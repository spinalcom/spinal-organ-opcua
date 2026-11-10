import { EventEmitter } from "events";
import { UserIdentityInfo, UserTokenType } from "node-opcua";
import { SpinalOPCUADiscoverModel, OPCUA_ORGAN_STATES, OPCUA_ORGAN_USER_CHOICE, IServer } from "spinal-model-opcua";

import { IDiscoverGateway } from "../interfaces/IDiscoverGateway";
import { IOPCNode } from "../interfaces/OPCNode";
import { ITreeOption } from "../interfaces/ITreeOption";

import { _transformTreeToGraphRecursively, createExistingDeviceIndex, getNodeAlreadyCreated } from "../utils/transformTreeToGraph";
import { getServerUrl, getVariablesList } from "../utils/Functions";
import { getOrGenNetworkNode } from "../utils/addNetworkToGraph";
import OPCUAService, { OPCUAConnectionError } from "../utils/OPCUAService";
import discoveringStore from "../utils/discoveringProcessStore";
import { discoverIsCancelled, executeConcurrently, getConfig, getNodeKey, normalizePath } from "../utils/utils";
import { SpinalQueuing } from "../utils/SpinalQueuing";
import { SpinalContext, SpinalNode } from "spinal-env-viewer-graph-service";
import OPCUAFactory from "../utils/OPCUAFactory";
import spinalLog from "../utils/displayLog";
import { Model } from "spinal-core-connectorjs";

// import * as testJSON from "./test.json";

const userIdentity: UserIdentityInfo = { type: UserTokenType.Anonymous };

class SpinalDiscover extends EventEmitter {
	private _discoverQueue: SpinalQueuing = new SpinalQueuing();
	private _isProcess: boolean = false;

	constructor() {
		super();
		this.listenEvent();
	}

	private listenEvent() {
		this._discoverQueue.on("start", () => {
			if (!this._isProcess) {
				this._isProcess = true;
				this._discoverNext();
			}
		});

		this.on("next", () => {
			this._discoverNext();
		});
	}

	public addToQueue(model: SpinalOPCUADiscoverModel) {
		this._discoverQueue.addToQueue(model);
	}

	private async _discoverNext() {
		if (!this._discoverQueue.isEmpty()) {
			const model: SpinalOPCUADiscoverModel = this._discoverQueue.dequeue();
			await this._bindDiscoverModel(model);
			model.changeState(OPCUA_ORGAN_STATES.discovering);

			this.emit("next");
		} else {
			this._isProcess = false;
		}
	}

	private _bindDiscoverModel(model: SpinalOPCUADiscoverModel) {
		const processBind = model.state.bind(async () => {
			const state = model.state.get();
			switch (state) {
				case OPCUA_ORGAN_STATES.discovering:
					await this._discoverDevices(model);
					break;
				case OPCUA_ORGAN_STATES.readyToCreate:
					this._createNetworkTreeInGraph(model);
					break;
				case OPCUA_ORGAN_STATES.error:
				case OPCUA_ORGAN_STATES.timeout:
					break;
			}
		});
	}

	private async _discoverDevices(model: SpinalOPCUADiscoverModel) {
		try {
			const { failedServers, discovered }: { failedServers: spinal.Model[]; discovered: any[] } = await this._fetchServerDiscovery(model);

			await this._retryFailedServerDiscovery(failedServers, model, discovered);

			if (discoverIsCancelled(model)) return;

			if (discovered.length === 0) throw "No Device found";

			await model.setTreeDiscovered({ nodeId: "root", displayName: "Root", children: discovered });
			spinalLog.log(`${model.network?.name?.get()} discovered !!`);
			model.changeState(OPCUA_ORGAN_STATES.discovered);
			return discovered;
		} catch (error) {
			console.error(error);
			model.changeState(OPCUA_ORGAN_STATES.error);
		}
	}

	private async _retryFailedServerDiscovery(failedServers: Model[], model: SpinalOPCUADiscoverModel, discovered: any[]) {
		for (const server of failedServers) {
			if (discoverIsCancelled(model)) break;

			try {
				const tree = await this._discoverDevice(server, model);
				if (!tree || !tree.children) throw new Error("No tree discovered");

				discovered.push(...tree.children);
				const count = model.progress.finished.get();
				model.progress.finished.set(count + 1);
			} catch (error) {
				const gateway = server.get() as IServer;
				spinalLog.warn(`[${getServerUrl(gateway)}] sequential discovery retry failed: "${error instanceof Error ? error.message : String(error)}"`);
				const count = model.progress.failed.get();
				model.progress.failed.set(count + 1);
			}
		}
	}

	private async _fetchServerDiscovery(model: SpinalOPCUADiscoverModel) {
		const servers = model.network.gateways;
		const discovered = [];

		const serverArr: spinal.Model[] = Array.from(servers as ArrayLike<spinal.Model>);

		const promises = serverArr.map(async (server) => {
			const tree = await this._discoverDevice(server, model);
			if (!tree || !tree.children) throw new Error("No tree discovered");
			const count = model.progress.finished.get();
			model.progress.finished.set(count + 1);
			return tree;
		});

		const parallelResults = await Promise.allSettled(promises);
		const failedServers: spinal.Model[] = [];

		for (let index = 0; index < parallelResults.length; index++) {
			const result = parallelResults[index];
			if (result.status === "fulfilled") {
				discovered.push(...(result.value.children ?? []));
			} else if (result.reason instanceof OPCUAConnectionError) {
				const server = serverArr[index].get() as IServer;
				spinalLog.warn(`[${getServerUrl(server)}] connection failed; skipping sequential retry: "${result.reason.message}"`);
				const count = model.progress.failed.get();
				model.progress.failed.set(count + 1);
			} else {
				failedServers.push(serverArr[index]);
				const server = serverArr[index].get() as IServer;
				spinalLog.warn(`[${getServerUrl(server)}] parallel discovery failed, will retry sequentially: "${result.reason instanceof Error ? result.reason.message : String(result.reason)}"`);
			}
		}
		return { failedServers, discovered };
	}

	private async _discoverDevice(gateway: spinal.Model, model: SpinalOPCUADiscoverModel) {
		const server: IDiscoverGateway = gateway.get();
		const discoverResult = await this._getOPCUATree(server, model);
		if (!discoverResult) return;

		return discoverResult.tree;
	}

	private askToContinueDiscovery(model: SpinalOPCUADiscoverModel): Promise<boolean> {
		return new Promise((resolve, reject) => {
			try {
				model.changeChoice(OPCUA_ORGAN_USER_CHOICE.noChoice);

				let proccessId = model.askResponse.bind(() => {
					const res = model.askResponse.get();
					if (![OPCUA_ORGAN_USER_CHOICE.yes, OPCUA_ORGAN_USER_CHOICE.no].includes(res)) return;

					const choice = model.askResponse.get() === OPCUA_ORGAN_USER_CHOICE.yes;
					model.ask.set(false);
					model.askResponse.unbind(proccessId);
					resolve(choice);
				}, false);

				model.ask.set(true);
				model.changeState(OPCUA_ORGAN_STATES.pending);
			} catch (error) {
				reject(error);
			}
		});
	}

	// tryTree2 is used to try the second method to get the tree if the first one failed
	// private async _getOPCUATree(model: SpinalOPCUADiscoverModel, useLastResult: boolean, tryTree2: boolean = true) {
	private async _getOPCUATree(server: IDiscoverGateway, model: SpinalOPCUADiscoverModel) {
		const _url = getServerUrl(server);

		let useLastResult = server?.useLastResult || false;
		if (useLastResult && !discoveringStore.fileExist(_url)) useLastResult = false;

		let entryPointPath = server?.entryPoint || "";

		spinalLog.log("discovering", server.address, useLastResult ? "using last result" : "starting from scratch");

		const opcuaService: OPCUAService = OPCUAFactory.getOPCUAInstance(_url, model);

		const options: ITreeOption = { useLastResult, useBroadCast: true, entryPointPath };
		let err;
		return opcuaService
			.getTree(options)
			.then(async (result) => {
				if (!result || !result.tree || !result.tree.children) throw new Error("No tree discovered");

				result.tree.children.map((el) => {
					el.server = server;
					return el;
				});

				return result;
			})
			.catch(async (err) => {
				spinalLog.log(`[${server.address}] discovery failed !! reason: "${err instanceof Error ? err.message : String(err)}"`);
				throw err;
				// model.changeState(OPCUA_ORGAN_STATES.error);
			})
			.finally(async () => {
				// Disable disconnect to keep the connection alive for future operations
				// await opcuaService.disconnect();
			});
	}

	private async _createNetworkTreeInGraph(model: SpinalOPCUADiscoverModel) {
		try {
			spinalLog.log("creating networkTree");
			const { protocol, host, port } = getConfig();
			const hubPath = `${protocol}://${host}:${port}`;
			const treeToCreate = await model.getTreeToCreate(hubPath);

			const context = await model.getContext();
			const { network, organ } = await getOrGenNetworkNode(model, context);

			const dataObject = await this._getDataByGateway(treeToCreate.children, context, network);

			for (const nodeTocreate of treeToCreate.children) {
				const serverKey = nodeTocreate.server ? getServerUrl(nodeTocreate.server) : "";
				const gatewayData = dataObject[serverKey] || [];
				if (!gatewayData || gatewayData.length <= 0) continue;

				const deviceData = gatewayData.find((el: { node: IOPCNode }) => {
					const key = getNodeKey(nodeTocreate);
					return normalizePath(el.node.path || "") === key || el.node.nodeId.toString() === key;
				});

				if (!deviceData) continue;

				await _transformTreeToGraphRecursively(context, nodeTocreate, deviceData.nodesAlreadyCreated, network, deviceData.values);
			}

			await model.changeState(OPCUA_ORGAN_STATES.created);
			spinalLog.log("network", network.getName().get(), "created !!");
		} catch (error) {
			spinalLog.error(error);
			model.changeState(OPCUA_ORGAN_STATES.error);
		}
	}

	private async _getDataByGateway(nodes: IOPCNode[], context: SpinalContext, network: SpinalNode) {
		const existingDeviceIndex = createExistingDeviceIndex(await network.getChildrenInContext(context));
		const records = nodes
			.filter((node): node is IOPCNode & { server: NonNullable<IOPCNode["server"]> } => !!node.server)
			.map((node) => ({
				node,
				variables: getVariablesList(node),
				url: getServerUrl(node.server),
			}));

		const preparedRecords = await executeConcurrently(
			records,
			async (record) => ({
				...record,
				nodesAlreadyCreated: await getNodeAlreadyCreated(context, network, record.node, existingDeviceIndex),
			}),
			5,
		);
		const recordsByGateway = new Map<string, typeof preparedRecords>();

		for (const record of preparedRecords) {
			const gatewayRecords = recordsByGateway.get(record.url) || [];
			gatewayRecords.push(record);
			recordsByGateway.set(record.url, gatewayRecords);
		}

		const gatewayRequests = Array.from(recordsByGateway.entries()).map(([url, gatewayRecords]) => {
			const variablesByKey = new Map<string, IOPCNode>();
			for (const record of gatewayRecords) {
				for (const variable of record.variables) {
					variablesByKey.set(getNodeKey(variable), variable);
				}
			}

			return { url, records: gatewayRecords, variables: Array.from(variablesByKey.values()) };
		});

		const gatewayResults = await executeConcurrently(
			gatewayRequests,
			async ({ url, records: gatewayRecords, variables }) => {
				const values = await this._getVariablesValues(url, variables);
				return {
					url,
					data: gatewayRecords.map((record) => ({ ...record, values })),
				};
			},
			4,
		);

		const result: { [key: string]: any } = {};
		for (const gatewayResult of gatewayResults) result[gatewayResult.url] = gatewayResult.data;
		return result;
	}

	private async _getVariablesValues(url: string, variables: IOPCNode[]): Promise<{ [key: string]: { dataType: string; value: any } }> {
		const opcuaService: OPCUAService = OPCUAFactory.getOPCUAInstance(url);

		return opcuaService
			.readNodeValue(variables)
			.then((result) => {
				const obj: { [key: string]: { dataType: string; value: any } } = {};

				for (let index = 0; index < result.length; index++) {
					const value = result[index];
					if (value === null) continue;

					const variable = variables[index];
					const key = getNodeKey(variable);
					obj[key] = value;
				}

				return obj;
			})
			.catch((error) => {
				spinalLog.error(`[_getVariablesValues] - Failed to read node values from ${url} due to:`, error);
				return {};
			});
	}

	private delay(ms: number) {
		return new Promise((resolve, reject) => {
			setTimeout(() => {
				resolve(true);
			}, ms);
		});
	}
}

export const discover = new SpinalDiscover();

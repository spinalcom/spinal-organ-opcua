import { EventEmitter } from "events";
import { UserIdentityInfo, UserTokenType } from "node-opcua";
import { SpinalOPCUADiscoverModel, OPCUA_ORGAN_STATES, OPCUA_ORGAN_USER_CHOICE, IServer } from "spinal-model-opcua";

import { IOPCNode } from "../interfaces/OPCNode";
import { ITreeOption } from "../interfaces/ITreeOption";


import { _transformTreeToGraphRecursively, getNodeAlreadyCreated } from "../utils/transformTreeToGraph";
import { getServerUrl, getVariablesList } from "../utils/Functions";
import { getOrGenNetworkNode } from "../utils/addNetworkToGraph";
import OPCUAService from "../utils/OPCUAService";
import discoveringStore from "../utils/discoveringProcessStore";
import { discoverIsCancelled, getConfig } from "../utils/utils";
import { SpinalQueuing } from "../utils/SpinalQueuing";
import { SpinalContext, SpinalNode } from "spinal-env-viewer-graph-service";

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
			const servers = model.network.gateways;
			let index = 0
			const discovered = [];

			while (index < servers.length && !discoverIsCancelled(model)) {
				try {
					const tree = await this._discoverDevice(servers[index], model);
					discovered.push(...tree.children);
					const count = model.progress.finished.get();
					model.progress.finished.set(count + 1);
				} catch (err) {
					const count = model.progress.failed.get();
					model.progress.failed.set(count + 1);
				}

				index++;
			}

			if (discoverIsCancelled(model)) return;

			if (discovered.length === 0) throw "No Device found";

			await model.setTreeDiscovered({ nodeId: "root", displayName: "Root", children: discovered });
			console.log(model.network?.name?.get(), "discovered !!");
			model.changeState(OPCUA_ORGAN_STATES.discovered);
			return discovered;

		} catch (error) {
			model.changeState(OPCUA_ORGAN_STATES.error);
		}

	}

	private async _discoverDevice(gateway: spinal.Model, model: SpinalOPCUADiscoverModel) {
		const server: IServer = gateway.get();
		const _url = getServerUrl(server);

		let useLastResult = false;

		if (discoveringStore.fileExist(_url)) {
			// 	console.log("inside file exist");
			// 	useLastResult = await this.askToContinueDiscovery(model);
			useLastResult = await model?.useLastResult.get() || true;
		}


		console.log("discovering", server.address, useLastResult ? "using last result" : "starting from scratch");
		const { tree } = await this._getOPCUATree(server, useLastResult, model, true);
		if (!tree) return;


		return tree;
		// return this._getOPCUATree(model, useLastResult, true)
		// 	.then(async ({ tree }: any) => {
		// 		if (!tree) return;

		// 		await model.setTreeDiscovered(tree);
		// 		console.log(server.name, "discovered !!");
		// 		model.changeState(OPCUA_ORGAN_STATES.discovered);
		// 		return tree;

		// 	}).catch((err) => {
		// 		error: console.log(`${model?.network?.name?.get()} discovery failed !! reason: "${err.message}"`);
		// 		model.changeState(OPCUA_ORGAN_STATES.error);
		// 	});

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
	private async _getOPCUATree(server: IServer, useLastResult: boolean, model: SpinalOPCUADiscoverModel, tryTree2: boolean = true) {
		const { entryPointPath } = getConfig();
		const url = getServerUrl(server);

		const opcuaService: OPCUAService = new OPCUAService(url, model);

		const options: ITreeOption = { useLastResult, useBroadCast: true };
		let err;
		return opcuaService.getTree(entryPointPath, options)
			.then(async (result) => {
				result.tree.children.map((el) => {
					el.server = server;
					return el;
				})

				return result;
			})
			// .catch(async (err) => {
			// 	if (!tryTree2) throw err;

			// 	console.log(`[${server.address}] - failed to use multi browsing, trying with unique browsing`);
			// 	options.useBroadCast = false;
			// 	const result = await opcuaService.getTree(entryPointPath, options);

			// 	result.tree.children.map((el) => {
			// 		el.server = server;
			// 		return el;
			// 	})

			// 	return result;

			// })
			.catch(async (err) => {
				console.log(`[${server.address}] discovery failed !! reason: "${err.message}"`);
				throw err;
				// model.changeState(OPCUA_ORGAN_STATES.error);
			})
			.finally(async () => {
				await opcuaService.disconnect();
			});

	}

	private async _createNetworkTreeInGraph(model: SpinalOPCUADiscoverModel) {
		try {
			console.log("creating networkTree");
			const { protocol, host, port } = getConfig();
			const hubPath = `${protocol}://${host}:${port}`;
			const treeToCreate = await model.getTreeToCreate(hubPath);

			const context = await model.getContext();
			const { network, organ } = await getOrGenNetworkNode(model, context);

			const dataObject = await this._getDataByGateway(treeToCreate.children, context, network);

			// const promises = treeToCreate.children.map((el: IOPCNode) => {
			// 	const gatewayData = dataObject[el.server?.address];
			// 	if (!gatewayData) return;

			// 	return _transformTreeToGraphRecursively(context, el, gatewayData.nodesAlreadyCreated, network, gatewayData.values);
			// })

			for (const el of treeToCreate.children) {
				const gatewayData = dataObject[el.server?.address];
				if (!gatewayData) continue;

				await _transformTreeToGraphRecursively(context, el, gatewayData.nodesAlreadyCreated, network, gatewayData.values);
			}

			await model.changeState(OPCUA_ORGAN_STATES.created);
			console.log("network", network.getName().get(), "created !!");

		} catch (error) {
			console.error(error);
			model.changeState(OPCUA_ORGAN_STATES.error);
		}


	}


	private async _getDataByGateway(nodes: IOPCNode[], context: SpinalContext, network: SpinalNode) {

		const obj: { [key: string]: any } = {};

		for (const node of nodes) {
			const variables = getVariablesList(node);
			const url = getServerUrl(node.server);
			const nodesAlreadyCreated = await getNodeAlreadyCreated(context, network, node.server);
			const values = await this._getVariablesValues(url, variables);
			obj[node.server.address] = { variables, values, node, nodesAlreadyCreated };
		}

		return obj;
		// const promises = nodes.map(async (el) => {
		// 	const variables = getVariablesList(el);
		// 	const url = getServerUrl(el.server);
		// 	const values = await this._getVariablesValues(url, variables);
		// 	const nodesAlreadyCreated = await getNodeAlreadyCreated(context, network, el.server);

		// 	return { variables, values, nodesAlreadyCreated, server: el.server, node: el };
		// })

		// return Promise.all(promises);
	}

	// private _formatGateway() {

	// }

	// private convertToBase64(tree: any) {
	// 	return new Promise((resolve, reject) => {
	// 		const treeString = JSON.stringify(tree);
	// 		zlib.deflate(treeString, (err, buffer) => {
	// 			if (!err) {
	// 				const base64 = buffer.toString("base64");
	// 				return resolve(base64);
	// 			}
	// 		});
	// 	});
	// }

	private async _getVariablesValues(url: string, variables: IOPCNode[]) {
		// const endpointUrl = getServerUrl(server);
		const opcuaService: OPCUAService = new OPCUAService(url);

		return opcuaService.readNodeValue(variables).then((result) => {
			const obj = {};
			for (let index = 0; index < result.length; index++) {
				const element = result[index];
				obj[variables[index].nodeId.toString()] = element;
			}

			opcuaService.disconnect();
			return obj;
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

import { EventEmitter } from "events";
import { SpinalQueuing } from "../utils/SpinalQueuing";
import { SpinalOPCUADiscoverModel, OPCUA_ORGAN_STATES } from "spinal-model-opcua";
import OPCUAService from "../utils/OPCUAService";

import { _transformTreeToGraphRecursively, getNodeAlreadyCreated } from "../utils/transformTreeToGraph";
import { getServerUrl, getVariablesList } from "../utils/Functions";
import { IOPCNode } from "../interfaces/OPCNode";

import { UserIdentityInfo, UserTokenType } from "node-opcua";
import { addNetworkToGraph, getOrGenNetworkNode } from "../utils/addNetworkToGraph";
import * as testJSON from "./test.json";

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
					await this._discoverDevice(model);
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

	private async _discoverDevice(model: SpinalOPCUADiscoverModel) {
		const server = model.network.get();
		console.log("discovering", server.name);

		return this._getOPCUATree(server, true, true)
			.then(async ({ tree, variables }) => {
				await model.setTreeDiscovered(tree);
				console.log(server.name, "discovered !!");
				model.changeState(OPCUA_ORGAN_STATES.discovered);
				await writeInFile("../../tree.txt", JSON.stringify(tree));
				return tree;

			}).catch((err) => {
				console.log(`${server.name} discovery failed !! reason: "${err.message}"`);
				model.changeState(OPCUA_ORGAN_STATES.error);
			});

	}

	// tryTree2 is used to try the second method to get the tree if the first one failed
	private async _getOPCUATree(server: any, useLastResult: boolean, tryTree2: boolean = true) {
		const endpointUrl = getServerUrl(server);
		const entryPointPath = process.env.OPCUA_SERVER_ENTRYPOINT;

		const opcuaService: OPCUAService = new OPCUAService();

		await opcuaService.initialize(endpointUrl);
		await opcuaService.connect(endpointUrl, userIdentity);

		const options: ITreeOption = { useLastResult, useBroadCast: true };

		return opcuaService.getTree(entryPointPath, options)
			.then(async (result) => {
				return result;
			}).catch(async (err) => {
				if (!tryTree2) throw err;

				console.log("failed to use multi browsing, trying with unique browsing");
				options.useBroadCast = false;
				return opcuaService.getTree(entryPointPath, options);

			}).finally(async () => {
				await opcuaService.disconnect();
			});

	}

	private async _createNetworkTreeInGraph(model: SpinalOPCUADiscoverModel) {
		const treeToCreate = await model.getTreeToCreate();
		const server = model.network.get();

		console.log("creating network", server.name);

		const variables = getVariablesList(treeToCreate);
		const values = await this._getVariablesValues(server, variables);

		const context = await model.getContext();
		const { network, organ } = await getOrGenNetworkNode(model, context);

		const nodesAlreadyCreated = await getNodeAlreadyCreated(context, network);

		const promises = (treeToCreate.children || []).map((tree) => _transformTreeToGraphRecursively(context, tree, nodesAlreadyCreated, undefined, values));
		return Promise.all(promises)
			.then(async (nodes) => {
				const r = await addNetworkToGraph(model, nodes, context, network, organ);
				return r;
			}).then(() => {
				model.changeState(OPCUA_ORGAN_STATES.created);
				console.log("network", network.getName().get(), "created !!");
			}).catch((err) => {
				model.changeState(OPCUA_ORGAN_STATES.error);
				console.log(network.getName().get(), "creation failed !")
			});

	}



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

	private async _getVariablesValues(server: any, variables: IOPCNode[]) {
		const endpointUrl = getServerUrl(server);
		const opcuaService: OPCUAService = new OPCUAService();

		await opcuaService.initialize(endpointUrl);
		await opcuaService.connect(endpointUrl, userIdentity);

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

import * as fs from "fs";
import * as nodePath from "path";
import { ITreeOption } from "../interfaces/ITreeOption";

function writeInFile(argPath, text) {
	return fs.writeFileSync(nodePath.resolve(__dirname, argPath), text);
}

/*
export class SpinalDiscover {
	private bindSateProcess: any;
	private CONNECTION_TIME_OUT: number;
	private devices: Map<number, SpinalDevice> = new Map();
	private discoverModel: any;

	constructor(model) {
		this.discoverModel = model;
		this.CONNECTION_TIME_OUT = model.network?.timeout?.get() || 45000;

		this.init(model);
	}

	public init(model: any) {
		this.bindState();
	}

	private bindState(): void {
		this.bindSateProcess = this.discoverModel.state.bind(() => {
			switch (this.discoverModel.state.get()) {
				case OPCUA_ORGAN_STATES.discovering:
					console.log("discovering");
					this.discover();
					break;
				case OPCUA_ORGAN_STATES.creating:
					this.createNodes();
				default:
					break;
			}
		});
	}

	private async discover() {
		try {
			const queue = await this.getDevicesQueue();

			let isFinish = false;

			while (!isFinish) {
				const item = queue.dequeue();

				if (typeof item !== "undefined") {
					const info = await this.createSpinalDevice(item);
					if (info) this.addDeviceFound(info);
				} else {
					console.log("isFinish");
					isFinish = true;
				}
			}

			if (this.discoverModel.devices.length !== 0) {
				console.log("discovered");
				this.discoverModel.setDiscoveredMode();
			} else {
				console.log("Timeout !");
				this.discoverModel.setTimeoutMode();
			}
		} catch (error) {
			console.log("Timeout...");
			this.discoverModel.setTimeoutMode();
		}
	}

	private getDevicesQueue(): Promise<SpinalQueuing> {
		const queue: SpinalQueuing = new SpinalQueuing();
		return new Promise((resolve, reject) => {
			// if (this.discoverModel.network?.useBroadcast?.get()) {
			//    console.log("use broadcast");
			let timeOutId;

			if (this.discoverModel.network?.useBroadcast?.get()) {
				console.log("use broadcast");

				timeOutId = setTimeout(() => {
					reject("[TIMEOUT] - Cannot establish connection with BACnet server.");
				}, this.CONNECTION_TIME_OUT);

				this.client.whoIs();
			} else {
				// ips.forEach(({ address, deviceId }) => {
				//    this.client.whoIs({ address })
				// });
				console.log("use unicast");
				const ips = this.discoverModel.network?.ips?.get() || [];
				const devices = ips
					.filter(({ address, deviceId }) => address && deviceId)
					.map(({ address, deviceId }) => {
						return { address, deviceId: parseInt(deviceId) };
					});

				queue.setQueue(devices);
			}

			const res = [];

			this.client.on("iAm", (device) => {
				if (typeof timeOutId !== "undefined") {
					clearTimeout(timeOutId);
				}

				console.log(device);

				const { address, deviceId } = device;
				const found = res.find((el) => el.address === address && el.deviceId === deviceId);
				if (!found) {
					res.push(device);
					queue.addToQueue(device);
				}
			});

			queue.on("start", () => {
				resolve(queue);
			});
		});
	}

	private createSpinalDevice(device): Promise<IDevice | void> {
		return new Promise((resolve, reject) => {
			const spinalDevice = new SpinalDevice(device, this.client);

			spinalDevice.on("initialized", (res) => {
				this.devices.set(res.device.deviceId, res);
				resolve(res.info);
			});

			spinalDevice.on("error", () => {
				resolve();
			});

			spinalDevice.init();
		});
	}

	private addDeviceFound(device: IDevice): void {
		console.log("device found", device.address);
		this.discoverModel.devices.push(device);
	}

	private async createNodes() {
		console.log("creating nodes...");

		try {
			const queue = new SpinalQueuing();
			queue.setQueue(Array.from(this.devices.keys()));
			const { networkService, network } = await SpinalNetworkServiceUtilities.initSpinalDiscoverNetwork(this.discoverModel);
			const devices = await this.getDevices(network.id.get());

			let isFinish = false;

			while (!isFinish) {
				const value = queue.dequeue();
				if (typeof value !== "undefined") {
					const node = devices.find((el) => el.idNetwork.get() == value);
					const device = this.devices.get(value);
					await device.createStructureNodes(networkService, node, network.id.get());
				} else {
					isFinish = true;
				}
			}

			this.discoverModel.setCreatedMode();
			this.discoverModel.state.unbind(this.bindSateProcess);
			this.discoverModel.remove();
			console.log("nodes created!");
		} catch (error) {
			this.discoverModel.setErrorMode();
			this.discoverModel.state.unbind(this.bindSateProcess);
			this.discoverModel.remove();
		}
	}

	private getDevices(id: string): Promise<SpinalNodeRef[]> {
		return SpinalGraphService.getChildren(id, [SpinalBmsDevice.relationName]);
	}
}
*/

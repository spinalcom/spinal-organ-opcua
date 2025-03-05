// import { EventEmitter } from "events";
// import { SpinalQueuing } from "../utils/SpinalQueuing";
// import { SpinalOPCUADiscoverModel, OPCUA_ORGAN_STATES, OPCUA_ORGAN_USER_CHOICE } from "spinal-model-opcua";
// import OPCUAService from "../utils/OPCUAService";

// import { _transformTreeToGraphRecursively, getNodeAlreadyCreated } from "../utils/transformTreeToGraph";
// import { getServerUrl, getVariablesList } from "../utils/Functions";
// import { IOPCNode } from "../interfaces/OPCNode";

// import { UserIdentityInfo, UserTokenType } from "node-opcua";
// import { addNetworkToGraph, getOrGenNetworkNode } from "../utils/addNetworkToGraph";
// import discoveringStore from "../utils/discoveringProcessStore";
// import { ITreeOption } from "../interfaces/ITreeOption";
// import { getConfig } from "../utils/utils";

// // import * as testJSON from "./test.json";

// const userIdentity: UserIdentityInfo = { type: UserTokenType.Anonymous };

// class SpinalDiscover extends EventEmitter {
// 	private _discoverQueue: SpinalQueuing = new SpinalQueuing();
// 	private _isProcess: boolean = false;

// 	constructor() {
// 		super();
// 		this.listenEvent();
// 	}

// 	private listenEvent() {
// 		this._discoverQueue.on("start", () => {
// 			if (!this._isProcess) {
// 				this._isProcess = true;
// 				this._discoverNext();
// 			}
// 		});

// 		this.on("next", () => {
// 			this._discoverNext();
// 		});
// 	}

// 	public addToQueue(model: SpinalOPCUADiscoverModel) {
// 		this._discoverQueue.addToQueue(model);
// 	}

// 	private async _discoverNext() {
// 		if (!this._discoverQueue.isEmpty()) {
// 			const model: SpinalOPCUADiscoverModel = this._discoverQueue.dequeue();
// 			await this._bindDiscoverModel(model);
// 			model.changeState(OPCUA_ORGAN_STATES.discovering);

// 			this.emit("next");

// 		} else {
// 			this._isProcess = false;
// 		}
// 	}


// 	private _bindDiscoverModel(model: SpinalOPCUADiscoverModel) {
// 		const processBind = model.state.bind(async () => {
// 			const state = model.state.get();
// 			switch (state) {
// 				case OPCUA_ORGAN_STATES.discovering:
// 					await this._discoverDevice(model);
// 					break;
// 				case OPCUA_ORGAN_STATES.readyToCreate:
// 					this._createNetworkTreeInGraph(model);
// 					break;
// 				case OPCUA_ORGAN_STATES.error:
// 				case OPCUA_ORGAN_STATES.timeout:
// 					break;
// 			}
// 		});
// 	}

// 	private async _discoverDevice(model: SpinalOPCUADiscoverModel) {
// 		const server = model.network.get();

// 		const _url = getServerUrl(server);
// 		let useLastResult = false;

// 		if (discoveringStore.fileExist(_url)) {
// 			console.log("inside file exist");
// 			useLastResult = await this.askToContinueDiscovery(model);
// 		}


// 		console.log("discovering", server.name, useLastResult ? "using last result" : "starting from scratch");

// 		return this._getOPCUATree(model, useLastResult, true)
// 			.then(async ({ tree, variables }: any) => {
// 				if (!tree) return;

// 				await model.setTreeDiscovered(tree);
// 				console.log(server.name, "discovered !!");
// 				model.changeState(OPCUA_ORGAN_STATES.discovered);
// 				return tree;

// 			}).catch((err) => {
// 				error: console.log(`${model?.network?.name?.get()} discovery failed !! reason: "${err.message}"`);
// 				model.changeState(OPCUA_ORGAN_STATES.error);
// 			});

// 	}

// 	private askToContinueDiscovery(model: SpinalOPCUADiscoverModel): Promise<boolean> {
// 		return new Promise((resolve, reject) => {
// 			try {

// 				model.changeChoice(OPCUA_ORGAN_USER_CHOICE.noChoice);

// 				let proccessId = model.askResponse.bind(() => {
// 					const res = model.askResponse.get();
// 					if (![OPCUA_ORGAN_USER_CHOICE.yes, OPCUA_ORGAN_USER_CHOICE.no].includes(res)) return;

// 					const choice = model.askResponse.get() === OPCUA_ORGAN_USER_CHOICE.yes;
// 					model.ask.set(false);
// 					model.askResponse.unbind(proccessId);
// 					resolve(choice);
// 				}, false);

// 				model.ask.set(true);
// 				model.changeState(OPCUA_ORGAN_STATES.pending);
// 			} catch (error) {
// 				reject(error);
// 			}

// 		});
// 	}

// 	// tryTree2 is used to try the second method to get the tree if the first one failed
// 	private async _getOPCUATree(model: SpinalOPCUADiscoverModel, useLastResult: boolean, tryTree2: boolean = true) {
// 		const { entryPointPath } = getConfig();

// 		const opcuaService: OPCUAService = new OPCUAService(model);

// 		await opcuaService.initialize();
// 		await opcuaService.connect(userIdentity);

// 		const options: ITreeOption = { useLastResult, useBroadCast: true };

// 		return opcuaService.getTree(entryPointPath, options)
// 			.then(async (result) => {
// 				return result;
// 			}).catch(async (err) => {
// 				if (!tryTree2) throw err;

// 				console.log("failed to use multi browsing, trying with unique browsing");
// 				options.useBroadCast = false;
// 				return opcuaService.getTree(entryPointPath, options);

// 			})
// 			.catch(async (err) => {
// 				console.log(`${model?.network?.name?.get()} discovery failed !! reason: "${err.message}"`);
// 				model.changeState(OPCUA_ORGAN_STATES.error);
// 			})
// 			.finally(async () => {
// 				await opcuaService.disconnect();
// 			});

// 	}

// 	private async _createNetworkTreeInGraph(model: SpinalOPCUADiscoverModel) {
// 		const { protocol, host, port, userId, password, path, name } = getConfig();
// 		const hubPath = `${protocol}://${host}:${port}`;
// 		const treeToCreate = await model.getTreeToCreate(hubPath);
// 		const server = model.network.get();

// 		console.log("creating network", server.name);

// 		const variables = getVariablesList(treeToCreate);
// 		const values = await this._getVariablesValues(model, variables);

// 		const context = await model.getContext();
// 		const { network, organ } = await getOrGenNetworkNode(model, context);


// 		const nodesAlreadyCreated = await getNodeAlreadyCreated(context, network, { address: server.address, port: server.port });

// 		const promises = (treeToCreate.children || []).map((tree) => _transformTreeToGraphRecursively(server, context, tree, nodesAlreadyCreated, undefined, values));
// 		return Promise.all(promises)
// 			.then(async (nodes) => {
// 				const r = await addNetworkToGraph(model, nodes, context, network, organ);
// 				return r;
// 			}).then(() => {
// 				model.changeState(OPCUA_ORGAN_STATES.created);
// 				console.log("network", network.getName().get(), "created !!");
// 			}).catch((err) => {
// 				model.changeState(OPCUA_ORGAN_STATES.error);
// 				console.log(network.getName().get(), "creation failed !")
// 			});

// 	}

// 	// private convertToBase64(tree: any) {
// 	// 	return new Promise((resolve, reject) => {
// 	// 		const treeString = JSON.stringify(tree);
// 	// 		zlib.deflate(treeString, (err, buffer) => {
// 	// 			if (!err) {
// 	// 				const base64 = buffer.toString("base64");
// 	// 				return resolve(base64);
// 	// 			}
// 	// 		});
// 	// 	});
// 	// }

// 	private async _getVariablesValues(model: SpinalOPCUADiscoverModel, variables: IOPCNode[]) {
// 		// const endpointUrl = getServerUrl(server);
// 		const opcuaService: OPCUAService = new OPCUAService(model);

// 		await opcuaService.initialize();
// 		await opcuaService.connect(userIdentity);

// 		return opcuaService.readNodeValue(variables).then((result) => {
// 			const obj = {};
// 			for (let index = 0; index < result.length; index++) {
// 				const element = result[index];
// 				obj[variables[index].nodeId.toString()] = element;
// 			}

// 			opcuaService.disconnect();
// 			return obj;
// 		});
// 	}

// 	private delay(ms: number) {
// 		return new Promise((resolve, reject) => {
// 			setTimeout(() => {
// 				resolve(true);
// 			}, ms);
// 		});
// 	}
// }

// export const discover = new SpinalDiscover();

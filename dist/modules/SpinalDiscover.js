"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.discover = void 0;
const events_1 = require("events");
const node_opcua_1 = require("node-opcua");
const spinal_model_opcua_1 = require("spinal-model-opcua");
const transformTreeToGraph_1 = require("../utils/transformTreeToGraph");
const Functions_1 = require("../utils/Functions");
const addNetworkToGraph_1 = require("../utils/addNetworkToGraph");
const OPCUAService_1 = require("../utils/OPCUAService");
const discoveringProcessStore_1 = require("../utils/discoveringProcessStore");
const utils_1 = require("../utils/utils");
const SpinalQueuing_1 = require("../utils/SpinalQueuing");
// import * as testJSON from "./test.json";
const userIdentity = { type: node_opcua_1.UserTokenType.Anonymous };
class SpinalDiscover extends events_1.EventEmitter {
    constructor() {
        super();
        this._discoverQueue = new SpinalQueuing_1.SpinalQueuing();
        this._isProcess = false;
        this.listenEvent();
    }
    listenEvent() {
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
    addToQueue(model) {
        this._discoverQueue.addToQueue(model);
    }
    _discoverNext() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this._discoverQueue.isEmpty()) {
                const model = this._discoverQueue.dequeue();
                yield this._bindDiscoverModel(model);
                model.changeState(spinal_model_opcua_1.OPCUA_ORGAN_STATES.discovering);
                this.emit("next");
            }
            else {
                this._isProcess = false;
            }
        });
    }
    _bindDiscoverModel(model) {
        const processBind = model.state.bind(() => __awaiter(this, void 0, void 0, function* () {
            const state = model.state.get();
            switch (state) {
                case spinal_model_opcua_1.OPCUA_ORGAN_STATES.discovering:
                    yield this._discoverDevices(model);
                    break;
                case spinal_model_opcua_1.OPCUA_ORGAN_STATES.readyToCreate:
                    this._createNetworkTreeInGraph(model);
                    break;
                case spinal_model_opcua_1.OPCUA_ORGAN_STATES.error:
                case spinal_model_opcua_1.OPCUA_ORGAN_STATES.timeout:
                    break;
            }
        }));
    }
    _discoverDevices(model) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const servers = model.network.gateways;
                let index = 0;
                const discovered = [];
                while (index < servers.length && !(0, utils_1.discoverIsCancelled)(model)) {
                    try {
                        const tree = yield this._discoverDevice(servers[index], model);
                        discovered.push(...tree.children);
                        const count = model.progress.finished.get();
                        model.progress.finished.set(count + 1);
                    }
                    catch (err) {
                        const count = model.progress.failed.get();
                        model.progress.failed.set(count + 1);
                    }
                    index++;
                }
                if ((0, utils_1.discoverIsCancelled)(model))
                    return;
                if (discovered.length === 0)
                    throw "No Device found";
                yield model.setTreeDiscovered({ nodeId: "root", displayName: "Root", children: discovered });
                console.log((_b = (_a = model.network) === null || _a === void 0 ? void 0 : _a.name) === null || _b === void 0 ? void 0 : _b.get(), "discovered !!");
                model.changeState(spinal_model_opcua_1.OPCUA_ORGAN_STATES.discovered);
                return discovered;
            }
            catch (error) {
                model.changeState(spinal_model_opcua_1.OPCUA_ORGAN_STATES.error);
            }
        });
    }
    _discoverDevice(gateway, model) {
        return __awaiter(this, void 0, void 0, function* () {
            const server = gateway.get();
            const _url = (0, Functions_1.getServerUrl)(server);
            let useLastResult = false;
            if (discoveringProcessStore_1.default.fileExist(_url)) {
                // 	console.log("inside file exist");
                // 	useLastResult = await this.askToContinueDiscovery(model);
                useLastResult = (yield (model === null || model === void 0 ? void 0 : model.useLastResult.get())) || true;
            }
            console.log("discovering", server.address, useLastResult ? "using last result" : "starting from scratch");
            const { tree } = yield this._getOPCUATree(server, useLastResult, model, true);
            if (!tree)
                return;
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
        });
    }
    askToContinueDiscovery(model) {
        return new Promise((resolve, reject) => {
            try {
                model.changeChoice(spinal_model_opcua_1.OPCUA_ORGAN_USER_CHOICE.noChoice);
                let proccessId = model.askResponse.bind(() => {
                    const res = model.askResponse.get();
                    if (![spinal_model_opcua_1.OPCUA_ORGAN_USER_CHOICE.yes, spinal_model_opcua_1.OPCUA_ORGAN_USER_CHOICE.no].includes(res))
                        return;
                    const choice = model.askResponse.get() === spinal_model_opcua_1.OPCUA_ORGAN_USER_CHOICE.yes;
                    model.ask.set(false);
                    model.askResponse.unbind(proccessId);
                    resolve(choice);
                }, false);
                model.ask.set(true);
                model.changeState(spinal_model_opcua_1.OPCUA_ORGAN_STATES.pending);
            }
            catch (error) {
                reject(error);
            }
        });
    }
    // tryTree2 is used to try the second method to get the tree if the first one failed
    // private async _getOPCUATree(model: SpinalOPCUADiscoverModel, useLastResult: boolean, tryTree2: boolean = true) {
    _getOPCUATree(server, useLastResult, model, tryTree2 = true) {
        return __awaiter(this, void 0, void 0, function* () {
            const { entryPointPath } = (0, utils_1.getConfig)();
            const url = (0, Functions_1.getServerUrl)(server);
            const opcuaService = new OPCUAService_1.default(url, model);
            const options = { useLastResult, useBroadCast: true };
            let err;
            return opcuaService.getTree(entryPointPath, options)
                .then((result) => __awaiter(this, void 0, void 0, function* () {
                result.tree.children.map((el) => {
                    el.server = server;
                    return el;
                });
                return result;
            }))
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
                .catch((err) => __awaiter(this, void 0, void 0, function* () {
                console.log(`[${server.address}] discovery failed !! reason: "${err.message}"`);
                throw err;
                // model.changeState(OPCUA_ORGAN_STATES.error);
            }))
                .finally(() => __awaiter(this, void 0, void 0, function* () {
                yield opcuaService.disconnect();
            }));
        });
    }
    _createNetworkTreeInGraph(model) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            try {
                console.log("creating networkTree");
                const { protocol, host, port } = (0, utils_1.getConfig)();
                const hubPath = `${protocol}://${host}:${port}`;
                const treeToCreate = yield model.getTreeToCreate(hubPath);
                const context = yield model.getContext();
                const { network, organ } = yield (0, addNetworkToGraph_1.getOrGenNetworkNode)(model, context);
                const dataObject = yield this._getDataByGateway(treeToCreate.children, context, network);
                // const promises = treeToCreate.children.map((el: IOPCNode) => {
                // 	const gatewayData = dataObject[el.server?.address];
                // 	if (!gatewayData) return;
                // 	return _transformTreeToGraphRecursively(context, el, gatewayData.nodesAlreadyCreated, network, gatewayData.values);
                // })
                for (const el of treeToCreate.children) {
                    const gatewayData = dataObject[(_a = el.server) === null || _a === void 0 ? void 0 : _a.address];
                    if (!gatewayData)
                        continue;
                    yield (0, transformTreeToGraph_1._transformTreeToGraphRecursively)(context, el, gatewayData.nodesAlreadyCreated, network, gatewayData.values);
                }
                yield model.changeState(spinal_model_opcua_1.OPCUA_ORGAN_STATES.created);
                console.log("network", network.getName().get(), "created !!");
            }
            catch (error) {
                console.error(error);
                model.changeState(spinal_model_opcua_1.OPCUA_ORGAN_STATES.error);
            }
        });
    }
    _getDataByGateway(nodes, context, network) {
        return __awaiter(this, void 0, void 0, function* () {
            const obj = {};
            for (const node of nodes) {
                const variables = (0, Functions_1.getVariablesList)(node);
                const url = (0, Functions_1.getServerUrl)(node.server);
                const nodesAlreadyCreated = yield (0, transformTreeToGraph_1.getNodeAlreadyCreated)(context, network, node.server);
                const values = yield this._getVariablesValues(url, variables);
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
        });
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
    _getVariablesValues(url, variables) {
        return __awaiter(this, void 0, void 0, function* () {
            // const endpointUrl = getServerUrl(server);
            const opcuaService = new OPCUAService_1.default(url);
            return opcuaService.readNodeValue(variables).then((result) => {
                const obj = {};
                for (let index = 0; index < result.length; index++) {
                    const element = result[index];
                    obj[variables[index].nodeId.toString()] = element;
                }
                opcuaService.disconnect();
                return obj;
            });
        });
    }
    delay(ms) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                resolve(true);
            }, ms);
        });
    }
}
exports.discover = new SpinalDiscover();
//# sourceMappingURL=SpinalDiscover.js.map
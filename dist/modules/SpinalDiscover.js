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
const SpinalQueuing_1 = require("../utils/SpinalQueuing");
const spinal_model_opcua_1 = require("spinal-model-opcua");
const OPCUAService_1 = require("../utils/OPCUAService");
const transformTreeToGraph_1 = require("../utils/transformTreeToGraph");
const Functions_1 = require("../utils/Functions");
const node_opcua_1 = require("node-opcua");
const addNetworkToGraph_1 = require("../utils/addNetworkToGraph");
const discoveringProcessStore_1 = require("../utils/discoveringProcessStore");
const utils_1 = require("../utils/utils");
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
                    yield this._discoverDevice(model);
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
    _discoverDevice(model) {
        return __awaiter(this, void 0, void 0, function* () {
            const server = model.network.get();
            const _url = (0, Functions_1.getServerUrl)(server);
            let useLastResult = false;
            if (discoveringProcessStore_1.default.fileExist(_url)) {
                console.log("inside file exist");
                useLastResult = yield this.askToContinueDiscovery(model);
            }
            console.log("discovering", server.name, useLastResult ? "using last result" : "starting from scratch");
            return this._getOPCUATree(model, useLastResult, true)
                .then(({ tree, variables }) => __awaiter(this, void 0, void 0, function* () {
                if (!tree)
                    return;
                yield model.setTreeDiscovered(tree);
                console.log(server.name, "discovered !!");
                model.changeState(spinal_model_opcua_1.OPCUA_ORGAN_STATES.discovered);
                return tree;
            })).catch((err) => {
                var _a, _b;
                error: console.log(`${(_b = (_a = model === null || model === void 0 ? void 0 : model.network) === null || _a === void 0 ? void 0 : _a.name) === null || _b === void 0 ? void 0 : _b.get()} discovery failed !! reason: "${err.message}"`);
                model.changeState(spinal_model_opcua_1.OPCUA_ORGAN_STATES.error);
            });
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
    _getOPCUATree(model, useLastResult, tryTree2 = true) {
        return __awaiter(this, void 0, void 0, function* () {
            const { entryPointPath } = (0, utils_1.getConfig)();
            const opcuaService = new OPCUAService_1.default(model);
            yield opcuaService.initialize();
            yield opcuaService.connect(userIdentity);
            const options = { useLastResult, useBroadCast: true };
            return opcuaService.getTree(entryPointPath, options)
                .then((result) => __awaiter(this, void 0, void 0, function* () {
                return result;
            })).catch((err) => __awaiter(this, void 0, void 0, function* () {
                if (!tryTree2)
                    throw err;
                console.log("failed to use multi browsing, trying with unique browsing");
                options.useBroadCast = false;
                return opcuaService.getTree(entryPointPath, options);
            }))
                .catch((err) => __awaiter(this, void 0, void 0, function* () {
                var _a, _b;
                console.log(`${(_b = (_a = model === null || model === void 0 ? void 0 : model.network) === null || _a === void 0 ? void 0 : _a.name) === null || _b === void 0 ? void 0 : _b.get()} discovery failed !! reason: "${err.message}"`);
                model.changeState(spinal_model_opcua_1.OPCUA_ORGAN_STATES.error);
            }))
                .finally(() => __awaiter(this, void 0, void 0, function* () {
                yield opcuaService.disconnect();
            }));
        });
    }
    _createNetworkTreeInGraph(model) {
        return __awaiter(this, void 0, void 0, function* () {
            const { protocol, host, port, userId, password, path, name } = (0, utils_1.getConfig)();
            const hubPath = `${protocol}://${host}:${port}`;
            const treeToCreate = yield model.getTreeToCreate(hubPath);
            const server = model.network.get();
            console.log("creating network", server.name);
            const variables = (0, Functions_1.getVariablesList)(treeToCreate);
            const values = yield this._getVariablesValues(model, variables);
            const context = yield model.getContext();
            const { network, organ } = yield (0, addNetworkToGraph_1.getOrGenNetworkNode)(model, context);
            const nodesAlreadyCreated = yield (0, transformTreeToGraph_1.getNodeAlreadyCreated)(context, network, { ip: server.ip, port: server.port });
            const promises = (treeToCreate.children || []).map((tree) => (0, transformTreeToGraph_1._transformTreeToGraphRecursively)(server, context, tree, nodesAlreadyCreated, undefined, values));
            return Promise.all(promises)
                .then((nodes) => __awaiter(this, void 0, void 0, function* () {
                const r = yield (0, addNetworkToGraph_1.addNetworkToGraph)(model, nodes, context, network, organ);
                return r;
            })).then(() => {
                model.changeState(spinal_model_opcua_1.OPCUA_ORGAN_STATES.created);
                console.log("network", network.getName().get(), "created !!");
            }).catch((err) => {
                model.changeState(spinal_model_opcua_1.OPCUA_ORGAN_STATES.error);
                console.log(network.getName().get(), "creation failed !");
            });
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
    _getVariablesValues(model, variables) {
        return __awaiter(this, void 0, void 0, function* () {
            // const endpointUrl = getServerUrl(server);
            const opcuaService = new OPCUAService_1.default(model);
            yield opcuaService.initialize();
            yield opcuaService.connect(userIdentity);
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
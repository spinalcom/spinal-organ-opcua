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
const OPCUAFactory_1 = require("../utils/OPCUAFactory");
const displayLog_1 = require("../utils/displayLog");
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
                const { failedServers, discovered } = yield this._fetchServerDiscovery(model);
                yield this._retryFailedServerDiscovery(failedServers, model, discovered);
                if ((0, utils_1.discoverIsCancelled)(model))
                    return;
                if (discovered.length === 0)
                    throw "No Device found";
                yield model.setTreeDiscovered({ nodeId: "root", displayName: "Root", children: discovered });
                displayLog_1.default.log(`${(_b = (_a = model.network) === null || _a === void 0 ? void 0 : _a.name) === null || _b === void 0 ? void 0 : _b.get()} discovered !!`);
                model.changeState(spinal_model_opcua_1.OPCUA_ORGAN_STATES.discovered);
                return discovered;
            }
            catch (error) {
                console.error(error);
                model.changeState(spinal_model_opcua_1.OPCUA_ORGAN_STATES.error);
            }
        });
    }
    _retryFailedServerDiscovery(failedServers, model, discovered) {
        return __awaiter(this, void 0, void 0, function* () {
            for (const server of failedServers) {
                if ((0, utils_1.discoverIsCancelled)(model))
                    break;
                try {
                    const tree = yield this._discoverDevice(server, model);
                    if (!tree || !tree.children)
                        throw new Error("No tree discovered");
                    discovered.push(...tree.children);
                    const count = model.progress.finished.get();
                    model.progress.finished.set(count + 1);
                }
                catch (error) {
                    const gateway = server.get();
                    displayLog_1.default.warn(`[${(0, Functions_1.getServerUrl)(gateway)}] sequential discovery retry failed: "${error instanceof Error ? error.message : String(error)}"`);
                    const count = model.progress.failed.get();
                    model.progress.failed.set(count + 1);
                }
            }
        });
    }
    _fetchServerDiscovery(model) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const servers = model.network.gateways;
            const discovered = [];
            const serverArr = Array.from(servers);
            const promises = serverArr.map((server) => __awaiter(this, void 0, void 0, function* () {
                const tree = yield this._discoverDevice(server, model);
                if (!tree || !tree.children)
                    throw new Error("No tree discovered");
                const count = model.progress.finished.get();
                model.progress.finished.set(count + 1);
                return tree;
            }));
            const parallelResults = yield Promise.allSettled(promises);
            const failedServers = [];
            for (let index = 0; index < parallelResults.length; index++) {
                const result = parallelResults[index];
                if (result.status === "fulfilled") {
                    discovered.push(...((_a = result.value.children) !== null && _a !== void 0 ? _a : []));
                }
                else if (result.reason instanceof OPCUAService_1.OPCUAConnectionError) {
                    const server = serverArr[index].get();
                    displayLog_1.default.warn(`[${(0, Functions_1.getServerUrl)(server)}] connection failed; skipping sequential retry: "${result.reason.message}"`);
                    const count = model.progress.failed.get();
                    model.progress.failed.set(count + 1);
                }
                else {
                    failedServers.push(serverArr[index]);
                    const server = serverArr[index].get();
                    displayLog_1.default.warn(`[${(0, Functions_1.getServerUrl)(server)}] parallel discovery failed, will retry sequentially: "${result.reason instanceof Error ? result.reason.message : String(result.reason)}"`);
                }
            }
            return { failedServers, discovered };
        });
    }
    _discoverDevice(gateway, model) {
        return __awaiter(this, void 0, void 0, function* () {
            const server = gateway.get();
            const discoverResult = yield this._getOPCUATree(server, model);
            if (!discoverResult)
                return;
            return discoverResult.tree;
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
    _getOPCUATree(server, model) {
        return __awaiter(this, void 0, void 0, function* () {
            const _url = (0, Functions_1.getServerUrl)(server);
            let useLastResult = (server === null || server === void 0 ? void 0 : server.useLastResult) || false;
            if (useLastResult && !discoveringProcessStore_1.default.fileExist(_url))
                useLastResult = false;
            let entryPointPath = (server === null || server === void 0 ? void 0 : server.entryPoint) || "";
            displayLog_1.default.log("discovering", server.address, useLastResult ? "using last result" : "starting from scratch");
            const opcuaService = OPCUAFactory_1.default.getOPCUAInstance(_url, model);
            const options = { useLastResult, useBroadCast: true, entryPointPath };
            let err;
            return opcuaService
                .getTree(options)
                .then((result) => __awaiter(this, void 0, void 0, function* () {
                if (!result || !result.tree || !result.tree.children)
                    throw new Error("No tree discovered");
                result.tree.children.map((el) => {
                    el.server = server;
                    return el;
                });
                return result;
            }))
                .catch((err) => __awaiter(this, void 0, void 0, function* () {
                displayLog_1.default.log(`[${server.address}] discovery failed !! reason: "${err instanceof Error ? err.message : String(err)}"`);
                throw err;
                // model.changeState(OPCUA_ORGAN_STATES.error);
            }))
                .finally(() => __awaiter(this, void 0, void 0, function* () {
                // Disable disconnect to keep the connection alive for future operations
                // await opcuaService.disconnect();
            }));
        });
    }
    _createNetworkTreeInGraph(model) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                displayLog_1.default.log("creating networkTree");
                const { protocol, host, port } = (0, utils_1.getConfig)();
                const hubPath = `${protocol}://${host}:${port}`;
                const treeToCreate = yield model.getTreeToCreate(hubPath);
                const context = yield model.getContext();
                const { network, organ } = yield (0, addNetworkToGraph_1.getOrGenNetworkNode)(model, context);
                const dataObject = yield this._getDataByGateway(treeToCreate.children, context, network);
                for (const nodeTocreate of treeToCreate.children) {
                    const serverKey = nodeTocreate.server ? (0, Functions_1.getServerUrl)(nodeTocreate.server) : "";
                    const gatewayData = dataObject[serverKey] || [];
                    if (!gatewayData || gatewayData.length <= 0)
                        continue;
                    const deviceData = gatewayData.find((el) => {
                        const key = (0, utils_1.getNodeKey)(nodeTocreate);
                        return (0, utils_1.normalizePath)(el.node.path || "") === key || el.node.nodeId.toString() === key;
                    });
                    if (!deviceData)
                        continue;
                    yield (0, transformTreeToGraph_1._transformTreeToGraphRecursively)(context, nodeTocreate, deviceData.nodesAlreadyCreated, network, deviceData.values);
                }
                yield model.changeState(spinal_model_opcua_1.OPCUA_ORGAN_STATES.created);
                displayLog_1.default.log("network", network.getName().get(), "created !!");
            }
            catch (error) {
                displayLog_1.default.error(error);
                model.changeState(spinal_model_opcua_1.OPCUA_ORGAN_STATES.error);
            }
        });
    }
    _getDataByGateway(nodes, context, network) {
        return __awaiter(this, void 0, void 0, function* () {
            const existingDeviceIndex = (0, transformTreeToGraph_1.createExistingDeviceIndex)(yield network.getChildrenInContext(context));
            const records = nodes
                .filter((node) => !!node.server)
                .map((node) => ({
                node,
                variables: (0, Functions_1.getVariablesList)(node),
                url: (0, Functions_1.getServerUrl)(node.server),
            }));
            const preparedRecords = yield (0, utils_1.executeConcurrently)(records, (record) => __awaiter(this, void 0, void 0, function* () {
                return (Object.assign(Object.assign({}, record), { nodesAlreadyCreated: yield (0, transformTreeToGraph_1.getNodeAlreadyCreated)(context, network, record.node, existingDeviceIndex) }));
            }), 5);
            const recordsByGateway = new Map();
            for (const record of preparedRecords) {
                const gatewayRecords = recordsByGateway.get(record.url) || [];
                gatewayRecords.push(record);
                recordsByGateway.set(record.url, gatewayRecords);
            }
            const gatewayRequests = Array.from(recordsByGateway.entries()).map(([url, gatewayRecords]) => {
                const variablesByKey = new Map();
                for (const record of gatewayRecords) {
                    for (const variable of record.variables) {
                        variablesByKey.set((0, utils_1.getNodeKey)(variable), variable);
                    }
                }
                return { url, records: gatewayRecords, variables: Array.from(variablesByKey.values()) };
            });
            const gatewayResults = yield (0, utils_1.executeConcurrently)(gatewayRequests, ({ url, records: gatewayRecords, variables }) => __awaiter(this, void 0, void 0, function* () {
                const values = yield this._getVariablesValues(url, variables);
                return {
                    url,
                    data: gatewayRecords.map((record) => (Object.assign(Object.assign({}, record), { values }))),
                };
            }), 4);
            const result = {};
            for (const gatewayResult of gatewayResults)
                result[gatewayResult.url] = gatewayResult.data;
            return result;
        });
    }
    _getVariablesValues(url, variables) {
        return __awaiter(this, void 0, void 0, function* () {
            const opcuaService = OPCUAFactory_1.default.getOPCUAInstance(url);
            return opcuaService
                .readNodeValue(variables)
                .then((result) => {
                const obj = {};
                for (let index = 0; index < result.length; index++) {
                    const value = result[index];
                    if (value === null)
                        continue;
                    const variable = variables[index];
                    const key = (0, utils_1.getNodeKey)(variable);
                    obj[key] = value;
                }
                return obj;
            })
                .catch((error) => {
                displayLog_1.default.error(`[_getVariablesValues] - Failed to read node values from ${url} due to:`, error);
                return {};
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
"use strict";
/*
 * Copyright 2021 SpinalCom - www.spinalcom.com
 *
 * This file is part of SpinalCore.
 *
 * Please read all of the following terms and conditions
 * of the Free Software license Agreement ("Agreement")
 * carefully.
 *
 * This Agreement is a legally binding contract between
 * the Licensee (as defined below) and SpinalCom that
 * sets forth the terms and conditions that govern your
 * use of the Program. By installing and/or using the
 * Program, you agree to abide by all the terms and
 * conditions stated or referenced herein.
 *
 * If you do not agree to abide by these terms and
 * conditions, do not demonstrate your acceptance and do
 * not install or use the Program.
 * You should have received a copy of the license along
 * with this file. If not, see
 * <http://resources.spinalcom.com/licenses.pdf>.
 */
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
exports.SpinalDevice = void 0;
const spinal_model_bmsnetwork_1 = require("spinal-model-bmsnetwork");
const events_1 = require("events");
const node_opcua_client_1 = require("node-opcua-client");
const node_opcua_1 = require("node-opcua");
const spinal_model_timeseries_1 = require("spinal-model-timeseries");
const spinal_env_viewer_graph_service_1 = require("spinal-env-viewer-graph-service");
const utils_1 = require("../utils/utils");
const profile_service_1 = require("../utils/profile_service");
const displayLog_1 = require("../utils/displayLog");
const securityMode = node_opcua_client_1.MessageSecurityMode["None"];
const securityPolicy = node_opcua_client_1.SecurityPolicy["None"];
const userIdentity = { type: node_opcua_1.UserTokenType.Anonymous };
class SpinalDevice extends events_1.EventEmitter {
    constructor(server, context, network, device, spinalListenerModel, profileId) {
        super();
        this.isInit = false;
        this.profileId = null;
        this.nodes = {};
        this.endpoints = {};
        this._browseHistoryQueue = []; // Queue for breadth-first traversal of the node tree
        this._updateQueue = []; // Queue for nodes that need to be updated
        this.server = server;
        this.context = context;
        this.network = network;
        this.device = device;
        this.deviceInfo = device.info.get();
        this.spinalListenerModel = spinalListenerModel;
        this.profileId = profileId;
        this._browseHistoryQueue = [device]; // Initialize the queue with the root device node
        this._listenToProfileUpdate();
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                displayLog_1.default.log(`[SpinalDevice] - initializing device ${this.deviceInfo.name} with profile ${this.profileId}`);
                if (this.isInit)
                    return;
                this._checkInitAndUpdate();
                const result = yield this._collectGraphData();
                this.isInit = true;
                displayLog_1.default.log(`[SpinalDevice] - device ${this.deviceInfo.name} initialized with ${Object.keys(this.endpoints).length} endpoints`);
                return result;
            }
            catch (error) {
                displayLog_1.default.error(`[SpinalDevice] - failed to init device ${this.deviceInfo.name} due to error: ${error.message}`);
            }
        });
    }
    updateEndpoints(nodes, isCov = false) {
        if (this.isInit)
            return this.updateEndpointsDirectly(nodes, isCov);
        displayLog_1.default.log(`[SpinalDevice] - ${this.deviceInfo.name} not initialized yet, the update will be queued and executed after initialization`);
        this._updateQueue.push({ nodes, isCov, date: Date.now() });
    }
    updateEndpointsDirectly(nodes, isCov = false, date = null) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const promises = [];
            for (const opcNode of nodes) {
                const key = (0, utils_1.getNodeKey)(opcNode);
                const spinalnode = yield this._getEndpoint(key);
                if (!spinalnode) {
                    displayLog_1.default.warn(`[SpinalDevice] - endpoint ${key} not found in device ${this.deviceInfo.name}`);
                    continue;
                }
                yield this._updateNodeInfo(opcNode, spinalnode);
                // const value = opcNode.value?.value || null; // may be bad if value is boolean
                const value = (_a = opcNode.value) === null || _a === void 0 ? void 0 : _a.value;
                promises.push(this._updateEndpointInGraph(spinalnode, value, isCov, date));
            }
            return Promise.all(promises)
                .then((result) => {
                if (!isCov)
                    displayLog_1.default.log(`[SpinalDevice] - device ${this.deviceInfo.name} updated`);
            })
                .catch((err) => {
                if (!isCov)
                    displayLog_1.default.error(`[SpinalDevice] - failed to update device ${this.deviceInfo.name} due to error: ${err.message}`);
            });
        });
    }
    stopMonitoring() {
        this.spinalListenerModel.monitored.set(false);
    }
    startMonitoring() {
        this.spinalListenerModel.monitored.set(true);
    }
    restartMonitoring() {
        this.stopMonitoring();
        setTimeout(() => {
            this.startMonitoring();
        }, 1000);
    }
    /////////////////////////////////////////////////////////////////////////
    //						PRIVATES METHODS
    /////////////////////////////////////////////////////////////////////////
    _updateEndpointInGraph(endpointNode, value, cov = false, date = null) {
        var _a, _b, _c, _d;
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (value === null)
                    value = "null";
                const saveTimeSeries = (_b = (_a = this.spinalListenerModel) === null || _a === void 0 ? void 0 : _a.saveTimeSeries) === null || _b === void 0 ? void 0 : _b.get();
                const element = yield endpointNode.getElement(true);
                if (!element)
                    return false;
                // element.mod_attr("currentValue", value);
                if (typeof element.currentValue === "undefined")
                    element.add_attr({ currentValue: value });
                else
                    element.currentValue.set(value);
                // avertir du changement de valeur, le log du cov est fait dans son callback
                const prefix = cov ? "[COV]" : "[PULLING]";
                displayLog_1.default.log(`${prefix} - Updating [${(_d = (_c = endpointNode.info) === null || _c === void 0 ? void 0 : _c.path) === null || _d === void 0 ? void 0 : _d.get().replace("/Objects", "")}] in graph, value :`, value);
                if (saveTimeSeries && (typeof value === "boolean" || !isNaN(value)))
                    yield this._saveTimeSeries(endpointNode, value, date);
                return true;
            }
            catch (error) {
                displayLog_1.default.error(error);
                return false;
            }
        });
    }
    _saveTimeSeries(endpointNode, value, date = null) {
        return __awaiter(this, void 0, void 0, function* () {
            const spinalServiceTimeseries = new spinal_model_timeseries_1.SpinalServiceTimeseries();
            spinal_env_viewer_graph_service_1.SpinalGraphService._addNode(endpointNode);
            if (!date)
                return spinalServiceTimeseries.pushFromEndpoint(endpointNode.getId().get(), value);
            return spinalServiceTimeseries.insertFromEndpoint(endpointNode.getId().get(), value, date);
        });
    }
    _updateNodeInfo(opcNode, spinalNode) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        return __awaiter(this, void 0, void 0, function* () {
            if (opcNode === null || opcNode === void 0 ? void 0 : opcNode.displayName) {
                const name = opcNode.displayName || opcNode.browseName;
                (_b = (_a = spinalNode.info) === null || _a === void 0 ? void 0 : _a.displayName) === null || _b === void 0 ? void 0 : _b.set(name);
                (_d = (_c = spinalNode.info) === null || _c === void 0 ? void 0 : _c.name) === null || _d === void 0 ? void 0 : _d.set(name);
            }
            if (opcNode === null || opcNode === void 0 ? void 0 : opcNode.browseName) {
                const name = opcNode.browseName || opcNode.displayName;
                (_f = (_e = spinalNode.info) === null || _e === void 0 ? void 0 : _e.browseName) === null || _f === void 0 ? void 0 : _f.set(name);
            }
            if (opcNode === null || opcNode === void 0 ? void 0 : opcNode.nodeId) {
                (_h = (_g = spinalNode.info) === null || _g === void 0 ? void 0 : _g.idNetwork) === null || _h === void 0 ? void 0 : _h.set(opcNode.nodeId.toString());
            }
        });
    }
    _getEndpoint(id) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.endpoints[id] || this.nodes[id] || this._findNodeInTree(id);
        });
    }
    _findNodeInTree(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const existingNode = this.nodes[id];
            if (existingNode) {
                return existingNode;
            }
            let queue = [...this._browseHistoryQueue]; // Start with the root device node
            const visited = new Set();
            const batchSize = 50;
            while (queue.length > 0) {
                const currentBatch = queue.splice(0, batchSize);
                const childrenResults = yield Promise.all(currentBatch.map((node) => node.getChildrenInContext(this.context)));
                for (const children of childrenResults) {
                    for (const child of children) {
                        const info = child.info.get();
                        const key = (0, utils_1.getNodeKey)(info);
                        if (visited.has(key)) {
                            continue;
                        }
                        visited.add(key);
                        this.addNode(key, child);
                        if (key === id) {
                            this._browseHistoryQueue = queue;
                            return child;
                        }
                        queue.push(child);
                    }
                }
                this._browseHistoryQueue = queue;
            }
            return undefined; // Return undefined if not found after traversing the entire tree
        });
    }
    addNode(key, node) {
        const type = node.getType().get();
        if (key)
            this.nodes[key] = node;
        if (key && type === spinal_model_bmsnetwork_1.SpinalBmsEndpoint.nodeTypeName)
            this.endpoints[key] = node;
    }
    _listenToProfileUpdate() {
        profile_service_1.OPCUAProfileService.getInstance().on(profile_service_1.PROFILE_UPDATE_EVENT, ({ profileId }) => {
            if (profileId === this.profileId) {
                displayLog_1.default.log(`[SpinalDevice] - profile ${profileId} updated, restarting monitoring for device ${this.deviceInfo.name}`);
                this.restartMonitoring();
            }
        });
    }
    _collectGraphData() {
        return __awaiter(this, void 0, void 0, function* () {
            let queue = [this.device]; // Start with the root device node
            const visited = new Set();
            const batchSize = 50;
            const allNodes = [];
            while (queue.length > 0) {
                const currentBatch = queue.splice(0, batchSize);
                const childrenResults = yield Promise.all(currentBatch.map((node) => node.getChildrenInContext(this.context)));
                for (const children of childrenResults) {
                    for (const child of children) {
                        const info = child.info.get();
                        const key = (0, utils_1.getNodeKey)(info);
                        if (visited.has(key)) {
                            continue;
                        }
                        visited.add(key);
                        allNodes.push(child);
                        this.addNode(key, child);
                        queue.push(child);
                    }
                }
                this._browseHistoryQueue = queue;
            }
            return allNodes; // Return all collected nodes
        });
    }
    _checkInitAndUpdate() {
        return __awaiter(this, void 0, void 0, function* () {
            const waitInitProm = new Promise((resolve, reject) => {
                const initFinished = () => {
                    if (!this.isInit) {
                        setTimeout(initFinished, 1000);
                        return;
                    }
                    resolve(true);
                };
                initFinished();
            });
            return waitInitProm.then(() => {
                const promises = this._updateQueue.map(({ nodes, isCov, date }) => this.updateEndpointsDirectly(nodes, isCov, date));
                this._updateQueue = [];
                return Promise.all(promises);
            });
        });
    }
}
exports.SpinalDevice = SpinalDevice;
//# sourceMappingURL=SpinalDevice.js.map
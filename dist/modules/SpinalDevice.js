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
const securityMode = node_opcua_client_1.MessageSecurityMode["None"];
const securityPolicy = node_opcua_client_1.SecurityPolicy["None"];
const userIdentity = { type: node_opcua_1.UserTokenType.Anonymous };
class SpinalDevice extends events_1.EventEmitter {
    constructor(server, context, network, device, spinalListenerModel, profile) {
        super();
        this.isInit = false;
        this.nodes = {};
        this.endpoints = {};
        this.server = server;
        this.context = context;
        this.network = network;
        this.device = device;
        this.deviceInfo = device.info.get();
        this.spinalListenerModel = spinalListenerModel;
        this.profile = profile;
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isInit)
                return;
            return this._convertNodesToObj();
        });
    }
    updateEndpoints(nodes, isCov = false) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const promises = [];
            for (const opcNode of nodes) {
                const key = (0, utils_1.normalizePath)(opcNode.path) || opcNode.nodeId.toString();
                const spinalnode = this.endpoints[key];
                if (!spinalnode)
                    continue;
                yield this._updateNodeInfo(opcNode, spinalnode);
                // const value = opcNode.value?.value || null; // may be bad if value is boolean
                const value = (_a = opcNode.value) === null || _a === void 0 ? void 0 : _a.value;
                promises.push(this._updateEndpoint(spinalnode, value, isCov));
            }
            return Promise.all(promises);
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
    _updateEndpoint(endpointNode, value, cov = false) {
        var _a, _b, _c;
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (value === null)
                    value = "null";
                const saveTimeSeries = (_a = this.spinalListenerModel.saveTimeSeries) === null || _a === void 0 ? void 0 : _a.get();
                const element = yield endpointNode.getElement(true);
                if (!element)
                    return false;
                element.mod_attr("currentValue", value);
                // avertir du changement de valeur, le log du cov est fait dans son callback
                if (!cov)
                    console.log(`[${this.deviceInfo.name}] - ${(_c = (_b = endpointNode.info) === null || _b === void 0 ? void 0 : _b.idNetwork) === null || _c === void 0 ? void 0 : _c.get()} changed value to`, value);
                if (saveTimeSeries && (typeof value === "boolean" || !isNaN(value))) {
                    const spinalServiceTimeseries = new spinal_model_timeseries_1.SpinalServiceTimeseries();
                    spinal_env_viewer_graph_service_1.SpinalGraphService._addNode(endpointNode);
                    return spinalServiceTimeseries.pushFromEndpoint(endpointNode.getId().get(), value);
                }
                return true;
            }
            catch (error) {
                console.error(error);
                return false;
            }
        });
    }
    _convertNodesToObj() {
        return this.device.findInContext(this.context, (node) => {
            var _a, _b, _c, _d;
            const key = (0, utils_1.normalizePath)((_b = (_a = node.info) === null || _a === void 0 ? void 0 : _a.path) === null || _b === void 0 ? void 0 : _b.get()) || ((_d = (_c = node.info) === null || _c === void 0 ? void 0 : _c.idNetwork) === null || _d === void 0 ? void 0 : _d.get());
            if (key)
                this.nodes[key] = node;
            if (key && node.getType().get() === spinal_model_bmsnetwork_1.SpinalBmsEndpoint.nodeTypeName)
                this.endpoints[key] = node;
            return true;
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
}
exports.SpinalDevice = SpinalDevice;
//# sourceMappingURL=SpinalDevice.js.map
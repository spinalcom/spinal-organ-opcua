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
    updateEndpoints(values, cov = false) {
        return __awaiter(this, void 0, void 0, function* () {
            const promises = Object.keys(values).map((id) => {
                var _a;
                // const value = values[id]?.value || null; // may be bad if value is boolean
                const value = (_a = values[id]) === null || _a === void 0 ? void 0 : _a.value;
                const node = this.endpoints[id];
                if (node)
                    return this._updateEndpoint(node, value, cov);
                return;
            });
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
        var _a;
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
                    console.log(`[${this.deviceInfo.name}] - ${endpointNode.info.networkId.get()} changed value to`, value);
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
            if (node.info.idNetwork)
                this.nodes[node.info.idNetwork.get()] = node;
            if (node.info.idNetwork && node.getType().get() === spinal_model_bmsnetwork_1.SpinalBmsEndpoint.nodeTypeName)
                this.endpoints[node.info.idNetwork.get()] = node;
            return true;
        });
    }
}
exports.SpinalDevice = SpinalDevice;
//# sourceMappingURL=SpinalDevice.js.map
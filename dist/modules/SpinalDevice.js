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
const OPCUAService_1 = require("../utils/OPCUAService");
const node_opcua_client_1 = require("node-opcua-client");
const node_opcua_1 = require("node-opcua");
const spinal_model_timeseries_1 = require("spinal-model-timeseries");
const spinal_env_viewer_graph_service_1 = require("spinal-env-viewer-graph-service");
const Functions_1 = require("../utils/Functions");
const securityMode = node_opcua_client_1.MessageSecurityMode["None"];
const securityPolicy = node_opcua_client_1.SecurityPolicy["None"];
const userIdentity = { type: node_opcua_1.UserTokenType.Anonymous };
class SpinalDevice extends events_1.EventEmitter {
    constructor(server, context, network, device, saveTimeSeries) {
        super();
        this.opcuaService = new OPCUAService_1.default();
        this.isInit = false;
        this.nodes = {};
        this.endpoints = {};
        this.variablesIds = [];
        this.endpointUrl = (0, Functions_1.getServerUrl)(server);
        this.context = context;
        this.network = network;
        this.device = device;
        this.deviceInfo = device.info.get();
        this.saveTimeSeries = saveTimeSeries;
    }
    init() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isInit)
                return;
            return this._convertNodesToObj();
        });
    }
    updateEndpoints(values) {
        return __awaiter(this, void 0, void 0, function* () {
            const promises = Object.keys(values).map((id) => {
                var _a;
                const value = ((_a = values[id]) === null || _a === void 0 ? void 0 : _a.value) || null;
                const node = this.endpoints[id];
                if (node)
                    return this._updateEndpoint(node, value);
                return;
            });
            return Promise.all(promises);
        });
    }
    // public async createTreeInGraph(tree: IOPCNode): Promise<SpinalNode[]> {
    // 	console.log("creating in graph...");
    // 	const values = await this._getVariablesValues(this.variablesIds);
    // 	const nodes = await this._transformTreeToGraphRecursively(tree, undefined, values);
    // 	const promises = nodes.map(({ node, relation, alreadyExist }) => {
    // 		if (!alreadyExist) {
    // 			this.device.addChildInContext(node, relation, SPINAL_RELATION_PTR_LST_TYPE, this.context);
    // 		}
    // 		return node;
    // 	});
    // 	return Promise.all(promises).then((result) => {
    // 		console.log("created");
    // 		return result;
    // 	});
    // 	// return Promise.all(promises).then(async (result) => {
    // 	// 	console.log("created");
    // 	// 	console.log("updating variables values..");
    // 	// 	const keys = Object.keys(this.endpoints);
    // 	// 	const values = await this._getVariablesValues(keys);
    // 	// 	const promises = keys.map(async (id) => {
    // 	// 		try {
    // 	// 			const node = this.endpoints[id];
    // 	// 			if (node) {
    // 	// 				const value = values[id]?.value && values[id]?.value.toString().length ? values[id].value : null;
    // 	// 				const dataType = values[id]?.dataType || "";
    // 	// 				const element = await node.getElement(true);
    // 	// 				console.log(node._server_id, value, dataType);
    // 	// 				element.mod_attr("currentValue", value);
    // 	// 				element.mod_attr("dataType", dataType);
    // 	// 			}
    // 	// 		} catch (error) {}
    // 	// 	});
    // 	// 	return Promise.all(promises).then(() => {
    // 	// 		console.log("updated");
    // 	// 		return result;
    // 	// 	});
    // 	// });
    // }
    // public async monitorItems(nodeIds: string | string[]) {
    // 	nodeIds = Array.isArray(nodeIds) ? nodeIds : [nodeIds];
    // 	await this.opcuaService.monitorItem(nodeIds, this.monitorCallback.bind(this));
    // }
    /////////////////////////////////////////////////////////////////////////
    //						PRIVATES METHODS
    /////////////////////////////////////////////////////////////////////////
    _updateEndpoint(endpointNode, value) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (value === null)
                    value = "null";
                const saveTimeSeries = (_a = this.saveTimeSeries) === null || _a === void 0 ? void 0 : _a.get();
                const element = yield endpointNode.getElement(true);
                if (!element)
                    return false;
                element.mod_attr("currentValue", value);
                console.log(`[${this.deviceInfo.name}] - ${endpointNode.getName().get()} changed value to`, value);
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
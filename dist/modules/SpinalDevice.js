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
const spinal_env_viewer_graph_service_1 = require("spinal-env-viewer-graph-service");
const OPCUAService_1 = require("../utils/OPCUAService");
const node_opcua_client_1 = require("node-opcua-client");
const node_opcua_1 = require("node-opcua");
const spinal_model_timeseries_1 = require("spinal-model-timeseries");
const spinal_env_viewer_graph_service_2 = require("spinal-env-viewer-graph-service");
const utils_1 = require("../utils/utils");
const securityMode = node_opcua_client_1.MessageSecurityMode["None"];
const securityPolicy = node_opcua_client_1.SecurityPolicy["None"];
const userIdentity = { type: node_opcua_1.UserTokenType.Anonymous };
class SpinalDevice extends events_1.EventEmitter {
    constructor(server, context, network, device) {
        super();
        this.opcuaService = new OPCUAService_1.default();
        this.isInit = false;
        this.nodes = {};
        this.endpoints = {};
        this.variablesIds = [];
        this.endpointUrl = `opc.tcp://${server.ip}:${server.port}`;
        this.context = context;
        this.network = network;
        this.device = device;
    }
    /*
    public async init() {
        console.log("initialization");
        if (this.isInit) return;
        const { certificateFile, clientCertificateManager, applicationUri, applicationName } = await certificatProm;
        const promises = [this.opcuaService.initialize(this.endpointUrl, securityMode, securityPolicy, certificateFile, clientCertificateManager, applicationName, applicationUri), this._convertNodesToObj()];
        // const promises = [this.opcuaService.initialize(this.endpointUrl, securityMode, securityPolicy, certificateFile, clientCertificateManager, applicationName, applicationUri)];

        await Promise.all(promises);
        console.log("initialized");

        return this.opcuaService.connect(this.endpointUrl, userIdentity);

        // remove this later
        // await this.opcuaService.connect(this.endpointUrl, userIdentity);
        // const keys = Object.keys(this.endpoints);
        // await this._getVariablesValues(keys);
    }

    public async discover() {
        console.log("discovering...");
        const { variables, tree } = await this.opcuaService.getTree();
        this.variablesIds = variables;
        return tree;
    }
    */
    createTreeInGraph(tree) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log("creating in graph...");
            const values = yield this._getVariablesValues(this.variablesIds);
            const nodes = yield this._transformTreeToGraphRecursively(tree, undefined, values);
            const promises = nodes.map(({ node, relation, alreadyExist }) => {
                if (!alreadyExist) {
                    this.device.addChildInContext(node, relation, spinal_env_viewer_graph_service_1.SPINAL_RELATION_PTR_LST_TYPE, this.context);
                }
                return node;
            });
            return Promise.all(promises).then((result) => {
                console.log("created");
                return result;
            });
            // return Promise.all(promises).then(async (result) => {
            // 	console.log("created");
            // 	console.log("updating variables values..");
            // 	const keys = Object.keys(this.endpoints);
            // 	const values = await this._getVariablesValues(keys);
            // 	const promises = keys.map(async (id) => {
            // 		try {
            // 			const node = this.endpoints[id];
            // 			if (node) {
            // 				const value = values[id]?.value && values[id]?.value.toString().length ? values[id].value : null;
            // 				const dataType = values[id]?.dataType || "";
            // 				const element = await node.getElement(true);
            // 				console.log(node._server_id, value, dataType);
            // 				element.mod_attr("currentValue", value);
            // 				element.mod_attr("dataType", dataType);
            // 			}
            // 		} catch (error) {}
            // 	});
            // 	return Promise.all(promises).then(() => {
            // 		console.log("updated");
            // 		return result;
            // 	});
            // });
        });
    }
    monitorItems(nodeIds) {
        return __awaiter(this, void 0, void 0, function* () {
            nodeIds = Array.isArray(nodeIds) ? nodeIds : [nodeIds];
            yield this.opcuaService.monitorItem(nodeIds, this.monitorCallback.bind(this));
        });
    }
    updateEndpoints(endpointIds, saveTimeSeries = false) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!Array.isArray(endpointIds))
                endpointIds = [endpointIds];
            const values = yield this._getVariablesValues(endpointIds);
            const promises = endpointIds.map((id) => {
                var _a;
                const value = ((_a = values[id]) === null || _a === void 0 ? void 0 : _a.value) || null;
                const node = this.endpoints[id];
                if (node)
                    return this._updateEndpoint(node, value, saveTimeSeries);
                return;
            });
            return Promise.all(promises);
        });
    }
    launchTestFunction() {
        const keys = Object.keys(this.endpoints);
        const toMonitor = keys.slice(0, keys.length / 3);
        this.monitorItems(toMonitor);
    }
    /////////////////////////////////////////////////////////////////////////
    //						PRIVATES METHODS
    /////////////////////////////////////////////////////////////////////////
    monitorCallback(id, value) {
        return __awaiter(this, void 0, void 0, function* () {
            const node = this.endpoints[id];
            if (node) {
                yield this._updateEndpoint(node, value, true);
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
    _getVariablesValues(variablesIds) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!Array.isArray(variablesIds))
                variablesIds = [variablesIds];
            const nodes = variablesIds.reduce((opcNodes, id) => {
                const node = this.endpoints[id] || id;
                const opcNode = (0, utils_1.convertSpinalNodeToOPCNode)(node);
                if (opcNode)
                    opcNodes.push(opcNode);
                return opcNodes;
            }, []);
            return this.opcuaService.readNodeValue(nodes).then((result) => {
                const obj = {};
                for (let index = 0; index < result.length; index++) {
                    const element = result[index];
                    obj[nodes[index].nodeId.toString()] = element;
                }
                return obj;
            });
        });
    }
    _transformTreeToGraphRecursively(tree, parent, values = {}) {
        const promises = (tree.children || []).map((el) => __awaiter(this, void 0, void 0, function* () {
            const { node, relation, alreadyExist } = yield this.getNodeAndRelation(el, values);
            if (parent && !alreadyExist) {
                yield parent.addChildInContext(node, relation, spinal_env_viewer_graph_service_1.SPINAL_RELATION_PTR_LST_TYPE, this.context);
            }
            yield this._transformTreeToGraphRecursively(el, node, values);
            return { node, relation, alreadyExist };
        }));
        return Promise.all(promises);
    }
    getNodeAndRelation(node, values = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            let spinalNode = this.nodes[node.nodeId.toString()];
            if (!spinalNode)
                return this._generateNodeAndRelation(node, values);
            const relation = this._getNodeRelationName(spinalNode.getType().get());
            // return { node: spinalNode, relation, alreadyExist: true };
            return { node: spinalNode, relation, alreadyExist: true };
        });
    }
    _generateNodeAndRelation(node, values = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            let element;
            let param = {
                id: node.nodeId.toString(),
                name: node.displayName,
                path: node.path,
            };
            if (this.opcuaService.isVaraiable(node)) {
                const dataValue = values[node.nodeId.toString()];
                param = Object.assign(Object.assign({}, param), { typeId: "", nodeTypeName: spinal_model_bmsnetwork_1.SpinalBmsEndpoint.nodeTypeName, type: spinal_model_bmsnetwork_1.SpinalBmsEndpoint.nodeTypeName, currentValue: (dataValue === null || dataValue === void 0 ? void 0 : dataValue.value) || "null", dataType: (dataValue === null || dataValue === void 0 ? void 0 : dataValue.dataType) || "", unit: "" });
                element = new spinal_model_bmsnetwork_1.SpinalBmsEndpoint(param);
            }
            else {
                param = Object.assign(Object.assign({}, param), { nodeTypeName: spinal_model_bmsnetwork_1.SpinalBmsEndpointGroup.nodeTypeName, type: spinal_model_bmsnetwork_1.SpinalBmsEndpointGroup.nodeTypeName });
                element = new spinal_model_bmsnetwork_1.SpinalBmsEndpointGroup(param);
            }
            const spinalNode = new spinal_env_viewer_graph_service_1.SpinalNode(param.name, param.type, element);
            spinalNode.info.add_attr({ idNetwork: param.id });
            if (param.type === spinal_model_bmsnetwork_1.SpinalBmsEndpoint.nodeTypeName)
                this.endpoints[param.id] = spinalNode;
            return { node: spinalNode, relation: this._getNodeRelationName(param.type), alreadyExist: false };
        });
    }
    _formatValue(dataValue) {
        var _a;
        let val;
        switch (dataValue.dataType) {
            case node_opcua_1.DataType.DateTime:
                val = dataValue.value
                    .toString()
                    .replace(/\(.*\)$/gi, (el) => "")
                    .trim();
            default:
                val = ((_a = dataValue.value) === null || _a === void 0 ? void 0 : _a.toString()) || dataValue.value;
        }
        return (val + "").length > 0 ? val : "null";
    }
    _getNodeRelationName(type) {
        switch (type) {
            case spinal_model_bmsnetwork_1.SpinalBmsEndpoint.nodeTypeName:
                return spinal_model_bmsnetwork_1.SpinalBmsEndpoint.relationName;
            case spinal_model_bmsnetwork_1.SpinalBmsEndpointGroup.nodeTypeName:
                return spinal_model_bmsnetwork_1.SpinalBmsEndpoint.relationName;
            case spinal_model_bmsnetwork_1.SpinalBmsDevice.nodeTypeName:
                return spinal_model_bmsnetwork_1.SpinalBmsDevice.relationName;
            case spinal_model_bmsnetwork_1.SpinalBmsNetwork.nodeTypeName:
                return spinal_model_bmsnetwork_1.SpinalBmsNetwork.relationName;
        }
    }
    _updateEndpoint(endpointNode, value, saveTimeSeries = false) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const element = yield endpointNode.getElement(true);
                if (!element)
                    return false;
                console.log(element.name.get(), "changed to", value.toString());
                element.currentValue.set(value);
                if (saveTimeSeries && (typeof value === "boolean" || !isNaN(value))) {
                    const spinalServiceTimeseries = new spinal_model_timeseries_1.SpinalServiceTimeseries();
                    spinal_env_viewer_graph_service_2.SpinalGraphService._addNode(endpointNode);
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
}
exports.SpinalDevice = SpinalDevice;
//# sourceMappingURL=SpinalDevice.js.map
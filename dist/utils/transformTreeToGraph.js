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
exports.getNodeAlreadyCreated = exports._transformTreeToGraphRecursively = void 0;
const spinal_env_viewer_graph_service_1 = require("spinal-env-viewer-graph-service");
const spinal_model_bmsnetwork_1 = require("spinal-model-bmsnetwork");
const spinal_env_viewer_plugin_documentation_service_1 = require("spinal-env-viewer-plugin-documentation-service");
const node_opcua_1 = require("node-opcua");
const OPCUAService_1 = require("./OPCUAService");
function _transformTreeToGraphRecursively(context, opcNode, nodesAlreadyCreated, parent, values = {}, depth = 0) {
    return __awaiter(this, void 0, void 0, function* () {
        const { node, relation, alreadyExist } = yield getNodeAndRelation(opcNode, nodesAlreadyCreated, values, depth);
        const { children, attributes } = _formatTree(opcNode);
        if (attributes && attributes.length > 0)
            yield _createNodeAttributes(node, attributes, values);
        if (parent && !alreadyExist) {
            yield parent.addChildInContext(node, relation, spinal_env_viewer_graph_service_1.SPINAL_RELATION_PTR_LST_TYPE, context);
        }
        const promises = (children || []).map((el) => __awaiter(this, void 0, void 0, function* () {
            const childNodeInfo = yield _transformTreeToGraphRecursively(context, el, nodesAlreadyCreated, node, values, depth + 1);
            return childNodeInfo;
        }));
        return Promise.all(promises).then((result) => {
            return { node, relation, alreadyExist };
        });
    });
}
exports._transformTreeToGraphRecursively = _transformTreeToGraphRecursively;
function getNodeAlreadyCreated(context, network, serverInfo) {
    return __awaiter(this, void 0, void 0, function* () {
        const obj = {};
        const devices = yield network.getChildrenInContext(context);
        // cette condition par du principe que chaque gateway a un device unique (si ce n'est pas le cas, il faudra changer la condition)
        const device = devices.find((el) => { var _a, _b, _c, _d; return ((_b = (_a = el.info.server) === null || _a === void 0 ? void 0 : _a.address) === null || _b === void 0 ? void 0 : _b.get()) === serverInfo.address && ((_d = (_c = el.info.server) === null || _c === void 0 ? void 0 : _c.port) === null || _d === void 0 ? void 0 : _d.get()) === serverInfo.port; });
        if (!device)
            return obj;
        return device.findInContext(context, (node) => {
            var _a, _b;
            if ((_b = (_a = node.info) === null || _a === void 0 ? void 0 : _a.idNetwork) === null || _b === void 0 ? void 0 : _b.get())
                obj[node.info.idNetwork.get()] = node;
            return true;
        }).then(() => {
            return obj;
        });
    });
}
exports.getNodeAlreadyCreated = getNodeAlreadyCreated;
function getNodeAndRelation(node, nodesAlreadyCreated, values = {}, depth = 0) {
    return __awaiter(this, void 0, void 0, function* () {
        let spinalNode = nodesAlreadyCreated[node.nodeId.toString()];
        if (!spinalNode) {
            if (depth == 0)
                return _generateDevice(node);
            return _generateNodeAndRelation(node, values);
        }
        const relation = _getNodeRelationName(spinalNode.getType().get());
        const data = values[node.nodeId.toString()];
        yield _changeValueAndDataType(spinalNode, data);
        return { node: spinalNode, relation, alreadyExist: true };
    });
}
function _generateNodeAndRelation(node, values = {}) {
    let element;
    let param = {
        id: node.nodeId.toString(),
        name: node.displayName,
        path: node.path,
        displayName: node.displayName || "",
        browseName: node.browseName || ""
    };
    if (OPCUAService_1.default.isVariable(node)) {
        const dataValue = values[node.nodeId.toString()];
        param = Object.assign(Object.assign({}, param), { typeId: "", nodeTypeName: spinal_model_bmsnetwork_1.SpinalBmsEndpoint.nodeTypeName, type: spinal_model_bmsnetwork_1.SpinalBmsEndpoint.nodeTypeName, currentValue: (dataValue === null || dataValue === void 0 ? void 0 : dataValue.value) || "null", dataType: (dataValue === null || dataValue === void 0 ? void 0 : dataValue.dataType) || "", unit: "" });
        element = new spinal_model_bmsnetwork_1.SpinalBmsEndpoint(param);
    }
    else {
        param = Object.assign(Object.assign({}, param), { nodeTypeName: spinal_model_bmsnetwork_1.SpinalBmsEndpointGroup.nodeTypeName, type: spinal_model_bmsnetwork_1.SpinalBmsEndpointGroup.nodeTypeName });
        element = new spinal_model_bmsnetwork_1.SpinalBmsEndpointGroup(param);
    }
    const spinalNode = new spinal_env_viewer_graph_service_1.SpinalNode(param.name, param.type, element);
    spinalNode.info.add_attr({
        idNetwork: element.id,
        displayName: element.displayName || "",
        browseName: element.browseName || "",
        path: element.path
    });
    return { node: spinalNode, relation: _getNodeRelationName(param.type), alreadyExist: false };
}
function _generateDevice(node) {
    var _a, _b, _c, _d, _e, _f;
    let param = {
        id: node.nodeId.toString(),
        name: node.displayName,
        type: spinal_model_bmsnetwork_1.SpinalBmsDevice.nodeTypeName,
        path: node.path,
        nodeTypeName: spinal_model_bmsnetwork_1.SpinalBmsDevice.nodeTypeName,
        server: {
            address: (_a = node.server) === null || _a === void 0 ? void 0 : _a.address,
            port: (_b = node.server) === null || _b === void 0 ? void 0 : _b.port,
            endpoint: ((_c = node.server) === null || _c === void 0 ? void 0 : _c.endpoint) || ""
        },
        displayName: node === null || node === void 0 ? void 0 : node.displayName,
        browseName: node === null || node === void 0 ? void 0 : node.browseName
    };
    let element = new spinal_model_bmsnetwork_1.SpinalBmsDevice(param);
    const spinalNode = new spinal_env_viewer_graph_service_1.SpinalNode(param.name, param.type, element);
    spinalNode.info.add_attr({
        idNetwork: element.id,
        displayName: element.displayName || "",
        browseName: element.browseName || "",
        path: element.path,
        server: {
            address: (_d = node.server) === null || _d === void 0 ? void 0 : _d.address,
            port: (_e = node.server) === null || _e === void 0 ? void 0 : _e.port,
            endpoint: ((_f = node.server) === null || _f === void 0 ? void 0 : _f.endpoint) || ""
        },
    });
    return { node: spinalNode, relation: _getNodeRelationName(param.type), alreadyExist: false };
}
function _getNodeRelationName(type) {
    switch (type) {
        case spinal_model_bmsnetwork_1.SpinalBmsEndpoint.nodeTypeName:
            return spinal_model_bmsnetwork_1.SpinalBmsEndpoint.relationName;
        case spinal_model_bmsnetwork_1.SpinalBmsEndpointGroup.nodeTypeName:
            return spinal_model_bmsnetwork_1.SpinalBmsEndpointGroup.relationName;
        case spinal_model_bmsnetwork_1.SpinalBmsDevice.nodeTypeName:
            return spinal_model_bmsnetwork_1.SpinalBmsDevice.relationName;
        case spinal_model_bmsnetwork_1.SpinalBmsNetwork.nodeTypeName:
            return spinal_model_bmsnetwork_1.SpinalBmsNetwork.relationName;
    }
}
function _formatTree(tree) {
    if (tree.nodeClass != node_opcua_1.NodeClass.Variable)
        return { children: tree.children, attributes: [] };
    return tree.children.reduce((obj, item) => {
        var _a;
        if (item.nodeClass == node_opcua_1.NodeClass.Variable && (!(item === null || item === void 0 ? void 0 : item.children) || ((_a = item === null || item === void 0 ? void 0 : item.children) === null || _a === void 0 ? void 0 : _a.length) == 0)) {
            obj.attributes.push(item);
        }
        else {
            obj.children.push(item);
        }
        return obj;
    }, { children: [], attributes: [] });
}
function _createNodeAttributes(node, attributes, values = {}) {
    const categoryName = "OPC Attributes";
    return spinal_env_viewer_plugin_documentation_service_1.serviceDocumentation.addCategoryAttribute(node, categoryName).then((attributeCategory) => {
        const promises = [];
        const formatted = attributes.map((el) => { var _a; return ({ name: el.displayName, value: ((_a = values[el.nodeId.toString()]) === null || _a === void 0 ? void 0 : _a.value) || "" }); });
        for (const { name, value } of formatted) {
            promises.push(spinal_env_viewer_plugin_documentation_service_1.serviceDocumentation.addAttributeByCategory(node, attributeCategory, name, value));
        }
        return Promise.all(promises);
    });
}
function _changeValueAndDataType(node, data) {
    return __awaiter(this, void 0, void 0, function* () {
        const element = yield node.getElement();
        element.mod_attr("currentValue", (data === null || data === void 0 ? void 0 : data.value) || "null");
        element.mod_attr("dataType", (data === null || data === void 0 ? void 0 : data.dataType) || "");
    });
}
//# sourceMappingURL=transformTreeToGraph.js.map
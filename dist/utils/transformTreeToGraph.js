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
exports._transformTreeToGraphRecursively = void 0;
const spinal_env_viewer_graph_service_1 = require("spinal-env-viewer-graph-service");
const spinal_model_bmsnetwork_1 = require("spinal-model-bmsnetwork");
const spinal_env_viewer_plugin_documentation_service_1 = require("spinal-env-viewer-plugin-documentation-service");
const node_opcua_1 = require("node-opcua");
const OPCUAService_1 = require("./OPCUAService");
function _transformTreeToGraphRecursively(context, tree, parent, values = {}) {
    return __awaiter(this, void 0, void 0, function* () {
        const { node, relation, alreadyExist } = getNodeAndRelation(tree, values);
        const { children, attributes } = _formatTree(tree);
        yield _createNodeAttributes(node, attributes, values);
        if (parent && !alreadyExist) {
            yield parent.addChildInContext(node, relation, spinal_env_viewer_graph_service_1.SPINAL_RELATION_PTR_LST_TYPE, context);
        }
        const promises = (children || []).map((el) => __awaiter(this, void 0, void 0, function* () {
            const childNodeInfo = yield _transformTreeToGraphRecursively(context, el, node, values);
            return childNodeInfo;
        }));
        return Promise.all(promises).then((result) => {
            return { node, relation, alreadyExist };
        });
    });
}
exports._transformTreeToGraphRecursively = _transformTreeToGraphRecursively;
function getNodeAndRelation(node, values = {}) {
    // let spinalNode: SpinalNode = this.nodes[node.nodeId.toString()];
    // if (!spinalNode) return this._generateNodeAndRelation(node, values);
    // const relation = _getNodeRelationName(spinalNode.getType().get());
    // // return { node: spinalNode, relation, alreadyExist: true };
    // return { node: spinalNode, relation, alreadyExist: true };
    return _generateNodeAndRelation(node, values);
}
function _generateNodeAndRelation(node, values = {}) {
    let element;
    let param = {
        id: node.nodeId.toString(),
        name: node.displayName,
        path: node.path,
    };
    const opcuaService = new OPCUAService_1.default();
    if (opcuaService.isVaraiable(node)) {
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
//# sourceMappingURL=transformTreeToGraph.js.map
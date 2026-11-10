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
exports.getNodeAlreadyCreated = exports.createExistingDeviceIndex = exports._transformTreeToGraphRecursively = void 0;
const spinal_env_viewer_graph_service_1 = require("spinal-env-viewer-graph-service");
const spinal_model_bmsnetwork_1 = require("spinal-model-bmsnetwork");
const spinal_env_viewer_plugin_documentation_service_1 = require("spinal-env-viewer-plugin-documentation-service");
const node_opcua_1 = require("node-opcua");
const OPCUAService_1 = require("./OPCUAService");
const utils_1 = require("./utils");
function createGraphOperationLimiter(maxConcurrent) {
    let activeOperations = 0;
    const waitingOperations = [];
    return (operation) => __awaiter(this, void 0, void 0, function* () {
        if (activeOperations >= maxConcurrent) {
            yield new Promise((resolve) => waitingOperations.push(resolve));
        }
        else {
            activeOperations++;
        }
        try {
            return yield operation();
        }
        finally {
            const nextOperation = waitingOperations.shift();
            if (nextOperation)
                nextOperation();
            else
                activeOperations--;
        }
    });
}
function _transformTreeToGraphRecursively(context, opcNode, nodesAlreadyCreated, parent, values = {}, depth = 0, limiter) {
    return __awaiter(this, void 0, void 0, function* () {
        const operationLimiter = limiter || createGraphOperationLimiter(10);
        const { node, relation, alreadyExist } = yield operationLimiter(() => getNodeAndRelation(opcNode, nodesAlreadyCreated, values, depth));
        const { children, attributes } = _formatTree(opcNode);
        if (attributes && attributes.length > 0)
            yield operationLimiter(() => _createNodeAttributes(node, attributes, values));
        if (parent && !alreadyExist) {
            yield operationLimiter(() => parent.addChildInContext(node, relation, spinal_env_viewer_graph_service_1.SPINAL_RELATION_PTR_LST_TYPE, context));
        }
        const promises = (children || []).map((el) => __awaiter(this, void 0, void 0, function* () {
            const childNodeInfo = yield _transformTreeToGraphRecursively(context, el, nodesAlreadyCreated, node, values, depth + 1, operationLimiter);
            return childNodeInfo;
        }));
        return Promise.all(promises).then((result) => {
            return { node, relation, alreadyExist };
        });
    });
}
exports._transformTreeToGraphRecursively = _transformTreeToGraphRecursively;
function createDeviceIndexKey(address, port, nodeKey) {
    return JSON.stringify([address, String(port), nodeKey]);
}
function createExistingDeviceIndex(devices) {
    var _a, _b, _c, _d;
    const index = new Map();
    for (const device of devices) {
        const address = (_b = (_a = device.info.server) === null || _a === void 0 ? void 0 : _a.address) === null || _b === void 0 ? void 0 : _b.get();
        const port = (_d = (_c = device.info.server) === null || _c === void 0 ? void 0 : _c.port) === null || _d === void 0 ? void 0 : _d.get();
        const key = (0, utils_1.getNodeKey)(device.info.get());
        if (address == null || port == null || !key)
            continue;
        index.set(createDeviceIndexKey(address, port, key), device);
    }
    return index;
}
exports.createExistingDeviceIndex = createExistingDeviceIndex;
function getNodeAlreadyCreated(context, network, opcNode, deviceIndex) {
    return __awaiter(this, void 0, void 0, function* () {
        const index = deviceIndex || createExistingDeviceIndex(yield network.getChildrenInContext(context));
        const serverInfo = opcNode.server;
        const address = serverInfo === null || serverInfo === void 0 ? void 0 : serverInfo.address;
        const port = serverInfo === null || serverInfo === void 0 ? void 0 : serverInfo.port;
        if (address == null || port == null)
            return {};
        const pathKey = (0, utils_1.normalizePath)(opcNode.path || "");
        const device = index.get(createDeviceIndexKey(address, port, pathKey)) || index.get(createDeviceIndexKey(address, port, opcNode.nodeId.toString()));
        if (!device)
            return {}; // If no device found, return an empty object
        const info = device.info.get();
        const key = (0, utils_1.getNodeKey)(info);
        const obj = { [key]: device };
        return device
            .findInContext(context, (node) => {
            const info = node.info.get();
            const nodeKey = (0, utils_1.getNodeKey)(info);
            if (nodeKey)
                obj[nodeKey] = node;
            return true;
        })
            .then(() => {
            return obj;
        });
    });
}
exports.getNodeAlreadyCreated = getNodeAlreadyCreated;
function getNodeAndRelation(opcNode, nodesAlreadyCreated, values = {}, depth = 0) {
    return __awaiter(this, void 0, void 0, function* () {
        const key = (0, utils_1.getNodeKey)(opcNode);
        let spinalNode = nodesAlreadyCreated[key];
        if (!spinalNode) {
            // If the node does not exist, create it
            if (depth == 0)
                return _generateDevice(opcNode);
            return _generateNodeAndRelation(opcNode, values);
        }
        else {
            _updateNodeInfo(spinalNode, opcNode);
        }
        const relation = _getNodeRelationName(spinalNode.getType().get());
        const data = values[key];
        yield _changeValueAndDataType(spinalNode, data);
        return { node: spinalNode, relation, alreadyExist: true };
    });
}
function _updateNodeInfo(spinalNode, opcNode) {
    spinalNode.info.name.set(opcNode.displayName || opcNode.browseName);
    spinalNode.info.idNetwork.set(opcNode.nodeId.toString());
    spinalNode.info.path.set((0, utils_1.normalizePath)(opcNode.path || ""));
    if (spinalNode.info.displayName)
        spinalNode.info.displayName.set(opcNode.displayName || opcNode.browseName);
    if (spinalNode.info.browseName)
        spinalNode.info.browseName.set(opcNode.browseName || spinalNode.info.browseName);
    return spinalNode;
}
function _generateNodeAndRelation(node, values = {}) {
    let element;
    let param = {
        id: node.nodeId.toString(),
        name: node.displayName,
        path: (0, utils_1.normalizePath)(node.path || ""),
        displayName: node.displayName || node.browseName,
        browseName: node.browseName || node.displayName,
    };
    if (OPCUAService_1.default.isVariable(node)) {
        const key = (0, utils_1.getNodeKey)(node);
        const dataValue = values[key];
        param = Object.assign(Object.assign({}, param), { typeId: "", nodeTypeName: spinal_model_bmsnetwork_1.SpinalBmsEndpoint.nodeTypeName, type: spinal_model_bmsnetwork_1.SpinalBmsEndpoint.nodeTypeName, 
            // currentValue: dataValue?.value || "null", // may be bad if value is boolean
            currentValue: dataValue === null || dataValue === void 0 ? void 0 : dataValue.value, dataType: (dataValue === null || dataValue === void 0 ? void 0 : dataValue.dataType) || "", unit: "" });
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
        path: (0, utils_1.normalizePath)(element.path.get() || ""),
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
            endpoint: ((_c = node.server) === null || _c === void 0 ? void 0 : _c.endpoint) || "",
        },
        displayName: node === null || node === void 0 ? void 0 : node.displayName,
        browseName: node === null || node === void 0 ? void 0 : node.browseName,
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
            endpoint: ((_f = node.server) === null || _f === void 0 ? void 0 : _f.endpoint) || "",
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
        default:
            throw new Error(`Unknown type ${type}`);
    }
}
function _formatTree(tree) {
    if (tree.nodeClass != node_opcua_1.NodeClass.Variable)
        return { children: tree.children, attributes: [] };
    const result = { children: [], attributes: [] };
    for (const item of tree.children || []) {
        // if (item.nodeClass == NodeClass.Variable && (!item?.children || item?.children?.length == 0)) {
        // 	result.attributes.push(item);
        // } else {
        result.children.push(item);
        // }
    }
    return result;
}
function _createNodeAttributes(node, attributes, values = {}) {
    var _a;
    const categoryName = "OPC Attributes";
    //[TODO] use createOrUpdateAttrsAndCategories
    const formatted = {};
    for (const attr of attributes) {
        const key = (0, utils_1.getNodeKey)(attr);
        const value = ((_a = values[key]) === null || _a === void 0 ? void 0 : _a.value) || "";
        if (attr.displayName)
            formatted[attr.displayName] = value;
    }
    return spinal_env_viewer_plugin_documentation_service_1.serviceDocumentation.createOrUpdateAttrsAndCategories(node, categoryName, formatted).then((result) => {
        return result;
    });
}
function _changeValueAndDataType(node, data) {
    return __awaiter(this, void 0, void 0, function* () {
        const element = yield node.getElement(true);
        if (typeof element.currentValue === "undefined")
            element.add_attr({ currentValue: data === null || data === void 0 ? void 0 : data.value });
        else
            element.currentValue.set(data === null || data === void 0 ? void 0 : data.value);
        // element.mod_attr("dataType", data?.dataType || "");
        if (typeof element.dataType === "undefined")
            element.add_attr({ dataType: (data === null || data === void 0 ? void 0 : data.dataType) || "" });
        else
            element.dataType.set((data === null || data === void 0 ? void 0 : data.dataType) || "");
    });
}
//# sourceMappingURL=transformTreeToGraph.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.coerceStringToDataType = exports.coerceFunc = exports.coerceNoop = exports.coerceNumberR = exports.coerceNumber = exports.coerceBoolean = exports.convertSpinalNodeToOPCNode = exports.convertToBrowseDescription = exports.getConfig = void 0;
const node_opcua_1 = require("node-opcua");
function getConfig() {
    return {
        name: process.env.ORGAN_NAME || "EDIT_ME",
        userId: process.env.USER_ID || "EDIT_ME",
        password: process.env.PASSWORD || "EDIT_ME",
        protocol: process.env.PROTOCOL || "EDIT_ME",
        host: process.env.HOST || "EDIT_ME",
        port: process.env.PORT || "EDIT_ME",
        path: process.env.ORGAN_FOLDER_PATH || "EDIT_ME",
    };
}
exports.getConfig = getConfig;
function convertToBrowseDescription(node) {
    return [
        {
            nodeId: node.nodeId,
            referenceTypeId: "Organizes",
            includeSubtypes: true,
            browseDirection: node_opcua_1.BrowseDirection.Forward,
            resultMask: 0x3f,
        },
        {
            nodeId: node.nodeId,
            referenceTypeId: "Aggregates",
            includeSubtypes: true,
            browseDirection: node_opcua_1.BrowseDirection.Forward,
            resultMask: 0x3f,
        },
        {
            nodeId: node.nodeId,
            referenceTypeId: "HasSubtype",
            includeSubtypes: true,
            browseDirection: node_opcua_1.BrowseDirection.Forward,
            resultMask: 0x3f,
        },
    ];
}
exports.convertToBrowseDescription = convertToBrowseDescription;
function convertSpinalNodeToOPCNode(node) {
    const isString = typeof node === "string";
    return {
        displayName: isString ? node : node.info.name.get(),
        nodeId: isString ? node : node.info.idNetwork.get(),
    };
}
exports.convertSpinalNodeToOPCNode = convertSpinalNodeToOPCNode;
const coerceBoolean = (data) => {
    return data === "true" || data === "1" || data === true;
};
exports.coerceBoolean = coerceBoolean;
const coerceNumber = (data) => {
    return parseInt(data, 10);
};
exports.coerceNumber = coerceNumber;
const coerceNumberR = (data) => {
    return parseFloat(data);
};
exports.coerceNumberR = coerceNumberR;
const coerceNoop = (data) => data;
exports.coerceNoop = coerceNoop;
const coerceFunc = (dataType) => {
    switch (dataType) {
        case node_opcua_1.DataType.Boolean:
            return exports.coerceBoolean;
        case node_opcua_1.DataType.Int16:
        case node_opcua_1.DataType.Int32:
        case node_opcua_1.DataType.Int64:
        case node_opcua_1.DataType.UInt16:
        case node_opcua_1.DataType.UInt32:
        case node_opcua_1.DataType.UInt64:
            return exports.coerceNumber;
        case node_opcua_1.DataType.Double:
        case node_opcua_1.DataType.Float:
            return exports.coerceNumberR;
        default:
            return exports.coerceNoop;
    }
};
exports.coerceFunc = coerceFunc;
function coerceStringToDataType(dataType, arrayType, VariantArrayType, data) {
    const c = (0, exports.coerceFunc)(dataType);
    if (arrayType === VariantArrayType.Scalar) {
        return c(data);
    }
    else {
        return data.map((d) => c(d));
    }
}
exports.coerceStringToDataType = coerceStringToDataType;
//# sourceMappingURL=utils.js.map
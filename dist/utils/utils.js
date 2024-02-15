"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertSpinalNodeToOPCNode = exports.convertToBrowseDescription = exports.getConfig = void 0;
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
//# sourceMappingURL=utils.js.map
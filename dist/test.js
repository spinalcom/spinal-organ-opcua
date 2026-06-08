"use strict";
// import { SpinalBmsDevice } from "spinal-model-bmsnetwork";
// import { getConfig } from "./utils/utils";
// import discoveringStore from "./utils/discoveringProcessStore";
// import OPCUAService from "./utils/OPCUAService";
// import OPCUAFactory from "./utils/OPCUAFactory";
// import { SpinalContext, SpinalGraph, SpinalNode } from "spinal-env-viewer-graph-service";
Object.defineProperty(exports, "__esModule", { value: true });
const OPCUAFactory_1 = require("./utils/OPCUAFactory");
function getNodePaht(ip, port, nodePath) {
    const opcuaService = OPCUAFactory_1.OPCUAFactory.getOPCUAInstance(`opc.tcp://${ip}:${port}`);
    opcuaService
        .checkAndRetablishConnection()
        .then(() => {
        // opcuaService
        // 	.getNodeIdByPath(nodePath)
        opcuaService
            ._browToGetNodeByPath(nodePath)
            .then((nodeId) => {
            console.log(`Node id for path ${nodePath}: ${nodeId}`);
        })
            .catch((err) => {
            console.error(`Error getting node id for path ${nodePath}:`, err);
        });
    })
        .catch((err) => {
        console.error(err);
    });
}
//# sourceMappingURL=test.js.map
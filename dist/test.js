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
exports.getNetwork = void 0;
const utils_1 = require("./utils/utils");
const discoveringProcessStore_1 = require("./utils/discoveringProcessStore");
const { spinalCore } = require("spinal-core-connectorjs_type");
const { SpinalBmsNetwork } = require("spinal-model-bmsnetwork");
const { SpinalNode, SPINAL_RELATION_PTR_LST_TYPE, SpinalContext, SpinalGraph } = require("spinal-model-graph");
const { SpinalOPCUADiscoverModel } = require("spinal-model-opcua");
function getNetwork(connect) {
    return new Promise((resolve, reject) => {
        const path = "/__users__/admin/Digital twin";
        spinalCore.load(connect, path, (graph) => __awaiter(this, void 0, void 0, function* () {
            const contextName = "OPCUA network";
            const organName = "spinal-organ-opcua-dev";
            const context = yield getContext(graph, contextName);
            const organ = yield getOrgan(context, organName);
            const network = {
                ip: "172.29.32.47",
                port: "26543",
                name: "Network 1",
                endpoint: "",
            };
            return resolve({ graph, context, organ, network });
        }), () => {
            console.log("hello");
        });
    });
}
exports.getNetwork = getNetwork;
function getContext(graph, contextName) {
    return __awaiter(this, void 0, void 0, function* () {
        const children = yield graph.getChildren();
        return children.find((el) => el.getName().get() === contextName);
    });
}
function getOrgan(context, organName) {
    return __awaiter(this, void 0, void 0, function* () {
        const children = yield context.getChildren();
        return children.find((el) => el.getName().get() === organName);
    });
}
(function () {
    return __awaiter(this, void 0, void 0, function* () {
        const { protocol, host, port, userId, password, path, name } = (0, utils_1.getConfig)();
        const url = `${protocol}://${userId}:${password}@${host}:${port}/`;
        const connect = spinalCore.connect(url);
        const { graph, context, organ, network } = yield getNetwork(connect);
        const spinalOPCUADiscoverModel = new SpinalOPCUADiscoverModel(graph, context, organ, network);
        const excelPath = `opc.tcp://172.29.32.47:26543`;
        const excelData = yield discoveringProcessStore_1.default.getProgress(excelPath);
        spinalOPCUADiscoverModel.addToGraph();
        yield spinalOPCUADiscoverModel.setTreeDiscovered(excelData);
        const tree = yield spinalOPCUADiscoverModel.getTreeDiscovered();
        console.log(tree);
    });
}());
//# sourceMappingURL=test.js.map
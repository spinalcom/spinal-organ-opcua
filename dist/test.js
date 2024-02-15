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
const spinal_model_bmsnetwork_1 = require("spinal-model-bmsnetwork");
const { spinalCore } = require("spinal-core-connectorjs_type");
const { SpinalBmsNetwork } = require("spinal-model-bmsnetwork");
const { SpinalNode, SPINAL_RELATION_PTR_LST_TYPE, SpinalContext, SpinalGraph } = require("spinal-model-graph");
const { SpinalOPCUADiscoverModel } = require("spinal-model-opcua");
function getNetwork(connect) {
    return new Promise((resolve, reject) => {
        const path = "/__users__/admin/Mission/Digital twin Mission";
        spinalCore.load(connect, path, (graph) => __awaiter(this, void 0, void 0, function* () {
            const contextName = "test organ opcua";
            const organName = "spinal-organ-opcua";
            const networkName = "Reseau 1";
            const deviceName = "Device 1";
            const context = yield getContext(graph, contextName);
            const organ = yield getOrgan(context, organName);
            const network = yield getOrCreateNetwork(graph, context, organ, networkName);
            const device = yield getOrCreateDevice(context, network, deviceName);
            return resolve({ graph, context, organ, network, device });
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
function getOrCreateNetwork(graph, context, organ, networkName) {
    return __awaiter(this, void 0, void 0, function* () {
        const children = yield organ.getChildren();
        const found = children.find((el) => el.getName().get() === networkName);
        if (found)
            return found;
        // const service = new NetworkService(false);
        // await service.init(graph, { contextName: context.getName().get(), contextType: "Network", networkType: SpinalBmsNetwork.nodeTypeName, networkName}, false)
        const res = new SpinalBmsNetwork(networkName, "network");
        const node = new SpinalNode(networkName, SpinalBmsNetwork.nodeTypeName, res);
        return organ.addChildInContext(node, SpinalBmsNetwork.relationName, SPINAL_RELATION_PTR_LST_TYPE, context);
    });
}
function getOrCreateDevice(context, network, deviceName) {
    return __awaiter(this, void 0, void 0, function* () {
        const children = yield network.getChildren();
        const found = children.find((el) => el.getName().get() === deviceName);
        if (found)
            return found;
        const res = new spinal_model_bmsnetwork_1.SpinalBmsDevice({
            id: "mon test",
            name: deviceName,
            type: spinal_model_bmsnetwork_1.SpinalBmsDevice.nodeTypeName,
            path: "",
            address: "",
            nodeTypeName: spinal_model_bmsnetwork_1.SpinalBmsDevice.nodeTypeName,
        });
        const node = new SpinalNode(deviceName, spinal_model_bmsnetwork_1.SpinalBmsDevice.nodeTypeName, res);
        return network.addChildInContext(node, spinal_model_bmsnetwork_1.SpinalBmsDevice.relationName, SPINAL_RELATION_PTR_LST_TYPE, context);
    });
}
//# sourceMappingURL=test.js.map
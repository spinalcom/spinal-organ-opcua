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
exports.getOrganNode = exports.addNetworkToGraph = void 0;
const spinal_env_viewer_graph_service_1 = require("spinal-env-viewer-graph-service");
const spinal_model_bmsnetwork_1 = require("spinal-model-bmsnetwork");
function addNetworkToGraph(model, nodes, context) {
    return __awaiter(this, void 0, void 0, function* () {
        context = context || (yield model.getContext());
        const { network, organ } = yield getOrGenNetworkNode(model, context);
        const promises = nodes.map(({ node, relation }) => network.addChildInContext(node, relation, spinal_env_viewer_graph_service_1.SPINAL_RELATION_PTR_LST_TYPE, context));
        return Promise.all(promises).then((net) => __awaiter(this, void 0, void 0, function* () {
            return organ.addChildInContext(network, spinal_model_bmsnetwork_1.SpinalBmsNetwork.relationName, spinal_env_viewer_graph_service_1.SPINAL_RELATION_PTR_LST_TYPE, context);
        }));
    });
}
exports.addNetworkToGraph = addNetworkToGraph;
function getOrGenNetworkNode(model, context) {
    return __awaiter(this, void 0, void 0, function* () {
        context = context || (yield model.getContext());
        const organElement = yield model.getOrgan();
        const organ = yield getOrganNode(organElement, context.getId().get());
        const server = model.network.get();
        const children = yield organ.getChildrenInContext(context);
        let network = children.find((child) => child.getName().get() === server.name);
        if (!network) {
            const element = new spinal_model_bmsnetwork_1.SpinalBmsNetwork(server.name, spinal_model_bmsnetwork_1.SpinalBmsNetwork.nodeTypeName);
            network = new spinal_env_viewer_graph_service_1.SpinalNode(server.name, spinal_model_bmsnetwork_1.SpinalBmsNetwork.nodeTypeName, element);
        }
        network.info.mod_attr("serverInfo", server);
        return { network, organ, context };
    });
}
function getOrganNode(organ, contextId) {
    return new Promise((resolve, reject) => {
        try {
            organ.references[contextId].load((node) => {
                if (node instanceof spinal_env_viewer_graph_service_1.SpinalNode)
                    resolve(node);
                else
                    reject("Error: getOrganNode");
            });
        }
        catch (error) {
            reject(error);
        }
    });
}
exports.getOrganNode = getOrganNode;
//# sourceMappingURL=addNetworkToGraph.js.map
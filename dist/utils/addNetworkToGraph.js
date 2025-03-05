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
exports.getOrganNode = exports.getOrGenNetworkNode = exports.addNetworkToGraph = void 0;
const spinal_env_viewer_graph_service_1 = require("spinal-env-viewer-graph-service");
const spinal_model_bmsnetwork_1 = require("spinal-model-bmsnetwork");
function addNetworkToGraph(nodes, context, network, organ) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = [];
        for (const { node, relation } of nodes) {
            const n = yield network.addChildInContext(node, relation, spinal_env_viewer_graph_service_1.SPINAL_RELATION_PTR_LST_TYPE, context).catch((e) => { });
            result.push(n);
        }
        return organ.addChildInContext(network, spinal_model_bmsnetwork_1.SpinalBmsNetwork.relationName, spinal_env_viewer_graph_service_1.SPINAL_RELATION_PTR_LST_TYPE, context).catch((e) => {
            return network;
        });
        // const promises = nodes.map(({ node, relation }) => {
        // 	return network.addChildInContext(node, relation, SPINAL_RELATION_PTR_LST_TYPE, context).catch((e) => { });
        // });
        // return Promise.all(promises).then(async (net) => {
        // 	return organ.addChildInContext(network, SpinalBmsNetwork.relationName, SPINAL_RELATION_PTR_LST_TYPE, context).catch((e) => {
        // 		return network;
        // 	});
        // });
    });
}
exports.addNetworkToGraph = addNetworkToGraph;
function getOrGenNetworkNode(model, context) {
    return __awaiter(this, void 0, void 0, function* () {
        context = context || (yield model.getContext());
        const organElement = yield model.getOrgan();
        const organ = yield getOrganNode(organElement, context.getId().get());
        const serverName = model.network.name.get();
        // delete server.address;
        const children = yield organ.getChildrenInContext(context);
        let network = children.find((child) => child.getName().get() === serverName);
        if (!network) {
            const element = new spinal_model_bmsnetwork_1.SpinalBmsNetwork(serverName, spinal_model_bmsnetwork_1.SpinalBmsNetwork.nodeTypeName);
            const networkNode = new spinal_env_viewer_graph_service_1.SpinalNode(serverName, spinal_model_bmsnetwork_1.SpinalBmsNetwork.nodeTypeName, element);
            network = yield organ.addChildInContext(networkNode, spinal_model_bmsnetwork_1.SpinalBmsNetwork.relationName, spinal_env_viewer_graph_service_1.SPINAL_RELATION_PTR_LST_TYPE, context);
        }
        // network.info.mod_attr("serverInfo", server);
        return { network, organ, context };
    });
}
exports.getOrGenNetworkNode = getOrGenNetworkNode;
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
import { SpinalNode, SpinalContext } from "spinal-env-viewer-graph-service";
import { SpinalOrganOPCUA } from "spinal-model-opcua";
export declare function addNetworkToGraph(nodes: {
    node: SpinalNode;
    relation: string;
    attributes: any;
}[], context: SpinalContext, network: SpinalNode, organ: SpinalNode): Promise<SpinalNode<any>>;
export declare function getOrGenNetworkNode(model: any, context: SpinalContext): Promise<{
    network: SpinalNode<any>;
    organ: SpinalNode<any>;
    context: SpinalContext<any>;
}>;
export declare function getOrganNode(organ: SpinalOrganOPCUA, contextId: string): Promise<SpinalNode>;

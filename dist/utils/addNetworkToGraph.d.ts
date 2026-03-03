import { SpinalNode, SpinalContext } from "spinal-env-viewer-graph-service";
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

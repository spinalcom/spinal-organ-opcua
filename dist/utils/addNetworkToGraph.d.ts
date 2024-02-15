import { SpinalNode, SpinalContext } from "spinal-env-viewer-graph-service";
import { SpinalOrganOPCUA } from "spinal-model-opcua";
export declare function addNetworkToGraph(model: any, nodes: {
    node: SpinalNode;
    relation: string;
    attributes: any;
}[], context: SpinalContext): Promise<SpinalNode<any>>;
export declare function getOrganNode(organ: SpinalOrganOPCUA, contextId: string): Promise<SpinalNode>;

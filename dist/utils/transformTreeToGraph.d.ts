import { SpinalContext, SpinalNode } from "spinal-env-viewer-graph-service";
import { IOPCNode } from "../interfaces/OPCNode";
export declare function _transformTreeToGraphRecursively(context: SpinalContext, tree: IOPCNode, nodesAlreadyCreated: {
    [key: string]: SpinalNode;
}, parent?: SpinalNode, values?: {
    [key: string]: any;
}, depth?: number): any;
export declare function getNodeAlreadyCreated(context: SpinalContext, network: SpinalNode): Promise<{
    [key: string]: SpinalNode;
}>;

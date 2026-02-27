import { SpinalContext, SpinalNode } from "spinal-env-viewer-graph-service";
import { IOPCNode } from "../interfaces/OPCNode";
export declare function _transformTreeToGraphRecursively(context: SpinalContext, opcNode: IOPCNode, nodesAlreadyCreated: {
    [key: string]: SpinalNode;
}, parent?: SpinalNode, values?: {
    [key: string]: any;
}, depth?: number): Promise<{
    node: SpinalNode;
    relation: string;
    alreadyExist: boolean;
}>;
export declare function getNodeAlreadyCreated(context: SpinalContext, network: SpinalNode, opcNode: IOPCNode): Promise<{
    [key: string]: SpinalNode;
}>;

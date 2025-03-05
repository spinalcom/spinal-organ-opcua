import { SpinalContext, SpinalNode } from "spinal-env-viewer-graph-service";
import { IOPCNode } from "../interfaces/OPCNode";
export declare function _transformTreeToGraphRecursively(context: SpinalContext, opcNode: IOPCNode, nodesAlreadyCreated: {
    [key: string]: SpinalNode;
}, parent?: SpinalNode, values?: {
    [key: string]: any;
}, depth?: number): any;
export declare function getNodeAlreadyCreated(context: SpinalContext, network: SpinalNode, serverInfo: IOPCNode["server"]): Promise<{
    [key: string]: SpinalNode;
}>;

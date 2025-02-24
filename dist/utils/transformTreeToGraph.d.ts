import { SpinalContext, SpinalNode } from "spinal-env-viewer-graph-service";
import { IOPCNode } from "../interfaces/OPCNode";
export declare function _transformTreeToGraphRecursively(server: {
    ip: string;
    port: number;
}, context: SpinalContext, tree: IOPCNode, nodesAlreadyCreated: {
    [key: string]: SpinalNode;
}, parent?: SpinalNode, values?: {
    [key: string]: any;
}, depth?: number): any;
export declare function getNodeAlreadyCreated(context: SpinalContext, network: SpinalNode, serverInfo: {
    ip: string;
    port: number;
}): Promise<{
    [key: string]: SpinalNode;
}>;

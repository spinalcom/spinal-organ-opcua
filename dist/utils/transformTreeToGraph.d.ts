import { SpinalContext, SpinalNode } from "spinal-env-viewer-graph-service";
import { IOPCNode } from "../interfaces/OPCNode";
type GraphOperationLimiter = <T>(operation: () => Promise<T>) => Promise<T>;
export declare function _transformTreeToGraphRecursively(context: SpinalContext, opcNode: IOPCNode, nodesAlreadyCreated: {
    [key: string]: SpinalNode;
}, parent?: SpinalNode, values?: {
    [key: string]: any;
}, depth?: number, limiter?: GraphOperationLimiter): Promise<{
    node: SpinalNode;
    relation: string;
    alreadyExist: boolean;
}>;
export declare function createExistingDeviceIndex(devices: SpinalNode[]): Map<string, SpinalNode>;
export declare function getNodeAlreadyCreated(context: SpinalContext, network: SpinalNode, opcNode: IOPCNode, deviceIndex?: Map<string, SpinalNode>): Promise<{
    [key: string]: SpinalNode;
}>;
export {};

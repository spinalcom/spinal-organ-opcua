import { SpinalContext, SpinalNode } from "spinal-env-viewer-graph-service";
import { IOPCNode } from "../interfaces/OPCNode";
export declare function _transformTreeToGraphRecursively(context: SpinalContext, tree: IOPCNode, parent?: SpinalNode, values?: {
    [key: string]: any;
}): any;

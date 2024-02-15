import { IOPCNode } from "../interfaces/OPCNode";
import { IConfig } from "../interfaces/IConfig";
import { BrowseDirection } from "node-opcua";
import { SpinalNode } from "spinal-env-viewer-graph-service";
export declare function getConfig(): IConfig;
export declare function convertToBrowseDescription(node: IOPCNode): {
    nodeId: import("node-opcua").NodeId;
    referenceTypeId: string;
    includeSubtypes: boolean;
    browseDirection: BrowseDirection;
    resultMask: number;
}[];
export declare function convertSpinalNodeToOPCNode(node: SpinalNode | string): IOPCNode;

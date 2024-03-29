import { IOPCNode } from "../interfaces/OPCNode";
import { IConfig } from "../interfaces/IConfig";
import { BrowseDirection, DataType } from "node-opcua";
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
export declare const coerceBoolean: (data: any) => boolean;
export declare const coerceNumber: (data: any) => number;
export declare const coerceNumberR: (data: any) => number;
export declare const coerceNoop: (data: any) => any;
export declare const coerceFunc: (dataType: DataType) => (data: any) => any;
export declare function coerceStringToDataType(dataType: any, arrayType: any, VariantArrayType: any, data: any): any;

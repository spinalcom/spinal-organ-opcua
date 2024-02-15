import { SpinalOrganOPCUA } from "spinal-model-opcua";
import { IOPCNode } from "../interfaces/OPCNode";
export declare const WaitModelReady: () => Promise<any>;
export declare const connectionErrorCallback: (err?: Error) => void;
export declare const CreateOrganConfigFile: (spinalConnection: any, path: string, connectorName: string) => Promise<SpinalOrganOPCUA>;
export declare const GetPm2Instance: (organName: string) => Promise<unknown>;
export declare const SpinalDiscoverCallback: (spinalDisoverModel: SpinalOPCUADiscoverModel, organModel: SpinalOrganOPCUA) => Promise<void | boolean>;
export declare function getVariablesList(tree: IOPCNode): IOPCNode[];

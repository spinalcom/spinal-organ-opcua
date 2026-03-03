/// <reference types="node" />
import { EventEmitter } from "events";
import { SpinalNode, SpinalContext } from "spinal-env-viewer-graph-service";
import { IProfile } from "../interfaces/IProfile";
import { IOPCNode } from "../interfaces/OPCNode";
import { SpinalOPCUAListener, IServer } from "spinal-model-opcua";
export declare class SpinalDevice extends EventEmitter {
    isInit: boolean;
    context: SpinalContext;
    network: SpinalNode;
    device: SpinalNode;
    server: IServer;
    deviceInfo: {
        name: string;
        type: string;
        id: string;
        path: string;
    };
    spinalListenerModel: SpinalOPCUAListener;
    profile: IProfile;
    private nodes;
    private endpoints;
    constructor(server: IServer, context: SpinalContext, network: SpinalNode, device: SpinalNode, spinalListenerModel: SpinalOPCUAListener, profile: IProfile);
    init(): Promise<void | SpinalNode<any>[]>;
    updateEndpoints(nodes: IOPCNode[], isCov?: boolean): Promise<void>;
    stopMonitoring(): void;
    startMonitoring(): void;
    restartMonitoring(): void;
    private _updateEndpoint;
    private _convertNodesToObj;
    private _updateNodeInfo;
}

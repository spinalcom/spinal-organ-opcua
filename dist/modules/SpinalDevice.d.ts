/// <reference types="node" />
import { EventEmitter } from "events";
import { SpinalNode, SpinalContext } from "spinal-env-viewer-graph-service";
import { IServer } from "spinal-model-opcua";
import { SpinalOPCUAListener } from "spinal-model-opcua";
import { IProfile } from "../utils/SpinalNetworkUtils";
export declare class SpinalDevice extends EventEmitter {
    private isInit;
    context: SpinalContext;
    network: SpinalNode;
    device: SpinalNode;
    server: IServer;
    deviceInfo: {
        name: string;
        type: string;
        id: string;
    };
    spinalListenerModel: SpinalOPCUAListener;
    profile: IProfile;
    private nodes;
    private endpoints;
    constructor(server: IServer, context: SpinalContext, network: SpinalNode, device: SpinalNode, spinalListenerModel: SpinalOPCUAListener, profile: IProfile);
    init(): Promise<SpinalNode<any>[]>;
    updateEndpoints(values: {
        [key: string]: {
            dataType: string;
            value: any;
        };
    }, cov?: boolean): Promise<boolean[]>;
    stopMonitoring(): void;
    startMonitoring(): void;
    restartMonitoring(): void;
    private _updateEndpoint;
    private _convertNodesToObj;
}

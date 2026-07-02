/// <reference types="node" />
import { EventEmitter } from "events";
import { SpinalNode, SpinalContext } from "spinal-env-viewer-graph-service";
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
    profileId: string | null;
    private nodes;
    private endpoints;
    private _browseHistoryQueue;
    private _updateQueue;
    constructor(server: IServer, context: SpinalContext, network: SpinalNode, device: SpinalNode, spinalListenerModel: SpinalOPCUAListener, profileId: string);
    init(): Promise<SpinalNode<any>[]>;
    updateEndpoints(nodes: IOPCNode[], isCov?: boolean): Promise<void>;
    updateEndpointsDirectly(nodes: IOPCNode[], isCov?: boolean, date?: number | null): Promise<void>;
    stopMonitoring(): void;
    startMonitoring(): void;
    restartMonitoring(): void;
    private _updateEndpointInGraph;
    private _saveTimeSeries;
    private _updateNodeInfo;
    private _getEndpoint;
    private _findNodeInTree;
    addNode(key: string, node: SpinalNode): void;
    private _listenToProfileUpdate;
    private _collectGraphData;
    private _checkInitAndUpdate;
}

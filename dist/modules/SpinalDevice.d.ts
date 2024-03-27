/// <reference types="node" />
import { EventEmitter } from "events";
import { SpinalNode, SpinalContext } from "spinal-env-viewer-graph-service";
import { IServer } from "spinal-model-opcua";
export declare class SpinalDevice extends EventEmitter {
    private endpointUrl;
    private opcuaService;
    private isInit;
    private context;
    private network;
    private device;
    private saveTimeSeries;
    deviceInfo: {
        name: string;
        type: string;
        id: string;
    };
    private nodes;
    private endpoints;
    private variablesIds;
    constructor(server: IServer, context: SpinalContext, network: SpinalNode, device: SpinalNode, saveTimeSeries: spinal.Bool);
    init(): Promise<SpinalNode<any>[]>;
    updateEndpoints(values: {
        [key: string]: {
            dataType: string;
            value: any;
        };
    }): Promise<boolean[]>;
    private _updateEndpoint;
    private _convertNodesToObj;
}

/// <reference types="node" />
import { EventEmitter } from "events";
import { SpinalOPCUADiscoverModel } from "spinal-model-opcua";
declare class SpinalDiscover extends EventEmitter {
    private _discoverQueue;
    private _isProcess;
    constructor();
    private listenEvent;
    addToQueue(model: SpinalOPCUADiscoverModel): void;
    private _discoverNext;
    private _bindDiscoverModel;
    private _discoverDevices;
    private _discoverDevice;
    private askToContinueDiscovery;
    private _getOPCUATree;
    private _createNetworkTreeInGraph;
    private _getDataByGateway;
    private _getVariablesValues;
    private delay;
}
export declare const discover: SpinalDiscover;
export {};

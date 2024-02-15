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
    private _getOPCUATree;
    private _bindDiscoverModel;
    private _discoverDevice;
    private _createNetworkTreeInGraph;
    private _getVariablesValues;
    private delay;
}
export declare const discover: SpinalDiscover;
export {};

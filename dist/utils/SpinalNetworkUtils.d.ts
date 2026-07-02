/// <reference types="node" />
import { SpinalDevice } from "../modules/SpinalDevice";
import { EventEmitter } from "stream";
import { SpinalOPCUAListener } from "spinal-model-opcua";
import { IListenerData } from "../interfaces/IListenerData";
export declare class SpinalNetworkUtils extends EventEmitter {
    static instance: SpinalNetworkUtils;
    private constructor();
    static getInstance(): SpinalNetworkUtils;
    initAllListenersModels(spinalListenerModels: SpinalOPCUAListener[]): Promise<SpinalDevice[]>;
    getListenerData(spinalListenerModel: SpinalOPCUAListener): Promise<IListenerData | null>;
    initSpinalListenerModel(data: IListenerData): Promise<SpinalDevice | null>;
    private _getSpinalListenerData;
    private _checkIfListenerModelIsValid;
}

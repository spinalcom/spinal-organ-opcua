/// <reference types="node" />
import { SpinalContext, SpinalNode } from "spinal-env-viewer-graph-service";
import { SpinalDevice } from "../modules/SpinalDevice";
import { EventEmitter } from "stream";
import { Process } from "spinal-core-connectorjs_type";
import { IServer, SpinalOPCUAListener } from "spinal-model-opcua";
import { IProfile } from "../interfaces/IProfile";
interface IListenerData {
    context: SpinalContext;
    device: SpinalNode;
    profile: SpinalNode;
    network: SpinalNode;
    serverinfo: IServer;
    model: SpinalOPCUAListener;
}
export declare class SpinalNetworkUtils extends EventEmitter {
    static instance: SpinalNetworkUtils;
    profiles: Map<string, IProfile>;
    profileToDevices: Map<string, Set<string>>;
    profileBinded: Map<string, Process>;
    private constructor();
    static getInstance(): SpinalNetworkUtils;
    initAllListenersModels(spinalListenerModels: SpinalOPCUAListener[]): Promise<SpinalDevice[]>;
    getListenerData(spinalListenerModel: SpinalOPCUAListener): Promise<IListenerData | null>;
    initSpinalListenerModel(data: IListenerData): Promise<SpinalDevice | null>;
    initProfile(profile: SpinalNode, deviceId: string): Promise<IProfile>;
    private _bindProfile;
    /**
     * Classifies listener models data by their profile.
     * put the first listener of each profile in the "first" array and the others in the "others" array.
     *
     *
     * @private
     * @param {SpinalOPCUAListener[]} spinalListenerModels
     * @return {*}  {Promise<{ first: IListenerData[]; others: IListenerData[] }>}
     * @memberof SpinalNetworkUtils
     */
    private collectFirstListenerForProfiles;
    private _checkIfListenerModelIsValid;
}
export {};

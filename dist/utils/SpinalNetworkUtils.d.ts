/// <reference types="node" />
import { SpinalContext, SpinalNode } from "spinal-env-viewer-graph-service";
import { SpinalOPCUAListener } from "spinal-model-opcua";
import { SpinalDevice } from "../modules/SpinalDevice";
import { EventEmitter } from "stream";
import { Process } from "spinal-core-connectorjs_type";
import { IServer } from "spinal-model-opcua";
export interface IProfile {
    modificationDate: number;
    node: SpinalNode;
    intervals: {
        [key: string]: any;
        children: {
            [key: string]: any;
        };
    }[];
}
export interface IDeviceInfo {
    context: SpinalContext;
    spinalDevice: SpinalDevice;
    profile: IProfile;
    spinalModel: SpinalOPCUAListener;
    network: SpinalNode;
    serverinfo: IServer;
}
export declare class SpinalNetworkUtils extends EventEmitter {
    static instance: SpinalNetworkUtils;
    profiles: Map<string, IProfile>;
    profileToDevices: Map<string, Set<string>>;
    profileBinded: Map<string, Process>;
    private constructor();
    static getInstance(): SpinalNetworkUtils;
    initSpinalListenerModel(spinalListenerModel: SpinalOPCUAListener): Promise<SpinalDevice>;
    initProfile(profile: SpinalNode, deviceId: string): Promise<IProfile>;
    private _bindProfile;
}

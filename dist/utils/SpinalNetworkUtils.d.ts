/// <reference types="node" />
import { SpinalContext, SpinalNode } from "spinal-env-viewer-graph-service";
import { SpinalOPCUAListener } from "spinal-model-opcua";
import { SpinalDevice } from "../modules/SpinalDevice";
import { EventEmitter } from "stream";
import { Process } from "spinal-core-connectorjs_type";
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
}
export declare class SpinalNetworkUtils extends EventEmitter {
    static instance: SpinalNetworkUtils;
    profiles: Map<string, IProfile>;
    profileToDevices: Map<string, Set<string>>;
    profileBinded: Map<string, Process>;
    private constructor();
    static getInstance(): SpinalNetworkUtils;
    initSpinalListenerModel(spinalListenerModel: SpinalOPCUAListener): Promise<IDeviceInfo>;
    initProfile(profile: SpinalNode, deviceId: string): Promise<IProfile>;
    private _bindProfile;
}

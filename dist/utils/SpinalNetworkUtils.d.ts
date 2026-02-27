/// <reference types="node" />
import { SpinalNode } from "spinal-env-viewer-graph-service";
import { SpinalDevice } from "../modules/SpinalDevice";
import { EventEmitter } from "stream";
import { Process } from "spinal-core-connectorjs_type";
import { SpinalOPCUAListener } from "spinal-model-opcua";
import { IProfile } from "../interfaces/IProfile";
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

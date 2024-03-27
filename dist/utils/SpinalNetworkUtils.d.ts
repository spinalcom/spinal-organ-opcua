import { SpinalContext, SpinalNode } from "spinal-env-viewer-graph-service";
import { SpinalOPCUAListener } from "spinal-model-opcua";
import { SpinalDevice } from "../modules/SpinalDevice";
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
export declare class SpinalNetworkUtils {
    static instance: SpinalNetworkUtils;
    profiles: Map<string, IProfile>;
    private constructor();
    static getInstance(): SpinalNetworkUtils;
    initSpinalListenerModel(spinalListenerModel: SpinalOPCUAListener): Promise<IDeviceInfo>;
    initProfile(profile: SpinalNode): Promise<IProfile>;
}

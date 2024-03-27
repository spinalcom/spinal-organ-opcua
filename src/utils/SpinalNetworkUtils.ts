import { SpinalContext, SpinalNode } from "spinal-env-viewer-graph-service";
import { SpinalOPCUAListener } from "spinal-model-opcua";
import { OPCUAProfileService } from "./profile_service";
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

export class SpinalNetworkUtils {
    static instance : SpinalNetworkUtils;

    profiles : Map<string, IProfile> = new Map();

    private constructor() {}

    static getInstance() {
        if (!this.instance) this.instance = new SpinalNetworkUtils();

        return this.instance;
    }

    public async initSpinalListenerModel(spinalListenerModel: SpinalOPCUAListener): Promise<IDeviceInfo> {
        
        const { context, device, profile, network} = await spinalListenerModel.getAllData();
        const serverinfo = network.info.serverInfo.get();
        const spinalDevice = new SpinalDevice(serverinfo,context, network, device, spinalListenerModel.saveTimeSeries);
        await spinalDevice.init();

        return {context, spinalDevice, profile : await this.initProfile(profile), spinalModel : spinalListenerModel, network};
    }


    public async initProfile(profile: SpinalNode): Promise<IProfile> {
        const profileId = profile.getId().get();
        
        if (this.profiles.has(profileId) && this.profiles.get(profileId).modificationDate === profile.info.indirectModificationDate.get()) {
            return this.profiles.get(profileId)
        }

        const intervals = await OPCUAProfileService.getIntervals(profile);
        const data = {
            modificationDate : profile.info.indirectModificationDate.get(),
            node: profile,
            intervals
        }

        this.profiles.set(profileId, data);
        return data;
    }
}



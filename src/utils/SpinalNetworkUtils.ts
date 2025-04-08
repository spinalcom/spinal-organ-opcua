import { SpinalContext, SpinalNode } from "spinal-env-viewer-graph-service";
import { SpinalOPCUAListener } from "spinal-model-opcua";
import { OPCUAProfileService } from "./profile_service";
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
    serverinfo: IServer
}

export class SpinalNetworkUtils extends EventEmitter {
    static instance: SpinalNetworkUtils;

    profiles: Map<string, IProfile> = new Map();
    profileToDevices: Map<string, Set<string>> = new Map();
    profileBinded: Map<string, Process> = new Map();

    private constructor() {
        super();
    }

    static getInstance() {
        if (!this.instance) this.instance = new SpinalNetworkUtils();

        return this.instance;
    }

    public async initSpinalListenerModel(spinalListenerModel: SpinalOPCUAListener): Promise<SpinalDevice> {

        const { context, device, profile, network } = await spinalListenerModel.getAllData();
        const serverinfo = device.info.server?.get() || {};
        const profileData = await this.initProfile(profile, device.getId().get());

        const spinalDevice = new SpinalDevice(serverinfo, context, network, device, spinalListenerModel, profileData);
        await spinalDevice.init();

        // const deviceId = spinalDevice.deviceInfo.id;

        return spinalDevice;
        // return { serverinfo, context, spinalDevice, profile: await this.initProfile(profile, deviceId), spinalModel: spinalListenerModel, network };
    }


    public async initProfile(profile: SpinalNode, deviceId: string): Promise<IProfile> {
        const profileId = profile.getId().get();

        if (this.profiles.has(profileId) && this.profiles.get(profileId).modificationDate === profile.info.indirectModificationDate.get()) {
            return this.profiles.get(profileId)
        }

        const intervals = await OPCUAProfileService.getIntervals(profile);
        const data = {
            modificationDate: profile.info.indirectModificationDate.get(),
            node: profile,
            intervals
        }
        this.profiles.set(profileId, data);


        const ids = this.profileToDevices.get(profileId) || new Set();
        ids.add(deviceId);

        this.profileToDevices.set(profileId, ids);

        this._bindProfile(profile);

        return data;
    }

    private _bindProfile(profile: SpinalNode) {
        const profileId = profile.getId().get();
        if (this.profileBinded.has(profileId)) return;

        const bindProcess = profile.info.indirectModificationDate.bind(() => {
            const devicesIds = this.profileToDevices.get(profileId);
            console.log(`profile changed`)
            this.emit("profileUpdated", { profileId: profileId, devicesIds: Array.from(devicesIds) });
        }, false);

        this.profileBinded.set(profileId, bindProcess);
    }
}



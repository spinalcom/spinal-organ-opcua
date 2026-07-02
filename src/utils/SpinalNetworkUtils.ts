import { SpinalContext, SpinalNode } from "spinal-env-viewer-graph-service";
import { OPCUAProfileService } from "./profile_service";
import { SpinalDevice } from "../modules/SpinalDevice";
import { EventEmitter, promises } from "stream";
import { Process } from "spinal-core-connectorjs_type";
import { IServer, SpinalOPCUAListener } from "spinal-model-opcua";
import { IProfile } from "../interfaces/IProfile";
import { IListenerData } from "../interfaces/IListenerData";
import { consumeBatch } from "./Functions";
import spinalLog from "./displayLog";

export class SpinalNetworkUtils extends EventEmitter {
	static instance: SpinalNetworkUtils;

	private constructor() {
		super();
	}

	static getInstance() {
		if (!this.instance) this.instance = new SpinalNetworkUtils();

		return this.instance;
	}

	async initAllListenersModels(spinalListenerModels: SpinalOPCUAListener[]): Promise<SpinalDevice[]> {
		const startTime = Date.now();
		const listenerData = await this._getSpinalListenerData(spinalListenerModels);
		const profiles: { [profileId: string]: () => Promise<IProfile> } = {};
		const devicesPromises: (() => Promise<SpinalDevice | null>)[] = [];

		for (const data of listenerData) {
			const { profile } = data;
			if (!profiles[profile.getId().get()]) {
				profiles[profile.getId().get()] = () => OPCUAProfileService.getInstance().initProfile(profile);
			}

			devicesPromises.push(() => this.initSpinalListenerModel(data));
		}

		
		return consumeBatch<SpinalDevice | null>(devicesPromises, 10).then(async (devicesResults) => { 
			const endTime = Date.now();
			spinalLog.log(`All listener models initialized`);
			
			spinalLog.log(`Starting to initialize profiles...`);
			const profilePromises = Object.values(profiles);
			await consumeBatch<IProfile>(profilePromises, 10);

			spinalLog.log(`All profiles initialized`);

			return (devicesResults as (SpinalDevice | null)[]).filter((device: any): device is SpinalDevice => device !== null);
		})

	}

	public async getListenerData(spinalListenerModel: SpinalOPCUAListener): Promise<IListenerData | null> {
		const { context, device, profile, network } = await spinalListenerModel.getAllData();

		const listenerIsValid = await this._checkIfListenerModelIsValid(spinalListenerModel, device);

		if (!listenerIsValid) {
			spinalLog.warn(`${device.getName().get()} listener model in info is not valid. Please check the device connection.`);
			return null;
		}

		const serverinfo = device.info.server?.get() || {};
		return { context, device, profile, network, serverinfo, model: spinalListenerModel };
	}

	public async initSpinalListenerModel(data: IListenerData): Promise<SpinalDevice | null> {
		const { context, device, profile, network, model } = data;

		try {
			const serverinfo = device.info.server?.get() || {};
			// const profileData = await OPCUAProfileService.getInstance().initProfile(profile);

			const spinalDevice = new SpinalDevice(serverinfo, context, network, device, model, profile.getId().get());
			// await spinalDevice.init();

			return spinalDevice;
		} catch (error: Error | any) {
			spinalLog.error(`[initSpinalListenerModel] - Error initializing ${device.getName().get()} due to: ${error.message}`);
			return null;
		}
	}

	private _getSpinalListenerData(listeners : SpinalOPCUAListener | SpinalOPCUAListener[]): Promise<IListenerData[]> {
		listeners = Array.isArray(listeners) ? listeners : [listeners];
		const promises = listeners.map((model) => this.getListenerData(model));
		return Promise.all(promises).then((results) => results.filter((data) => data !== null) as IListenerData[]);
	}

	// public async initProfile(profile: SpinalNode, deviceId: string): Promise<IProfile> {
	// 	const profileId = profile.getId().get();
	// 	const profileInfo = this.profiles.get(profileId);

	// 	if (profileInfo && profileInfo.modificationDate === profile.info.indirectModificationDate.get()) {
	// 		return profileInfo;
	// 	}

	// 	const intervals = await OPCUAProfileService.getIntervals(profile);
	// 	const data = {
	// 		modificationDate: profile.info.indirectModificationDate.get(),
	// 		node: profile,
	// 		intervals,
	// 	};

	// 	this.profiles.set(profileId, data);

	// 	const ids = this.profileToDevices.get(profileId) || new Set();
	// 	ids.add(deviceId);

	// 	this.profileToDevices.set(profileId, ids);

	// 	this._bindProfile(profile);

	// 	return data;
	// }

	// private _bindProfile(profile: SpinalNode) {
	// 	const profileId = profile.getId().get();
	// 	if (this.profileBinded.has(profileId)) return;

	// 	const bindProcess = profile.info.indirectModificationDate.bind(() => {
	// 		const devicesIds: Set<string> | undefined = this.profileToDevices.get(profileId) || new Set();

	// 		spinalLog.log(`profile changed`);
	// 		this.emit("profileUpdated", { profileId: profileId, devicesIds: Array.from(devicesIds) });
	// 	}, false);

	// 	this.profileBinded.set(profileId, bindProcess);
	// }


	// private async collectListenerData(spinalListenerModels: SpinalOPCUAListener[]): Promise<{ profile: SpinalNode[]; listenerData: IListenerData[] }> {
	// 	const promises = spinalListenerModels.map((model) => this.getListenerData(model));
	// 	const allData = await Promise.all(promises);

	// 	const classifiedData: { [profileId: string]: IListenerData[] } = {};
	// 	const result: { first: IListenerData[]; others: IListenerData[] } = { first: [], others: [] };

	// 	for (const data of allData) {
	// 		if (!data) continue;

	// 		const profileId = data.profile.getId().get();

	// 		if (!classifiedData[profileId]) {
	// 			classifiedData[profileId] = [];
	// 			result.first.push(data);
	// 		} else {
	// 			result.others.push(data);
	// 		}

	// 		classifiedData[profileId].push(data);
	// 	}

	// 	return result;
	// }

	private async _checkIfListenerModelIsValid(argListenerModel: SpinalOPCUAListener, device: SpinalNode): Promise<boolean> {
		const listenerModel = await device.info.listener.load();
		if (listenerModel._server_id == argListenerModel._server_id) return true;

		return false;
		//TODO: check if the listener model is valid, for example, check if the device is still connected;
		// check wich model is the valid one;
	}
}

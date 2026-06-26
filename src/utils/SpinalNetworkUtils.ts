import { SpinalContext, SpinalNode } from "spinal-env-viewer-graph-service";
import { OPCUAProfileService } from "./profile_service";
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

	async initAllListenersModels(spinalListenerModels: SpinalOPCUAListener[]): Promise<SpinalDevice[]> {
		const { first, others } = await this.collectFirstListenerForProfiles(spinalListenerModels);

		// Initialize the first listener of each profile first
		// This ensures that the profile data is initialized before the other listeners that share the same profile
		const firstDevicesPromises = first.map((data) => this.initSpinalListenerModel(data));
		const firstDevices = await Promise.all(firstDevicesPromises);

		// Initialize the other listeners after the first ones have been initialized
		const othersDevicesPromises = others.map((data) => this.initSpinalListenerModel(data));
		const othersDevices = await Promise.all(othersDevicesPromises);

		return [...firstDevices, ...othersDevices].filter((device) => !!device);
	}

	public async getListenerData(spinalListenerModel: SpinalOPCUAListener): Promise<IListenerData | null> {
		const { context, device, profile, network } = await spinalListenerModel.getAllData();

		const listenerIsValid = await this._checkIfListenerModelIsValid(spinalListenerModel, device);

		if (!listenerIsValid) {
			console.warn(`${device.getName().get()} listener model in info is not valid. Please check the device connection.`);
			return null;
		}

		const serverinfo = device.info.server?.get() || {};
		return { context, device, profile, network, serverinfo, model: spinalListenerModel };
	}

	public async initSpinalListenerModel(data: IListenerData): Promise<SpinalDevice | null> {
		const { context, device, profile, network, model } = data;
		try {
			const serverinfo = device.info.server?.get() || {};
			const profileData = await this.initProfile(profile, device.getId().get());

			const spinalDevice = new SpinalDevice(serverinfo, context, network, device, model, profileData);

			await spinalDevice.init();

			return spinalDevice;
		} catch (error: Error | any) {
			console.error(`[initSpinalListenerModel] - Error initializing ${device.getName().get()} due to: ${error.message}`);
			return null;
		}
	}

	public async initProfile(profile: SpinalNode, deviceId: string): Promise<IProfile> {
		const profileId = profile.getId().get();
		const profileInfo = this.profiles.get(profileId);

		if (profileInfo && profileInfo.modificationDate === profile.info.indirectModificationDate.get()) {
			return profileInfo;
		}

		const intervals = await OPCUAProfileService.getIntervals(profile);
		const data = {
			modificationDate: profile.info.indirectModificationDate.get(),
			node: profile,
			intervals,
		};

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
			const devicesIds: Set<string> | undefined = this.profileToDevices.get(profileId) || new Set();

			console.log(`profile changed`);
			this.emit("profileUpdated", { profileId: profileId, devicesIds: Array.from(devicesIds) });
		}, false);

		this.profileBinded.set(profileId, bindProcess);
	}

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
	private async collectFirstListenerForProfiles(spinalListenerModels: SpinalOPCUAListener[]): Promise<{ first: IListenerData[]; others: IListenerData[] }> {
		const promises = spinalListenerModels.map((model) => this.getListenerData(model));
		const allData = await Promise.all(promises);

		const classifiedData: { [profileId: string]: IListenerData[] } = {};
		const result: { first: IListenerData[]; others: IListenerData[] } = { first: [], others: [] };

		for (const data of allData) {
			if (!data) continue;

			const profileId = data.profile.getId().get();

			if (!classifiedData[profileId]) {
				classifiedData[profileId] = [];
				result.first.push(data);
			} else {
				result.others.push(data);
			}

			classifiedData[profileId].push(data);
		}

		return result;
	}

	private async _checkIfListenerModelIsValid(argListenerModel: SpinalOPCUAListener, device: SpinalNode): Promise<boolean> {
		const listenerModel = await device.info.listener.load();
		if (listenerModel._server_id == argListenerModel._server_id) return true;

		return false;
		//TODO: check if the listener model is valid, for example, check if the device is still connected;
		// check wich model is the valid one;
	}
}

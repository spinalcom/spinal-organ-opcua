import { SPINAL_RELATION_PTR_LST_TYPE, SpinalGraphService, SpinalNode } from "spinal-env-viewer-graph-service";
import { IIntervalInfo } from "../interfaces/INodeInfo";
import { IProfile } from "../interfaces/IProfile";
import { Process } from "spinal-core-connectorjs_type";
import { EventEmitter } from "events";
import spinalLog from "./displayLog";
// NAMES
export const CONTEXT_NAME = "OPCdeviceProfileContext";
export const ITEMS_GROUP_NAME = "Item_list";
export const SUPERVISION_NAME = "Supervision";

// TYPES
export const CONTEXT_TYPE = "OPCUA Profile";
export const PROFILE_TYPE = "OPCUADeviceProfile";
export const ITEM_LIST_TYPE = "itemList";
export const ITEM_TYPE = "item";
export const SUPERVISION_TYPE = "Supervision";
export const INTERVAL_TYPE = "Interval";

// RELATIONS
export const CONTEXT_TO_PROFILE_RELATION = "hasProfile";
export const PROFILE_TO_ITEMS_GROUP = "hasItems";
export const PROFILE_TO_SUPERVISION = "hasSupervision";
export const SUPERVISION_TO_INTERVAL = "hasIntervalTime";
export const ITEM_LIST_TO_ITEM = "hasItem";
export const INTERVAL_TO_ITEM = "hasItem";

export const PROFILE_UPDATE_EVENT = "profileUpdated";

class OPCUAProfileService extends EventEmitter {
	private static _instance: OPCUAProfileService;
	private _profiles: Map<string, IProfile> = new Map();
	private _profileToDevices: Map<string, Set<string>> = new Map();
	private _profileBinded: Map<string, Process> = new Map();

	private constructor() {
		super();
		this.setMaxListeners(0);
	}

	static getInstance(): OPCUAProfileService {
		if (!OPCUAProfileService._instance) {
			OPCUAProfileService._instance = new OPCUAProfileService();
		}
		return OPCUAProfileService._instance;
	}

	public getProfile(profileId: string): IProfile | undefined {
		return this._profiles.get(profileId);
	}

	public async initProfile(profile: SpinalNode): Promise<IProfile> {
		const profileId = profile.getId().get();
		const profileInfo = this._profiles.get(profileId);

		if (profileInfo && profileInfo.modificationDate === profile.info.indirectModificationDate.get()) {
			return profileInfo;
		}

		const data = await this._updateProfileData(profile);
		// this._addDeviceToProfile(profileId, deviceIds);

		this._bindProfile(profile);

		return data;
	}

	private async _updateProfileData(profile: SpinalNode): Promise<IProfile> {
		const intervals = await this.getIntervals(profile);
		const data = { modificationDate: profile.info.indirectModificationDate.get(), node: profile, intervals };

		this._profiles.set(profile.getId().get(), data);
		return data;
	}

	private _addDeviceToProfile(profileId: string, deviceIds: string | string[]): void {
		if (!Array.isArray(deviceIds)) deviceIds = [deviceIds];

		const ids = this._profileToDevices.get(profileId) || new Set();
		deviceIds.forEach((id) => ids.add(id));
		this._profileToDevices.set(profileId, ids);
	}

	private async getItems(profile: SpinalNode): Promise<SpinalNode[]> {
		const itemListNode = await this.getItemListNode(profile);
		if (itemListNode) return itemListNode.getChildren(ITEM_LIST_TO_ITEM);

		return [];
	}

	private async getItemListNode(profile: SpinalNode): Promise<SpinalNode | undefined> {
		const children = await profile.getChildren([]);
		return children.find((el) => el.getName().get() === ITEMS_GROUP_NAME);
	}

	private _bindProfile(profile: SpinalNode) {
		const profileId = profile.getId().get();
		if (this._profileBinded.has(profileId)) return;

		const bindProcess = profile.info.indirectModificationDate.bind(async () => {
			spinalLog.log(`[${profileId}] - profile changed, updating profile Data`);
			await this._updateProfileData(profile);
			spinalLog.log(`[${profileId}] - profile updated, emitting event`);
			this.emit(PROFILE_UPDATE_EVENT, { profileId: profileId });

			// const devicesIds: Set<string> | undefined = this._profileToDevices.get(profileId) || new Set();
			// spinalLog.log(`profile changed`);
			// this.emit(PROFILE_UPDATE_EVENT, { profileId: profileId, devicesIds: Array.from(devicesIds) });
		}, false);

		this._profileBinded.set(profileId, bindProcess);
	}

	private async getIntervals(profile: SpinalNode): Promise<IIntervalInfo[]> {
		const supervisionNode = await this.getSupervisionNode(profile);

		if (supervisionNode) {
			const intervals: SpinalNode[] = await supervisionNode.getChildren(SUPERVISION_TO_INTERVAL);
			const promises = intervals.map(async (node) => {
				const children: SpinalNode[] = await node.getChildren(INTERVAL_TO_ITEM);

				return {
					...node.info.get(),
					children: children.map((el) => el.info.get()),
				};
			});

			return Promise.all(promises);
		}

		return [];
	}

	private async getSupervisionNode(profile: SpinalNode): Promise<SpinalNode | undefined> {
		const children = await profile.getChildren();
		return children.find((el) => el.getName().get() === SUPERVISION_NAME);
	}
}

export { OPCUAProfileService };

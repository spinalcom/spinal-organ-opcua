/// <reference types="node" />
import { SpinalNode } from "spinal-env-viewer-graph-service";
import { IProfile } from "../interfaces/IProfile";
import { EventEmitter } from "events";
export declare const CONTEXT_NAME = "OPCdeviceProfileContext";
export declare const ITEMS_GROUP_NAME = "Item_list";
export declare const SUPERVISION_NAME = "Supervision";
export declare const CONTEXT_TYPE = "OPCUA Profile";
export declare const PROFILE_TYPE = "OPCUADeviceProfile";
export declare const ITEM_LIST_TYPE = "itemList";
export declare const ITEM_TYPE = "item";
export declare const SUPERVISION_TYPE = "Supervision";
export declare const INTERVAL_TYPE = "Interval";
export declare const CONTEXT_TO_PROFILE_RELATION = "hasProfile";
export declare const PROFILE_TO_ITEMS_GROUP = "hasItems";
export declare const PROFILE_TO_SUPERVISION = "hasSupervision";
export declare const SUPERVISION_TO_INTERVAL = "hasIntervalTime";
export declare const ITEM_LIST_TO_ITEM = "hasItem";
export declare const INTERVAL_TO_ITEM = "hasItem";
export declare const PROFILE_UPDATE_EVENT = "profileUpdated";
declare class OPCUAProfileService extends EventEmitter {
    private static _instance;
    private _profiles;
    private _profileToDevices;
    private _profileBinded;
    private constructor();
    static getInstance(): OPCUAProfileService;
    getProfile(profileId: string): IProfile | undefined;
    initProfile(profile: SpinalNode): Promise<IProfile>;
    private _updateProfileData;
    private _addDeviceToProfile;
    private getItems;
    private getItemListNode;
    private _bindProfile;
    private getIntervals;
    private getSupervisionNode;
}
export { OPCUAProfileService };

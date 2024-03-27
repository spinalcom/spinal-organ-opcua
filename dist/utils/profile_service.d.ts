import { SpinalNode } from "spinal-env-viewer-graph-service";
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
declare class OPCUAProfileService {
    constructor();
    static getItems(profile: SpinalNode): Promise<SpinalNode<any>[]>;
    static getItemListNode(profile: SpinalNode): Promise<SpinalNode<any>>;
    static getIntervals(profile: SpinalNode): Promise<any[]>;
    static getSupervisionNode(profile: any): Promise<any>;
}
export { OPCUAProfileService };

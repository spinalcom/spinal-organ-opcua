import { SPINAL_RELATION_PTR_LST_TYPE, SpinalGraphService, SpinalNode } from "spinal-env-viewer-graph-service";

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



class OPCUAProfileService {

    constructor() { }


    static async getItems(profile: SpinalNode) {
        const itemListNode = await this.getItemListNode(profile);
        if (itemListNode) return itemListNode.getChildren(ITEM_LIST_TO_ITEM);

        return [];
    }

    static async getItemListNode(profile: SpinalNode) {
        const children = await profile.getChildren([]);
        return children.find(el => el.getName().get() === ITEMS_GROUP_NAME);
    }



    static async getIntervals(profile: SpinalNode) {
        const supervisionNode = await this.getSupervisionNode(profile);

        if (supervisionNode) {
            const intervals = await supervisionNode.getChildren(SUPERVISION_TO_INTERVAL);
            const promises = intervals.map(async node => {
                const children = await node.getChildren(INTERVAL_TO_ITEM)
                return {
                    ...(node.info.get()),
                    children: children.map(el => el.info.get())
                }
            })

            return Promise.all(promises);
        }

        return [];
    }



    static async getSupervisionNode(profile) {
        const children = await profile.getChildren();
        return children.find(el => el.getName().get() === SUPERVISION_NAME);
    }

}


export { OPCUAProfileService }
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPCUAProfileService = exports.INTERVAL_TO_ITEM = exports.ITEM_LIST_TO_ITEM = exports.SUPERVISION_TO_INTERVAL = exports.PROFILE_TO_SUPERVISION = exports.PROFILE_TO_ITEMS_GROUP = exports.CONTEXT_TO_PROFILE_RELATION = exports.INTERVAL_TYPE = exports.SUPERVISION_TYPE = exports.ITEM_TYPE = exports.ITEM_LIST_TYPE = exports.PROFILE_TYPE = exports.CONTEXT_TYPE = exports.SUPERVISION_NAME = exports.ITEMS_GROUP_NAME = exports.CONTEXT_NAME = void 0;
// NAMES
exports.CONTEXT_NAME = "OPCdeviceProfileContext";
exports.ITEMS_GROUP_NAME = "Item_list";
exports.SUPERVISION_NAME = "Supervision";
// TYPES
exports.CONTEXT_TYPE = "OPCUA Profile";
exports.PROFILE_TYPE = "OPCUADeviceProfile";
exports.ITEM_LIST_TYPE = "itemList";
exports.ITEM_TYPE = "item";
exports.SUPERVISION_TYPE = "Supervision";
exports.INTERVAL_TYPE = "Interval";
// RELATIONS
exports.CONTEXT_TO_PROFILE_RELATION = "hasProfile";
exports.PROFILE_TO_ITEMS_GROUP = "hasItems";
exports.PROFILE_TO_SUPERVISION = "hasSupervision";
exports.SUPERVISION_TO_INTERVAL = "hasIntervalTime";
exports.ITEM_LIST_TO_ITEM = "hasItem";
exports.INTERVAL_TO_ITEM = "hasItem";
class OPCUAProfileService {
    constructor() { }
    static getItems(profile) {
        return __awaiter(this, void 0, void 0, function* () {
            const itemListNode = yield this.getItemListNode(profile);
            if (itemListNode)
                return itemListNode.getChildren(exports.ITEM_LIST_TO_ITEM);
            return [];
        });
    }
    static getItemListNode(profile) {
        return __awaiter(this, void 0, void 0, function* () {
            const children = yield profile.getChildren([]);
            return children.find(el => el.getName().get() === exports.ITEMS_GROUP_NAME);
        });
    }
    static getIntervals(profile) {
        return __awaiter(this, void 0, void 0, function* () {
            const supervisionNode = yield this.getSupervisionNode(profile);
            if (supervisionNode) {
                const intervals = yield supervisionNode.getChildren(exports.SUPERVISION_TO_INTERVAL);
                const promises = intervals.map((node) => __awaiter(this, void 0, void 0, function* () {
                    const children = yield node.getChildren(exports.INTERVAL_TO_ITEM);
                    const info = node.info.get();
                    info.children = children.map(el => el.info.get());
                    return info;
                }));
                return Promise.all(promises);
            }
            return [];
        });
    }
    static getSupervisionNode(profile) {
        return __awaiter(this, void 0, void 0, function* () {
            const SUPERVISION_RELATION_NAME = "hasSupervision";
            const children = yield profile.getChildren([SUPERVISION_RELATION_NAME]);
            return children.find(el => el.getName().get() === exports.SUPERVISION_NAME);
        });
    }
}
exports.OPCUAProfileService = OPCUAProfileService;
//# sourceMappingURL=profile_service.js.map
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
exports.SpinalNetworkUtils = void 0;
const profile_service_1 = require("./profile_service");
const SpinalDevice_1 = require("../modules/SpinalDevice");
const stream_1 = require("stream");
class SpinalNetworkUtils extends stream_1.EventEmitter {
    constructor() {
        super();
        this.profiles = new Map();
        this.profileToDevices = new Map();
        this.profileBinded = new Map();
    }
    static getInstance() {
        if (!this.instance)
            this.instance = new SpinalNetworkUtils();
        return this.instance;
    }
    initSpinalListenerModel(spinalListenerModel) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const { context, device, profile, network } = yield spinalListenerModel.getAllData();
            const serverinfo = ((_a = device.info.server) === null || _a === void 0 ? void 0 : _a.get()) || {};
            const profileData = yield this.initProfile(profile, device.getId().get());
            const spinalDevice = new SpinalDevice_1.SpinalDevice(serverinfo, context, network, device, spinalListenerModel, profileData);
            yield spinalDevice.init();
            // const deviceId = spinalDevice.deviceInfo.id;
            return spinalDevice;
        });
    }
    initProfile(profile, deviceId) {
        return __awaiter(this, void 0, void 0, function* () {
            const profileId = profile.getId().get();
            if (this.profiles.has(profileId) && this.profiles.get(profileId).modificationDate === profile.info.indirectModificationDate.get()) {
                return this.profiles.get(profileId);
            }
            const intervals = yield profile_service_1.OPCUAProfileService.getIntervals(profile);
            const data = {
                modificationDate: profile.info.indirectModificationDate.get(),
                node: profile,
                intervals
            };
            this.profiles.set(profileId, data);
            const ids = this.profileToDevices.get(profileId) || new Set();
            ids.add(deviceId);
            this.profileToDevices.set(profileId, ids);
            this._bindProfile(profile);
            return data;
        });
    }
    _bindProfile(profile) {
        const profileId = profile.getId().get();
        if (this.profileBinded.has(profileId))
            return;
        const bindProcess = profile.info.indirectModificationDate.bind(() => {
            const devicesIds = this.profileToDevices.get(profileId);
            console.log(`profile changed`);
            this.emit("profileUpdated", { profileId: profileId, devicesIds: Array.from(devicesIds) });
        }, false);
        this.profileBinded.set(profileId, bindProcess);
    }
}
exports.SpinalNetworkUtils = SpinalNetworkUtils;
//# sourceMappingURL=SpinalNetworkUtils.js.map
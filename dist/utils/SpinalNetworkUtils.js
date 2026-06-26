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
    initAllListenersModels(spinalListenerModels) {
        return __awaiter(this, void 0, void 0, function* () {
            const { first, others } = yield this.collectFirstListenerForProfiles(spinalListenerModels);
            // Initialize the first listener of each profile first
            // This ensures that the profile data is initialized before the other listeners that share the same profile
            const firstDevicesPromises = first.map((data) => this.initSpinalListenerModel(data));
            const firstDevices = yield Promise.all(firstDevicesPromises);
            // Initialize the other listeners after the first ones have been initialized
            const othersDevicesPromises = others.map((data) => this.initSpinalListenerModel(data));
            const othersDevices = yield Promise.all(othersDevicesPromises);
            return [...firstDevices, ...othersDevices].filter((device) => !!device);
        });
    }
    getListenerData(spinalListenerModel) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const { context, device, profile, network } = yield spinalListenerModel.getAllData();
            const listenerIsValid = yield this._checkIfListenerModelIsValid(spinalListenerModel, device);
            if (!listenerIsValid) {
                console.warn(`${device.getName().get()} listener model in info is not valid. Please check the device connection.`);
                return null;
            }
            const serverinfo = ((_a = device.info.server) === null || _a === void 0 ? void 0 : _a.get()) || {};
            return { context, device, profile, network, serverinfo, model: spinalListenerModel };
        });
    }
    initSpinalListenerModel(data) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const { context, device, profile, network, model } = data;
            try {
                const serverinfo = ((_a = device.info.server) === null || _a === void 0 ? void 0 : _a.get()) || {};
                const profileData = yield this.initProfile(profile, device.getId().get());
                const spinalDevice = new SpinalDevice_1.SpinalDevice(serverinfo, context, network, device, model, profileData);
                yield spinalDevice.init();
                return spinalDevice;
            }
            catch (error) {
                console.error(`[initSpinalListenerModel] - Error initializing ${device.getName().get()} due to: ${error.message}`);
                return null;
            }
        });
    }
    initProfile(profile, deviceId) {
        return __awaiter(this, void 0, void 0, function* () {
            const profileId = profile.getId().get();
            const profileInfo = this.profiles.get(profileId);
            if (profileInfo && profileInfo.modificationDate === profile.info.indirectModificationDate.get()) {
                return profileInfo;
            }
            const intervals = yield profile_service_1.OPCUAProfileService.getIntervals(profile);
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
        });
    }
    _bindProfile(profile) {
        const profileId = profile.getId().get();
        if (this.profileBinded.has(profileId))
            return;
        const bindProcess = profile.info.indirectModificationDate.bind(() => {
            const devicesIds = this.profileToDevices.get(profileId) || new Set();
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
    collectFirstListenerForProfiles(spinalListenerModels) {
        return __awaiter(this, void 0, void 0, function* () {
            const promises = spinalListenerModels.map((model) => this.getListenerData(model));
            const allData = yield Promise.all(promises);
            const classifiedData = {};
            const result = { first: [], others: [] };
            for (const data of allData) {
                if (!data)
                    continue;
                const profileId = data.profile.getId().get();
                if (!classifiedData[profileId]) {
                    classifiedData[profileId] = [];
                    result.first.push(data);
                }
                else {
                    result.others.push(data);
                }
                classifiedData[profileId].push(data);
            }
            return result;
        });
    }
    _checkIfListenerModelIsValid(argListenerModel, device) {
        return __awaiter(this, void 0, void 0, function* () {
            const listenerModel = yield device.info.listener.load();
            if (listenerModel._server_id == argListenerModel._server_id)
                return true;
            return false;
            //TODO: check if the listener model is valid, for example, check if the device is still connected;
            // check wich model is the valid one;
        });
    }
}
exports.SpinalNetworkUtils = SpinalNetworkUtils;
//# sourceMappingURL=SpinalNetworkUtils.js.map
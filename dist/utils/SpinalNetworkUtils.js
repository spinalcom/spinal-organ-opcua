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
const Functions_1 = require("./Functions");
const displayLog_1 = require("./displayLog");
class SpinalNetworkUtils extends stream_1.EventEmitter {
    constructor() {
        super();
    }
    static getInstance() {
        if (!this.instance)
            this.instance = new SpinalNetworkUtils();
        return this.instance;
    }
    initAllListenersModels(spinalListenerModels) {
        return __awaiter(this, void 0, void 0, function* () {
            const startTime = Date.now();
            const listenerData = yield this._getSpinalListenerData(spinalListenerModels);
            const profiles = {};
            const devicesPromises = [];
            for (const data of listenerData) {
                const { profile } = data;
                if (!profiles[profile.getId().get()]) {
                    profiles[profile.getId().get()] = () => profile_service_1.OPCUAProfileService.getInstance().initProfile(profile);
                }
                devicesPromises.push(() => this.initSpinalListenerModel(data));
            }
            return (0, Functions_1.consumeBatch)(devicesPromises, 10).then((devicesResults) => __awaiter(this, void 0, void 0, function* () {
                const endTime = Date.now();
                displayLog_1.default.log(`All listener models initialized`);
                displayLog_1.default.log(`Starting to initialize profiles...`);
                const profilePromises = Object.values(profiles);
                yield (0, Functions_1.consumeBatch)(profilePromises, 10);
                displayLog_1.default.log(`All profiles initialized`);
                return devicesResults.filter((device) => device !== null);
            }));
        });
    }
    getListenerData(spinalListenerModel) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const { context, device, profile, network } = yield spinalListenerModel.getAllData();
            const listenerIsValid = yield this._checkIfListenerModelIsValid(spinalListenerModel, device);
            if (!listenerIsValid) {
                displayLog_1.default.warn(`${device.getName().get()} listener model in info is not valid. Please check the device connection.`);
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
                // const profileData = await OPCUAProfileService.getInstance().initProfile(profile);
                const spinalDevice = new SpinalDevice_1.SpinalDevice(serverinfo, context, network, device, model, profile.getId().get());
                // await spinalDevice.init();
                return spinalDevice;
            }
            catch (error) {
                displayLog_1.default.error(`[initSpinalListenerModel] - Error initializing ${device.getName().get()} due to: ${error.message}`);
                return null;
            }
        });
    }
    _getSpinalListenerData(listeners) {
        listeners = Array.isArray(listeners) ? listeners : [listeners];
        const promises = listeners.map((model) => this.getListenerData(model));
        return Promise.all(promises).then((results) => results.filter((data) => data !== null));
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
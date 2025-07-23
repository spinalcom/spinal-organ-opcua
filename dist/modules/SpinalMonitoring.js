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
exports.spinalMonitoring = void 0;
const priority_queue_1 = require("@datastructures-js/priority-queue");
const SpinalQueuing_1 = require("../utils/SpinalQueuing");
const lodash = require("lodash");
const SpinalNetworkUtils_1 = require("../utils/SpinalNetworkUtils");
const node_opcua_1 = require("node-opcua");
const OPCUAService_1 = require("../utils/OPCUAService");
const Functions_1 = require("../utils/Functions");
class SpinalMonitoring {
    constructor() {
        this.queue = new SpinalQueuing_1.SpinalQueuing();
        this.priorityQueue = new priority_queue_1.MinPriorityQueue();
        this.isProcessing = false;
        this.intervalTimesMap = new Map();
        this.initializedMap = new Map();
        this.spinalDevices = new Map();
        this.idNetworkToSpinalDevice = new Map();
        this.spinalNetworkUtils = SpinalNetworkUtils_1.SpinalNetworkUtils.getInstance();
        this.covItemToMonitoring = new Map();
    }
    addToMonitoringList(spinalListenerModel) {
        return __awaiter(this, void 0, void 0, function* () {
            this.queue.addToQueue(spinalListenerModel);
        });
    }
    init() {
        this.queue.on("start", () => this.startDeviceInitialisation());
        this.spinalNetworkUtils.on("profileUpdated", ({ profileId, devicesIds }) => this._updateProfile(profileId, devicesIds));
    }
    startDeviceInitialisation() {
        return __awaiter(this, void 0, void 0, function* () {
            const list = this.queue.getQueue();
            this.queue.refresh();
            const promises = list.map(el => this.spinalNetworkUtils.initSpinalListenerModel(el));
            const devices = lodash.flattenDeep(yield Promise.all(promises));
            // const filtered = devices.filter(el => typeof el !== "undefined");
            const filtered = devices.filter(el => !!el);
            yield this._bindData(filtered);
            if (!this.isProcessing) {
                this.isProcessing = true;
                this.startMonitoring();
            }
        });
    }
    startMonitoring() {
        return __awaiter(this, void 0, void 0, function* () {
            let p = true;
            while (p) {
                if (this.priorityQueue.isEmpty()) {
                    yield this.waitFct(900);
                    continue;
                }
                const { priority, element } = this.priorityQueue.dequeue();
                const data = this.intervalTimesMap.get(element.interval);
                if (data) {
                    if (priority > Date.now()) {
                        this.priorityQueue.enqueue({ interval: element.interval }, priority);
                        yield this.waitFct(900); // wait pour ne pas avoir une boucle infinie et pour detecter les changements de priorité
                        continue;
                    }
                    yield this.updateData(data, element.interval, priority);
                }
            }
        });
    }
    updateData(data, interval, date) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (date && Date.now() < date) {
                    console.log(`waiting ${(date - Date.now()) / 1000}s, for the next update`);
                    yield this.waitFct(date - Date.now());
                }
                const valuesObj = yield this._getOPCValues(data);
                const promises = Object.keys(valuesObj).map((key) => {
                    const device = this.spinalDevices.get(key);
                    if (!device)
                        return;
                    return device.updateEndpoints(valuesObj[key]);
                });
                yield Promise.all(promises);
                // this.priorityQueue.enqueue({ interval }, Date.now() + interval);
            }
            catch (error) {
                console.error(error);
                // this.priorityQueue.enqueue({ interval }, Date.now() + interval);
            }
            this.priorityQueue.enqueue({ interval }, Date.now() + interval);
        });
    }
    _bindData(data) {
        for (const spinalDevice of data) {
            this.spinalDevices.set(spinalDevice.deviceInfo.id, spinalDevice);
            const spinalModel = spinalDevice.spinalListenerModel;
            // const network = spinalDevice.network;
            const profile = spinalDevice.profile;
            spinalModel.monitored.bind(() => __awaiter(this, void 0, void 0, function* () {
                const monitored = spinalModel.monitored.get();
                const deviceInfo = spinalDevice.deviceInfo;
                // const serverInfo = network.info.serverInfo.get()
                const url = (0, Functions_1.getServerUrl)(spinalDevice.server);
                if (!monitored) {
                    console.log(deviceInfo.name, "is stopped");
                    this._removeFromMaps(deviceInfo.id, url);
                    this._stopCovItems(deviceInfo.id);
                    return;
                }
                console.log("start monitoring", deviceInfo.name);
                yield this._addToMaps({ url, spinalDevice, profile, deviceInfo });
            }));
        }
    }
    _addToMaps({ url, spinalDevice, profile, deviceInfo }) {
        return __awaiter(this, void 0, void 0, function* () {
            return profile.intervals.reduce((prom, el) => __awaiter(this, void 0, void 0, function* () {
                var _a;
                let list = yield prom;
                if (isNaN(el.value) || !((_a = el.children) === null || _a === void 0 ? void 0 : _a.length))
                    return list;
                const interval = Number(el.value);
                if (interval == 0) {
                    yield this.monitorWithCov(url, spinalDevice, el.children);
                    return list;
                }
                // add to interval map
                let intervalObj = this.intervalTimesMap.get(interval) || {};
                const value = intervalObj[url] || [];
                value.push({
                    id: deviceInfo.id,
                    nodeToUpdate: el.children.map((el) => {
                        const i = el.idNetwork;
                        this.idNetworkToSpinalDevice.set(i, spinalDevice);
                        return { displayName: i, nodeId: i };
                    })
                });
                intervalObj[url] = value;
                this.intervalTimesMap.set(interval, intervalObj);
                // end add to interval map
                // add to priority queue
                const arr = this.priorityQueue.toArray();
                //@ts-ignore
                const found = arr.find((p) => p.interval === interval);
                if (!found)
                    this.priorityQueue.enqueue({ interval }, interval + Date.now());
                // end add to priority queue
                return list;
            }), Promise.resolve([]));
        });
    }
    _removeFromMaps(deviceId, url) {
        this.intervalTimesMap.forEach((valueObj, key) => {
            if (valueObj[url]) {
                valueObj[url] = valueObj[url].filter(el => el.id !== deviceId);
                this.intervalTimesMap.set(key, valueObj);
            }
            //    this.intervalTimesMap.set(key, value.filter(el => el.id !== deviceId));
        });
    }
    _stopCovItems(deviceId) {
        return __awaiter(this, void 0, void 0, function* () {
            const keys = Array.from(this.covItemToMonitoring.keys()).filter((key) => key.startsWith(deviceId));
            const promises = keys.map((key) => __awaiter(this, void 0, void 0, function* () {
                try {
                    const item = this.covItemToMonitoring.get(key);
                    if (!item)
                        return;
                    yield item.terminate();
                    this.covItemToMonitoring.delete(key);
                }
                catch (error) { }
            }));
            yield Promise.all(promises);
        });
    }
    waitFct(nb) {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve();
            }, nb >= 0 ? nb : 0);
        });
    }
    _getOPCValues(obj) {
        const deviceObj = {};
        const promises = Object.keys(obj).map((url) => __awaiter(this, void 0, void 0, function* () {
            const value = obj[url];
            const opcIds = value.map((el) => el.nodeToUpdate).flat();
            return this._getVariablesValues(url, opcIds);
        }));
        return Promise.all(promises).then((result) => {
            const obj = {};
            for (const r of result.flat()) {
                this._classifyByDevice(obj, r);
            }
            return obj;
        });
    }
    _getVariablesValues(endpointUrl, variablesIds) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!Array.isArray(variablesIds))
                    variablesIds = [variablesIds];
                const userIdentity = { type: node_opcua_1.UserTokenType.Anonymous };
                const opcuaService = new OPCUAService_1.default(endpointUrl);
                yield opcuaService.initialize();
                yield opcuaService.connect(userIdentity);
                return opcuaService.readNodeValue(variablesIds).then((result) => __awaiter(this, void 0, void 0, function* () {
                    const obj = {};
                    for (let index = 0; index < result.length; index++) {
                        const element = result[index];
                        obj[variablesIds[index].nodeId.toString()] = element;
                    }
                    yield opcuaService.disconnect();
                    return obj;
                }));
            }
            catch (error) {
                return {};
            }
        });
    }
    _classifyByDevice(obj, data) {
        for (const key in data) {
            const value = data[key];
            const device = this.idNetworkToSpinalDevice.get(key);
            if (!device)
                continue;
            if (!obj[device.deviceInfo.id])
                obj[device.deviceInfo.id] = {};
            obj[device.deviceInfo.id][key] = value;
        }
        return obj;
    }
    _updateProfile(profileId, devicesIds) {
        return devicesIds.map((deviceId) => {
            const device = this.spinalDevices.get(deviceId);
            if (!device)
                return;
            device.restartMonitoring();
        });
    }
    monitorWithCov(url, spinalDevice, nodes) {
        return __awaiter(this, void 0, void 0, function* () {
            // const names = {};
            const ids = nodes.map((el) => {
                // names[el.idNetwork] = el.name;
                return el.idNetwork;
            });
            const opcuaService = new OPCUAService_1.default(url);
            yield opcuaService.initialize();
            yield opcuaService.connect();
            opcuaService.monitorItem(ids, (id, dataValue, monitorItem) => {
                if (!dataValue || typeof (dataValue === null || dataValue === void 0 ? void 0 : dataValue.value) == "undefined")
                    return;
                console.log("dataValue = ", dataValue);
                const value = ["string", "number", "boolean"].includes(typeof (dataValue === null || dataValue === void 0 ? void 0 : dataValue.value)) ? dataValue === null || dataValue === void 0 ? void 0 : dataValue.value : null;
                console.log(`[COV] - ${id} has changed to ${value}`);
                const temp_id = `${spinalDevice.deviceInfo.id}_${id}`;
                if (!this.covItemToMonitoring.has(temp_id))
                    this.covItemToMonitoring.set(temp_id, monitorItem); // save the monitor item to be able to stop it later
                spinalDevice.updateEndpoints({ [id]: { value: value, dataType: typeof value } }, true);
            });
        });
    }
}
const spinalMonitoring = new SpinalMonitoring();
exports.spinalMonitoring = spinalMonitoring;
spinalMonitoring.init();
exports.default = spinalMonitoring;
//# sourceMappingURL=SpinalMonitoring.js.map
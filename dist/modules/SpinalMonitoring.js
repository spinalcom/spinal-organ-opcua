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
const SpinalNetworkUtils_1 = require("../utils/SpinalNetworkUtils");
const node_opcua_1 = require("node-opcua");
const Functions_1 = require("../utils/Functions");
const utils_1 = require("../utils/utils");
const OPCUAFactory_1 = require("../utils/OPCUAFactory");
class SpinalMonitoring {
    constructor() {
        this.queue = new SpinalQueuing_1.SpinalQueuing();
        this.priorityQueue = new priority_queue_1.MinPriorityQueue();
        this.isProcessing = false;
        this.intervalTimesMap = new Map();
        this.initializedMap = new Map();
        this.spinalDevicesStore = new Map();
        this.idNetworkToSpinalDevice = new Map();
        this.spinalNetworkUtils = SpinalNetworkUtils_1.SpinalNetworkUtils.getInstance();
        this.covItemToMonitoring = new Map();
        this.addToMonitoringMapQueue = new SpinalQueuing_1.SpinalQueuing();
    }
    addToMonitoringList(spinalListenerModel) {
        return __awaiter(this, void 0, void 0, function* () {
            this.queue.addToQueue(spinalListenerModel);
        });
    }
    init() {
        this.queue.on("start", () => this.startDeviceInitialisation());
        this.spinalNetworkUtils.on("profileUpdated", ({ profileId, devicesIds }) => this._updateProfile(profileId, devicesIds));
        this.addToMonitoringMapQueue.on("start", () => __awaiter(this, void 0, void 0, function* () { return this._addAllDeviceDataToMaps(); }));
    }
    startDeviceInitialisation() {
        return __awaiter(this, void 0, void 0, function* () {
            const modelInQueue = this.queue.getQueue(); // get all models as array
            this.queue.refresh(); // clear the queue
            console.log(`Starting initialization of ${modelInQueue.length} devices`);
            const devices = yield this.initAllListenersModels(modelInQueue);
            console.log(`${devices.length} devices initialized successfully`);
            // const promises = modelInQueue.map(el => this.spinalNetworkUtils.initSpinalListenerModel(el));
            // const devicesFlatted = lodash.flattenDeep(await Promise.all(promises));
            // const validDevices = devicesFlatted.filter(el => !!el);
            console.log(`Starting to bind devices`);
            yield this._bindDevices(devices);
            if (!this.isProcessing) {
                this.isProcessing = true;
                this.startMonitoring();
            }
        });
    }
    initAllListenersModels(spinalListenerModels) {
        return __awaiter(this, void 0, void 0, function* () {
            const devices = [];
            for (const model of spinalListenerModels) {
                const modelData = yield this.spinalNetworkUtils.initSpinalListenerModel(model);
                devices.push(modelData);
            }
            return new Promise((resolve, reject) => {
                const interval = setInterval(() => {
                    const allInitialized = devices.every((device) => device === null || device === void 0 ? void 0 : device.isInit);
                    if (allInitialized) {
                        clearInterval(interval);
                        resolve(devices.filter(el => !!el));
                    }
                }, 400);
            });
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
                const { priority, element: intervalData } = this.priorityQueue.dequeue();
                const data = this.intervalTimesMap.get(intervalData.interval);
                if (!data)
                    continue; // if no data for this interval, continue to next iteration and not add to the queue
                // if the priority is greater than the current time, we need to wait for the next iteration
                if (priority > Date.now()) {
                    this.priorityQueue.enqueue({ interval: intervalData.interval }, priority);
                    yield this.waitFct(900); // wait 900ms before next iteration (it's less than 1s to avoid busy waiting)
                    continue;
                }
                yield this.updateData(data, intervalData.interval, priority);
            }
        });
    }
    updateData(data, interval, date) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // if a date is provided, we wait for the next update
                if (date && Date.now() < date) {
                    console.log(`waiting ${(date - Date.now()) / 1000}s, for the next update`);
                    yield this.waitFct(date - Date.now());
                }
                const valuesObj = yield this._getOPCValues(data);
                const promises = Object.keys(valuesObj).map((deviceId) => {
                    const device = this.spinalDevicesStore.get(deviceId);
                    if (!device)
                        return;
                    return device.updateEndpoints(valuesObj[deviceId]);
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
    _bindDevices(devices) {
        for (const spinalDevice of devices) {
            this.spinalDevicesStore.set(spinalDevice.deviceInfo.id, spinalDevice); // save the device in the map to be able to retrieve it later
            const spinalModel = spinalDevice.spinalListenerModel;
            const profile = spinalDevice.profile;
            spinalModel.monitored.bind(() => __awaiter(this, void 0, void 0, function* () {
                const deviceIsMonitored = spinalModel.monitored.get();
                const deviceInfo = spinalDevice.deviceInfo;
                // const serverInfo = network.info.serverInfo.get()
                const url = (0, Functions_1.getServerUrl)(spinalDevice.server);
                if (!deviceIsMonitored) {
                    console.log(deviceInfo.name, "is stopped");
                    this._removeFromMaps(deviceInfo.id, url);
                    this._stopCovItems(deviceInfo.id);
                    return;
                }
                console.log(deviceInfo.name, "is monitored");
                this.addToMonitoringMapQueue.addToQueue({ url, spinalDevice, profile });
                // await this._addDeviceDataToMaps(url, spinalDevice, profile);
            }));
        }
    }
    _addAllDeviceDataToMaps() {
        return __awaiter(this, void 0, void 0, function* () {
            const queueData = this.addToMonitoringMapQueue.getQueue(); // get all models as array
            this.addToMonitoringMapQueue.refresh(); // clear the queue
            for (const { url, spinalDevice, profile } of queueData) {
                yield this._addDeviceDataToMaps(url, spinalDevice, profile);
            }
        });
    }
    _addDeviceDataToMaps(url, spinalDevice, profile) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            for (const intervalData of profile.intervals) {
                if (isNaN(intervalData.value) || !((_a = intervalData.children) === null || _a === void 0 ? void 0 : _a.length))
                    continue;
                const interval = Number(intervalData.value);
                if (interval == 0) {
                    yield this.monitorWithCov(url, spinalDevice, intervalData.children);
                    continue; // go to next interval
                }
                // add to interval map
                yield this._addItemTointervalMap(url, spinalDevice, intervalData);
                yield this._addItemToPriorityQueue(interval);
            }
        });
    }
    _addItemTointervalMap(url, spinalDevice, intervalData) {
        var _a;
        const interval = Number(intervalData.value);
        if (isNaN(interval) || !((_a = intervalData.children) === null || _a === void 0 ? void 0 : _a.length))
            return;
        let intervalObj = this.intervalTimesMap.get(interval) || {};
        let intervalList = intervalObj[url] || [];
        const nodeToUpdate = intervalData.children.map((child) => {
            const key = (0, utils_1.normalizePath)(child.path) || child.idNetwork;
            this.idNetworkToSpinalDevice.set(key, spinalDevice); // save the device in the map to be able to retrieve it later
            return { path: (0, utils_1.normalizePath)(child.path) };
        });
        intervalList.push({ id: spinalDevice.deviceInfo.id, nodeToUpdate });
        // const data: { id: string; nodeToUpdate: { displayName: string; path: string }[] }[];
        intervalObj[url] = intervalList;
        this.intervalTimesMap.set(interval, intervalObj);
        return { interval, intervalObj };
    }
    _addItemToPriorityQueue(interval) {
        const priorityQueueData = this.priorityQueue.toArray();
        const intervalFound = priorityQueueData.find((priority) => { var _a; return ((_a = priority.element) === null || _a === void 0 ? void 0 : _a.interval) == interval; });
        console.log("Interval found in priority queue:", !!intervalFound, interval);
        if (!intervalFound)
            this.priorityQueue.enqueue({ interval }, interval + Date.now());
        return intervalFound;
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
        const urls = Object.keys(obj);
        const promises = [];
        if (!urls.length)
            return Promise.resolve([]);
        for (const url of urls) {
            const nodesToUpdate = obj[url].map((el) => el.nodeToUpdate).flat() || [];
            promises.push(this._getVariablesValues(url, nodesToUpdate));
        }
        return Promise.all(promises).then((result) => {
            const opcNodeObj = {};
            // result is an array of arrays, we need to flatten it and classify by device id
            for (const opcNode of result.flat()) {
                if (!opcNode || !opcNode.nodeId)
                    continue; // skip if no nodeId
                const key = (0, utils_1.normalizePath)(opcNode.path) || opcNode.nodeId.toString();
                const device = this.idNetworkToSpinalDevice.get(key);
                if (!device)
                    continue;
                const deviceId = device.deviceInfo.id;
                if (!opcNodeObj[deviceId])
                    opcNodeObj[deviceId] = [];
                opcNodeObj[deviceId].push(opcNode);
            }
            return opcNodeObj;
        });
    }
    _getVariablesValues(endpointUrl, variableNodes) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!Array.isArray(variableNodes))
                    variableNodes = [variableNodes];
                const userIdentity = { type: node_opcua_1.UserTokenType.Anonymous };
                const opcuaService = OPCUAFactory_1.default.getOPCUAInstance(endpointUrl);
                yield opcuaService.checkAndRetablishConnection();
                return opcuaService.getNodesNewInfoByPath(variableNodes).then((result) => __awaiter(this, void 0, void 0, function* () {
                    // Disable disconnect to keep the connection alive for future operations
                    // await opcuaService.disconnect();
                    return result;
                }));
            }
            catch (error) {
                return [];
            }
        });
    }
    _updateProfile(profileId, devicesIds) {
        return devicesIds.map((deviceId) => {
            const device = this.spinalDevicesStore.get(deviceId);
            if (!device)
                return;
            device.restartMonitoring();
        });
    }
    monitorWithCov(url, spinalDevice, nodes) {
        return __awaiter(this, void 0, void 0, function* () {
            const isCov = true;
            const idsToPaths = {};
            const opcNodes = yield this._getVariablesValues(url, nodes);
            yield spinalDevice.updateEndpoints(opcNodes, isCov); // update the endpoints node with the new values (name, path, value)
            // get new ids from opcNodes and save the path to be able to retrieve it later
            const ids = opcNodes.map((el) => {
                const nodeId = el.nodeId.toString();
                idsToPaths[nodeId] = (0, utils_1.normalizePath)(el.path) || nodeId; // save the path to be able to retrieve it later
                return nodeId;
            });
            // connect to the OPCUA server and monitor the items
            const opcuaService = OPCUAFactory_1.default.getOPCUAInstance(url);
            yield opcuaService.checkAndRetablishConnection();
            // call monitorItem with the ids and a callback function
            opcuaService.monitorItem(ids, (id, dataValue, monitorItem) => {
                if (!dataValue || typeof (dataValue === null || dataValue === void 0 ? void 0 : dataValue.value) == "undefined")
                    return;
                const value = ["string", "number", "boolean"].includes(typeof (dataValue === null || dataValue === void 0 ? void 0 : dataValue.value)) ? dataValue === null || dataValue === void 0 ? void 0 : dataValue.value : null;
                console.log(`[COV] - ${id} has changed to ${value}`);
                const temp_id = `${spinalDevice.deviceInfo.id}_${id}`;
                if (!this.covItemToMonitoring.has(temp_id))
                    this.covItemToMonitoring.set(temp_id, monitorItem); // save the monitor item to be able to stop it later
                spinalDevice.updateEndpoints([{ path: idsToPaths[id], nodeId: (0, node_opcua_1.coerceNodeId)(id), value: { value: value, dataType: typeof value } }], isCov);
            });
        });
    }
}
const spinalMonitoring = new SpinalMonitoring();
exports.spinalMonitoring = spinalMonitoring;
spinalMonitoring.init();
exports.default = spinalMonitoring;
//# sourceMappingURL=SpinalMonitoring.js.map
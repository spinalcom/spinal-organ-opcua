
import { SpinalOPCUAListener } from "spinal-model-opcua";
import { MinPriorityQueue, PriorityQueue, PriorityQueueItem } from "@datastructures-js/priority-queue";

import { SpinalQueuing } from "../utils/SpinalQueuing";
import { SpinalDevice } from "./SpinalDevice";
import * as lodash from "lodash";
import { IProfile, SpinalNetworkUtils } from "../utils/SpinalNetworkUtils";
import { ClientMonitoredItemBase, coerceNodeId, UserIdentityInfo, UserTokenType } from "node-opcua";
import OPCUAService from "../utils/OPCUAService";
import { IOPCNode } from "../interfaces/OPCNode";
import { getServerUrl } from "../utils/Functions";
import { ISpinalInterval } from "../interfaces/IntervalTypes";
import { normalizePath } from "../utils/utils";
import OPCUAFactory from "../utils/OPCUAFactory";

class SpinalMonitoring {
    private queue: SpinalQueuing = new SpinalQueuing();
    private priorityQueue: MinPriorityQueue<{ interval: number; }> = new MinPriorityQueue();
    private isProcessing: boolean = false;
    private intervalTimesMap: Map<number, { [key: string]: ISpinalInterval[] }> = new Map();

    private initializedMap: Map<string, boolean> = new Map();
    private spinalDevicesStore: Map<string, SpinalDevice> = new Map();
    private idNetworkToSpinalDevice: Map<string, SpinalDevice> = new Map();
    private spinalNetworkUtils: SpinalNetworkUtils = SpinalNetworkUtils.getInstance();
    private covItemToMonitoring: Map<string, ClientMonitoredItemBase> = new Map();
    private addToMonitoringMapQueue: SpinalQueuing = new SpinalQueuing();


    constructor() { }

    public async addToMonitoringList(spinalListenerModel: SpinalOPCUAListener): Promise<void> {
        this.queue.addToQueue(spinalListenerModel);
    }

    init() {
        this.queue.on("start", () => this.startDeviceInitialisation());
        this.spinalNetworkUtils.on("profileUpdated", ({ profileId, devicesIds }) => this._updateProfile(profileId, devicesIds));
        this.addToMonitoringMapQueue.on("start", async () => this._addAllDeviceDataToMaps());
    }

    public async startDeviceInitialisation() {
        const modelInQueue = this.queue.getQueue(); // get all models as array
        this.queue.refresh(); // clear the queue

        console.log(`Starting initialization of ${modelInQueue.length} devices`);

        const devices = await this.initAllListenersModels(modelInQueue);

        console.log(`${devices.length} devices initialized successfully`);
        // const promises = modelInQueue.map(el => this.spinalNetworkUtils.initSpinalListenerModel(el));

        // const devicesFlatted = lodash.flattenDeep(await Promise.all(promises));
        // const validDevices = devicesFlatted.filter(el => !!el);
        console.log(`Starting to bind devices`);
        await this._bindDevices(devices);

        if (!this.isProcessing) {
            this.isProcessing = true;
            this.startMonitoring();
        }
    }


    public async initAllListenersModels(spinalListenerModels: SpinalOPCUAListener[]): Promise<SpinalDevice[]> {
        const devices = [];
        for (const model of spinalListenerModels) {
            const modelData = await this.spinalNetworkUtils.initSpinalListenerModel(model);
            devices.push(modelData);
        }

        return new Promise((resolve, reject) => {
            const interval = setInterval(() => {
                const allInitialized = devices.every((device) => device?.isInit);
                if (allInitialized) {
                    clearInterval(interval);
                    resolve(devices.filter(el => !!el));
                }
            }, 400)
        });
    }

    public async startMonitoring() {
        let p = true;
        while (p) {
            if (this.priorityQueue.isEmpty()) {
                await this.waitFct(900);
                continue;
            }

            const { priority, element: intervalData } = this.priorityQueue.dequeue();
            const data = this.intervalTimesMap.get(intervalData.interval);

            if (!data) continue; // if no data for this interval, continue to next iteration and not add to the queue

            // if the priority is greater than the current time, we need to wait for the next iteration
            if (priority > Date.now()) {
                this.priorityQueue.enqueue({ interval: intervalData.interval }, priority);
                await this.waitFct(900); // wait 900ms before next iteration (it's less than 1s to avoid busy waiting)
                continue;
            }

            await this.updateData(data, intervalData.interval, priority);
        }
    }

    public async updateData(data: { [key: string]: ISpinalInterval[] }, interval: number, date?: number) {

        try {

            // if a date is provided, we wait for the next update
            if (date && Date.now() < date) {
                console.log(`waiting ${(date - Date.now()) / 1000}s, for the next update`);
                await this.waitFct(date - Date.now());
            }

            const valuesObj = await this._getOPCValues(data);

            const promises = Object.keys(valuesObj).map((deviceId) => {

                const device = this.spinalDevicesStore.get(deviceId);
                if (!device) return;

                return device.updateEndpoints(valuesObj[deviceId]);
            });

            await Promise.all(promises);

            // this.priorityQueue.enqueue({ interval }, Date.now() + interval);
        } catch (error) {
            console.error(error);

            // this.priorityQueue.enqueue({ interval }, Date.now() + interval);
        }

        this.priorityQueue.enqueue({ interval }, Date.now() + interval);
    }


    private _bindDevices(devices: SpinalDevice[]) {
        for (const spinalDevice of devices) {
            this.spinalDevicesStore.set(spinalDevice.deviceInfo.id, spinalDevice); // save the device in the map to be able to retrieve it later

            const spinalModel = spinalDevice.spinalListenerModel;
            const profile = spinalDevice.profile;

            spinalModel.monitored.bind(async () => {
                const deviceIsMonitored = spinalModel.monitored.get();
                const deviceInfo = spinalDevice.deviceInfo;

                // const serverInfo = network.info.serverInfo.get()
                const url = getServerUrl(spinalDevice.server);

                if (!deviceIsMonitored) {
                    console.log(deviceInfo.name, "is stopped");
                    this._removeFromMaps(deviceInfo.id, url);
                    this._stopCovItems(deviceInfo.id);
                    return;
                }

                console.log(deviceInfo.name, "is monitored");
                this.addToMonitoringMapQueue.addToQueue({ url, spinalDevice, profile });
                // await this._addDeviceDataToMaps(url, spinalDevice, profile);

            })
        }
    }

    private async _addAllDeviceDataToMaps() {
        const queueData = this.addToMonitoringMapQueue.getQueue(); // get all models as array
        this.addToMonitoringMapQueue.refresh(); // clear the queue

        for (const { url, spinalDevice, profile } of queueData) {
            await this._addDeviceDataToMaps(url, spinalDevice, profile);
        }
    }

    private async _addDeviceDataToMaps(url: string, spinalDevice: SpinalDevice, profile: IProfile) {

        for (const intervalData of profile.intervals) {
            if (isNaN(intervalData.value) || !intervalData.children?.length) continue;

            const interval = Number(intervalData.value);

            if (interval == 0) {
                await this.monitorWithCov(url, spinalDevice, intervalData.children as any);
                continue; // go to next interval
            }

            // add to interval map
            await this._addItemTointervalMap(url, spinalDevice, intervalData);
            await this._addItemToPriorityQueue(interval);
        }

    }

    private _addItemTointervalMap(url: string, spinalDevice: SpinalDevice, intervalData: IProfile["intervals"][0]) {

        const interval = Number(intervalData.value);
        if (isNaN(interval) || !intervalData.children?.length) return;

        let intervalObj = this.intervalTimesMap.get(interval) || {};
        let intervalList = intervalObj[url] || [];

        const nodeToUpdate = intervalData.children.map((child) => {
            const key = normalizePath(child.path) || child.idNetwork;
            this.idNetworkToSpinalDevice.set(key, spinalDevice); // save the device in the map to be able to retrieve it later
            return { path: normalizePath(child.path) };
        })

        intervalList.push({ id: spinalDevice.deviceInfo.id, nodeToUpdate })

        // const data: { id: string; nodeToUpdate: { displayName: string; path: string }[] }[];


        intervalObj[url] = intervalList;

        this.intervalTimesMap.set(interval, intervalObj);
        return { interval, intervalObj }
    }

    private _addItemToPriorityQueue(interval: number) {
        const priorityQueueData: PriorityQueueItem<{ interval }>[] = this.priorityQueue.toArray();

        const intervalFound = priorityQueueData.find((priority: any) => priority.element?.interval == interval);
        console.log("Interval found in priority queue:", !!intervalFound, interval);
        if (!intervalFound) this.priorityQueue.enqueue({ interval }, interval + Date.now());

        return intervalFound;
    }


    private _removeFromMaps(deviceId: string, url: string) {
        this.intervalTimesMap.forEach((valueObj, key) => {
            if (valueObj[url]) {
                valueObj[url] = valueObj[url].filter(el => el.id !== deviceId);
                this.intervalTimesMap.set(key, valueObj);
            }
            //    this.intervalTimesMap.set(key, value.filter(el => el.id !== deviceId));
        })
    }

    private async _stopCovItems(deviceId: string) {
        const keys = Array.from(this.covItemToMonitoring.keys()).filter((key: string) => key.startsWith(deviceId));
        const promises = keys.map(async (key) => {
            try {
                const item = this.covItemToMonitoring.get(key);
                if (!item) return;

                await item.terminate();
                this.covItemToMonitoring.delete(key);
            } catch (error) { }
        });

        await Promise.all(promises);
    }

    private waitFct(nb: number): Promise<void> {
        return new Promise((resolve) => {
            setTimeout(
                () => {
                    resolve();
                },
                nb >= 0 ? nb : 0);
        });
    }


    private _getOPCValues(obj: { [key: string]: ISpinalInterval[] }) {

        const urls = Object.keys(obj);
        const promises = [];
        if (!urls.length) return Promise.resolve([]);

        for (const url of urls) {
            const nodesToUpdate = obj[url].map((el) => el.nodeToUpdate).flat() || [];
            promises.push(this._getVariablesValues(url, nodesToUpdate));
        }

        return Promise.all(promises).then((result) => {
            const opcNodeObj: { [key: string]: IOPCNode[] } = {};

            // result is an array of arrays, we need to flatten it and classify by device id
            for (const opcNode of result.flat()) {

                if (!opcNode || !opcNode.nodeId) continue; // skip if no nodeId

                const key = normalizePath(opcNode.path) || opcNode.nodeId.toString();
                const device = this.idNetworkToSpinalDevice.get(key);
                if (!device) continue;

                const deviceId = device.deviceInfo.id;
                if (!opcNodeObj[deviceId]) opcNodeObj[deviceId] = [];

                opcNodeObj[deviceId].push(opcNode);
            }

            return opcNodeObj;
        })

    }

    private async _getVariablesValues(endpointUrl: string, variableNodes: IOPCNode[]): Promise<IOPCNode[]> {
        try {

            if (!Array.isArray(variableNodes)) variableNodes = [variableNodes];

            const userIdentity: UserIdentityInfo = { type: UserTokenType.Anonymous };
            const opcuaService: OPCUAService = OPCUAFactory.getOPCUAInstance(endpointUrl);

            await opcuaService.checkAndRetablishConnection();

            return opcuaService.getNodesNewInfoByPath(variableNodes).then(async (result) => {
                // Disable disconnect to keep the connection alive for future operations
                // await opcuaService.disconnect();
                return result;
            })


        } catch (error) {
            return []
        }
    }


    private _updateProfile(profileId: string, devicesIds: string[]) {
        return devicesIds.map((deviceId) => {
            const device = this.spinalDevicesStore.get(deviceId);
            if (!device) return;

            device.restartMonitoring();
        });
    }

    private async monitorWithCov(url: string, spinalDevice: SpinalDevice, nodes: IOPCNode[]) {

        const isCov = true;
        const idsToPaths: { [key: string]: string } = {};

        const opcNodes = await this._getVariablesValues(url, nodes);
        await spinalDevice.updateEndpoints(opcNodes, isCov); // update the endpoints node with the new values (name, path, value)


        // get new ids from opcNodes and save the path to be able to retrieve it later
        const ids = opcNodes.map((el) => {
            const nodeId = el.nodeId.toString();
            idsToPaths[nodeId] = normalizePath(el.path) || nodeId; // save the path to be able to retrieve it later
            return nodeId;
        });

        // connect to the OPCUA server and monitor the items
        const opcuaService: OPCUAService = OPCUAFactory.getOPCUAInstance(url);
        await opcuaService.checkAndRetablishConnection();


        // call monitorItem with the ids and a callback function
        opcuaService.monitorItem(ids, (id, dataValue, monitorItem) => {
            if (!dataValue || typeof dataValue?.value == "undefined") return;
            const value = ["string", "number", "boolean"].includes(typeof dataValue?.value) ? dataValue?.value : null;

            console.log(`[COV] - ${id} has changed to ${value}`);

            const temp_id = `${spinalDevice.deviceInfo.id}_${id}`;

            if (!this.covItemToMonitoring.has(temp_id)) this.covItemToMonitoring.set(temp_id, monitorItem); // save the monitor item to be able to stop it later

            spinalDevice.updateEndpoints([{ path: idsToPaths[id], nodeId: coerceNodeId(id), value: { value: value, dataType: typeof value } }], isCov);
        });

    }
}


const spinalMonitoring = new SpinalMonitoring();
spinalMonitoring.init();

export default spinalMonitoring;
export { spinalMonitoring }
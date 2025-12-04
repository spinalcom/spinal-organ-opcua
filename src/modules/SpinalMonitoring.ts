
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

class SpinalMonitoring {
    private queue: SpinalQueuing = new SpinalQueuing();
    private priorityQueue: MinPriorityQueue<{ interval: number; }> = new MinPriorityQueue();
    private isProcessing: boolean = false;
    private intervalTimesMap: Map<number, { [key: string]: ISpinalInterval[] }> = new Map();

    private initializedMap: Map<string, boolean> = new Map();
    private spinalDevices: Map<string, SpinalDevice> = new Map();
    private idNetworkToSpinalDevice: Map<string, SpinalDevice> = new Map();
    private spinalNetworkUtils: SpinalNetworkUtils = SpinalNetworkUtils.getInstance();
    private covItemToMonitoring: Map<string, ClientMonitoredItemBase> = new Map();


    constructor() { }

    public async addToMonitoringList(spinalListenerModel: SpinalOPCUAListener): Promise<void> {
        this.queue.addToQueue(spinalListenerModel);
    }

    init() {
        this.queue.on("start", () => this.startDeviceInitialisation());
        this.spinalNetworkUtils.on("profileUpdated", ({ profileId, devicesIds }) => this._updateProfile(profileId, devicesIds));
    }

    public async startDeviceInitialisation() {
        const modelInQueue = this.queue.getQueue();
        this.queue.refresh();

        const promises = modelInQueue.map(el => this.spinalNetworkUtils.initSpinalListenerModel(el));

        const devicesFlatted = lodash.flattenDeep(await Promise.all(promises));
        // const filtered = devices.filter(el => typeof el !== "undefined");
        const validDevices = devicesFlatted.filter(el => !!el);

        await this._bindData(validDevices);

        if (!this.isProcessing) {
            this.isProcessing = true;
            this.startMonitoring();
        }
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
                await this.waitFct(900); // wait pour ne pas avoir une boucle infinie et pour detecter les changements de priorité
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

                const device = this.spinalDevices.get(deviceId);
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


    private _bindData(data: SpinalDevice[]) {
        for (const spinalDevice of data) {
            this.spinalDevices.set(spinalDevice.deviceInfo.id, spinalDevice);
            const spinalModel = spinalDevice.spinalListenerModel;
            // const network = spinalDevice.network;
            const profile = spinalDevice.profile;

            spinalModel.monitored.bind(async () => {
                const monitored = spinalModel.monitored.get();
                const deviceInfo = spinalDevice.deviceInfo;

                // const serverInfo = network.info.serverInfo.get()
                const url = getServerUrl(spinalDevice.server);

                if (!monitored) {
                    console.log(deviceInfo.name, "is stopped");
                    this._removeFromMaps(deviceInfo.id, url);
                    this._stopCovItems(deviceInfo.id);
                    return;
                }

                console.log(deviceInfo.name, "is monitored");
                await this._addToMaps(url, spinalDevice, profile);

            })
        }
    }

    private async _addToMaps(url: string, spinalDevice: SpinalDevice, profile: IProfile) {

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

        const intervalFound = priorityQueueData.find((priority: any) => priority.interval == interval);

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
            const opcuaService: OPCUAService = new OPCUAService(endpointUrl);

            await opcuaService.initialize();
            await opcuaService.connect(userIdentity);

            return opcuaService.getNodesNewInfoByPath(variableNodes).then(async (result) => {
                await opcuaService.disconnect();
                return result;
            })


        } catch (error) {
            return []
        }
    }


    private _updateProfile(profileId: string, devicesIds: string[]) {
        return devicesIds.map((deviceId) => {
            const device = this.spinalDevices.get(deviceId);
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
        const opcuaService: OPCUAService = new OPCUAService(url);
        await opcuaService.initialize();
        await opcuaService.connect();


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
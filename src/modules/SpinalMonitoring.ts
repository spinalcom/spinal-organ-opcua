
import { SpinalOPCUAListener } from "spinal-model-opcua";
import { MinPriorityQueue } from "@datastructures-js/priority-queue";

import { SpinalQueuing } from "../utils/SpinalQueuing";
import { SpinalDevice } from "./SpinalDevice";
import * as lodash from "lodash";
import { SpinalNetworkUtils } from "../utils/SpinalNetworkUtils";
import { ClientMonitoredItemBase, UserIdentityInfo, UserTokenType } from "node-opcua";
import OPCUAService from "../utils/OPCUAService";
import { IOPCNode } from "../interfaces/OPCNode";
import { getServerUrl } from "../utils/Functions";

class SpinalMonitoring {
    private queue: SpinalQueuing = new SpinalQueuing();
    private priorityQueue: MinPriorityQueue<{ interval: number; }> = new MinPriorityQueue();
    private isProcessing: boolean = false;
    private intervalTimesMap: Map<number, any> = new Map();
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
        const list = this.queue.getQueue();
        this.queue.refresh();

        const promises = list.map(el => this.spinalNetworkUtils.initSpinalListenerModel(el));

        const devices = lodash.flattenDeep(await Promise.all(promises));
        // const filtered = devices.filter(el => typeof el !== "undefined");
        const filtered = devices.filter(el => !!el);

        await this._bindData(filtered);

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

            const { priority, element } = this.priorityQueue.dequeue();
            const data = this.intervalTimesMap.get(element.interval);

            if (data) {
                if (priority > Date.now()) {
                    this.priorityQueue.enqueue({ interval: element.interval }, priority);
                    await this.waitFct(900); // wait pour ne pas avoir une boucle infinie et pour detecter les changements de priorité
                    continue;
                }

                await this.updateData(data, element.interval, priority);
            }

        }
    }

    public async updateData(data, interval: number, date?: number) {

        try {

            if (date && Date.now() < date) {
                console.log(`waiting ${(date - Date.now()) / 1000}s, for the next update`);
                await this.waitFct(date - Date.now());
            }

            const valuesObj = await this._getOPCValues(data);

            const promises = Object.keys(valuesObj).map((key) => {

                const device = this.spinalDevices.get(key);
                if (!device) return;

                return device.updateEndpoints(valuesObj[key]);
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

                console.log("start monitoring", deviceInfo.name)
                await this._addToMaps({ url, spinalDevice, profile, deviceInfo });

            })
        }
    }

    private async _addToMaps({ url, spinalDevice, profile, deviceInfo }) {
        return profile.intervals.reduce(async (prom, el) => {
            let list = await prom;

            if (isNaN(el.value) || !el.children?.length) return list;

            const interval = Number(el.value);
            if (interval == 0) {
                await this.monitorWithCov(url, spinalDevice, el.children);
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
            if (!found) this.priorityQueue.enqueue({ interval }, interval + Date.now());

            // end add to priority queue
            return list;
        }, Promise.resolve([]));

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


    private _getOPCValues(obj: { [key: string]: { id: string, nodeToUpdate: string[] } }[]) {
        const deviceObj = {};

        const promises = Object.keys(obj).map(async (url) => {
            const value = obj[url];
            const opcIds = value.map((el) => el.nodeToUpdate).flat();

            return this._getVariablesValues(url, opcIds);
        });

        return Promise.all(promises).then((result) => {
            const obj = {};

            for (const r of result.flat()) {
                this._classifyByDevice(obj, r);
            }

            return obj;
        })
    }

    private async _getVariablesValues(endpointUrl: string, variablesIds: IOPCNode[]): Promise<{ [key: string]: { dataType: string; value: any } }> {
        try {

            if (!Array.isArray(variablesIds)) variablesIds = [variablesIds];

            const userIdentity: UserIdentityInfo = { type: UserTokenType.Anonymous };
            const opcuaService: OPCUAService = new OPCUAService(endpointUrl);

            await opcuaService.initialize();
            await opcuaService.connect(userIdentity);

            return opcuaService.readNodeValue(variablesIds).then(async (result) => {
                const obj = {};

                for (let index = 0; index < result.length; index++) {
                    const element = result[index];
                    obj[variablesIds[index].nodeId.toString()] = element;
                }

                await opcuaService.disconnect();
                return obj;
            })


        } catch (error) {
            return {}
        }
    }

    private _classifyByDevice(obj: { [key: string]: { [key: string]: any } }, data: { [key: string]: any }) {

        for (const key in data) {
            const value = data[key];
            const device = this.idNetworkToSpinalDevice.get(key);
            if (!device) continue;

            if (!obj[device.deviceInfo.id]) obj[device.deviceInfo.id] = {};
            obj[device.deviceInfo.id][key] = value;
        }

        return obj;
    }

    private _updateProfile(profileId: string, devicesIds: string[]) {
        return devicesIds.map((deviceId) => {
            const device = this.spinalDevices.get(deviceId);
            if (!device) return;

            device.restartMonitoring();
        });
    }

    private async monitorWithCov(url: string, spinalDevice: SpinalDevice, nodes: any[]) {
        // const names = {};

        const ids = nodes.map((el) => {
            // names[el.idNetwork] = el.name;
            return el.idNetwork
        });

        const opcuaService: OPCUAService = new OPCUAService(url);
        await opcuaService.initialize();
        await opcuaService.connect();

        opcuaService.monitorItem(ids, (id, dataValue, monitorItem) => {
            if (!dataValue || typeof dataValue?.value == "undefined") return;
            const value = ["string", "number", "boolean"].includes(typeof dataValue?.value) ? dataValue?.value : null;

            console.log(`[COV] - ${id} has changed to ${value}`);

            const temp_id = `${spinalDevice.deviceInfo.id}_${id}`;

            if (!this.covItemToMonitoring.has(temp_id)) this.covItemToMonitoring.set(temp_id, monitorItem); // save the monitor item to be able to stop it later

            spinalDevice.updateEndpoints({ [id]: { value: value, dataType: typeof value } }, true);
        });

    }
}


const spinalMonitoring = new SpinalMonitoring();
spinalMonitoring.init();

export default spinalMonitoring;
export { spinalMonitoring }
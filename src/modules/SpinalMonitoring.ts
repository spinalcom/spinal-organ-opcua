
import { SpinalOPCUAListener } from "spinal-model-opcua";
import { MinPriorityQueue } from "@datastructures-js/priority-queue";

import { SpinalQueuing } from "../utils/SpinalQueuing";
import { SpinalDevice } from "./SpinalDevice";
import * as lodash from "lodash";
import { IDeviceInfo, SpinalNetworkUtils } from "../utils/SpinalNetworkUtils";
import { SpinalNode } from "spinal-env-viewer-graph-service";
import { NodeId, UserIdentityInfo, UserTokenType } from "node-opcua";
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
    constructor() { }

    public async addToMonitoringList(spinalListenerModel: SpinalOPCUAListener): Promise<void> {
        this.queue.addToQueue(spinalListenerModel);
    }

    init() {
        this.queue.on("start", () => { 
           this.startDeviceInitialisation();
        })
    }

    public async startDeviceInitialisation() {
        const list = this.queue.getQueue();
        this.queue.refresh();
  
        const promises = list.map(el => SpinalNetworkUtils.getInstance().initSpinalListenerModel(el));
  
        const devices = lodash.flattenDeep(await Promise.all(promises));
        const filtered = devices.filter(el => typeof el !== "undefined");
        
        await this._addToMaps(filtered);
        // // await this.addToQueue(filtered);
  
        if (!this.isProcessing) {
           this.isProcessing = true;
           this.startMonitoring()
        }
    }

    public async startMonitoring() {
        let p = true;
        while (p) {
            if (this.priorityQueue.isEmpty()) {
  
              await this.waitFct(100);
              continue;
            }
  
            const { priority, element } = this.priorityQueue.dequeue();
            const data = this.intervalTimesMap.get(element.interval);

            if (data) {
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
                if(!device) return;
                
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

    private _addToMaps(data: IDeviceInfo[]) {
        for (const {context, spinalDevice, profile, spinalModel, network} of data) {
            this.spinalDevices.set(spinalDevice.deviceInfo.id, spinalDevice);

            spinalModel.monitored.bind(async () => {
                const monitored = spinalModel.monitored.get();
                const deviceInfo = spinalDevice.deviceInfo;

                const serverInfo = network.info.serverInfo.get()
                const url = getServerUrl(serverInfo);

                if(!monitored) {
                    console.log(deviceInfo.name, "not monitored");
                    this._removeToMaps(deviceInfo.id, url);
                    return;
                }

                console.log("start monitoring", deviceInfo.name)

                const promises = profile.intervals.map((el) => {
                    const interval = Number(el.value);
                    if(isNaN(interval) || interval <= 0 || !el.children?.length) return;

                    // add to interval map
                    let intervalObj = this.intervalTimesMap.get(interval) || {};
                    const value = intervalObj[url] || [];

                    value.push({
                        id : deviceInfo.id, 
                        nodeToUpdate: el.children.map((el) => {
                            const i = el.idNetwork;
                            this.idNetworkToSpinalDevice.set(i, spinalDevice);
                            return {displayName : i, nodeId : i};
                        })
                    });

                    intervalObj[url] = value;
                    this.intervalTimesMap.set(interval, intervalObj);
                    // end add to interval map

                    // add to priority queue
                    const arr = this.priorityQueue.toArray();
                    //@ts-ignore
                    const found = arr.find((p) => p.interval === interval);
                    if(!found) this.priorityQueue.enqueue({ interval }, interval + Date.now());

                    // end add to priority queue
                    return;
                });

                return Promise.all(promises);
            })
        }
    }

    private _removeToMaps(deviceId: string, url: string) {
        this.intervalTimesMap.forEach((valueObj, key) => {
            if(valueObj[url]) {
                valueObj[url] = valueObj[url].filter(el => el.id !== deviceId);
                this.intervalTimesMap.set(key, valueObj);
            }
        //    this.intervalTimesMap.set(key, value.filter(el => el.id !== deviceId));
        })
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


    private _getOPCValues(obj : {[key:string]: {id: string, nodeToUpdate: string[]}}[]) {
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

    private async _getVariablesValues(endpointUrl: string,  variablesIds: IOPCNode[]): Promise<{[key: string]: {dataType: string; value: any}}> {
        try {

            if (!Array.isArray(variablesIds)) variablesIds = [variablesIds];

            const userIdentity: UserIdentityInfo = { type: UserTokenType.Anonymous };
            const opcuaService: OPCUAService = new OPCUAService();

            await opcuaService.initialize(endpointUrl);
            await opcuaService.connect(endpointUrl, userIdentity);

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

    private _classifyByDevice(obj: {[key:string]: {[key:string]: any}}, data : {[key: string]: any}) {

        for (const key in data) {
            const value = data[key];
            const device = this.idNetworkToSpinalDevice.get(key);
            if(!device) continue;
        
            if(!obj[device.deviceInfo.id]) obj[device.deviceInfo.id] = {};
            obj[device.deviceInfo.id][key] = value;               
        }

        return obj;
    }

       
}


const spinalMonitoring = new SpinalMonitoring();
spinalMonitoring.init();

export default spinalMonitoring;
export {
   spinalMonitoring
}
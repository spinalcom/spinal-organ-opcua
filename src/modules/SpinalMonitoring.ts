import { SpinalOPCUAListener } from "spinal-model-opcua";
import { MinPriorityQueue, PriorityQueue, PriorityQueueItem } from "@datastructures-js/priority-queue";

import { SpinalQueuing } from "../utils/SpinalQueuing";
import { SpinalDevice } from "./SpinalDevice";
import * as lodash from "lodash";
import { SpinalNetworkUtils } from "../utils/SpinalNetworkUtils";
import { ClientMonitoredItemBase, coerceNodeId, UserIdentityInfo, UserTokenType } from "node-opcua";
import OPCUAService from "../utils/OPCUAService";
import { IOPCNode } from "../interfaces/OPCNode";
import { consumeBatch, getServerUrl } from "../utils/Functions";
import { ISpinalInterval } from "../interfaces/IntervalTypes";
import { getNodeKey, normalizePath } from "../utils/utils";
import OPCUAFactory from "../utils/OPCUAFactory";
import { IProfile } from "../interfaces/IProfile";
import { OPCUAProfileService, PROFILE_UPDATE_EVENT } from "../utils/profile_service";
import spinalLog from "../utils/displayLog";

class SpinalMonitoring {
	private devicesToMonitorQueue: SpinalQueuing = new SpinalQueuing();
	private priorityQueue: MinPriorityQueue<{ interval: number }> = new MinPriorityQueue();
	private isProcessing: boolean = false;
	private intervalTimesMap: Map<number, { [key: string]: ISpinalInterval[] }> = new Map();
	private readonly initConcurrency: number = 10;

	private initializedMap: Map<string, boolean> = new Map();
	private spinalDevicesStore: Map<string, SpinalDevice> = new Map();
	private idNetworkToSpinalDevice: Map<string, SpinalDevice> = new Map();
	private spinalNetworkUtils: SpinalNetworkUtils = SpinalNetworkUtils.getInstance();
	private covItemToMonitoring: Map<string, ClientMonitoredItemBase> = new Map();
	private monitoringMapQueue: SpinalQueuing = new SpinalQueuing();

	constructor() {}

	public async addToDeviceToMonitorQueue(spinalListenerModel: SpinalOPCUAListener): Promise<void> {
		this.devicesToMonitorQueue.addToQueue(spinalListenerModel);
	}

	init() {
		this.devicesToMonitorQueue.on("start", () => this.startDeviceInitialisation());

		this.monitoringMapQueue.on("start", async () => this._addAllDeviceDataToMaps());
	}

	public async startDeviceInitialisation() {
		const modelInQueue = this.devicesToMonitorQueue.getQueue(); // get all models as array
		this.devicesToMonitorQueue.refresh(); // clear the queue

		spinalLog.log(`${modelInQueue.length} devices found, start formatting and binding`);

		const devices = await this.initAllListenersModels(modelInQueue);

		await this._bindDevices(devices);

		if (!this.isProcessing) {
			this.isProcessing = true;
			this.startMonitoring();
		}
	}

	public async initAllListenersModels(spinalListenerModels: SpinalOPCUAListener[]): Promise<SpinalDevice[]> {
		return this.spinalNetworkUtils.initAllListenersModels(spinalListenerModels);
	}


	public async startMonitoring() {
		let p = true;
		while (p) {
			if (this.priorityQueue.isEmpty()) {
				await this.waitFct(900);
				continue;
			}

			//@ts-ignore
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
				spinalLog.log(`waiting ${(date - Date.now()) / 1000}s, for the next update`);
				await this.waitFct(date - Date.now());
			}

			const valuesObj = await this._getOPCValues(data);
			const deviceIds = Object.keys(valuesObj);

			for (const deviceId of deviceIds) {
				if (this.spinalDevicesStore.has(deviceId)) {
					const device = this.spinalDevicesStore.get(deviceId);
					device?.updateEndpoints(valuesObj[deviceId]);
				}
			}

			// const promises = Object.keys(valuesObj).map((deviceId) => {
			//     const device = this.spinalDevicesStore.get(deviceId);
			//     try {
			//         if (!device) return;

			//         return device.updateEndpoints(valuesObj[deviceId]);
			//     } catch (error) {
			//         spinalLog.error(`Error updating endpoints for device ${deviceId}:`, error);
			//     }
			// });

			// await Promise.all(promises);

			// this.priorityQueue.enqueue({ interval }, Date.now() + interval);
		} catch (error) {
			spinalLog.error(error);
		} finally {
			this.priorityQueue.enqueue({ interval }, Number(interval) + Date.now());
		}
	}

	private _bindDevices(devices: SpinalDevice[]) {
		spinalLog.log(`Binding devices to their respective models and profiles...`);

		for (const spinalDevice of devices) {
			this.spinalDevicesStore.set(spinalDevice.deviceInfo.id, spinalDevice); // save the device in the map to be able to retrieve it later

			const spinalModel = spinalDevice.spinalListenerModel;
			const profile = (spinalDevice.profileId);

			spinalModel.monitored.bind(async () => {
				const deviceIsMonitored = spinalModel.monitored.get();
				const deviceInfo = spinalDevice.deviceInfo;

				// const serverInfo = network.info.serverInfo.get()
				const url = getServerUrl(spinalDevice.server);

				if (!deviceIsMonitored) {
					spinalLog.log(deviceInfo.name, "is stopped");
					this._removeFromMaps(deviceInfo.id, url);
					this._stopCovItems(deviceInfo.id);
					return;
				}

				spinalLog.log(deviceInfo.name, "is monitored");
				await spinalDevice.init();
				this.monitoringMapQueue.addToQueue({ url, spinalDevice, profile });
				// await this._addDeviceDataToMaps(url, spinalDevice, profile);
			});
		}
	}

	private async _addAllDeviceDataToMaps() {
		const queueData = this.monitoringMapQueue.getQueue(); // get all models as array
		this.monitoringMapQueue.refresh(); // clear the queue

		for (const { url, spinalDevice } of queueData) {
			const profileData = OPCUAProfileService.getInstance().getProfile(spinalDevice.profileId || "");

			if (!profileData) { 
				spinalLog.warn(`Profile data not found for device ${spinalDevice.deviceInfo.name} with profileId ${spinalDevice.profileId}`);
				continue;
			}

			this._addDeviceDataToMaps(url, spinalDevice, profileData);
		}
	}

	private async _addDeviceDataToMaps(url: string, spinalDevice: SpinalDevice, profile: IProfile) {
		for (const intervalData of profile.intervals) {
			if (isNaN(intervalData.value) || !intervalData.children?.length) continue;

			const interval = Number(intervalData.value);

			// if interval is 0, we need to monitor the items with COV (Change of Value) instead of adding them to the interval map
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

		const nodeToUpdate = intervalData.children.map((child: any) => {
			const key = getNodeKey(child);
			this.idNetworkToSpinalDevice.set(key, spinalDevice); // save the device in the map to be able to retrieve it later
			return { path: normalizePath(child.path), nodeId: child.nodeId || child.idNetwork };
		});

		intervalList.push({ id: spinalDevice.deviceInfo.id, nodeToUpdate });

		intervalObj[url] = intervalList;

		this.intervalTimesMap.set(interval, intervalObj);
		return { interval, intervalObj };
	}

	private _addItemToPriorityQueue(interval: number) {
		const priorityQueueData: PriorityQueueItem<{ interval: number }>[] = this.priorityQueue.toArray();

		const intervalFound = priorityQueueData.find((priority: any) => priority.element?.interval == interval);
		spinalLog.log("Interval found in priority queue:", !!intervalFound, interval);
		if (!intervalFound) this.priorityQueue.enqueue({ interval }, interval + Date.now());

		return intervalFound;
	}

	private _removeFromMaps(deviceId: string, url: string) {
		this.intervalTimesMap.forEach((valueObj, key) => {
			if (valueObj[url]) {
				valueObj[url] = valueObj[url].filter((el) => el.id !== deviceId);
				this.intervalTimesMap.set(key, valueObj);
			}
			//    this.intervalTimesMap.set(key, value.filter(el => el.id !== deviceId));
		});
	}

	private async _stopCovItems(deviceId: string) {
		const keys = Array.from(this.covItemToMonitoring.keys()).filter((key: string) => key.startsWith(deviceId));
		const promises = keys.map(async (key) => {
			try {
				const item = this.covItemToMonitoring.get(key);
				if (!item) return;

				await item.terminate();
				this.covItemToMonitoring.delete(key);
			} catch (error) {}
		});

		await Promise.all(promises);
	}

	private waitFct(nb: number): Promise<void> {
		return new Promise((resolve) => {
			setTimeout(
				() => {
					resolve();
				},
				nb >= 0 ? nb : 0,
			);
		});
	}

	private _getOPCValues(obj: { [key: string]: ISpinalInterval[] }): Promise<{ [key: string]: IOPCNode[] }> {
		const urls = Object.keys(obj);
		const promises = [];
		if (!urls.length) return Promise.resolve({});

		for (const url of urls) {
			const nodesToUpdate = obj[url].map((el) => el.nodeToUpdate).flat() || [];
			promises.push(this._getVariablesValues(url, nodesToUpdate));
		}

		return Promise.all(promises).then((result) => {
			const opcNodeObj: { [key: string]: IOPCNode[] } = {};

			// result is an array of arrays, we need to flatten it and classify by device id
			for (const opcNode of result.flat()) {
				if (!opcNode || !opcNode.nodeId) continue; // skip if no nodeId

				const key = getNodeKey(opcNode);
				const device = this.idNetworkToSpinalDevice.get(key);

				if (!device) continue;

				const deviceId = device.deviceInfo.id;
				if (!opcNodeObj[deviceId]) opcNodeObj[deviceId] = [];

				opcNodeObj[deviceId].push(opcNode);
			}

			return opcNodeObj;
		});
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
			});
		} catch (error) {
			return [];
		}
	}

	// private _updateProfile(profileId: string, devicesIds: string[]) {
	// 	return devicesIds.map((deviceId) => {
	// 		const device = this.spinalDevicesStore.get(deviceId);
	// 		if (!device) return;

	// 		device.restartMonitoring();
	// 	});
	// }

	private async monitorWithCov(url: string, spinalDevice: SpinalDevice, nodes: IOPCNode[]) {
		// spinalLog.log(`Monitoring ${nodes.length} nodes with COV for device ${spinalDevice.deviceInfo.name} at ${url}`);
		const isCov = true;
		// const idsToPaths: { [key: string]: string } = {};

		const opcNodes = await this._getVariablesValues(url, nodes);
		await spinalDevice.updateEndpoints(opcNodes, isCov); // update the endpoints node with the new values (name, path, value)

		// // get new ids from opcNodes and save the path to be able to retrieve it later
		// const ids = opcNodes.map((el) => {
		//     const nodeId = el.nodeId.toString();
		//     idsToPaths[nodeId] = normalizePath(el.path || "") || nodeId; // save the path to be able to retrieve it later
		//     return nodeId;
		// });

		// connect to the OPCUA server and monitor the items
		const opcuaService: OPCUAService = OPCUAFactory.getOPCUAInstance(url);
		await opcuaService.checkAndRetablishConnection();

		const chunked = lodash.chunk(opcNodes, 100);

		for (const itemsChunked of chunked) {
			opcuaService.monitorItem(itemsChunked, (node, dataValue, monitorItem) => {
				this._monitorCallback(node, dataValue, monitorItem, spinalDevice, isCov);
			});
		}
	}

	private _monitorCallback(node: IOPCNode, dataValue: any, monitorItem: ClientMonitoredItemBase, spinalDevice: SpinalDevice, isCov: boolean) {
		if (!dataValue || typeof dataValue?.value == "undefined") return;
		// const value = ["string", "number", "boolean"].includes(typeof dataValue?.value) ? dataValue?.value : null;
		const value = dataValue?.value ?? null;
		const nodePath = getNodeKey(node);
		const nodeId = node.nodeId.toString();

		spinalLog.log(`[COV] - receive COV notif from OPCUA server: ${nodePath} change event ${value}`);

		const temp_id = `${spinalDevice.deviceInfo.id}_${nodeId}`;

		if (!this.covItemToMonitoring.has(temp_id)) this.covItemToMonitoring.set(temp_id, monitorItem); // save the monitor item to be able to stop it later

		spinalDevice.updateEndpoints([{ path: nodePath, nodeId: coerceNodeId(nodeId), value: { value: value, dataType: typeof value } }], isCov);
	}
}

const spinalMonitoring = new SpinalMonitoring();
spinalMonitoring.init();

export default spinalMonitoring;
export { spinalMonitoring };

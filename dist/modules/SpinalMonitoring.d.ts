import { SpinalOPCUAListener } from "spinal-model-opcua";
import { SpinalDevice } from "./SpinalDevice";
import { ISpinalInterval } from "../interfaces/IntervalTypes";
declare class SpinalMonitoring {
    private queue;
    private priorityQueue;
    private isProcessing;
    private intervalTimesMap;
    private initializedMap;
    private spinalDevicesStore;
    private idNetworkToSpinalDevice;
    private spinalNetworkUtils;
    private covItemToMonitoring;
    private addToMonitoringMapQueue;
    constructor();
    addToMonitoringList(spinalListenerModel: SpinalOPCUAListener): Promise<void>;
    init(): void;
    startDeviceInitialisation(): Promise<void>;
    initAllListenersModels(spinalListenerModels: SpinalOPCUAListener[]): Promise<SpinalDevice[]>;
    startMonitoring(): Promise<void>;
    updateData(data: {
        [key: string]: ISpinalInterval[];
    }, interval: number, date?: number): Promise<void>;
    private _bindDevices;
    private _addAllDeviceDataToMaps;
    private _addDeviceDataToMaps;
    private _addItemTointervalMap;
    private _addItemToPriorityQueue;
    private _removeFromMaps;
    private _stopCovItems;
    private waitFct;
    private _getOPCValues;
    private _getVariablesValues;
    private _updateProfile;
    private monitorWithCov;
}
declare const spinalMonitoring: SpinalMonitoring;
export default spinalMonitoring;
export { spinalMonitoring };

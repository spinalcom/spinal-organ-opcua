import { SpinalOPCUAListener } from "spinal-model-opcua";
declare class SpinalMonitoring {
    private queue;
    private priorityQueue;
    private isProcessing;
    private intervalTimesMap;
    private initializedMap;
    private spinalDevices;
    private idNetworkToSpinalDevice;
    private spinalNetworkUtils;
    private covItemToMonitoring;
    constructor();
    addToMonitoringList(spinalListenerModel: SpinalOPCUAListener): Promise<void>;
    init(): void;
    startDeviceInitialisation(): Promise<void>;
    startMonitoring(): Promise<void>;
    updateData(data: any, interval: number, date?: number): Promise<void>;
    private _bindData;
    private _addToMaps;
    private _removeFromMaps;
    private _stopCovItems;
    private waitFct;
    private _getOPCValues;
    private _getVariablesValues;
    private _classifyByDevice;
    private _updateProfile;
    private monitorWithCov;
}
declare const spinalMonitoring: SpinalMonitoring;
export default spinalMonitoring;
export { spinalMonitoring };

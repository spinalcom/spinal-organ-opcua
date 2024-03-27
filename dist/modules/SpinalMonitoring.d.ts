import { SpinalOPCUAListener } from "spinal-model-opcua";
declare class SpinalMonitoring {
    private queue;
    private priorityQueue;
    private isProcessing;
    private intervalTimesMap;
    private initializedMap;
    private spinalDevices;
    private idNetworkToSpinalDevice;
    constructor();
    addToMonitoringList(spinalListenerModel: SpinalOPCUAListener): Promise<void>;
    init(): void;
    startDeviceInitialisation(): Promise<void>;
    startMonitoring(): Promise<void>;
    updateData(data: any, interval: number, date?: number): Promise<void>;
    private _addToMaps;
    private _removeToMaps;
    private waitFct;
    private _getOPCValues;
    private _getVariablesValues;
    private _classifyByDevice;
}
declare const spinalMonitoring: SpinalMonitoring;
export default spinalMonitoring;
export { spinalMonitoring };

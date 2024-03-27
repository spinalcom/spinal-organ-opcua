import { SpinalOPCUAPilot } from "spinal-model-opcua";
declare class SpinalPilot {
    private queue;
    private isProcessing;
    private static instance;
    private constructor();
    static getInstance(): SpinalPilot;
    private init;
    addToPilotList(spinalPilotModel: SpinalOPCUAPilot): Promise<void>;
    private pilot;
    private _sendPilotToServer;
}
declare const spinalPilot: SpinalPilot;
export default spinalPilot;
export { spinalPilot };

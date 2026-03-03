import { SpinalOPCUAPilot } from "spinal-model-opcua";
declare class SpinalPilot {
    spinalPilotModel: SpinalOPCUAPilot | null;
    constructor(spinalPilotModel: SpinalOPCUAPilot);
    sendPilotToServer(): Promise<void>;
}
export default SpinalPilot;
export { SpinalPilot };


import { OPCUAService } from "../utils/OPCUAService";
import { getServerUrl } from "../utils/Functions";
import { SpinalQueuing } from "../utils/SpinalQueuing";
import { SpinalOPCUAPilot, IRequest } from "spinal-model-opcua";
import OPCUAFactory from "../utils/OPCUAFactory";


class SpinalPilot {
   // private queue: SpinalQueuing = new SpinalQueuing();
   // private isProcessing: boolean = false;
   // private static instance: SpinalPilot;
   spinalPilotModel: SpinalOPCUAPilot | null = null;

   constructor(spinalPilotModel: SpinalOPCUAPilot) {
      this.spinalPilotModel = spinalPilotModel;
   }

   public async sendPilotToServer() {
      const requests: IRequest[] = this.spinalPilotModel?.requests.get() || [];
      const request = requests[0];

      try {

         if (!request) throw new Error("No requests found in the pilot model");


         console.log(`sending update request to ${request.path} with value ${request.value}`);

         const url = getServerUrl(request.networkInfo);

         const opcuaService = OPCUAFactory.getOPCUAInstance(url);
         await opcuaService.checkAndRetablishConnection();

         const newNodeId = await opcuaService.getNodeIdByPath(request.path); // in case the nodeId has changed
         if (newNodeId) request.nodeId = newNodeId; // update the nodeId

         await opcuaService.writeNode({ nodeId: request.nodeId }, request.value);

         // Disable disconnect to keep the connection alive for future requests
         // await opcuaService.disconnect(); // disconnect after the write operation

         this.spinalPilotModel?.setSuccessMode();
         console.log(`[${request.path}] updated successfully`);

      } catch (error) {
         console.log(`the update of [${request.path}] failed due to error: ${(error as Error).message}`);
         this.spinalPilotModel?.setErrorMode();
      }

      await this.spinalPilotModel?.removeFromGraph();

   }

}


export default SpinalPilot;
export { SpinalPilot };

// const spinalPilot = SpinalPilot.getInstance();


// export default spinalPilot;
// export {
// spinalPilot
// }

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


         console.log(`send update request to ${request.nodeId} with value ${request.value}`);

         const url = getServerUrl(request.networkInfo);

         const opcuaService = OPCUAFactory.getOPCUAInstance(url);
         await opcuaService.checkAndRetablishConnection();

         const newNodeId = await opcuaService.getNodeIdByPath(request.path); // in case the nodeId has changed
         if (newNodeId) request.nodeId = newNodeId; // update the nodeId

         await opcuaService.writeNode({ nodeId: request.nodeId }, request.value);

         // Disable disconnect to keep the connection alive for future requests
         // await opcuaService.disconnect(); // disconnect after the write operation

         this.spinalPilotModel?.setSuccessMode();
         console.log(`[${request.nodeId}] updated successfully`);

      } catch (error) {
         console.log(`the update of [${request.nodeId}] failed due to error: ${(error as Error).message}`);
         this.spinalPilotModel?.setErrorMode();
      }

      await this.spinalPilotModel?.removeFromNode();

   }



   // public static getInstance(): SpinalPilot {
   //    if (!this.instance) {
   //       this.instance = new SpinalPilot();
   //       this.instance.init();
   //    }
   //    return this.instance;
   // }

   // private init() {
   //    this.queue.on("start", () => {
   //       this.pilot();
   //    })
   // }

   // public async addToPilotList(spinalPilotModel: SpinalOPCUAPilot): Promise<void> {
   //    this.queue.addToQueue(spinalPilotModel);
   // }

   // private async pilot() {
   //    if (!this.isProcessing) {
   //       this.isProcessing = true;
   //       while (!this.queue.isEmpty()) {
   //          const pilot = this.queue.dequeue();
   //          try {
   //             const requests = pilot?.requests.get();
   //             await this._sendPilotToServer(pilot, requests);

   //          } catch (error) {
   //             pilot.setErrorMode();
   //          }
   //       }

   //       this.isProcessing = false;
   //    }
   // }


   // private async _sendPilotToServer(pilot: SpinalOPCUAPilot, requests: IRequest[]) {
   //    const request = requests[0];

   //    try {

   //       console.log(`send update request to ${request.nodeId} with value ${request.value}`);

   //       const url = getServerUrl(request.networkInfo);

   //       const opcuaService = OPCUAFactory.getOPCUAInstance(url);
   //       await opcuaService.checkAndRetablishConnection();

   //       const newNodeId = await opcuaService.getNodeIdByPath(request.path); // in case the nodeId has changed
   //       if (newNodeId) request.nodeId = newNodeId; // update the nodeId

   //       await opcuaService.writeNode({ nodeId: request.nodeId }, request.value);

   //       // Disable disconnect to keep the connection alive for future requests
   //       // await opcuaService.disconnect(); // disconnect after the write operation

   //       pilot.setSuccessMode();
   //       console.log(`[${request.nodeId}] updated successfully`);

   //    } catch (error) {
   //       console.log(`the update of [${request.nodeId}] failed due to error: ${(error as Error).message}`);
   //       pilot.setErrorMode();
   //    }

   //    await pilot.removeFromNode();

   // }



}


export default SpinalPilot;
export { SpinalPilot };

// const spinalPilot = SpinalPilot.getInstance();


// export default spinalPilot;
// export {
// spinalPilot
// }
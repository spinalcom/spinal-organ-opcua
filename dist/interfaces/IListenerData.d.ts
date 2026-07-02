import { SpinalContext, SpinalNode } from "spinal-env-viewer-graph-service";
import { IServer, SpinalOPCUAListener } from "spinal-model-opcua";
export interface IListenerData {
    context: SpinalContext;
    device: SpinalNode;
    profile: SpinalNode;
    network: SpinalNode;
    serverinfo: IServer;
    model: SpinalOPCUAListener;
}

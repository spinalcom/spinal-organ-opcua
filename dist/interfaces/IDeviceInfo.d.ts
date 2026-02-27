import { SpinalContext, SpinalNode } from "spinal-env-viewer-graph-service";
import { SpinalDevice } from "../modules/SpinalDevice";
import { IProfile } from "./IProfile";
import { IServer } from "./OPCNode";
import { SpinalOPCUAListener } from "spinal-model-opcua";
export interface IDeviceInfo {
    context: SpinalContext;
    spinalDevice: SpinalDevice;
    profile: IProfile;
    spinalModel: SpinalOPCUAListener;
    network: SpinalNode;
    serverinfo: IServer;
}

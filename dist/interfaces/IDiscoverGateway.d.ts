import { IServer } from "spinal-model-opcua";
export interface IDiscoverGateway extends IServer {
    useLastResult?: boolean;
    entryPoint?: string;
}

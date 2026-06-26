import OPCUAService from "./OPCUAService";
import { SpinalOPCUADiscoverModel } from "spinal-model-opcua";
export declare class OPCUAFactory {
    private static services;
    static getOPCUAInstance(url: string, model?: SpinalOPCUADiscoverModel): OPCUAService;
    static resetOPCUAInstance(url: string): void;
}
export default OPCUAFactory;

import { Model } from "spinal-core-connectorjs";
import OPCUAService from "./OPCUAService";
export declare class OPCUAFactory {
    private static services;
    static getOPCUAInstance(url: string, model?: Model): OPCUAService;
    static resetOPCUAInstance(url: string): void;
}
export default OPCUAFactory;

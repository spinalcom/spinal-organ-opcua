import { Model } from "spinal-core-connectorjs";
import OPCUAService from "./OPCUAService";


export class OPCUAFactory {

    private static services: { [key: string]: OPCUAService } = {};

    static getOPCUAInstance(url: string, model?: Model): OPCUAService {
        if (this.services[url]) return this.services[url];

        const opcuaService = new OPCUAService(url, model);
        this.services[url] = opcuaService;
        return opcuaService;
    }

    static resetOPCUAInstance(url: string) {
        if (this.services[url]) {
            delete this.services[url];
        }
    }
}

export default OPCUAFactory;
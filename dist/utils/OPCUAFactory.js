"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPCUAFactory = void 0;
const OPCUAService_1 = require("./OPCUAService");
class OPCUAFactory {
    static getOPCUAInstance(url, model) {
        if (this.services[url])
            return this.services[url];
        const opcuaService = new OPCUAService_1.default(url, model);
        this.services[url] = opcuaService;
        return opcuaService;
    }
    static resetOPCUAInstance(url) {
        if (this.services[url]) {
            delete this.services[url];
        }
    }
}
exports.OPCUAFactory = OPCUAFactory;
OPCUAFactory.services = {};
exports.default = OPCUAFactory;
//# sourceMappingURL=OPCUAFactory.js.map
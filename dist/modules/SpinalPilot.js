"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpinalPilot = void 0;
const Functions_1 = require("../utils/Functions");
const OPCUAFactory_1 = require("../utils/OPCUAFactory");
class SpinalPilot {
    constructor(spinalPilotModel) {
        // private queue: SpinalQueuing = new SpinalQueuing();
        // private isProcessing: boolean = false;
        // private static instance: SpinalPilot;
        this.spinalPilotModel = null;
        this.spinalPilotModel = spinalPilotModel;
    }
    sendPilotToServer() {
        var _a, _b, _c, _d;
        return __awaiter(this, void 0, void 0, function* () {
            const requests = ((_a = this.spinalPilotModel) === null || _a === void 0 ? void 0 : _a.requests.get()) || [];
            const request = requests[0];
            try {
                if (!request)
                    throw new Error("No requests found in the pilot model");
                console.log(`send update request to ${request.nodeId} with value ${request.value}`);
                const url = (0, Functions_1.getServerUrl)(request.networkInfo);
                const opcuaService = OPCUAFactory_1.default.getOPCUAInstance(url);
                yield opcuaService.checkAndRetablishConnection();
                const newNodeId = yield opcuaService.getNodeIdByPath(request.path); // in case the nodeId has changed
                if (newNodeId)
                    request.nodeId = newNodeId; // update the nodeId
                yield opcuaService.writeNode({ nodeId: request.nodeId }, request.value);
                // Disable disconnect to keep the connection alive for future requests
                // await opcuaService.disconnect(); // disconnect after the write operation
                (_b = this.spinalPilotModel) === null || _b === void 0 ? void 0 : _b.setSuccessMode();
                console.log(`[${request.nodeId}] updated successfully`);
            }
            catch (error) {
                console.log(`the update of [${request.nodeId}] failed due to error: ${error.message}`);
                (_c = this.spinalPilotModel) === null || _c === void 0 ? void 0 : _c.setErrorMode();
            }
            yield ((_d = this.spinalPilotModel) === null || _d === void 0 ? void 0 : _d.removeFromNode());
        });
    }
}
exports.SpinalPilot = SpinalPilot;
exports.default = SpinalPilot;
// const spinalPilot = SpinalPilot.getInstance();
// export default spinalPilot;
// export {
// spinalPilot
// }
//# sourceMappingURL=SpinalPilot.js.map
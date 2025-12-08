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
exports.spinalPilot = void 0;
const OPCUAService_1 = require("../utils/OPCUAService");
const Functions_1 = require("../utils/Functions");
const SpinalQueuing_1 = require("../utils/SpinalQueuing");
class SpinalPilot {
    constructor() {
        this.queue = new SpinalQueuing_1.SpinalQueuing();
        this.isProcessing = false;
    }
    static getInstance() {
        if (!this.instance) {
            this.instance = new SpinalPilot();
            this.instance.init();
        }
        return this.instance;
    }
    init() {
        this.queue.on("start", () => {
            this.pilot();
        });
    }
    addToPilotList(spinalPilotModel) {
        return __awaiter(this, void 0, void 0, function* () {
            this.queue.addToQueue(spinalPilotModel);
        });
    }
    pilot() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.isProcessing) {
                this.isProcessing = true;
                while (!this.queue.isEmpty()) {
                    const pilot = this.queue.dequeue();
                    try {
                        const requests = pilot === null || pilot === void 0 ? void 0 : pilot.request.get();
                        yield this._sendPilotToServer(pilot, requests);
                    }
                    catch (error) {
                        pilot.setErrorMode();
                    }
                    // if (pilot?.isNormal()) {
                    //    pilot.setProcessMode();
                    //    try {
                    //       await this.writeProperties(pilot?.requests.get())
                    //       console.log("success");
                    //       pilot.setSuccessMode();
                    //       await pilot.removeToNode();
                    //    } catch (error) {
                    //       console.error(error.message);
                    //       pilot.setErrorMode();
                    //       await pilot.removeToNode();
                    //    }
                    // } else {
                    //    console.log("remove");
                    //    await pilot.removeToNode();
                    // }
                    // // console.log("pilot",pilot)
                }
                this.isProcessing = false;
            }
        });
    }
    _sendPilotToServer(pilot, requests) {
        return __awaiter(this, void 0, void 0, function* () {
            const request = requests[0];
            try {
                console.log(`send update request to ${request.nodeId} with value ${request.value}`);
                const url = (0, Functions_1.getServerUrl)(request.networkInfo);
                const opcuaService = new OPCUAService_1.OPCUAService(url);
                yield opcuaService.initialize();
                yield opcuaService.connect();
                const newNodeId = yield opcuaService.getNodeIdByPath(request.path); // in case the nodeId has changed
                if (newNodeId)
                    request.nodeId = newNodeId; // update the nodeId
                yield opcuaService.writeNode({ nodeId: request.nodeId }, request.value);
                yield opcuaService.disconnect();
                pilot.setSuccessMode();
                console.log(`[${request.nodeId}] updated successfully`);
            }
            catch (error) {
                console.log(`the update of [${request.nodeId}] failed due to error: ${error.message}`);
                pilot.setErrorMode();
            }
            yield pilot.removeFromNode();
        });
    }
}
const spinalPilot = SpinalPilot.getInstance();
exports.spinalPilot = spinalPilot;
exports.default = spinalPilot;
//# sourceMappingURL=SpinalPilot.js.map
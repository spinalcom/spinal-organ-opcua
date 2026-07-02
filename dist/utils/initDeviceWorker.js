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
const SpinalNetworkUtils_1 = require("./SpinalNetworkUtils");
const worker_threads_1 = require("worker_threads");
(() => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const spinalNetworkUtils = SpinalNetworkUtils_1.SpinalNetworkUtils.getInstance();
        const result = yield spinalNetworkUtils.initSpinalListenerModel(worker_threads_1.workerData.listenerData);
        worker_threads_1.parentPort === null || worker_threads_1.parentPort === void 0 ? void 0 : worker_threads_1.parentPort.postMessage({ ok: true, result });
    }
    catch (error) {
        worker_threads_1.parentPort === null || worker_threads_1.parentPort === void 0 ? void 0 : worker_threads_1.parentPort.postMessage({ ok: false, error: (error === null || error === void 0 ? void 0 : error.message) || "Worker initialization failed" });
    }
}))();
//# sourceMappingURL=initDeviceWorker.js.map
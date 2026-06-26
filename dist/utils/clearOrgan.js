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
exports.clearOrgan = void 0;
const spinal_model_bmsnetwork_1 = require("spinal-model-bmsnetwork");
function clearOrgan(organModel) {
    return __awaiter(this, void 0, void 0, function* () {
        const references = yield getAllOrganReferences(organModel);
        const promises = references.map(clearReference);
        return Promise.all(promises);
    });
}
exports.clearOrgan = clearOrgan;
function getAllOrganReferences(organModel) {
    const ptrList = organModel.references._attribute_names.map((name) => organModel.references[name]);
    const promises = ptrList.map(_loadPtr);
    return Promise.allSettled(promises).then((result) => {
        const references = [];
        for (const element of result) {
            if (element.status === "fulfilled")
                references.push(element.value);
        }
        return references;
    });
}
function clearReference(reference) {
    return __awaiter(this, void 0, void 0, function* () {
        const { devices, endpoints } = yield getDeviceAndEndpointsFromOrgan(reference);
        console.log(`Clearing reference: ${reference.getName().get()} with ${devices.length} devices and ${endpoints.length} endpoints.`);
        devices.forEach(clearDevice);
        endpoints.forEach(clearEndpoint);
    });
}
function getDeviceAndEndpointsFromOrgan(organNode) {
    return __awaiter(this, void 0, void 0, function* () {
        const data = { devices: [], endpoints: [] };
        const context = yield organNode.findOneParent(["hasBmsNetworkOrgan"], (node) => node.getType().get() === "Network");
        if (!context)
            return data;
        return organNode
            .findInContext(context, (node) => {
            if (node.getType().get() === spinal_model_bmsnetwork_1.SpinalBmsDevice.nodeTypeName)
                data.devices.push(node);
            else if (node.getType().get() === spinal_model_bmsnetwork_1.SpinalBmsEndpoint.nodeTypeName)
                data.endpoints.push(node);
            return true;
        })
            .then(() => {
            return data;
        });
    });
}
function clearEndpoint(endpoint) {
    endpoint.info.rem_attr("pilot");
}
function clearDevice(device) {
    device.info.rem_attr("listener");
}
function _loadPtr(ptr) {
    return new Promise((resolve, reject) => {
        ptr.load((node) => {
            resolve(node);
        });
    });
}
//# sourceMappingURL=clearOrgan.js.map
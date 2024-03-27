"use strict";
/*
 * Copyright 2022 SpinalCom - www.spinalcom.com
 *
 * This file is part of SpinalCore.
 *
 * Please read all of the following terms and conditions
 * of the Free Software license Agreement ("Agreement")
 * carefully.
 *
 * This Agreement is a legally binding contract between
 * the Licensee (as defined below) and SpinalCom that
 * sets forth the terms and conditions that govern your
 * use of the Program. By installing and/or using the
 * Program, you agree to abide by all the terms and
 * conditions stated or referenced herein.
 *
 * If you do not agree to abide by these terms and
 * conditions, do not demonstrate your acceptance and do
 * not install or use the Program.
 * You should have received a copy of the license along
 * with this file. If not, see
 * <http://resources.spinalcom.com/licenses.pdf>.
 */
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
exports.getServerUrl = exports.SpinalPilotCallback = exports.getVariablesList = exports.SpinalDiscoverCallback = exports.SpinalListnerCallback = exports.GetPm2Instance = exports.CreateOrganConfigFile = exports.connectionErrorCallback = exports.WaitModelReady = void 0;
const spinal_core_connectorjs_type_1 = require("spinal-core-connectorjs_type");
const spinal_model_opcua_1 = require("spinal-model-opcua");
const SpinalDiscover_1 = require("../modules/SpinalDiscover");
const node_opcua_1 = require("node-opcua");
const SpinalMonitoring_1 = require("../modules/SpinalMonitoring");
const SpinalPilot_1 = require("../modules/SpinalPilot");
// import { SpinalDevice } from "../modules/SpinalDevice";
// import { SpinalNetworkServiceUtilities } from "./SpinalNetworkServiceUtilities";
// import { spinalMonitoring } from "../modules/SpinalMonitoring";
const Q = require("q");
const pm2 = require("pm2");
const WaitModelReady = () => {
    const deferred = Q.defer();
    const WaitModelReadyLoop = (defer) => {
        if (spinal_core_connectorjs_type_1.FileSystem._sig_server === false) {
            setTimeout(() => {
                defer.resolve(WaitModelReadyLoop(defer));
            }, 200);
        }
        else {
            defer.resolve();
        }
        return defer.promise;
    };
    return WaitModelReadyLoop(deferred);
};
exports.WaitModelReady = WaitModelReady;
const connectionErrorCallback = (err) => {
    if (!err)
        console.error("Error Connect");
    else
        console.error("Error Connect", err);
    process.exit(0);
};
exports.connectionErrorCallback = connectionErrorCallback;
const CreateOrganConfigFile = (spinalConnection, path, connectorName) => {
    return new Promise((resolve) => {
        spinalConnection.load_or_make_dir(`${path}`, (directory) => __awaiter(void 0, void 0, void 0, function* () {
            const found = yield findFileInDirectory(directory, connectorName);
            if (found) {
                console.log("organ found !");
                return resolve(found);
            }
            console.log("organ not found");
            const model = new spinal_model_opcua_1.SpinalOrganOPCUA(connectorName);
            (0, exports.WaitModelReady)().then(() => {
                const file = new spinal_core_connectorjs_type_1.File(`${connectorName}.conf`, model, { model_type: model.type.get() });
                directory.push(file);
                console.log("organ created");
                return resolve(model);
            });
        }));
    });
};
exports.CreateOrganConfigFile = CreateOrganConfigFile;
const GetPm2Instance = (organName) => {
    return new Promise((resolve, reject) => {
        pm2.list((err, apps) => {
            if (err) {
                console.error(err);
                return reject(err);
            }
            const instance = apps.find((app) => app.name === organName);
            resolve(instance);
        });
    });
};
exports.GetPm2Instance = GetPm2Instance;
function findFileInDirectory(directory, fileName) {
    return new Promise((resolve, reject) => {
        for (let index = 0; index < directory.length; index++) {
            const element = directory[index];
            const elementName = element.name.get();
            if (elementName.toLowerCase() === `${fileName}.conf`.toLowerCase()) {
                return element.load((file) => {
                    (0, exports.WaitModelReady)().then(() => {
                        resolve(file);
                    });
                });
            }
        }
        resolve(undefined);
    });
}
////////////////////////////////////////////////
////                 CALLBACKS                //
////////////////////////////////////////////////
// export const SpinalBacnetValueModelCallback = async (spinalBacnetValueModel: SpinalBacnetValueModel, organModel: SpinalOrganConfigModel): Promise<void | boolean> => {
// 	await WaitModelReady();
// 	try {
// 		spinalBacnetValueModel.organ.load(async (organ) => {
// 			if (organ && (<any>organ).id?.get() !== organModel.id?.get()) return;
// 			const { networkService, device, node } = <any>await SpinalNetworkServiceUtilities.initSpinalBacnetValueModel(spinalBacnetValueModel);
// 			if (spinalBacnetValueModel.state.get() === "wait") {
// 				const spinalDevice = new SpinalDevice(device);
// 				await spinalDevice.createDeviceItemList(networkService, node, spinalBacnetValueModel);
// 			} else {
// 				return spinalBacnetValueModel.remToNode();
// 			}
// 		});
// 	} catch (error) {
// 		// console.error(error);
// 		await spinalBacnetValueModel.setErrorState();
// 		return spinalBacnetValueModel.remToNode();
// 	}
// };
const SpinalListnerCallback = (spinalListenerModel, organModel) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    yield (0, exports.WaitModelReady)();
    const organNode = yield spinalListenerModel.getOrgan();
    const spinalDisoverModelOrgan = yield organNode.getElement(true);
    if (((_a = organModel.id) === null || _a === void 0 ? void 0 : _a.get()) === ((_b = spinalDisoverModelOrgan.id) === null || _b === void 0 ? void 0 : _b.get())) {
        SpinalMonitoring_1.spinalMonitoring.addToMonitoringList(spinalListenerModel);
    }
});
exports.SpinalListnerCallback = SpinalListnerCallback;
const SpinalDiscoverCallback = (spinalDisoverModel, organModel) => __awaiter(void 0, void 0, void 0, function* () {
    var _c, _d, _e;
    yield (0, exports.WaitModelReady)();
    const spinalDisoverModelOrgan = yield spinalDisoverModel.getOrgan();
    if (((_c = organModel.id) === null || _c === void 0 ? void 0 : _c.get()) === ((_d = spinalDisoverModelOrgan === null || spinalDisoverModelOrgan === void 0 ? void 0 : spinalDisoverModelOrgan.id) === null || _d === void 0 ? void 0 : _d.get())) {
        const minute = 2 * (60 * 1000);
        const time = Date.now();
        const creation = ((_e = spinalDisoverModel.creation) === null || _e === void 0 ? void 0 : _e.get()) || 0;
        // Check if model is not timeout.
        if (time - creation >= minute || spinalDisoverModel.state.get() === spinal_model_opcua_1.OPCUA_ORGAN_STATES.created) {
            // spinalDisoverModel.setTimeoutMode();
            spinalDisoverModel.changeState(spinal_model_opcua_1.OPCUA_ORGAN_STATES.timeout);
            return spinalDisoverModel.removeFromGraph();
        }
        SpinalDiscover_1.discover.addToQueue(spinalDisoverModel);
    }
});
exports.SpinalDiscoverCallback = SpinalDiscoverCallback;
function getVariablesList(tree) {
    const variables = [];
    addToObj(tree);
    return variables;
    function addToObj(n) {
        if (n.nodeClass === node_opcua_1.NodeClass.Variable) {
            variables.push(n);
        }
        for (const i of n.children || []) {
            addToObj(i);
        }
    }
}
exports.getVariablesList = getVariablesList;
const SpinalPilotCallback = (spinalPilotModel, organModel) => __awaiter(void 0, void 0, void 0, function* () {
    var _f;
    yield (0, exports.WaitModelReady)();
    const organNode = yield spinalPilotModel.getOrgan();
    const organ = yield organNode.getElement(true);
    if ((organ === null || organ === void 0 ? void 0 : organ.id.get()) === ((_f = organModel.id) === null || _f === void 0 ? void 0 : _f.get())) {
        SpinalPilot_1.spinalPilot.addToPilotList(spinalPilotModel);
    }
});
exports.SpinalPilotCallback = SpinalPilotCallback;
function getServerUrl(serverInfo) {
    let endpoint = serverInfo.endpoint || "";
    if (endpoint.substring(0, 1) !== "/")
        endpoint = `/${endpoint}`;
    if (endpoint.substring(endpoint.length - 1) === "/")
        endpoint = endpoint.substring(0, endpoint.length - 1);
    return `opc.tcp://${serverInfo.ip}:${serverInfo.port}${endpoint}`;
}
exports.getServerUrl = getServerUrl;
//# sourceMappingURL=Functions.js.map
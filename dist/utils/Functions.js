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
exports.clearOrganModel = exports.clearnOrgan = exports.consumeBatch = exports.restartProcessById = exports.getServerUrl = exports.getVariablesList = exports.SpinalPilotCallback = exports.SpinalDiscoverCallback = exports.SpinalListnerCallback = exports.bindModels = exports.GetPm2Instance = exports.WaitModelReady = void 0;
const displayLog_1 = require("./displayLog");
const spinal_core_connectorjs_type_1 = require("spinal-core-connectorjs_type");
const node_opcua_1 = require("node-opcua");
const spinal_env_viewer_graph_service_1 = require("spinal-env-viewer-graph-service");
const spinal_connector_service_1 = require("spinal-connector-service");
const SpinalDiscover_1 = require("../modules/SpinalDiscover");
const SpinalMonitoring_1 = require("../modules/SpinalMonitoring");
const SpinalPilot_1 = require("../modules/SpinalPilot");
const pm2 = require("pm2");
const utils_1 = require("./utils");
const clearOrgan_1 = require("./clearOrgan");
const lodash = require("lodash");
const WaitModelReady = () => {
    return new Promise((resolve) => {
        const waitLoop = () => {
            if (spinal_core_connectorjs_type_1.FileSystem._sig_server === false) {
                setTimeout(waitLoop, 200);
                return;
            }
            resolve(true);
        };
        waitLoop();
    });
};
exports.WaitModelReady = WaitModelReady;
const GetPm2Instance = (organName) => {
    return new Promise((resolve, reject) => {
        pm2.list((err, apps) => {
            if (err) {
                displayLog_1.default.error(err);
                return reject(err);
            }
            const instance = apps.find((app) => app.name === organName);
            resolve(instance);
        });
    });
};
exports.GetPm2Instance = GetPm2Instance;
// function findFileInDirectory(directory: spinal.Directory, fileName: string): Promise<SpinalOrganOPCUA | void> {
// 	return new Promise((resolve, reject) => {
// 		for (let index = 0; index < directory.length; index++) {
// 			const element = directory[index];
// 			const elementName = element.name.get();
// 			if (elementName.toLowerCase() === `${fileName}.conf`.toLowerCase()) {
// 				return element.load((file: SpinalOrganOPCUA) => {
// 					WaitModelReady().then(() => {
// 						resolve(file);
// 					});
// 				});
// 			}
// 		}
// 		resolve(undefined);
// 	});
// }
////////////////////////////////////////////////
////                 CALLBACKS                //
////////////////////////////////////////////////
function bindModels(organModel) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!organIsCompatible(organModel)) {
            if (!clearnOrgan())
                throw new Error("[bindModels] - Organ model incompatible. Update it or set CLEAR_ORGAN_IF_NOT_COMPATIBLE=1.");
            displayLog_1.default.log("[bindModels] - Clearing organ model...");
            yield clearOrganModel(organModel);
            displayLog_1.default.log("[bindModels] - Organ model cleared. Rebinding models...");
        }
        const { discover, listener, pilot } = yield organModel.getModels();
        if (!discover || !listener || !pilot) {
            throw new Error("[bindModels] - Organ model is missing one or more required models (discover, listener, pilot).");
        }
        const listenerAlreadyBinded = new Set();
        const discoverAlreadyBinded = new Set();
        ////////////////
        //bind discover model[discover]
        ////////////////
        bindDiscoverModel(discover, organModel, discoverAlreadyBinded);
        ///////////////
        //  bind pilot model [write value to bacnet device]
        ///////////////
        bindPilotModel(pilot, organModel);
        ////////////
        //  bind listener model [monitoring bacnet device]
        ////////////
        bindListenerModel(listener, organModel, listenerAlreadyBinded);
    });
}
exports.bindModels = bindModels;
function bindListenerModel(listenerModel, organModel, listenerAlreadyBinded) {
    if (!(listenerModel === null || listenerModel === void 0 ? void 0 : listenerModel.modification_date))
        return;
    listenerModel.modification_date.bind(() => __awaiter(this, void 0, void 0, function* () {
        const listenerList = yield organModel.getListenerModelFromGraph();
        if (!listenerList)
            return;
        for (let i = 0; i < listenerList.length; i++) {
            const spinalListenerModel = listenerList[i];
            if (listenerAlreadyBinded.has(spinalListenerModel._server_id))
                continue;
            yield (0, exports.SpinalListnerCallback)(spinalListenerModel, organModel);
            listenerAlreadyBinded.add(spinalListenerModel._server_id);
        }
    }), true);
}
function bindDiscoverModel(discoverModel, organModel, discoverAlreadyBinded) {
    discoverModel.modification_date.bind(() => __awaiter(this, void 0, void 0, function* () {
        const discoverList = yield organModel.getDiscoverModelFromGraph();
        if (!discoverList)
            return;
        for (const spinalDiscoverModel of discoverList) {
            const serverId = spinalDiscoverModel === null || spinalDiscoverModel === void 0 ? void 0 : spinalDiscoverModel._server_id;
            if (typeof serverId !== "number")
                continue;
            if (discoverAlreadyBinded.has(serverId))
                continue;
            (0, exports.SpinalDiscoverCallback)(spinalDiscoverModel, organModel);
            discoverAlreadyBinded.add(serverId);
        }
    }));
}
function bindPilotModel(pilotModel, organModel) {
    if (!(pilotModel === null || pilotModel === void 0 ? void 0 : pilotModel.modification_date))
        return;
    pilotModel.modification_date.bind(() => __awaiter(this, void 0, void 0, function* () {
        const pilotList = yield organModel.getPilotModelFromGraph();
        if (!pilotList)
            return;
        for (const spinalPilotModel of pilotList) {
            (0, exports.SpinalPilotCallback)(spinalPilotModel, organModel);
        }
    }), true);
}
function checkOrgan(spinalOrgan, organId) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (!organId)
                return false;
            yield (0, exports.WaitModelReady)();
            let spinalDisoverModelOrgan = yield spinalOrgan.getOrgan();
            if (spinalDisoverModelOrgan instanceof spinal_env_viewer_graph_service_1.SpinalNode) {
                spinalDisoverModelOrgan = yield spinalDisoverModelOrgan.getElement(true);
            }
            return !!(organId === ((_a = spinalDisoverModelOrgan.id) === null || _a === void 0 ? void 0 : _a.get()));
        }
        catch (error) {
            return false;
        }
    });
}
const SpinalListnerCallback = (spinalListenerModel, organModel) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const itsForme = yield checkOrgan(spinalListenerModel, (_a = organModel.id) === null || _a === void 0 ? void 0 : _a.get());
    if (itsForme)
        SpinalMonitoring_1.spinalMonitoring.addToDeviceToMonitorQueue(spinalListenerModel);
});
exports.SpinalListnerCallback = SpinalListnerCallback;
const SpinalDiscoverCallback = (spinalDisoverModel, organModel) => __awaiter(void 0, void 0, void 0, function* () {
    var _b, _c;
    try {
        const itsForme = yield checkOrgan(spinalDisoverModel, (_b = organModel.id) === null || _b === void 0 ? void 0 : _b.get());
        if (!itsForme)
            return false;
        // Check if model is not timeout.
        const minute = 2 * (60 * 1000);
        const time = Date.now();
        const creation = ((_c = spinalDisoverModel.creation) === null || _c === void 0 ? void 0 : _c.get()) || 0;
        const state = spinalDisoverModel.state.get();
        const timeout = time - creation >= minute;
        // Check if model is not timeout.
        if (timeout || [spinal_connector_service_1.STATES.created, spinal_connector_service_1.STATES.cancelled].includes(state))
            throw "Time out !";
        SpinalDiscover_1.discover.addToQueue(spinalDisoverModel);
    }
    catch (error) {
        spinalDisoverModel.changeState(spinal_connector_service_1.STATES.timeout);
        return spinalDisoverModel.removeFromGraph();
    }
});
exports.SpinalDiscoverCallback = SpinalDiscoverCallback;
const SpinalPilotCallback = (spinalPilotModel, organModel) => __awaiter(void 0, void 0, void 0, function* () {
    var _d;
    try {
        const itsForme = yield checkOrgan(spinalPilotModel, (_d = organModel.id) === null || _d === void 0 ? void 0 : _d.get());
        if (!itsForme)
            return;
        const spinalPilot = new SpinalPilot_1.SpinalPilot(spinalPilotModel);
        yield spinalPilot.sendPilotToServer();
    }
    catch (error) {
        spinalPilotModel === null || spinalPilotModel === void 0 ? void 0 : spinalPilotModel.setErrorMode();
        yield (spinalPilotModel === null || spinalPilotModel === void 0 ? void 0 : spinalPilotModel.removeFromNode());
    }
});
exports.SpinalPilotCallback = SpinalPilotCallback;
function getVariablesList(tree) {
    const variables = [];
    addToObj(tree);
    return variables;
    // Recursively add nodes to the variables list
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
function getServerUrl(serverInfo) {
    const prefix = "opc.tcp://";
    let endpoint = serverInfo.endpoint || "";
    // if (endpoint.substring(0, 1) !== "/") endpoint = `/${endpoint}`;
    // if (endpoint.substring(endpoint.length - 1) === "/") endpoint = endpoint.substring(0, endpoint.length - 1);
    const ip = serverInfo.address || serverInfo.ip;
    return (0, utils_1.normalizePath)(`${prefix}/${ip}:${serverInfo.port}/${endpoint}`);
}
exports.getServerUrl = getServerUrl;
function restartProcessById(instanceId) {
    return new Promise((resolve, reject) => {
        pm2.restart(instanceId, (err) => {
            if (err)
                return resolve(false);
            resolve(true);
        });
    });
}
exports.restartProcessById = restartProcessById;
function consumeBatch(functions, batchSize) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!functions.length)
            return [];
        const safeBatchSize = Math.max(1, batchSize);
        const chunks = lodash.chunk(functions, safeBatchSize);
        const result = [];
        for (const chunk of chunks) {
            const chunkResults = yield Promise.allSettled(chunk.map(fn => fn()));
            result.push(...chunkResults);
        }
        return result.reduce((acc, item) => {
            if (item.status === "fulfilled")
                acc.push(item.value);
            return acc;
        }, []);
    });
}
exports.consumeBatch = consumeBatch;
function clearnOrgan() {
    if (process.env.CLEAR_ORGAN_IF_NOT_COMPATIBLE == "1")
        return true;
    return false;
}
exports.clearnOrgan = clearnOrgan;
function organIsCompatible(organModel) {
    if (organModel.discover instanceof spinal_connector_service_1.ModelsInfo && organModel.listener instanceof spinal_connector_service_1.ModelsInfo && organModel.pilot instanceof spinal_connector_service_1.ModelsInfo)
        return true;
    return false;
}
function clearOrganModel(organModel) {
    return __awaiter(this, void 0, void 0, function* () {
        yield (0, clearOrgan_1.clearOrgan)(organModel)
            .then(() => {
            organModel.rem_attr("discover");
            organModel.rem_attr("listener");
            organModel.rem_attr("pilot");
            return organModel.initializeModelsList(); // Reinitialize the models list after clearing the organ model
        })
            .catch((err) => {
            displayLog_1.default.error("[clearOrganModel] - Error clearing organ model:", err);
        });
    });
}
exports.clearOrganModel = clearOrganModel;
//# sourceMappingURL=Functions.js.map
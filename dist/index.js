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
const dotenv_1 = require("dotenv");
const nodePath = require("path");
const spinal_core_connectorjs_type_1 = require("spinal-core-connectorjs_type");
const pm2 = require("pm2");
const utils_1 = require("./utils/utils");
const Functions_1 = require("./utils/Functions");
const fs = require("fs");
const nodepath = require("path");
(0, dotenv_1.config)({ path: nodePath.resolve(__dirname, "../.env"), override: true });
const { protocol, host, port, userId, password, path, name } = (0, utils_1.getConfig)();
const url = `${protocol}://${userId}:${password}@${host}:${port}/`;
const connect = spinal_core_connectorjs_type_1.spinalCore.connect(url);
(0, Functions_1.CreateOrganConfigFile)(connect, path, name).then((organModel) => {
    organModel.restart.bind(() => {
        (0, Functions_1.GetPm2Instance)(name).then((app) => __awaiter(void 0, void 0, void 0, function* () {
            const restart = organModel.restart.get();
            if (!restart) {
                listenLoadType(connect, organModel);
                // const { context, network, device } = await getNetwork(connect);
                // const server = { ip: "10.10.0.11", port: "26543", name: "Device 1" };
                // const spinalDevice = new SpinalDevice(server, context, network, device);
                // await spinalDevice.init();
                // console.log("initialized");
                // const tree = await spinalDevice.discover();
                // // await writeInFile("../tree.txt", JSON.stringify(tree));
                // await spinalDevice.createTreeInGraph(tree);
                // spinalDevice.launchTestFunction();
                // console.log("end");
                // return;
            }
            if (app) {
                console.log("restart organ", app.pm_id);
                organModel.restart.set(false);
                pm2.restart(app.pm_id, (err) => {
                    if (err) {
                        console.error(err);
                        return;
                    }
                    console.log("organ restarted with success !");
                });
            }
        }));
    });
});
function writeInFile(argPath, text) {
    return fs.writeFileSync(nodepath.resolve(__dirname, argPath), text);
}
const listenLoadType = (connect, organModel) => {
    loadTypeInSpinalCore(connect, "SpinalOPCUADiscoverModel", (spinalDisoverModel) => {
        (0, Functions_1.SpinalDiscoverCallback)(spinalDisoverModel, organModel);
    }, Functions_1.connectionErrorCallback);
    // loadTypeInSpinalCore(
    // 	connect,
    // 	"SpinalListenerModel",
    // 	(spinalListenerModel: SpinalListenerModel) => {
    // 		// SpinalListnerCallback(spinalListenerModel, organModel);
    // 		// // const child = fork("../fork_process/Listener");
    // 		// // child.send({ organModel, spinalListenerModel });
    // 	},
    // 	connectionErrorCallback
    // );
    // loadTypeInSpinalCore(
    // 	connect,
    // 	"SpinalBacnetValueModel",
    // 	(spinalBacnetValueModel: SpinalBacnetValueModel) => {
    // 		// SpinalBacnetValueModelCallback(spinalBacnetValueModel, organModel);
    // 	},
    // 	connectionErrorCallback
    // );
    // loadTypeInSpinalCore(
    // 	connect,
    // 	"SpinalPilotModel",
    // 	(spinalPilotModel: SpinalPilotModel) => {
    // 		// SpinalPilotCallback(spinalPilotModel, organModel);
    // 	},
    // 	connectionErrorCallback
    // );
};
const loadTypeInSpinalCore = (connect, type, callback, errorCallback) => {
    spinal_core_connectorjs_type_1.spinalCore.load_type(connect, type, callback, errorCallback);
};
//# sourceMappingURL=index.js.map
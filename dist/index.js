"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// import { config as dotenvConfig } from "dotenv";
const spinal_core_connectorjs_type_1 = require("spinal-core-connectorjs_type");
const utils_1 = require("./utils/utils");
const Functions_1 = require("./utils/Functions");
const spinal_model_opcua_1 = require("spinal-model-opcua");
const spinal_connector_service_1 = require("spinal-connector-service");
const nodePath = require("path");
// dotenvConfig({ path: nodepath.resolve(__dirname, "../.env"), override: true });
const { protocol, host, port, userId, password, path, name } = (0, utils_1.getConfig)();
const url = `${protocol}://${userId}:${password}@${host}:${port}/`;
const connect = spinal_core_connectorjs_type_1.spinalCore.connect(url);
const organInfo = {
    name,
    type: spinal_model_opcua_1.OPCUA_ORGAN_TYPE,
    path: nodePath.normalize(nodePath.join(path, `${name}`)),
    model: new spinal_model_opcua_1.SpinalOrganOPCUA(name, spinal_model_opcua_1.OPCUA_ORGAN_TYPE)
};
const spinalConnectorService = spinal_connector_service_1.SpinalConnectorService.getInstance();
spinalConnectorService.initialize(connect, organInfo).then(({ alreadyExists, node }) => {
    // Bind the restart function to PM2 events
    const pm2_instance = (0, Functions_1.GetPm2Instance)(name);
    const pm2_id = pm2_instance ? pm2_instance.pm_id : null;
    if (pm2_id)
        node.restart.bind(() => (0, Functions_1.restartProcessById)(pm2_id));
    // end of restart function to bind
    const message = alreadyExists ? "organ found !" : "organ not found, creating new organ !";
    console.log(message);
    (0, Functions_1.bindModels)(node);
}).catch((err) => {
    console.error(err);
});
// CreateOrganConfigFile(connect, path, name).then((organModel: SpinalOrganOPCUA) => {
// 	organModel.restart.bind(() => {
// 		GetPm2Instance(name).then(async (app: any) => {
// 			const restart = organModel.restart.get();
// 			if (!restart) {
// 				listenLoadType(connect, organModel);
// 				return;
// 			}
// 			if (app) {
// 				console.log("restart organ", app.pm_id);
// 				organModel.restart.set(false);
// 				pm2.restart(app.pm_id, (err) => {
// 					if (err) {
// 						console.error(err);
// 						return;
// 					}
// 					console.log("organ restarted with success !");
// 				});
// 			}
// 		});
// 	});
// });
// const listenLoadType = (connect: spinal.FileSystem, organModel: SpinalOrganOPCUA) => {
// 	loadTypeInSpinalCore(connect, "SpinalOPCUADiscoverModel", (spinalDisoverModel: SpinalOPCUADiscoverModel) => {
// 		SpinalDiscoverCallback(spinalDisoverModel, organModel);
// 	}, connectionErrorCallback);
// 	loadTypeInSpinalCore(connect, "SpinalOPCUAListener", (spinalListenerModel: SpinalOPCUAListener) => {
// 		SpinalListnerCallback(spinalListenerModel, organModel);
// 	}, connectionErrorCallback);
// 	loadTypeInSpinalCore(connect, "SpinalOPCUAPilot", (spinalPilotModel: SpinalOPCUAPilot) => {
// 		SpinalPilotCallback(spinalPilotModel, organModel);
// 	}, connectionErrorCallback);
// };
// const loadTypeInSpinalCore = (connect: spinal.FileSystem, type: string, callback: (model: any) => void, errorCallback: SpinalCallBackError) => {
// 	spinalCore.load_type(connect, type, callback, errorCallback);
// };
//# sourceMappingURL=index.js.map
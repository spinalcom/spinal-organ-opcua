// import { config as dotenvConfig } from "dotenv";
import { SpinalCallBackError, spinalCore } from "spinal-core-connectorjs_type";
import { getConfig } from "./utils/utils";
import { bindModels, GetPm2Instance, restartProcessById } from "./utils/Functions";
import { OPCUA_ORGAN_TYPE, SpinalOrganOPCUA, SpinalOPCUADiscoverModel, SpinalOPCUAListener, SpinalOPCUAPilot } from "spinal-model-opcua";
import { IConnectorInfo, SpinalConnectorService } from "spinal-connector-service";
import * as nodePath from "path";

// dotenvConfig({ path: nodepath.resolve(__dirname, "../.env"), override: true });


const { protocol, host, port, userId, password, path, name } = getConfig();
const url = `${protocol}://${userId}:${password}@${host}:${port}/`;
const connect: spinal.FileSystem = spinalCore.connect(url);

const organInfo: IConnectorInfo = {
	name,
	type: OPCUA_ORGAN_TYPE,
	path: nodePath.normalize(nodePath.join(path, `${name}`)),
	model: new SpinalOrganOPCUA(name, OPCUA_ORGAN_TYPE)
}

const spinalConnectorService = SpinalConnectorService.getInstance();
spinalConnectorService.initialize(connect, organInfo).then(({ alreadyExists, node }) => {

	// Bind the restart function to PM2 events
	const pm2_instance = GetPm2Instance(name);
	const pm2_id = pm2_instance ? (pm2_instance as any).pm_id : null;
	if (pm2_id) node.restart.bind(() => restartProcessById(pm2_id));
	// end of restart function to bind

	const message = alreadyExists ? "organ found !" : "organ not found, creating new organ !";
	console.log(message);

	bindModels(node as SpinalOrganOPCUA);

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
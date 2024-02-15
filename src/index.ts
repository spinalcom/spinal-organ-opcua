import { config as dotenvConfig } from "dotenv";
import * as nodePath from "path";
import { spinalCore } from "spinal-core-connectorjs_type";
import * as pm2 from "pm2";
import { getConfig } from "./utils/utils";
import { connectionErrorCallback, CreateOrganConfigFile, GetPm2Instance, SpinalDiscoverCallback } from "./utils/Functions";
import { SpinalOrganOPCUA, SpinalOPCUADiscoverModel } from "spinal-model-opcua";
import { SpinalDevice } from "./modules/SpinalDevice";
import { getNetwork } from "./test";

import * as fs from "fs";
import * as nodepath from "path";
import { text } from "stream/consumers";

dotenvConfig({ path: nodePath.resolve(__dirname, "../.env"), override: true });

const { protocol, host, port, userId, password, path, name } = getConfig();
const url = `${protocol}://${userId}:${password}@${host}:${port}/`;
const connect: spinal.FileSystem = spinalCore.connect(url);

CreateOrganConfigFile(connect, path, name).then((organModel: SpinalOrganOPCUA) => {
	organModel.restart.bind(() => {
		GetPm2Instance(name).then(async (app: any) => {
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
		});
	});
});

function writeInFile(argPath, text) {
	return fs.writeFileSync(nodepath.resolve(__dirname, argPath), text);
}

const listenLoadType = (connect: spinal.FileSystem, organModel: SpinalOrganOPCUA) => {
	loadTypeInSpinalCore(
		connect,
		"SpinalOPCUADiscoverModel",
		(spinalDisoverModel: SpinalOPCUADiscoverModel) => {
			SpinalDiscoverCallback(spinalDisoverModel, organModel);
		},
		connectionErrorCallback
	);

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
	spinalCore.load_type(connect, type, callback, errorCallback);
};

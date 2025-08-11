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

import { FileSystem, File as SpinalFile } from "spinal-core-connectorjs_type";
import { SpinalOrganOPCUA, SpinalOPCUADiscoverModel, OPCUA_ORGAN_STATES, SpinalOPCUAListener, SpinalOPCUAPilot } from "spinal-model-opcua";
import { discover } from "../modules/SpinalDiscover";
import { IOPCNode } from "../interfaces/OPCNode";
import { NodeClass } from "node-opcua";
import { SpinalNode } from "spinal-env-viewer-graph-service";
import { spinalMonitoring } from "../modules/SpinalMonitoring";
import { spinalPilot } from "../modules/SpinalPilot";

// import { SpinalDevice } from "../modules/SpinalDevice";
// import { SpinalNetworkServiceUtilities } from "./SpinalNetworkServiceUtilities";
// import { spinalMonitoring } from "../modules/SpinalMonitoring";

const Q = require("q");
const pm2 = require("pm2");

export const WaitModelReady = (): Promise<any> => {
	const deferred = Q.defer();
	const WaitModelReadyLoop = (defer) => {
		if (FileSystem._sig_server === false) {
			setTimeout(() => {
				defer.resolve(WaitModelReadyLoop(defer));
			}, 200);
		} else {
			defer.resolve();
		}
		return defer.promise;
	};
	return WaitModelReadyLoop(deferred);
};

export const connectionErrorCallback = (err?: Error): void => {
	if (!err) console.error("Error Connect");
	else console.error("Error Connect", err);
	process.exit(0);
};

export const CreateOrganConfigFile = (spinalConnection: any, path: string, connectorName: string): Promise<SpinalOrganOPCUA> => {
	return new Promise((resolve) => {
		spinalConnection.load_or_make_dir(`${path}`, async (directory) => {
			const found = await findFileInDirectory(directory, connectorName);
			if (found) {
				console.log("organ found !");
				return resolve(found);
			}

			console.log("organ not found");
			const model = new SpinalOrganOPCUA(connectorName);
			WaitModelReady().then(() => {
				const file = new SpinalFile(`${connectorName}.conf`, model, { model_type: model.type.get() });
				directory.push(file);
				console.log("organ created");
				return resolve(model);
			});
		});
	});
};

export const GetPm2Instance = (organName: string) => {
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


function findFileInDirectory(directory: spinal.Directory, fileName: string): Promise<SpinalOrganOPCUA | void> {
	return new Promise((resolve, reject) => {
		for (let index = 0; index < directory.length; index++) {
			const element = directory[index];
			const elementName = element.name.get();
			if (elementName.toLowerCase() === `${fileName}.conf`.toLowerCase()) {
				return element.load((file) => {
					WaitModelReady().then(() => {
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

async function checkOrgan(spinalOrgan: SpinalOPCUAListener | SpinalOPCUADiscoverModel | SpinalOPCUAPilot, organId: string): Promise<boolean> {
	try {

		if (!organId) return false;

		await WaitModelReady();
		let spinalDisoverModelOrgan: SpinalNode = await spinalOrgan.getOrgan();

		if (spinalDisoverModelOrgan instanceof SpinalNode) {
			spinalDisoverModelOrgan = await spinalDisoverModelOrgan.getElement(true);
		}

		return !!(organId === spinalDisoverModelOrgan.id?.get())
	} catch (error) {
		return false;
	}

}

export const SpinalListnerCallback = async (spinalListenerModel: SpinalOPCUAListener, organModel: SpinalOrganOPCUA): Promise<void> => {
	const itsForme = await checkOrgan(spinalListenerModel, organModel.id?.get());
	if (itsForme) spinalMonitoring.addToMonitoringList(spinalListenerModel);
};

export const SpinalDiscoverCallback = async (spinalDisoverModel: SpinalOPCUADiscoverModel, organModel: SpinalOrganOPCUA): Promise<void | boolean> => {

	try {
		const itsForme = await checkOrgan(spinalDisoverModel, organModel.id?.get());

		if (itsForme) {
			const minute = 2 * (60 * 1000);
			const time = Date.now();
			const creation = spinalDisoverModel.creation?.get() || 0;

			const state = spinalDisoverModel.state.get();
			const timeout = time - creation >= minute;

			// Check if model is not timeout.
			if (timeout || [OPCUA_ORGAN_STATES.created, OPCUA_ORGAN_STATES.cancelled].includes(state)) throw "Time out !"

			discover.addToQueue(spinalDisoverModel);
		}
	} catch (error) {
		spinalDisoverModel.changeState(OPCUA_ORGAN_STATES.timeout);
		return spinalDisoverModel.removeFromGraph();
	}

};

export const SpinalPilotCallback = async (spinalPilotModel: SpinalOPCUAPilot, organModel: SpinalOrganOPCUA): Promise<void> => {
	try {
		const itsForme = await checkOrgan(spinalPilotModel, organModel.id?.get());

		if (itsForme) spinalPilot.addToPilotList(spinalPilotModel);

	} catch (error) { }

};

export function getVariablesList(tree: IOPCNode): IOPCNode[] {
	const variables = [];

	addToObj(tree);

	return variables;


	// Recursively add nodes to the variables list
	function addToObj(n: IOPCNode) {
		if (n.nodeClass === NodeClass.Variable) {
			variables.push(n);
		}

		for (const i of n.children || []) {
			addToObj(i);
		}
	}
}





export function getServerUrl(serverInfo: any): string {
	let endpoint = serverInfo.endpoint || "";

	if (endpoint.substring(0, 1) !== "/") endpoint = `/${endpoint}`;
	if (endpoint.substring(endpoint.length - 1) === "/") endpoint = endpoint.substring(0, endpoint.length - 1);

	const ip = serverInfo.address || serverInfo.ip;
	return `opc.tcp://${ip}:${serverInfo.port}${endpoint}`;
}
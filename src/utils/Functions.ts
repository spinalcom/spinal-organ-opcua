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
import { SpinalOrganOPCUA, SpinalOPCUADiscoverModel, SpinalOPCUAListener, SpinalOPCUAPilot } from "spinal-model-opcua";
import { NodeClass, s } from "node-opcua";
import { SpinalNode } from "spinal-env-viewer-graph-service";
import { STATES } from "spinal-connector-service";
import { IOPCNode, IServer } from "../interfaces/OPCNode";

import { discover } from "../modules/SpinalDiscover";
import { spinalMonitoring } from "../modules/SpinalMonitoring";
import { SpinalPilot } from "../modules/SpinalPilot";
import * as pm2 from "pm2";
import { normalizePath } from "./utils";
// import { SpinalDevice } from "../modules/SpinalDevice";
// import { SpinalNetworkServiceUtilities } from "./SpinalNetworkServiceUtilities";
// import { spinalMonitoring } from "../modules/SpinalMonitoring";

const Q = require("q");

export const WaitModelReady = (): Promise<any> => {
	const deferred = Q.defer();
	const WaitModelReadyLoop = (defer: any) => {
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

// export const connectionErrorCallback = (err?: Error): void => {
// 	if (!err) console.error("Error Connect");
// 	else console.error("Error Connect", err);
// 	process.exit(0);
// };

export const CreateOrganConfigFile = (spinalConnection: spinal.FileSystem, path: string, connectorName: string): Promise<SpinalOrganOPCUA> => {
	return new Promise((resolve) => {
		spinalConnection.load_or_make_dir(`${path}`, async (directory: spinal.Directory) => {
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
		pm2.list((err: Error, apps: pm2.ProcessDescription[]) => {
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
				return element.load((file: SpinalOrganOPCUA) => {
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

export async function bindModels(organModel: SpinalOrganOPCUA): Promise<void> {

	const { discover, listener, pilot } = await organModel.getModels();

	const listenerAlreadyBinded = new Set<number>();
	const discoverAlreadyBinded = new Set<number>();

	//////////////// 
	//bind discover model[discover]
	////////////////
	discover.modification_date.bind(async () => {
		const discoverList = await organModel.getDiscoverModelFromGraph();

		for (const spinalDiscoverModel of discoverList) {
			if (discoverAlreadyBinded.has(spinalDiscoverModel._server_id)) continue;

			SpinalDiscoverCallback(spinalDiscoverModel, organModel)
			discoverAlreadyBinded.add(spinalDiscoverModel._server_id);
		}
	})

	///////////////
	//  bind pilot model [write value to bacnet device]
	///////////////
	pilot.modification_date.bind(async () => {
		const pilotList = await organModel.getPilotModelFromGraph();

		for (const spinalPilotModel of pilotList) {
			SpinalPilotCallback(spinalPilotModel, organModel);
		}
	}, true);


	////////////
	//  bind listener model [monitoring bacnet device]
	////////////
	listener.modification_date.bind(async () => {
		const listenerList = await organModel.getListenerModelFromGraph();

		for (let i = 0; i < listenerList.length; i++) {
			const spinalListenerModel = listenerList[i];

			if (listenerAlreadyBinded.has(spinalListenerModel._server_id)) continue;

			await SpinalListnerCallback(spinalListenerModel, organModel);
			listenerAlreadyBinded.add(spinalListenerModel._server_id);
		}
	}, true);
}

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
			if (timeout || [STATES.created, STATES.cancelled].includes(state)) throw "Time out !"

			discover.addToQueue(spinalDisoverModel);
		}
	} catch (error) {
		spinalDisoverModel.changeState(STATES.timeout);
		return spinalDisoverModel.removeFromGraph();
	}

};

export const SpinalPilotCallback = async (spinalPilotModel: SpinalOPCUAPilot, organModel: SpinalOrganOPCUA): Promise<void> => {
	try {
		const itsForme = await checkOrgan(spinalPilotModel, organModel.id?.get());

		if (itsForme) {
			const spinalPilot = new SpinalPilot(spinalPilotModel);
			await spinalPilot.sendPilotToServer();
		}

	} catch (error) {
		spinalPilotModel?.setErrorMode();
		await spinalPilotModel?.removeFromNode();
	}

};

export function getVariablesList(tree: IOPCNode): IOPCNode[] {
	const variables: IOPCNode[] = [];

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

export function getServerUrl(serverInfo: IServer): string {
	const prefix = "opc.tcp://";
	let endpoint = serverInfo.endpoint || "";

	// if (endpoint.substring(0, 1) !== "/") endpoint = `/${endpoint}`;
	// if (endpoint.substring(endpoint.length - 1) === "/") endpoint = endpoint.substring(0, endpoint.length - 1);

	const ip = serverInfo.address || serverInfo.ip;

	return normalizePath(`${prefix}/${ip}:${serverInfo.port}/${endpoint}`);
}

export function restartProcessById(instanceId: string | number): Promise<boolean> {

	return new Promise((resolve, reject) => {
		pm2.restart(instanceId, (err) => {
			if (err) return resolve(false);
			resolve(true);
		});
	});
}
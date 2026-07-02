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

import spinalLog from "./displayLog";
import { FileSystem, Lst, File as SpinalFile } from "spinal-core-connectorjs_type";
import { SpinalOrganOPCUA, SpinalOPCUADiscoverModel, SpinalOPCUAListener, SpinalOPCUAPilot } from "spinal-model-opcua";
import { NodeClass } from "node-opcua";
import { SpinalNode } from "spinal-env-viewer-graph-service";
import { ModelsInfo, STATES } from "spinal-connector-service";
import { IOPCNode, IServer } from "../interfaces/OPCNode";

import { discover } from "../modules/SpinalDiscover";
import { spinalMonitoring } from "../modules/SpinalMonitoring";
import { SpinalPilot } from "../modules/SpinalPilot";
import * as pm2 from "pm2";
import { normalizePath } from "./utils";
import { clearOrgan } from "./clearOrgan";
import * as lodash from "lodash";

export const WaitModelReady = (): Promise<boolean> => {
	return new Promise((resolve) => {
		const waitLoop = () => {
			if (FileSystem._sig_server === false) {
				setTimeout(waitLoop, 200);
				return;
			}

			resolve(true);
		};

		waitLoop();
	});
};

export const GetPm2Instance = (organName: string): Promise<pm2.ProcessDescription | undefined> => {
	return new Promise((resolve, reject) => {
		pm2.list((err: Error, apps: pm2.ProcessDescription[]) => {
			if (err) {
				spinalLog.error(err);
				return reject(err);
			}
			const instance = apps.find((app) => app.name === organName);

			resolve(instance);
		});
	});
};

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

export async function bindModels(organModel: SpinalOrganOPCUA): Promise<void> {
	if (!organIsCompatible(organModel)) {
		if (!clearnOrgan()) throw new Error("[bindModels] - Organ model incompatible. Update it or set CLEAR_ORGAN_IF_NOT_COMPATIBLE=1.");

		spinalLog.log("[bindModels] - Clearing organ model...");
		await clearOrganModel(organModel);
		spinalLog.log("[bindModels] - Organ model cleared. Rebinding models...");
	}

	const { discover, listener, pilot } = await organModel.getModels();

	if (!discover || !listener || !pilot) {
		throw new Error("[bindModels] - Organ model is missing one or more required models (discover, listener, pilot).");
	}

	const listenerAlreadyBinded = new Set<number>();
	const discoverAlreadyBinded = new Set<number>();

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
}

function bindListenerModel(listenerModel: ModelsInfo<SpinalOPCUAListener>, organModel: SpinalOrganOPCUA, listenerAlreadyBinded: Set<number>): void {
	if (!listenerModel?.modification_date) return;

	listenerModel.modification_date.bind(async () => {
		const listenerList: Lst<SpinalOPCUAListener> | undefined = await organModel.getListenerModelFromGraph();

		if (!listenerList) return;

		for (let i = 0; i < listenerList.length; i++) {
			const spinalListenerModel = listenerList[i];

			if (listenerAlreadyBinded.has(spinalListenerModel._server_id)) continue;

			await SpinalListnerCallback(spinalListenerModel, organModel);
			listenerAlreadyBinded.add(spinalListenerModel._server_id);
		}
	}, true);
}

function bindDiscoverModel(discoverModel: ModelsInfo<SpinalOPCUADiscoverModel>, organModel: SpinalOrganOPCUA, discoverAlreadyBinded: Set<number>): void {
	discoverModel.modification_date.bind(async () => {
		const discoverList: Lst<SpinalOPCUADiscoverModel> | undefined = await organModel.getDiscoverModelFromGraph();

		if (!discoverList) return;

		for (const spinalDiscoverModel of discoverList) {
			const serverId = spinalDiscoverModel?._server_id;
			if (typeof serverId !== "number") continue;
			if (discoverAlreadyBinded.has(serverId)) continue;

			SpinalDiscoverCallback(spinalDiscoverModel, organModel);
			discoverAlreadyBinded.add(serverId);
		}
	});
}

function bindPilotModel(pilotModel: ModelsInfo<SpinalOPCUAPilot>, organModel: SpinalOrganOPCUA): void {
	if (!pilotModel?.modification_date) return;

	pilotModel.modification_date.bind(async () => {
		const pilotList: Lst<SpinalOPCUAPilot> | undefined = await organModel.getPilotModelFromGraph();

		if (!pilotList) return;

		for (const spinalPilotModel of pilotList) {
			SpinalPilotCallback(spinalPilotModel, organModel);
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

		return !!(organId === spinalDisoverModelOrgan.id?.get());
	} catch (error) {
		return false;
	}
}

export const SpinalListnerCallback = async (spinalListenerModel: SpinalOPCUAListener, organModel: SpinalOrganOPCUA): Promise<void> => {
	const itsForme = await checkOrgan(spinalListenerModel, organModel.id?.get());
	if (itsForme) spinalMonitoring.addToDeviceToMonitorQueue(spinalListenerModel);
};

export const SpinalDiscoverCallback = async (spinalDisoverModel: SpinalOPCUADiscoverModel, organModel: SpinalOrganOPCUA): Promise<void | boolean> => {
	try {
		const itsForme = await checkOrgan(spinalDisoverModel, organModel.id?.get());
		if (!itsForme) return false;

		// Check if model is not timeout.
		const minute = 2 * (60 * 1000);
		const time = Date.now();
		const creation = spinalDisoverModel.creation?.get() || 0;

		const state = spinalDisoverModel.state.get();
		const timeout = time - creation >= minute;

		// Check if model is not timeout.
		if (timeout || [STATES.created, STATES.cancelled].includes(state)) throw "Time out !";

		discover.addToQueue(spinalDisoverModel);
	} catch (error) {
		spinalDisoverModel.changeState(STATES.timeout);
		return spinalDisoverModel.removeFromGraph();
	}
};

export const SpinalPilotCallback = async (spinalPilotModel: SpinalOPCUAPilot, organModel: SpinalOrganOPCUA): Promise<void> => {
	try {
		const itsForme = await checkOrgan(spinalPilotModel, organModel.id?.get());
		if (!itsForme) return;

		const spinalPilot = new SpinalPilot(spinalPilotModel);
		await spinalPilot.sendPilotToServer();
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

export async function consumeBatch<R>(functions: (() => Promise<R>)[], batchSize: number): Promise<R[]> {
	if (!functions.length) return [];

	const safeBatchSize = Math.max(1, batchSize);

	const chunks: (() => Promise<R>)[][] = lodash.chunk(functions, safeBatchSize);
	const result: PromiseSettledResult<R>[] = [];

	for (const chunk of chunks) { 
		const chunkResults = await Promise.allSettled(chunk.map(fn => fn()));
		result.push(...chunkResults);
	}

	return result.reduce((acc, item: PromiseSettledResult<R>) => {
		if(item.status === "fulfilled") acc.push(item.value);
		return acc;
	}, [] as R[]);
}

export function clearnOrgan(): boolean {
	if (process.env.CLEAR_ORGAN_IF_NOT_COMPATIBLE == "1") return true;
	return false;
}

function organIsCompatible(organModel: SpinalOrganOPCUA): boolean {
	if (organModel.discover instanceof ModelsInfo && organModel.listener instanceof ModelsInfo && organModel.pilot instanceof ModelsInfo) return true;
	return false;
}

export async function clearOrganModel(organModel: SpinalOrganOPCUA): Promise<void> {
	await clearOrgan(organModel)
		.then(() => {
			organModel.rem_attr("discover");
			organModel.rem_attr("listener");
			organModel.rem_attr("pilot");

			return organModel.initializeModelsList(); // Reinitialize the models list after clearing the organ model
		})
		.catch((err) => {
			spinalLog.error("[clearOrganModel] - Error clearing organ model:", err);
		});
}

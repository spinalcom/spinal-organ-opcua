/*
 * Copyright 2021 SpinalCom - www.spinalcom.com
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

import { SpinalBmsEndpoint } from "spinal-model-bmsnetwork";
import { EventEmitter } from "events";
import { SpinalNode, SpinalContext } from "spinal-env-viewer-graph-service";
import { IServer } from "spinal-model-opcua";
import { MessageSecurityMode, SecurityPolicy } from "node-opcua-client";
import { UserTokenType, UserIdentityInfo } from "node-opcua";
import { SpinalServiceTimeseries } from "spinal-model-timeseries";
import { SpinalGraphService } from "spinal-env-viewer-graph-service";
import { SpinalOPCUAListener } from "spinal-model-opcua";
import { IProfile } from "../utils/SpinalNetworkUtils";
import { IOPCNode } from "../interfaces/OPCNode";
import { normalizePath } from "../utils/utils";

const securityMode: MessageSecurityMode = MessageSecurityMode["None"] as any as MessageSecurityMode;
const securityPolicy = (SecurityPolicy as any)["None"];
const userIdentity: UserIdentityInfo = { type: UserTokenType.Anonymous };

export class SpinalDevice extends EventEmitter {
	private isInit: boolean = false;
	public context: SpinalContext;
	public network: SpinalNode;
	public device: SpinalNode;
	public server: IServer;
	public deviceInfo: { name: string, type: string, id: string, path: string };
	public spinalListenerModel: SpinalOPCUAListener;
	public profile: IProfile;

	private nodes: { [key: string]: SpinalNode } = {};
	private endpoints: { [key: string]: SpinalNode } = {};

	constructor(server: IServer, context: SpinalContext, network: SpinalNode, device: SpinalNode, spinalListenerModel: SpinalOPCUAListener, profile: IProfile) {

		super();

		this.server = server;
		this.context = context;
		this.network = network;
		this.device = device;
		this.deviceInfo = device.info.get();
		this.spinalListenerModel = spinalListenerModel;
		this.profile = profile;
	}


	public async init() {
		if (this.isInit) return;
		return this._convertNodesToObj();
	}

	public async updateEndpoints(nodes: IOPCNode[], isCov: boolean = false) {

		const promises = [];

		for (const opcNode of nodes) {
			const key = normalizePath(opcNode.path) || opcNode.nodeId.toString();
			const spinalnode = this.endpoints[key];
			if (!spinalnode) continue;

			await this._updateNodeInfo(opcNode, spinalnode);
			// const value = opcNode.value?.value || null; // may be bad if value is boolean
			const value = opcNode.value?.value;
			promises.push(this._updateEndpoint(spinalnode, value, isCov));
		}

		return Promise.all(promises);
	}



	stopMonitoring() {
		this.spinalListenerModel.monitored.set(false);
	}

	startMonitoring() {
		this.spinalListenerModel.monitored.set(true);
	}

	restartMonitoring() {
		this.stopMonitoring();
		setTimeout(() => {
			this.startMonitoring();
		}, 1000);
	}


	/////////////////////////////////////////////////////////////////////////
	//						PRIVATES METHODS
	/////////////////////////////////////////////////////////////////////////

	private async _updateEndpoint(endpointNode: SpinalNode, value: any, cov: boolean = false) {
		try {

			if (value === null) value = "null";

			const saveTimeSeries = this.spinalListenerModel.saveTimeSeries?.get();

			const element = await endpointNode.getElement(true);
			if (!element) return false;

			element.mod_attr("currentValue", value);

			// avertir du changement de valeur, le log du cov est fait dans son callback
			if (!cov) console.log(`[${this.deviceInfo.name}] - ${endpointNode.info?.idNetwork?.get()} changed value to`, value);

			if (saveTimeSeries && (typeof value === "boolean" || !isNaN(value))) {
				const spinalServiceTimeseries = new SpinalServiceTimeseries();
				SpinalGraphService._addNode(endpointNode);
				return spinalServiceTimeseries.pushFromEndpoint(endpointNode.getId().get(), value);
			}

			return true;
		} catch (error) {
			console.error(error);
			return false;
		}
	}

	private _convertNodesToObj(): Promise<SpinalNode[]> {
		return this.device.findInContext(this.context, (node) => {
			const key = normalizePath(node.info?.path?.get()) || node.info?.idNetwork?.get()

			if (key) this.nodes[key] = node;
			if (key && node.getType().get() === SpinalBmsEndpoint.nodeTypeName) this.endpoints[key] = node;
			return true;
		});
	}

	private async _updateNodeInfo(opcNode: IOPCNode, spinalNode: SpinalNode) {
		if (opcNode?.displayName) {
			const name = opcNode.displayName || opcNode.browseName;
			spinalNode.info?.displayName?.set(name);
			spinalNode.info?.name?.set(name);
		}

		if (opcNode?.browseName) {
			const name = opcNode.browseName || opcNode.displayName;
			spinalNode.info?.browseName?.set(name);
		}

		if (opcNode?.nodeId) {
			spinalNode.info?.idNetwork?.set(opcNode.nodeId.toString());
		}

	}

}

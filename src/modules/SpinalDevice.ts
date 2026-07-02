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
import { MessageSecurityMode, SecurityPolicy } from "node-opcua-client";
import { UserTokenType, UserIdentityInfo } from "node-opcua";
import { SpinalServiceTimeseries } from "spinal-model-timeseries";
import { SpinalGraphService } from "spinal-env-viewer-graph-service";
import { IProfile } from "../interfaces/IProfile";
import { IOPCNode } from "../interfaces/OPCNode";
import { getNodeKey } from "../utils/utils";
import { SpinalOPCUAListener, IServer } from "spinal-model-opcua";
import { OPCUAProfileService, PROFILE_UPDATE_EVENT } from "../utils/profile_service";
import spinalLog from "../utils/displayLog";

const securityMode: MessageSecurityMode = MessageSecurityMode["None"] as any as MessageSecurityMode;
const securityPolicy = (SecurityPolicy as any)["None"];
const userIdentity: UserIdentityInfo = { type: UserTokenType.Anonymous };

export class SpinalDevice extends EventEmitter {
	public isInit: boolean = false;
	public context: SpinalContext;
	public network: SpinalNode;
	public device: SpinalNode;
	public server: IServer;
	public deviceInfo: { name: string; type: string; id: string; path: string };
	public spinalListenerModel: SpinalOPCUAListener;
	public profileId: string | null = null;

	private nodes: { [key: string]: SpinalNode } = {};
	private endpoints: { [key: string]: SpinalNode } = {};
	private _browseHistoryQueue: SpinalNode[] = []; // Queue for breadth-first traversal of the node tree
	private _updateQueue: { nodes: IOPCNode[]; isCov: boolean; date: number }[] = []; // Queue for nodes that need to be updated

	constructor(server: IServer, context: SpinalContext, network: SpinalNode, device: SpinalNode, spinalListenerModel: SpinalOPCUAListener, profileId: string) {
		super();

		this.server = server;
		this.context = context;
		this.network = network;
		this.device = device;
		this.deviceInfo = device.info.get();
		this.spinalListenerModel = spinalListenerModel;
		this.profileId = profileId;
		this._browseHistoryQueue = [device]; // Initialize the queue with the root device node

		this._listenToProfileUpdate();
	}

	public async init() {
		try {
			spinalLog.log(`[SpinalDevice] - initializing device ${this.deviceInfo.name} with profile ${this.profileId}`);

			if (this.isInit) return;

			this._checkInitAndUpdate();

			const result = await this._collectGraphData();
			this.isInit = true;

			spinalLog.log(`[SpinalDevice] - device ${this.deviceInfo.name} initialized with ${Object.keys(this.endpoints).length} endpoints`);
			return result;
		} catch (error: Error | any) {
			spinalLog.error(`[SpinalDevice] - failed to init device ${this.deviceInfo.name} due to error: ${error.message}`);
		}
	}

	public updateEndpoints(nodes: IOPCNode[], isCov: boolean = false) {
		if (this.isInit) return this.updateEndpointsDirectly(nodes, isCov);

		spinalLog.log(`[SpinalDevice] - ${this.deviceInfo.name} not initialized yet, the update will be queued and executed after initialization`);
		this._updateQueue.push({ nodes, isCov, date: Date.now() });
	}

	public async updateEndpointsDirectly(nodes: IOPCNode[], isCov: boolean = false, date: number | null = null) {
		const promises = [];

		for (const opcNode of nodes) {
			const key = getNodeKey(opcNode);
			const spinalnode = await this._getEndpoint(key);

			if (!spinalnode) {
				spinalLog.warn(`[SpinalDevice] - endpoint ${key} not found in device ${this.deviceInfo.name}`);
				continue;
			}

			await this._updateNodeInfo(opcNode, spinalnode);
			// const value = opcNode.value?.value || null; // may be bad if value is boolean
			const value = opcNode.value?.value;
			promises.push(this._updateEndpointInGraph(spinalnode, value, isCov, date));
		}

		return Promise.all(promises)
			.then((result) => {
				if (!isCov) spinalLog.log(`[SpinalDevice] - device ${this.deviceInfo.name} updated`);
			})
			.catch((err) => {
				if (!isCov) spinalLog.error(`[SpinalDevice] - failed to update device ${this.deviceInfo.name} due to error: ${err.message}`);
			});
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

	private async _updateEndpointInGraph(endpointNode: SpinalNode, value: any, cov: boolean = false, date: number | null = null) {
		try {
			if (value === null) value = "null";

			const saveTimeSeries = this.spinalListenerModel?.saveTimeSeries?.get();

			const element = await endpointNode.getElement(true);
			if (!element) return false;

			// element.mod_attr("currentValue", value);
			if (typeof element.currentValue === "undefined") element.add_attr({ currentValue: value });
			else element.currentValue.set(value);

			// avertir du changement de valeur, le log du cov est fait dans son callback
			const prefix = cov ? "[COV]" : "[PULLING]";
			spinalLog.log(`${prefix} - Updating [${endpointNode.info?.path?.get().replace("/Objects", "")}] value to ${value} in graph`);

			if (saveTimeSeries && (typeof value === "boolean" || !isNaN(value))) await this._saveTimeSeries(endpointNode, value, date);

			return true;
		} catch (error) {
			spinalLog.error(error);
			return false;
		}
	}

	private async _saveTimeSeries(endpointNode: SpinalNode, value: any, date: number | null = null) {
		const spinalServiceTimeseries = new SpinalServiceTimeseries();
		SpinalGraphService._addNode(endpointNode);

		if (!date) return spinalServiceTimeseries.pushFromEndpoint(endpointNode.getId().get(), value);

		return spinalServiceTimeseries.insertFromEndpoint(endpointNode.getId().get(), value, date);
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

	private async _getEndpoint(id: string): Promise<SpinalNode | undefined> {
		return this.endpoints[id] || this.nodes[id] || this._findNodeInTree(id);
	}

	private async _findNodeInTree(id: string): Promise<SpinalNode | undefined> {
		const existingNode = this.nodes[id];
		if (existingNode) {
			return existingNode;
		}

		let queue: SpinalNode[] = [...this._browseHistoryQueue]; // Start with the root device node
		const visited = new Set<string>();
		const batchSize = 50;

		while (queue.length > 0) {
			const currentBatch = queue.splice(0, batchSize);
			const childrenResults = await Promise.all(currentBatch.map((node) => node.getChildrenInContext(this.context)));

			for (const children of childrenResults) {
				for (const child of children) {
					const info = child.info.get();
					const key = getNodeKey(info);

					if (visited.has(key)) {
						continue;
					}

					visited.add(key);

					this.addNode(key, child);

					if (key === id) {
						this._browseHistoryQueue = queue;
						return child;
					}

					queue.push(child);
				}
			}

			this._browseHistoryQueue = queue;
		}

		return undefined; // Return undefined if not found after traversing the entire tree
	}

	public addNode(key: string, node: SpinalNode) {
		const type = node.getType().get();

		if (key) this.nodes[key] = node;
		if (key && type === SpinalBmsEndpoint.nodeTypeName) this.endpoints[key] = node;
	}

	private _listenToProfileUpdate() {
		OPCUAProfileService.getInstance().on(PROFILE_UPDATE_EVENT, ({ profileId }) => {
			if (profileId === this.profileId) {
				spinalLog.log(`[SpinalDevice] - profile ${profileId} updated, restarting monitoring for device ${this.deviceInfo.name}`);
				this.restartMonitoring();
			}
		});
	}

	private async _collectGraphData(): Promise<SpinalNode[]> {
		let queue: SpinalNode[] = [this.device]; // Start with the root device node
		const visited = new Set<string>();
		const batchSize = 50;
		const allNodes: SpinalNode[] = [];

		while (queue.length > 0) {
			const currentBatch = queue.splice(0, batchSize);
			const childrenResults = await Promise.all(currentBatch.map((node) => node.getChildrenInContext(this.context)));

			for (const children of childrenResults) {
				for (const child of children) {
					const info = child.info.get();
					const key = getNodeKey(info);

					if (visited.has(key)) {
						continue;
					}

					visited.add(key);
					allNodes.push(child);
					this.addNode(key, child);
					queue.push(child);
				}
			}

			this._browseHistoryQueue = queue;
		}

		return allNodes; // Return all collected nodes
	}

	private async _checkInitAndUpdate() {
		const waitInitProm = new Promise((resolve, reject) => {
			const initFinished = () => {
				if (!this.isInit) {
					setTimeout(initFinished, 1000);
					return;
				}

				resolve(true);
			};
			initFinished();
		});

		return waitInitProm.then(() => {
			const promises = this._updateQueue.map(({ nodes, isCov, date }) => this.updateEndpointsDirectly(nodes, isCov, date));
			this._updateQueue = [];
			return Promise.all(promises);
		});
	}
}

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

import { SpinalBmsDevice, SpinalBmsEndpoint, SpinalBmsEndpointGroup, SpinalBmsNetwork } from "spinal-model-bmsnetwork";
import { EventEmitter } from "events";
import { SpinalNode, SPINAL_RELATION_PTR_LST_TYPE, SpinalContext } from "spinal-env-viewer-graph-service";
import { IServer } from "spinal-model-opcua";
import OPCUAService from "../utils/OPCUAService";
import { MessageSecurityMode, SecurityPolicy } from "node-opcua-client";
import { UserTokenType, UserIdentityInfo, DataType } from "node-opcua";
import certificatProm from "../utils/make_certificate";
import { IOPCNode } from "../interfaces/OPCNode";
import { SpinalServiceTimeseries } from "spinal-model-timeseries";
import { SpinalGraphService } from "spinal-env-viewer-graph-service";
import { convertSpinalNodeToOPCNode } from "../utils/utils";
import { getServerUrl } from "../utils/Functions";
import { SpinalOPCUAListener } from "spinal-model-opcua";

const securityMode: MessageSecurityMode = MessageSecurityMode["None"] as any as MessageSecurityMode;
const securityPolicy = (SecurityPolicy as any)["None"];
const userIdentity: UserIdentityInfo = { type: UserTokenType.Anonymous };

export class SpinalDevice extends EventEmitter {
	private isInit: boolean = false;
	private context: SpinalContext;
	private network: SpinalNode;
	private device: SpinalNode;
	private saveTimeSeries: spinal.Bool;
	public deviceInfo: { name: string, type: string, id: string };

	private nodes: { [key: string]: SpinalNode } = {};
	private endpoints: { [key: string]: SpinalNode } = {};
	private spinalListenerModel: SpinalOPCUAListener;

	constructor(server: IServer, context: SpinalContext, network: SpinalNode, device: SpinalNode, spinalListenerModel: SpinalOPCUAListener) {
		super();
		this.context = context;
		this.network = network;
		this.device = device;
		this.deviceInfo = device.info.get();
		this.spinalListenerModel = spinalListenerModel;
	}


	public async init() {
		if (this.isInit) return;
		return this._convertNodesToObj();
	}

	public async updateEndpoints(values: { [key: string]: { dataType: string; value: any } }) {
		const promises = Object.keys(values).map((id) => {
			const value = values[id]?.value || null;
			const node = this.endpoints[id];
			if (node) return this._updateEndpoint(node, value);
			return;
		});

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

	private async _updateEndpoint(endpointNode: SpinalNode, value: any) {
		try {

			if (value === null) value = "null";

			const saveTimeSeries = this.spinalListenerModel.saveTimeSeries?.get();

			const element = await endpointNode.getElement(true);
			if (!element) return false;

			element.mod_attr("currentValue", value);

			console.log(`[${this.deviceInfo.name}] - ${endpointNode.getName().get()} changed value to`, value);

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
			if (node.info.idNetwork) this.nodes[node.info.idNetwork.get()] = node;
			if (node.info.idNetwork && node.getType().get() === SpinalBmsEndpoint.nodeTypeName) this.endpoints[node.info.idNetwork.get()] = node;
			return true;
		});
	}

	// private async monitorCallback(id: string, value: any) {
	// 	const node = this.endpoints[id];
	// 	if (node) {
	// 		await this._updateEndpoint(node, value);
	// 	}
	// }

	// private async _getVariablesValues(variablesIds: string | string[]) {
	// 	if (!Array.isArray(variablesIds)) variablesIds = [variablesIds];
	// 	const nodes = variablesIds.reduce((opcNodes, id) => {
	// 		const node = this.endpoints[id] || id;

	// 		const opcNode = convertSpinalNodeToOPCNode(node);
	// 		if (opcNode) opcNodes.push(opcNode);
	// 		return opcNodes;
	// 	}, []);

	// 	return this.opcuaService.readNodeValue(nodes).then((result) => {
	// 		const obj = {};
	// 		for (let index = 0; index < result.length; index++) {
	// 			const element = result[index];
	// 			obj[nodes[index].nodeId.toString()] = element;
	// 		}

	// 		return obj;
	// 	});
	// }

	// private _transformTreeToGraphRecursively(tree: IOPCNode, parent?: SpinalNode, values: { [key: string]: any } = {}) {
	// 	const promises = (tree.children || []).map(async (el) => {
	// 		const { node, relation, alreadyExist } = await this.getNodeAndRelation(el, values);
	// 		if (parent && !alreadyExist) {
	// 			await parent.addChildInContext(node, relation, SPINAL_RELATION_PTR_LST_TYPE, this.context);
	// 		}
	// 		await this._transformTreeToGraphRecursively(el, node, values);
	// 		return { node, relation, alreadyExist };
	// 	});

	// 	return Promise.all(promises);
	// }

	// private async getNodeAndRelation(node: IOPCNode, values: { [key: string]: any } = {}): Promise<{ node: SpinalNode; relation: string; alreadyExist: boolean }> {
	// 	let spinalNode: SpinalNode = this.nodes[node.nodeId.toString()];
	// 	if (!spinalNode) return this._generateNodeAndRelation(node, values);

	// 	const relation = this._getNodeRelationName(spinalNode.getType().get());
	// 	// return { node: spinalNode, relation, alreadyExist: true };
	// 	return { node: spinalNode, relation, alreadyExist: true };
	// }

	// private async _generateNodeAndRelation(node: IOPCNode, values: { [key: string]: any } = {}): Promise<{ node: SpinalNode; relation: string; alreadyExist: boolean }> {
	// 	let element;
	// 	let param: any = {
	// 		id: node.nodeId.toString(),
	// 		name: node.displayName,
	// 		path: node.path,
	// 	};

	// 	if (this.opcuaService.isVariable(node)) {
	// 		const dataValue = values[node.nodeId.toString()];
	// 		param = {
	// 			...param,
	// 			typeId: "",
	// 			nodeTypeName: SpinalBmsEndpoint.nodeTypeName,
	// 			type: SpinalBmsEndpoint.nodeTypeName,
	// 			currentValue: dataValue?.value || "null",
	// 			dataType: dataValue?.dataType || "",
	// 			unit: "",
	// 		};

	// 		element = new SpinalBmsEndpoint(param);
	// 	} else {
	// 		param = {
	// 			...param,
	// 			nodeTypeName: SpinalBmsEndpointGroup.nodeTypeName,
	// 			type: SpinalBmsEndpointGroup.nodeTypeName,
	// 		};

	// 		element = new SpinalBmsEndpointGroup(param);
	// 	}

	// 	const spinalNode = new SpinalNode(param.name, param.type, element);
	// 	spinalNode.info.add_attr({ idNetwork: param.id });

	// 	if (param.type === SpinalBmsEndpoint.nodeTypeName) this.endpoints[param.id] = spinalNode;

	// 	return { node: spinalNode, relation: this._getNodeRelationName(param.type), alreadyExist: false };
	// }

	// private _formatValue(dataValue: { dataType: any; value: any }) {
	// 	let val;
	// 	switch (dataValue.dataType) {
	// 		case DataType.DateTime:
	// 			val = dataValue.value
	// 				.toString()
	// 				.replace(/\(.*\)$/gi, (el) => "")
	// 				.trim();

	// 		default:
	// 			val = dataValue.value?.toString() || dataValue.value;
	// 	}

	// 	return (val + "").length > 0 ? val : "null";
	// }

	// private _getNodeRelationName(type: string) {
	// 	switch (type) {
	// 		case SpinalBmsEndpoint.nodeTypeName:
	// 			return SpinalBmsEndpoint.relationName;

	// 		case SpinalBmsEndpointGroup.nodeTypeName:
	// 			return SpinalBmsEndpoint.relationName;

	// 		case SpinalBmsDevice.nodeTypeName:
	// 			return SpinalBmsDevice.relationName;

	// 		case SpinalBmsNetwork.nodeTypeName:
	// 			return SpinalBmsNetwork.relationName;
	// 	}
	// }


}

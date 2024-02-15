import { OPCUAClient, ResultMask, NodeClass, NodeClassMask, OPCUAClientOptions, ClientSession, BrowseResult, ReferenceDescription, BrowseDescriptionLike, ClientSubscription, UserIdentityInfo, ClientAlarmList, UserTokenType, MessageSecurityMode, SecurityPolicy, OPCUACertificateManager, NodeId, QualifiedName, AttributeIds, BrowseDirection, StatusCodes, makeBrowsePath, resolveNodeId, sameNodeId, VariantArrayType, TimestampsToReturn, MonitoringMode, ClientMonitoredItem, DataValue, DataType, NodeIdLike, coerceNodeId, makeResultMask } from "node-opcua";
import { IServer } from "spinal-model-opcua";
import { EventEmitter } from "events";
import { IOPCNode } from "../interfaces/OPCNode";
import * as lodash from "lodash";
import { convertToBrowseDescription } from "./utils";

import certificatProm from "../utils/make_certificate";

const securityMode: MessageSecurityMode = MessageSecurityMode["None"] as any as MessageSecurityMode;
const securityPolicy = (SecurityPolicy as any)["None"];
const userIdentity: UserIdentityInfo = { type: UserTokenType.Anonymous };

export class OPCUAService extends EventEmitter {
	private client?: OPCUAClient;
	private session?: ClientSession;
	private subscription?: ClientSubscription;
	private userIdentity: UserIdentityInfo = { type: UserTokenType.Anonymous };
	public verbose: boolean = false;
	private endpointUrl: string = "";
	private monitoredItemsListData: any[] = [];
	private clientAlarms: ClientAlarmList = new ClientAlarmList();

	public data = {
		reconnectionCount: 0,
		tokenRenewalCount: 0,
		receivedBytes: 0,
		sentBytes: 0,
		sentChunks: 0,
		receivedChunks: 0,
		backoffCount: 0,
		transactionCount: 0,
	};

	public constructor() {
		super();
	}

	public async initialize(endpointUrl: string) {
		// public async initialize(endpointUrl: string, securityMode: MessageSecurityMode, securityPolicy: SecurityPolicy) {
		const { certificateFile, clientCertificateManager, applicationUri, applicationName } = await certificatProm;

		this.endpointUrl = endpointUrl;
		this.client = OPCUAClient.create({
			endpointMustExist: false,
			securityMode,
			securityPolicy,
			// certificateFile,
			defaultSecureTokenLifetime: 30 * 1000,
			// clientCertificateManager,
			// applicationName,
			// applicationUri,
			keepSessionAlive: true,
		});

		this._listenClientEvents();
	}

	public async createSubscription() {
		if (!this.session) throw new Error("Invalid Session");

		try {
			const parameters = {
				requestedPublishingInterval: 500,
				requestedLifetimeCount: 1000,
				requestedMaxKeepAliveCount: 12,
				maxNotificationsPerPublish: 100,
				publishingEnabled: true,
				priority: 10,
			};

			this.subscription = await this.session.createSubscription2(parameters);
			console.log("subscription created !");
		} catch (error) {
			console.log("cannot create subscription !");
		}
	}

	public async connect(endpointUrl: string, userIdentity: UserIdentityInfo) {
		try {
			this.userIdentity = userIdentity;
			console.log("connecting to", endpointUrl);
			await this.client.connect(endpointUrl);
			await this._createSession();
			console.log("connected to ....", endpointUrl);
			await this.createSubscription();
		} catch (error) {
			console.log(" Cannot connect", error.toString());
			this.emit("connectionError", error);
		}
	}

	public async disconnect(): Promise<void> {
		if (this.session) {
			const session = this.session;
			this.session = undefined;
			await session.close();
		}

		await this.client!.disconnect();
	}

	public async getTree() {
		const _self = this;
		const tree = {
			displayName: "RootFolder",
			nodeId: resolveNodeId("RootFolder"),
			children: [],
		};

		let variables = [];
		let queue = [tree];
		const obj = {
			[tree.nodeId.toString()]: tree,
		};

		while (queue.length) {
			queue = await getAndFormatChilren(queue);
		}

		return { tree, variables };

		async function getAndFormatChilren(list) {
			const nodesToBrowse = list.map((el) => convertToBrowseDescription(el)).flat();
			const childrenObj = await _self.getChildren(nodesToBrowse);
			const newQueue = [];

			for (const key in childrenObj) {
				const children = childrenObj[key];
				for (const child of children) {
					const nodeInfo = {
						displayName: child.displayName.text || child.browseName.toString(),
						nodeId: child.nodeId,
						nodeClass: child.nodeClass as number,
						children: [],
					};
					if (nodeInfo.nodeClass === NodeClass.Variable) variables.push(nodeInfo.nodeId.toString());

					obj[nodeInfo.nodeId.toString()] = nodeInfo;
					obj[key].children.push(nodeInfo);

					newQueue.push(nodeInfo);
				}
			}

			return newQueue;
		}
	}

	public async getChildren(nodesToBrowse: any[]): Promise<{ [key: string]: ReferenceDescription[] }> {
		const list = lodash.chunk(nodesToBrowse, 500);
		const browseResults = [];

		for (const i of list) {
			const t = await this.session.browse(i);
			browseResults.push(...t);
		}

		const obj = {};
		for (let index = 0; index < browseResults.length; index++) {
			const element = browseResults[index].references;
			const parentId = nodesToBrowse[index].nodeId.toString();
			if (!obj[parentId]) obj[parentId] = [];

			obj[parentId].push(...element);
		}

		return obj;
	}

	///////////////////////////////////////////////////////////////////////////
	//					Exemple 1 : getTree (take a lot of time)		 	 //
	///////////////////////////////////////////////////////////////////////////
	public async getTree2(): Promise<any> {
		const tree = {
			displayName: "RootFolder",
			nodeId: resolveNodeId("RootFolder"),
			children: [],
		};

		await this.browseNode(tree);

		return tree;
	}

	public async browseNode(node: any) {
		const nodesToBrowse = [
			{
				nodeId: node.nodeId,
				referenceTypeId: "Organizes",
				includeSubtypes: true,
				browseDirection: BrowseDirection.Forward,
				resultMask: 0x3f,
			},
			{
				nodeId: node.nodeId,
				referenceTypeId: "Aggregates",
				includeSubtypes: true,
				browseDirection: BrowseDirection.Forward,
				resultMask: 0x3f,
			},
			{
				nodeId: node.nodeId,
				referenceTypeId: "HasSubtype",
				includeSubtypes: true,
				browseDirection: BrowseDirection.Forward,
				resultMask: 0x3f,
			},
		];

		const browseResults = await this.session.browse(nodesToBrowse);

		const references = browseResults.map((el) => el.references).flat();
		const res = [];

		for (const reference of references) {
			if ((reference.displayName.text || reference.browseName.toString()).toLowerCase() === "server") continue;

			const nodeInfo = {
				displayName: reference.displayName.text || reference.browseName.toString(),
				nodeId: reference.nodeId,
				nodeClass: reference.nodeClass as number,
				children: [],
			};

			const childNodeInfo = await this.browseNode(nodeInfo);
			res.push(nodeInfo);
		}

		node.children.push(...res);
		return res;
	}

	public async getNodeChildren2(node: IOPCNode): Promise<IOPCNode[]> {
		if (!this.session) throw new Error("No Session yet");

		if (this.session.isReconnecting) throw new Error("Session is not available (reconnecting)");

		const nodesToBrowse = [
			{
				nodeId: node.nodeId,
				referenceTypeId: "Organizes",
				includeSubtypes: true,
				browseDirection: BrowseDirection.Forward,
				resultMask: 0x3f,
			},
			{
				nodeId: node.nodeId,
				referenceTypeId: "Aggregates",
				includeSubtypes: true,
				browseDirection: BrowseDirection.Forward,
				resultMask: 0x3f,
			},
			{
				nodeId: node.nodeId,
				referenceTypeId: "HasSubtype",
				includeSubtypes: true,
				browseDirection: BrowseDirection.Forward,
				resultMask: 0x3f,
			},
		];

		try {
			const results = await this.session.browse(nodesToBrowse);

			return results.reduce((children: IOPCNode[], result: BrowseResult) => {
				if (result.references) {
					for (const ref of result.references) {
						if (ref.displayName.text.toLowerCase() === "server") continue;

						children.push({
							displayName: ref.displayName.text || ref.browseName.toString(),
							nodeId: ref.nodeId,
							nodeClass: ref.nodeClass as number,
						});
					}
				}

				return children;
			}, []);
		} catch (err) {
			console.log(err);
			return [];
		}
	}

	///////////////////////////////////////////////////////////////////////////
	//					End Exemple 1									 	 //
	///////////////////////////////////////////////////////////////////////////

	public async extractBrowsePath(nodeId: NodeId): Promise<string> {
		const browseName = await this._readBrowseName(nodeId);
		const pathElements = [];
		pathElements.push(`${browseName.namespaceIndex}:${browseName.name}`);

		let parent = await this._getNodeParent(nodeId);

		while (parent) {
			if (sameNodeId(parent.parentNodeId, resolveNodeId("RootFolder"))) {
				break;
			}

			const browseName = await this._readBrowseName(parent.parentNodeId);
			pathElements.unshift(`${browseName.namespaceIndex}:${browseName.name}${parent.sep}`);
			parent = await this._getNodeParent(parent.parentNodeId);
		}

		const browsePath = "/" + pathElements.join("");

		// verification
		const a = await this.session.translateBrowsePath(makeBrowsePath("i=84", browsePath));
		return browsePath + " (" + a.targets[0]?.targetId?.toString() + ")";
	}

	public async readNode(node: IOPCNode | IOPCNode[]): Promise<DataValue[]> {
		if (!Array.isArray(node)) node = [node];
		return this.session.read(node);
	}

	public async readNodeValue(node: IOPCNode | IOPCNode[]): Promise<{ dataType: string; value: any }[]> {
		if (!this.session) {
			return null;
		}

		if (!Array.isArray(node)) node = [node];
		const nodesChunk = lodash.chunk(node, 500);
		const dataValues = [];

		for (const i of nodesChunk) {
			const values = await this.readNode(i);
			dataValues.push(...values);
		}

		return dataValues.map((dataValue) => formatDataValue(dataValue));

		// if (dataValues.statusCode == StatusCodes.Good) {
		// 	if (dataValues.value.value) {
		// 		const obj = { dataType: DataType[dataValues.value.dataType], value: undefined };

		// 		switch (dataValues.value.arrayType) {
		// 			case VariantArrayType.Scalar:
		// 				obj.value = dataValues.value.value;
		// 				break;
		// 			case VariantArrayType.Array:
		// 				obj.value = dataValues.value.value.join(",");
		// 				break;
		// 			default:
		// 				obj.value = null;
		// 				break;
		// 		}

		// 		return obj;
		// 	}
		// }
		return null;
	}

	public async monitorItem(nodeIds: string | string[], callback: (id: string, data: DataValue) => any): Promise<void> {
		if (!this.subscription) return;

		nodeIds = Array.isArray(nodeIds) ? nodeIds : [nodeIds];

		const monitoredItems = nodeIds.map((nodeId) => ({ nodeId: nodeId, attributeId: AttributeIds.Value }));

		const monitoredItemGroup = await this.subscription.monitorItems(monitoredItems, { samplingInterval: 30 * 1000, discardOldest: true, queueSize: 1000 }, TimestampsToReturn.Both);
		for (const monitoredItem of monitoredItemGroup.monitoredItems) {
			monitoredItem.on("changed", (dataValue: DataValue) => {
				const value = formatDataValue(dataValue);
				callback(monitoredItem.itemToMonitor.nodeId.toString(), value?.value || "null");
			});
		}
		// this.subscription.monitor(monitoredItems, { samplingInterval: 1000, discardOldest: true, queueSize: 100 }, TimestampsToReturn.Both, MonitoringMode.Reporting, (err: Error | null, monitoredItem: ClientMonitoredItem) => {
		// 	if (err) {
		// 		console.log("cannot create monitored item", err.message);
		// 		return;
		// 	}

		// 	(<any>node).monitoredItem = monitoredItem;

		// 	monitoredItem.on("changed", (dataValue: DataValue) => {
		// 		callback(node.nodeId.toString(), dataValue.value.value);

		// 		// console.log(" value ", node.browseName, node.nodeId.toString(), " changed to ", dataValue.value.toString());
		// 		// if (dataValue.value.value.toFixed) {
		// 		// 	node.valueAsString = w(dataValue.value.value.toFixed(3), 16, " ");
		// 		// } else {
		// 		// 	node.valueAsString = w(dataValue.value.value.toString(), 16, " ");
		// 		// }
		// 		// monitoredItemData[2] = node.valueAsString;

		// 		// this.emit("monitoredItemChanged", this.monitoredItemsListData, node, dataValue);
		// 	});
		// });
	}

	public isVaraiable(node: IOPCNode): boolean {
		return node.nodeClass === NodeClass.Variable;
	}

	public isObject(node: IOPCNode): boolean {
		return node.nodeClass === NodeClass.Object;
	}

	///////////////////////////////////////////////////////////////////////////

	private async _createSession(client?: OPCUAClient): Promise<ClientSession> {
		try {
			const session = await (client || this.client)!.createSession(this.userIdentity);
			if (!client) {
				this.session = session;
				this._listenSessionEvent();
			}

			return session;
		} catch (err) {
			console.log(" Cannot create session ", err.toString());
		}
	}

	private _listenClientEvents(): void {
		this.client.on("backoff", (number, delay) => console.log(`connection failed, retrying in ${delay / 1000.0} seconds`));

		this.client.on("start_reconnection", () => console.log("Starting reconnection...." + this.endpointUrl));

		this.client.on("connection_reestablished", () => console.log("CONNECTION RE-ESTABLISHED !! " + this.endpointUrl));

		// monitoring des lifetimes
		this.client.on("lifetime_75", (token) => {
			if (this.verbose) console.log("received lifetime_75 on " + this.endpointUrl);
		});

		this.client.on("security_token_renewed", () => {
			if (this.verbose) console.log(" security_token_renewed on " + this.endpointUrl);
		});
	}

	private _listenSessionEvent(): void {
		this.session.on("session_closed", () => {
			console.log(" Warning => Session closed");
		});
		this.session.on("keepalive", () => {
			console.log("session keepalive");
		});
		this.session.on("keepalive_failure", () => {
			console.log("session keepalive failure");
		});
	}

	private async _readBrowseName(nodeId: NodeId): Promise<QualifiedName> {
		const node = await this.session.read({ nodeId, attributeId: AttributeIds.BrowseName });
		return node.value.value;
	}

	private async _getNodeParent(nodeId: NodeId): Promise<{ sep: string; parentNodeId: NodeId } | null> {
		let browseResult = await this.session.browse({
			browseDirection: BrowseDirection.Inverse,
			includeSubtypes: true,
			nodeId,
			nodeClassMask: 0xff,
			resultMask: 0xff,
			referenceTypeId: "HasChild",
		});

		if (browseResult.statusCode === StatusCodes.Good && browseResult.references?.length) {
			const parentNodeId = browseResult.references[0].nodeId;
			return { sep: ".", parentNodeId };
		}

		browseResult = await this.session.browse({
			browseDirection: BrowseDirection.Inverse,
			includeSubtypes: true,
			nodeId,
			nodeClassMask: 0xff,
			resultMask: 0xff,
			referenceTypeId: "Organizes",
		});

		if (browseResult.statusCode === StatusCodes.Good && browseResult.references?.length) {
			const parentNodeId = browseResult.references[0].nodeId;
			return { sep: "/", parentNodeId };
		}

		return null;
	}
}

export function w(s: string, l: number, c: string): string {
	c = c || " ";
	const filling = Array(25).join(c[0]);
	return (s + filling).substr(0, l);
}

function formatDataValue(dataValue: DataValue): { value: any; dataType: string } {
	if (dataValue.statusCode == StatusCodes.Good) {
		if (dataValue.value.value) {
			const obj = { dataType: DataType[dataValue.value.dataType], value: undefined };

			switch (dataValue.value.arrayType) {
				case VariantArrayType.Scalar:
					obj.value = dataValue.value.value;
					break;
				case VariantArrayType.Array:
					obj.value = dataValue.value.value.join(",");
					break;
				default:
					obj.value = null;
					break;
			}

			return obj;
		}
	}
	return null;
}

export default OPCUAService;

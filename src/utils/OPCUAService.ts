import { OPCUAClient, ResultMask, NodeClass, NodeClassMask, OPCUAClientOptions, ClientSession, BrowseResult, ReferenceDescription, BrowseDescriptionLike, ClientSubscription, UserIdentityInfo, ClientAlarmList, UserTokenType, MessageSecurityMode, SecurityPolicy, OPCUACertificateManager, NodeId, QualifiedName, AttributeIds, BrowseDirection, StatusCodes, makeBrowsePath, resolveNodeId, sameNodeId, VariantArrayType, TimestampsToReturn, MonitoringMode, ClientMonitoredItem, DataValue, DataType, NodeIdLike, coerceNodeId, makeResultMask, findBasicDataType, Variant, WriteValue, BrowsePath, ObjectIds, RelativePath, makeRelativePath, TranslateBrowsePathsToNodeIdsRequest, browseAll, INamespace, MonitoredItem, ClientMonitoredItemBase } from "node-opcua";
import { EventEmitter } from "events";
import { IOPCNode } from "../interfaces/OPCNode";
import * as lodash from "lodash";
import { coerceStringToDataType, convertToBrowseDescription, discoverIsCancelled } from "./utils";

import certificatProm from "../utils/make_certificate";
import discoveringStore from "./discoveringProcessStore";
import { OPCUA_ORGAN_STATES, SpinalOPCUADiscoverModel } from "spinal-model-opcua";
import { ITreeOption } from "../interfaces/ITreeOption";
import { getServerUrl, getVariablesList } from "../utils/Functions";
import { NAMES_TO_IGNORE } from "./constants";


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
	private _discoverModel: SpinalOPCUADiscoverModel;

	public isVariable = OPCUAService.isVariable;

	public constructor(url: string, model?: SpinalOPCUADiscoverModel) {
		super();
		this.endpointUrl = url;
		this._discoverModel = model;
		// if (typeof modelOrUrl === "string")
		// 	this.endpointUrl = modelOrUrl;
		// else {
		// 	const server = modelOrUrl.network.get();
		// 	this.endpointUrl = getServerUrl(server);
		// 	this._discoverModel = modelOrUrl;
		// }
	}

	public async initialize() {
		const { certificateFile, clientCertificateManager, applicationUri, applicationName } = await certificatProm;

		this.client = OPCUAClient.create({
			endpointMustExist: false,
			securityMode,
			securityPolicy,
			defaultSecureTokenLifetime: 30 * 1000,
			requestedSessionTimeout: 30 * 1000,
			keepSessionAlive: true,
			transportTimeout: 60 * 1000,
			connectionStrategy: {
				maxRetry: 3,
				initialDelay: 1000,
				maxDelay: 10 * 1000,
			},
		});

		this._listenClientEvents();
	}

	public async createSubscription() {
		if (!this.session) {
			await this._createSession();
		}

		try {
			const parameters = {
				requestedPublishingInterval: 500,
				requestedLifetimeCount: 10,
				requestedMaxKeepAliveCount: 5,
				maxNotificationsPerPublish: 10,
				publishingEnabled: true,
				priority: 1
			};

			this.subscription = await this.session.createSubscription2(parameters);
		} catch (error) {
			console.log("cannot create subscription !");
		}
	}

	public async connect(userIdentity?: UserIdentityInfo) {
		try {
			this.userIdentity = userIdentity || { type: UserTokenType.Anonymous };
			await this.client.connect(this.endpointUrl);
			await this._createSession();
			await this.createSubscription();
		} catch (error) {
			throw error;
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

	///////////////////////////////////////////////////////////////////////////
	//					Exemple 1 : [getTree] - Browse several node 		 //
	//					May have timeout error if the tree is too big		 //
	///////////////////////////////////////////////////////////////////////////

	public async getTree(entryPointPath?: string, options: ITreeOption = { useLastResult: false, useBroadCast: true }): Promise<{ tree: IOPCNode; variables: string[] }> {


		await this.initialize();
		await this.connect(userIdentity);
		// let { tree, variables, queue, nodesObj, browseMode } = await this._getDiscoverData(entryPointPath, options.useBroadCast);

		let { nodesObj, queue, browseMode } = await this._getDiscoverData(entryPointPath, options.useLastResult);
		console.log(`browsing ${this.endpointUrl} using "${browseMode}" , it may take a long time...`);

		while (queue.length && !discoverIsCancelled(this._discoverModel)) {

			let discoverState = null;
			let _error = null;
			const chunked = options.useBroadCast ? queue.splice(0, 10) : [queue.shift()];

			try {
				discoverState = OPCUA_ORGAN_STATES.discovering;
				const newsItems = await this._getChildrenAndAddToObj(chunked, nodesObj);
				queue.push(...newsItems);
				if (newsItems.length) console.log(`[${browseMode}] - ${newsItems.length} new nodes found !`);
				console.log(`[${browseMode}] - ${queue.length} nodes remaining in queue`);
			} catch (error) {
				queue.unshift(...chunked);
				_error = error;
				discoverState = OPCUA_ORGAN_STATES.error;
			}

			if (!_error && queue.length === 0) discoverState = OPCUA_ORGAN_STATES.discovered;

			await discoveringStore.saveProgress(this.endpointUrl, nodesObj, queue, discoverState);

			if (_error) throw _error;
		}


		// if the discovering process is interrupted by user, stop the process
		if (discoverIsCancelled(this._discoverModel)) return;

		const { tree, variables } = await this._convertObjToTree(entryPointPath, nodesObj);
		console.log(`${this.endpointUrl} discovered, ${Object.keys(nodesObj).length} nodes found.`);
		return { tree, variables };
	}



	///////////////////////////////////////////////////////////////////////////
	//					Exemple 2 : getTree (take a lot of time)		 	 //
	///////////////////////////////////////////////////////////////////////////
	// public async getTree2(entryPointPath?: string): Promise<any> {
	// 	console.log("discovering", this.endpointUrl || "", "inside getTree2, may take up to 1 hour or more...");
	// 	const tree = await this._getEntryPoint(entryPointPath);
	// 	const queue: any[] = [tree];
	// 	const variables = [];
	// 	const nodesObj = { [tree.nodeId.toString()]: tree };

	// 	while (queue.length) {
	// 		const node = queue.shift();
	// 		let _error = null;
	// 		let discoverState = OPCUA_ORGAN_STATES.discovering;

	// 		try {
	// 			console.log("[getTree2] browsing", node.displayName);
	// 			// if (this.isVariable(node)) variables.push(node.nodeId.toString());
	// 			// const children = await this._browseNode(node);
	// 			// node.children = children;
	// 			// queue.push(...children);
	// 			const children = await this._getChildrenAndAddToObj([node], nodesObj, variables);
	// 			queue.push(...children);
	// 		} catch (error) {
	// 			discoverState = OPCUA_ORGAN_STATES.error;
	// 			queue.unshift(node);
	// 			_error = error;
	// 			console.log("error", error);
	// 		}

	// 		if (!_error && queue.length === 0) discoverState = OPCUA_ORGAN_STATES.discovered;
	// 		await discoveringStore.saveProgress(this.endpointUrl, tree, queue, discoverState);

	// 		if (_error) throw _error;
	// 	}

	// 	return { tree, variables };
	// }

	public async browseNodeRec(node: any) {
		console.log("browsing", node.displayName, "inside browseNodeRec");
		const children = await this._browseNode(node);
		for (const child of children) {
			await this.browseNodeRec(child);
		}
		node.children = children;
		return children;

	}

	///////////////////////////////////////////////////////////////////////////

	public async _getChildrenAndAddToObj(nodes: IOPCNode[], nodesObj: { [key: string]: IOPCNode } = {}) {

		const children = await this._browseNode(nodes);

		for (const child of children) {
			// const parent = nodesObj[child.parentId];
			// if (this.isVariable(child)) variables.push(child.nodeId.toString());
			nodesObj[child.nodeId.toString()] = child;
			// if (parent) parent.children.push(child);
		}

		return children;
	}

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

	public async readNodeValue(node: IOPCNode | IOPCNode[]): Promise<{ dataType: string; value: any }[]> {
		await this.initialize();
		await this.connect(userIdentity);

		if (!this.session) {
			this._createSession();
		}

		node = Array.isArray(node) ? node : [node];

		const nodesChunk = lodash.chunk(node, 500);
		const _promise = nodesChunk.reduce(async (prom, chunk) => {
			let list = await prom;
			const values = await this.readNode(chunk);
			list.push(...values);
			return list;
		}, Promise.resolve([]));

		const dataValues = await _promise;
		await this.disconnect();

		return dataValues.map((dataValue) => this._formatDataValue(dataValue));

	}

	public async writeNode(node: IOPCNode, value: any): Promise<any> {
		if (!this.session) {
			await this._createSession();
		}

		const { dataType, arrayDimension, valueRank } = await this._getNodesDetails(node);

		if (dataType) {
			try {
				const _value = this._parseValue(valueRank, arrayDimension, dataType, value);

				const writeValue = new WriteValue({
					nodeId: node.nodeId,
					attributeId: AttributeIds.Value,
					value: { value: _value },
				});

				let statusCode = await this.session.write(writeValue);

				return statusCode;
			} catch (error) {
				console.log("error writing value", error);
				return StatusCodes.BadInternalError;
			}
		}
	}

	public async monitorItem(nodeIds: string | string[], callback: (id: string, data: { value: any, dataType: string }, monitorItem: ClientMonitoredItemBase) => any): Promise<void> {
		if (!this.subscription) {
			await this.createSubscription();
		};

		nodeIds = Array.isArray(nodeIds) ? nodeIds : [nodeIds];

		const monitoredItems = nodeIds.map((nodeId) => ({ nodeId: nodeId, attributeId: AttributeIds.Value }));

		// const monitoredItemGroup = await this.subscription.monitorItems(monitoredItems, { samplingInterval: 30 * 1000, discardOldest: true, queueSize: 1000 }, TimestampsToReturn.Both);
		const monitoredItemGroup = await this.subscription.monitorItems(monitoredItems, { samplingInterval: 10, discardOldest: true, queueSize: 1 }, TimestampsToReturn.Both);

		for (const monitoredItem of monitoredItemGroup.monitoredItems) {
			this._listenMonitoredItemEvents(monitoredItem, callback);
		}
	}

	///////////////////////////////////////////////////////////////////////////


	private _listenMonitoredItemEvents(monitoredItem: ClientMonitoredItemBase, callback: (id: string, data: { value: any, dataType: string }, monitorItem: ClientMonitoredItemBase) => any) {
		monitoredItem.on("changed", (dataValue: DataValue) => {
			const value = this._formatDataValue(dataValue);
			callback(monitoredItem.itemToMonitor.nodeId.toString(), value, monitoredItem);
		});

		monitoredItem.on("err", (err) => {
			console.log(`[Error - COV] - ${monitoredItem.itemToMonitor.nodeId.toString()} : ${err}`);
		});

	}

	private _browseNode(node: IOPCNode | IOPCNode[]): Promise<IOPCNode[]> {
		node = Array.isArray(node) ? node : [node];
		const nodeToBrowse = node.reduce((list, n) => {
			const configs = convertToBrowseDescription(n);
			list.push(...configs);
			return list;
		}, []);

		return this._browseUsingBrowseDescription(nodeToBrowse);
	}

	private async _browseUsingBrowseDescription(descriptions: BrowseDescriptionLike[]): Promise<IOPCNode[]> {
		const browseResults = await this.session.browse(descriptions);

		return browseResults.reduce((children: IOPCNode[], el: BrowseResult, index: number) => {
			const parentId = (descriptions[index] as any)?.nodeId?.toString();
			for (const ref of el.references) {
				const refName = ref.displayName.text || ref.browseName?.toString();
				if (!refName || refName.startsWith(".") || NAMES_TO_IGNORE.includes(refName.toLowerCase()))
					continue; // skip unwanted nodes

				const formatted = this._formatReference(ref, "", parentId);
				children.push(formatted);
			}

			return children;
		}, []);

		// const references = browseResults.map((el) => el.references).flat(); // each browseResult has an array of references for each description;
		// return references.reduce((list, ref, index) => {
		// 	const refName = ref.displayName.text || ref.browseName?.toString();
		// 	if (!refName || refName.toLowerCase() === "server" || refName[0] === ".") return list; // skip server and hidden nodes

		// 	const parentId = (descriptions[index] as any)?.nodeId?.toString();
		// 	const formatted = this._formatReference(ref, "", parentId);
		// 	list.push(formatted);
		// 	return list;
		// }, []);
	}

	private async _getNodesDetails(node: IOPCNode) {
		const dataTypeIdDataValue = await this.session.read({ nodeId: node.nodeId, attributeId: AttributeIds.DataType });
		const arrayDimensionDataValue = await this.session.read({ nodeId: node.nodeId, attributeId: AttributeIds.ArrayDimensions });
		const valueRankDataValue = await this.session.read({ nodeId: node.nodeId, attributeId: AttributeIds.ValueRank });

		const dataTypeId = dataTypeIdDataValue.value.value as NodeId;
		const dataType = await findBasicDataType(this.session, dataTypeId);

		const arrayDimension = arrayDimensionDataValue.value.value as null | number[];
		const valueRank = valueRankDataValue.value.value as number;

		return { dataType, arrayDimension, valueRank };
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


		// using Organizes if HasChild is not found
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

	private async _getDiscoverData(entryPointPath: string, useLastResult: boolean) {
		let queue, nodesObj, browseMode;

		try {
			if (!useLastResult) throw new Error("no last result"); // throw error to force unicast browsing

			const data = await discoveringStore.getProgress(this.endpointUrl);

			browseMode = "Multicast";
			nodesObj = data.nodesObj;
			queue = data.queue;

		} catch (error) {
			browseMode = "Unicast";

			let tree = await this._getEntryPoint(entryPointPath);
			queue = [tree];
			nodesObj = { [tree.nodeId.toString()]: tree };
		}

		return { queue, nodesObj, browseMode };
	}

	private async _convertTreeToObject(tree: IOPCNode) {
		const obj = {};
		const variables = [];
		const stack = [tree];

		while (stack.length) {
			const node = stack.shift();
			obj[node.nodeId.toString()] = node;
			if (this.isVariable(node)) variables.push(node);

			stack.push(...node.children);
		}

		return { obj, variables };
	}

	private async _convertObjToTree(entryPointPath: string, obj: { [key: string]: IOPCNode }): Promise<{ tree: IOPCNode, variables: string[] }> {
		let tree = await this._getEntryPoint(entryPointPath);
		const variables = [];

		for (const key in obj) {
			if (Object.prototype.hasOwnProperty.call(obj, key)) {
				const node = obj[key];
				const parent = obj[node.parentId];
				if (this.isVariable(node)) variables.push(node.nodeId.toString());

				if (parent) parent.children.push(node);
			}
		}

		tree = obj[tree.nodeId.toString()];
		return { tree, variables }
	}
	////////////////////////////////////////////////////////////
	//							Client			 			  //
	////////////////////////////////////////////////////////////

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
		this.client.on("backoff", (number, delay) => {
			if (number === 1) return this.client.disconnect();
			console.log(`connection failed, retrying attempt ${number + 1}`)
		});

		this.client.on("start_reconnection", () => console.log("Starting reconnection...." + this.endpointUrl));

		this.client.on("connection_reestablished", () => console.log("CONNECTION RE-ESTABLISHED !! " + this.endpointUrl));

		// monitoring des lifetimes
		this.client.on("lifetime_75", (token) => {
			if (this.verbose) console.log("received lifetime_75 on " + this.endpointUrl);
		});

		this.client.on("security_token_renewed", () => {
			if (this.verbose) console.log(" security_token_renewed on " + this.endpointUrl);
		});

		this.client.on("timed_out_request", (request) => {
			this.emit("timed_out_request", request);
		});
	}

	private _listenSessionEvent(): void {
		this.session.on("session_closed", () => {
			// console.log(" Warning => Session closed");
		})
		this.session.on("keepalive", () => {
			console.log("session keepalive");
		})
		this.session.on("keepalive_failure", () => {
			this._restartConnection();
		})
	}

	private _restartConnection = async () => {
		try {
			await this.client.disconnect()
			await this.client.connect(this.endpointUrl)
		} catch (error) {
			console.log("OpcUa: restartConnection", error)
		}
	}

	///////////////////////////////////////////////////////
	//					Utils							 //
	///////////////////////////////////////////////////////

	private async _getEntryPoint(entryPointPath?: string): Promise<IOPCNode> {
		let root: any = {
			displayName: "Root",
			nodeId: ObjectIds.RootFolder,
			path: "/",
			children: [],
		};

		if (!entryPointPath || entryPointPath === "/") entryPointPath = "/Objects";
		if (!entryPointPath.startsWith("/")) entryPointPath = "/" + entryPointPath;

		return this._getEntryPointWithPath(root, entryPointPath);
	}

	private async _getEntryPointWithPath(start: any, entryPointPath?: string): Promise<IOPCNode> {
		if (!entryPointPath.startsWith("/Objects")) entryPointPath = "/Objects" + entryPointPath;

		const paths = entryPointPath.split("/").filter((el) => el !== "");
		let error;
		let node = start;
		let lastNode;

		while (paths.length && !error) {
			const path = paths.shift();
			const children = await this._browseNode(node);
			let found = children.find((el) => el.displayName.toLocaleLowerCase() === path.toLocaleLowerCase());

			if (!found) {
				error = `No node found with entry point : ${entryPointPath}`;
				break;
			}

			node = found;
			if (paths.length === 0) lastNode = node;
		}

		if (error) throw new Error(error);

		return { ...lastNode, children: [], path: `/${paths.join("/")}` };
	}

	private _formatReference(reference: ReferenceDescription, path: string, parentId?: string): IOPCNode {
		const name = reference.displayName.text || reference.browseName.toString();
		path = path.endsWith("/") ? path : `${path}/`;

		return {
			displayName: name,
			browseName: reference.browseName.toString(),
			nodeId: reference.nodeId,
			nodeClass: reference.nodeClass as number,
			path: path + name,
			children: [],
			parentId
		};
	}

	private _formatDataValue(dataValue: DataValue): { value: any; dataType: string } {

		if (dataValue?.statusCode == StatusCodes.Good) {
			if (dataValue?.value?.value) {
				const obj = { dataType: DataType[dataValue?.value?.dataType], value: undefined };

				switch (dataValue?.value?.arrayType) {
					case VariantArrayType.Scalar:
						obj.value = dataValue?.value?.value;
						break;
					case VariantArrayType.Array:
						obj.value = dataValue?.value?.value.join(",");
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

	private async _readBrowseName(nodeId: NodeId): Promise<QualifiedName> {
		const node = await this.session.read({ nodeId, attributeId: AttributeIds.BrowseName });
		return node.value.value;
	}


	public static isVariable(node: IOPCNode): boolean {
		return node.nodeClass === NodeClass.Variable;
	}


	public isObject(node: IOPCNode): boolean {
		return node.nodeClass === NodeClass.Object;
	}

	private _parseValue(valueRank: number, arrayDimension: number[], dataType: DataType, value: any) {
		const arrayType = valueRank === -1 ? VariantArrayType.Scalar : valueRank === 1 ? VariantArrayType.Array : VariantArrayType.Matrix;
		const dimensions = arrayType === VariantArrayType.Matrix ? arrayDimension : undefined;

		const _value = new Variant({
			dataType,
			arrayType,
			dimensions,
			value: coerceStringToDataType(dataType, arrayType, VariantArrayType, value),
		});
		return _value;
	}

	public async readNode(node: IOPCNode | IOPCNode[]): Promise<DataValue[]> {
		if (!Array.isArray(node)) node = [node];
		return this.session.read(node);
	}
}



export default OPCUAService;

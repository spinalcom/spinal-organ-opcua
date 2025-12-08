import { OPCUAClient, NodeClass, ClientSession, BrowseResult, ReferenceDescription, BrowseDescriptionLike, ClientSubscription, UserIdentityInfo, ClientAlarmList, UserTokenType, MessageSecurityMode, SecurityPolicy, NodeId, QualifiedName, AttributeIds, BrowseDirection, StatusCodes, makeBrowsePath, resolveNodeId, sameNodeId, VariantArrayType, TimestampsToReturn, DataValue, DataType, coerceNodeId, ClientMonitoredItemBase, DataChangeFilter, DataChangeTrigger, StatusCode, LocalizedText } from "node-opcua";
import { EventEmitter } from "events";
import { IOPCNode } from "../interfaces/OPCNode";
import * as lodash from "lodash";
import { coerceStringToDataType, convertToBrowseDescription, discoverIsCancelled, normalizePath } from "./utils";

import certificatProm from "../utils/make_certificate";
import discoveringStore from "./discoveringProcessStore";
import { OPCUA_ORGAN_STATES, SpinalOPCUADiscoverModel } from "spinal-model-opcua";
import { ITreeOption } from "../interfaces/ITreeOption";
import { NAMES_TO_IGNORE } from "./constants";


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

	public isVariable = OPCUAService.isVariable; // static method to check if a node is a variable

	public constructor(url: string, model?: SpinalOPCUADiscoverModel) {
		super();
		this.endpointUrl = url;
		this._discoverModel = model;
	}

	public async initialize() {
		const { certificateFile, clientCertificateManager, applicationUri, applicationName } = await certificatProm;

		this.client = OPCUAClient.create({
			securityMode: MessageSecurityMode.None,
			securityPolicy: SecurityPolicy.None,
			endpointMustExist: false,
			defaultSecureTokenLifetime: 30 * 1000,
			requestedSessionTimeout: 50 * 1000,
			keepSessionAlive: true,
			transportTimeout: 60 * 1000,
			connectionStrategy: {
				maxRetry: 3,
				initialDelay: 1000,
				// maxDelay: 10 * 1000,
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
				requestedPublishingInterval: 10 * 1000, // interval auquel on veut recevoir les notifications
				requestedLifetimeCount: 100, // Nombre de notification sans reponses avants que la subscription soit considérée comme expirée 
				requestedMaxKeepAliveCount: 4, // Nombre de notification avant que le serveur envoie un keep alive
				maxNotificationsPerPublish: 10, // Nombre de valueur (DataChange) maximum par notification
				publishingEnabled: true, // Activer ou desactiver l'envoi de notification
				priority: 1 // Donne une priorité à la subscription
			};

			this.subscription = await this.session.createSubscription2(parameters);
		} catch (error) {
			console.log("cannot create subscription !", error.message);
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
	//              Exemple 1 : [getTree] - Browse several node              //
	//              May have timeout error if the tree is too big            //
	///////////////////////////////////////////////////////////////////////////

	public async getTree(entryPointPath?: string, options: ITreeOption = { useLastResult: false, useBroadCast: true }): Promise<{ tree: IOPCNode; variables: string[] }> {


		await this.initialize();
		await this.connect(userIdentity);

		// get the queue and nodesObj from the last discover or create a new one
		let { nodesObj, queue, browseMode } = await this._getDiscoverStarterData(entryPointPath, options.useLastResult);
		console.log(`browsing ${this.endpointUrl} using "${browseMode}" , it may take a long time...`);


		while (queue.length && !discoverIsCancelled(this._discoverModel)) {

			let discoverState = null;
			let _error = null;

			// chunk the queue to avoid timeout errors
			const chunked = options.useBroadCast ? queue.splice(0, 10) : [queue.shift()];

			try {
				discoverState = OPCUA_ORGAN_STATES.discovering; // set the state to discovering
				const children = await this._browseNode(chunked); // browse the nodes in the queue
				const newsItems = await this._addNodeToNodesObject(children, nodesObj); // add the new nodes to the nodesObj

				queue.push(...newsItems);

				if (newsItems.length) console.log(`[${browseMode}] - ${newsItems.length} new nodes found !`); // log the number of new nodes found
				console.log(`[${browseMode}] - ${queue.length} nodes remaining in queue`); // log the number of nodes remaining in queue

			} catch (error) {
				queue.unshift(...chunked); // if an error occurs, put the nodes back in the queue
				_error = error;
				discoverState = OPCUA_ORGAN_STATES.error; // set the state to error
			}

			if (!_error && queue.length === 0) discoverState = OPCUA_ORGAN_STATES.discovered; // if the queue is empty, set the state to discovered

			await discoveringStore.saveProgress(this.endpointUrl, nodesObj, queue, discoverState); // save the progress in the store

			if (_error) throw _error; // if an error occurs, throw it to stop the process
		}


		// if the discovering process is interrupted by user, stop the process
		if (discoverIsCancelled(this._discoverModel)) return;

		const { tree, variables } = await this._convertObjToTree(entryPointPath, nodesObj);
		console.log(`${this.endpointUrl} discovered, ${Object.keys(nodesObj).length} nodes found.`);
		return { tree, variables };
	}


	///////////////////////////////////////////////////////////////////////////


	public async readNode(node: IOPCNode | IOPCNode[]): Promise<DataValue[]> {
		if (!Array.isArray(node)) node = [node];
		return this.session.read(node);
	}

	public async getNodePath(nodeId: string | NodeId): Promise<string> {

		if (typeof nodeId === "string") nodeId = coerceNodeId(nodeId);

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

		// const { dataType, arrayDimension, valueRank } = await this._getNodesDetails(node);

		const PossibleDataType = await this._getPossibleDataType(value);

		try {

			let statusCode: StatusCode;
			let isGood: boolean = false; // check we found a data type

			// test each data type until we find a good one
			while (!isGood && PossibleDataType.length) {
				const dataType = PossibleDataType.shift();
				if (!dataType) throw new Error("No data type found for value: " + value);
				let tempValue = value;

				if (dataType == DataType.Boolean) tempValue = value == 0 ? false : true; // convert 1 and 0 to boolean
				statusCode = await (this.session as any).writeSingleNode(node.nodeId.toString(), { dataType, value: tempValue });

				if (statusCode.isGoodish()) isGood = true;

			}

			console.log("statusCode", statusCode);

			if (!isGood) throw new Error("Cannot write value: " + value + " to node: " + node.nodeId + " with any data type");
			return statusCode;

		} catch (error) {
			// console.log("error writing value", error);
			// return StatusCodes.BadInternalError;
			throw error;
		}
	}

	public async monitorItem(nodeIds: string | string[], callback: (id: string, data: { value: any, dataType: string }, monitorItem: ClientMonitoredItemBase) => any): Promise<void> {
		if (!this.subscription) {
			await this.createSubscription();
		};

		nodeIds = Array.isArray(nodeIds) ? nodeIds : [nodeIds];

		const monitoredItems = nodeIds.map((nodeId) => ({ nodeId: nodeId, attributeId: AttributeIds.Value }));

		const parameters = {
			samplingInterval: 3 * 1000, // 10 seconds
			filter: new DataChangeFilter({
				trigger: DataChangeTrigger.StatusValue,
				// deadbandType: DeadbandType.Absolute,
				// deadbandValue: 0.5
			}),
			discardOldest: true,
			queueSize: 1
		}

		const monitoredItemGroup = await this.subscription.monitorItems(monitoredItems, parameters, TimestampsToReturn.Both);

		for (const monitoredItem of monitoredItemGroup.monitoredItems) {
			this._listenMonitoredItemEvents(monitoredItem, callback);
		}
	}


	public async getNodeIdByPath(path?: string): Promise<string> {

		try {
			if (!path.startsWith("/Objects")) path = "/Objects" + path;

			if (path.endsWith("/")) path = path.slice(0, -1); // remove trailing slash

			const browsePaths = makeBrowsePath("RootFolder", path);
			const nodesFound = await this.session.translateBrowsePath(browsePaths);

			if (!nodesFound.targets || nodesFound.targets.length === 0) return;

			return nodesFound.targets[0].targetId?.toString();

		} catch (error) {
			return;
		}

	}


	public async getNodeByPath(path?: string): Promise<IOPCNode> {

		try {
			const startNodeId = await this.getNodeIdByPath(path);
			if (!startNodeId) return;

			const startNode = await this.readNodeDescription(startNodeId, path);

			return startNode; // return the node with its children and path

		} catch (error) {
			return;
		}

	}


	public static isVariable(node: IOPCNode): boolean {
		return node.nodeClass === NodeClass.Variable;
	}

	public isObject(node: IOPCNode): boolean {
		return node.nodeClass === NodeClass.Object;
	}

	public getNodesNewInfoByPath(nodes: IOPCNode | IOPCNode[]): Promise<IOPCNode[]> {
		if (!Array.isArray(nodes)) nodes = [nodes];

		const promises = nodes.map(node => this.getNodeByPath(node.path));

		return Promise.all(promises).then((result) => {
			return result;
		})
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

		const nodeToBrowse = node.map((n) => convertToBrowseDescription(n)).flat();

		return this._browseUsingBrowseDescription(nodeToBrowse);
	}

	private async _browseUsingBrowseDescription(descriptions: BrowseDescriptionLike[]): Promise<IOPCNode[]> {
		const browseResults = await this.session.browse(descriptions);

		return browseResults.reduce((children: IOPCNode[], browseResult: BrowseResult, index: number) => {
			const parentId = (descriptions[index] as any)?.nodeId?.toString();

			for (const ref of browseResult.references) {
				const refName = ref.displayName.text || ref.browseName?.toString();
				if (!refName || refName.startsWith(".") || NAMES_TO_IGNORE.includes(refName.toLowerCase()))
					continue; // skip unwanted nodes

				const formatted = this._formatReference(ref, "", parentId);
				children.push(formatted);
			}

			return children;
		}, []);
	}


	private async _addNodeToNodesObject(nodes: IOPCNode[], nodesObj: { [key: string]: IOPCNode } = {}) {
		for (const child of nodes) {
			const parent = nodesObj[child.parentId];

			// create the path based on the parent node
			const path = parent ? `${parent.path}/${child.browseName}/` : `/${child.browseName}`;

			child.path = normalizePath(path);
			nodesObj[child.nodeId.toString()] = child;
		}

		return nodes;
	}

	private _getPossibleDataType(value: any): DataType[] {

		if (!isNaN(value)) { // if the value is a number

			const numerics = [DataType.Float, DataType.Double, DataType.Int16, DataType.Int32, DataType.Int64, DataType.UInt16, DataType.UInt32, DataType.UInt64]
			if (value == 0 || value == 1)
				return [...numerics, DataType.Boolean]; // if the value is 0 or 1, it can be a boolean or a numeric type

			return numerics; // if the value is a number, it can be a numeric type
		}

		if (typeof value == "string") { // if the value is a string
			return [DataType.String, DataType.LocalizedText, DataType.XmlElement]; // if the value is a string, it can be a string or a localized text
		}


		if (typeof value == "boolean") { // if the value is a boolean
			return [DataType.Boolean];
		}

		if (value instanceof Date) { // if the value is a Date
			return [DataType.DateTime];
		}


		return [DataType.Null]; // if the value is not recognized, return null
	}

	private async readNodeDescription(nodeId: string, path: string = ""): Promise<IOPCNode> {
		const attributesToRead = [
			{ nodeId, attributeId: AttributeIds.BrowseName },
			{ nodeId, attributeId: AttributeIds.DisplayName },
			{ nodeId, attributeId: AttributeIds.NodeClass },
			{ nodeId, attributeId: AttributeIds.Value },
		];

		const [displayNameData, browseNameData, nodeClassData, valueData] = await this.session.read(attributesToRead);
		const displayName = this._formatDataValue(displayNameData);
		const browseName = this._formatDataValue(browseNameData);
		const nodeClass = nodeClassData.value.value as NodeClass;
		const value = this._formatDataValue(valueData);

		return {
			displayName: displayName?.value || "",
			browseName: browseName?.value || "",
			nodeId: coerceNodeId(nodeId),
			nodeClass,
			children: [],
			path,
			value
		};
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

	private async _getDiscoverStarterData(entryPointPath: string, useLastResult: boolean) {
		let queue, nodesObj;

		let browseMode = "unicast"; //always use unicast browsing

		try {
			if (!useLastResult) throw new Error("no last result"); // throw error to force new browsing

			const data = await discoveringStore.getProgress(this.endpointUrl); // get the last discover data from the store

			nodesObj = data.nodesObj;
			queue = data.queue;

		} catch (error) {
			// if no last result or error in file reading, use unicast browsing

			let tree = await this._getEntryPoint(entryPointPath);
			queue = [tree];
			nodesObj = { [tree.nodeId.toString()]: tree };
		}

		return { queue, nodesObj, browseMode };
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


	///////////////////////////////////////////////////////
	//                                      Utils                                                    //
	///////////////////////////////////////////////////////

	private async _getEntryPoint(entryPointPath?: string): Promise<IOPCNode> {
		if (!entryPointPath || entryPointPath === "/") entryPointPath = "/Objects";
		if (!entryPointPath.startsWith("/")) entryPointPath = "/" + entryPointPath;

		const node = await this.getNodeByPath(entryPointPath);
		if (node) return node;

		throw `No node found with entry point : ${entryPointPath}`;
	}


	private _formatReference(reference: ReferenceDescription, parentPath: string, parentId?: string): IOPCNode {
		const name = reference.displayName.text || reference.browseName.toString();
		const browseName = reference.browseName?.toString();

		parentPath = parentPath.endsWith("/") ? parentPath : `${parentPath}/`;

		return {
			displayName: name,
			browseName,
			nodeId: reference.nodeId,
			nodeClass: reference.nodeClass as number,
			path: parentPath + browseName,
			children: [],
			parentId
		};
	}



	private _formatDataValue(dataValue: any): { value: any; dataType: string } {


		// if dataValue.value is not a Variant, return the value and dataType
		if (typeof dataValue.value !== "object") {
			dataValue.value = this._formatRealValue(dataValue.value); // format the value if it's not a Variant
			return dataValue;
		}

		// if dataValue.value is a Variant return the value of the Variant
		if (typeof dataValue?.value?.value !== "undefined") {
			const obj = { dataType: DataType[dataValue?.value?.dataType], value: undefined };

			if (dataValue?.value?.arrayType == VariantArrayType.Array) {
				obj.value = obj.value = dataValue?.value?.value.join(",");
			} else {
				obj.value = this._formatRealValue(dataValue?.value?.value);
			}

			return obj;
		}


		return null;
	}

	private _formatRealValue(value) {
		if (value instanceof QualifiedName) value = value.name; // if the value is a QualifiedName, get the name
		if (value instanceof LocalizedText) value = value.text; // if the value is a LocalizedText, get the text

		if (value == null) value = "null";

		return value; // return the value as is
	}

	private async _readBrowseName(nodeId: NodeId): Promise<QualifiedName> {
		const node = await this.session.read({ nodeId, attributeId: AttributeIds.BrowseName });
		return node.value.value;
	}

	////////////////////////////////////////////////////////////
	//                       Client                           //
	////////////////////////////////////////////////////////////

	private async _createSession(client?: OPCUAClient): Promise<ClientSession> {
		try {
			const session = await (client || this.client)!.createSession(this.userIdentity);
			if (!client) { // if no client is provided, set the session to the instance variable
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
			// console.log("session keepalive");
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


}



export default OPCUAService;
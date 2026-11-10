import { OPCUAClient, NodeClass, ClientSession, ReferenceDescription, BrowseDescriptionLike, ClientSubscription, UserIdentityInfo, ClientAlarmList, UserTokenType, MessageSecurityMode, SecurityPolicy, NodeId, QualifiedName, AttributeIds, BrowseDirection, StatusCodes, makeBrowsePath, resolveNodeId, sameNodeId, VariantArrayType, TimestampsToReturn, DataValue, DataType, coerceNodeId, ClientMonitoredItemBase, DataChangeFilter, DataChangeTrigger, StatusCode, LocalizedText, DeadbandType, ObjectIds, VariableIds } from "node-opcua";
import { EventEmitter } from "events";
import { IOPCNode } from "../interfaces/OPCNode";
import { convertToBrowseDescription, discoverIsCancelled, executeConcurrently, isNumericDataType, normalizePath } from "./utils";

import certificatProm from "../utils/make_certificate";
import discoveringStore from "./discoveringProcessStore";
import { OPCUA_ORGAN_STATES, SpinalOPCUADiscoverModel } from "spinal-model-opcua";
import { ITreeOption } from "../interfaces/ITreeOption";
import { NAMES_TO_IGNORE, noSessionError, noSubscriptionError } from "./constants";
import OPCUAFactory from "./OPCUAFactory";
import spinalLog from "./displayLog";

const userIdentity: UserIdentityInfo = { type: UserTokenType.Anonymous };
const DISCOVER_CHECKPOINT_BATCH_COUNT = 25; // Number of nodes to process before saving a checkpoint during discovery
const INITIAL_DISCOVER_BATCH_SIZE = 10; // Initial number of nodes to process in a batch during discovery
const MAX_DISCOVER_BATCH_SIZE = 100; // Maximum number of nodes to process in a batch during discovery
const MAX_READ_BATCH_SIZE = 100;
const MAX_CONCURRENT_READ_BATCHES = 4;

function isTooManyBrowseOperations(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /BadTooManyOperations|TooManyRequests?/i.test(message);
}

type CovCallbackType = (node: IOPCNode, data: { value: any; dataType: string }, monitorItem: ClientMonitoredItemBase) => void;

export class OPCUAConnectionError extends Error {
	constructor(endpointUrl: string, error: unknown) {
		const reason = error instanceof Error ? error.message : String(error);
		super(`failed to connect to ${endpointUrl}! due to ${reason}`);
		this.name = "OPCUAConnectionError";
	}
}

export class OPCUAService extends EventEmitter {
	private client?: OPCUAClient;
	private session?: ClientSession;
	private subscription?: ClientSubscription;
	private userIdentity: UserIdentityInfo = { type: UserTokenType.Anonymous };
	public verbose: boolean = false;
	private endpointUrl: string = "";
	private monitoredItemsData: { nodes: IOPCNode[]; callback: CovCallbackType; onMonitorItem?: (item: ClientMonitoredItemBase) => void }[] = [];
	private maxNodesPerRead?: number;

	private clientAlarms: ClientAlarmList = new ClientAlarmList();
	private _discoverModel: SpinalOPCUADiscoverModel | undefined = undefined; // model used to save the discovering process in the spinal system, if provided in the constructor

	public isVariable = OPCUAService.isVariable; // static method to check if a node is a variable
	private isReconnecting: boolean = false;

	public constructor(url: string, model?: SpinalOPCUADiscoverModel) {
		super();
		this.endpointUrl = url;
		this._discoverModel = model;
	}

	//////////////////////////// Client connection management ////////////////////////////

	private async createClient(): Promise<OPCUAClient> {
		if (this.client) return this.client; // if the client already exists, return it

		// const { certificateFile, clientCertificateManager, applicationUri, applicationName } = await certificatProm;

		const client = OPCUAClient.create({
			securityMode: MessageSecurityMode.None,
			securityPolicy: SecurityPolicy.None,
			endpointMustExist: false,
			defaultSecureTokenLifetime: 2 * 60 * 1000, // 2 minutes
			requestedSessionTimeout: 5 * 60 * 1000, // 5 minutes
			keepSessionAlive: true,
			defaultTransactionTimeout: 60 * 1000, // 60 seconds
			transportTimeout: 90 * 1000, // 90 seconds
			connectionStrategy: {
				maxRetry: 3,
				initialDelay: 1000,
				maxDelay: 10 * 1000,
				randomisationFactor: 0.2, // 20% randomisation
			},
		});

		this._listenClientEvents(client);

		return client;
	}

	private _listenClientEvents(client: OPCUAClient): void {
		client.on("backoff", (number, delay) => {
			spinalLog.warn(`[${this.endpointUrl}] connection attempt ${number} failed; retrying in ${delay}ms`);
		});

		client.on("after_reconnection", () => {
			const isReconnection = true;
			for (const { nodes, callback, onMonitorItem } of this.monitoredItemsData) {
				this.monitorItem(nodes, callback, isReconnection, onMonitorItem);
			}
		});

		client.on("connection_lost", () => this.reconnect());
	}

	public async checkAndReestablishConnection(userIdentity?: UserIdentityInfo): Promise<void> {
		if (this.client && this.session) return;

		this.client = await this.createClient();
		await this.connect(userIdentity);
	}

	public async disconnect(): Promise<void> {
		if (this.session) await this.session.close();

		OPCUAFactory.resetOPCUAInstance(this.endpointUrl); // reset the instance in the factory
		if (this.client) await this.client.disconnect();
	}

	private async _createSession(): Promise<ClientSession> {
		try {
			if (!this.client) this.client = await this.createClient();

			const session = await this.client.createSession(this.userIdentity);
			this._listenSessionEvent(session);

			return session;
		} catch (err) {
			spinalLog.log(" Cannot create session ", (err as Error).toString());
			throw err;
		}
	}

	private _listenSessionEvent(session: ClientSession): void {
		session.on("session_closed", () => {
			// spinalLog.log(" Warning => Session closed");
			this.reconnect();
		});
		// session.on("keepalive", () => {
		// 	// spinalLog.log("session keepalive");
		// })
		session.on("keepalive_failure", () => {
			this.reconnect();
		});
	}

	private async createSubscription() {
		if (!this.session) this.session = await this._createSession();

		try {
			const parameters = {
				requestedPublishingInterval: 10 * 1000, // interval auquel on veut recevoir les notifications
				requestedLifetimeCount: 100, // Nombre de notification sans reponses avants que la subscription soit considérée comme expirée
				requestedMaxKeepAliveCount: 4, // Nombre de notification avant que le serveur envoie un keep alive
				maxNotificationsPerPublish: 10, // Nombre de valueur (DataChange) maximum par notification
				publishingEnabled: true, // Activer ou desactiver l'envoi de notification
				priority: 1, // Donne une priorité à la subscription
			};

			return this.session.createSubscription2(parameters);
		} catch (error) {
			spinalLog.log("cannot create subscription !", (error as Error).message);
			throw error;
		}
	}

	private async connect(userIdentity?: UserIdentityInfo) {
		try {
			this.userIdentity = userIdentity || { type: UserTokenType.Anonymous };
			if (!this.client) this.client = await this.createClient();

			await this.client.connect(this.endpointUrl);
			this.session = await this._createSession();
			this.subscription = await this.createSubscription();
		} catch (error) {
			throw new OPCUAConnectionError(this.endpointUrl, error);
		}
	}

	private async reconnect() {
		try {
			if (this.isReconnecting) return;

			if (!this.client) this.client = await this.createClient();

			this.isReconnecting = true;
			await this.client.disconnect();
			await this.connect();

			this.isReconnecting = false;
		} catch (error) {
			spinalLog.log(`Reconnection failed to ${this.endpointUrl}`, error);
			this.isReconnecting = false;
			// OPCUAFactory.resetOPCUAInstance(this.endpointUrl); // reset the instance in the factory
		}
	}

	///////////////////////////////////////////////////////////////////////////
	//              Exemple 1 : [getTree] - Browse several node              //
	//              May have timeout error if the tree is too big            //
	///////////////////////////////////////////////////////////////////////////

	public async getTree(options: ITreeOption = { useLastResult: false, useBroadCast: true, entryPointPath: "" }): Promise<{ tree: IOPCNode; variables: string[] } | void> {
		await this.checkAndReestablishConnection(userIdentity);

		// get the queue and nodesObj from the last discover or create a new one
		let { nodesObj, queue, browseMode } = await this._getDiscoverStarterData(options.entryPointPath, options.useLastResult);
		const queuedNodeIds = new Set<string>();

		// Initialize the queuedNodeIds set with the nodeIds already in the queue to avoid duplicates
		queue = queue.filter((node: IOPCNode) => {
			const nodeId = node.nodeId.toString();
			if (queuedNodeIds.has(nodeId)) return false;
			queuedNodeIds.add(nodeId);
			return true;
		});

		let { maxBrowseBatchSize, batchesSinceCheckpoint } = await this._fetchBatchingLimits(options, queue);
		let browseBatchSize = Math.min(INITIAL_DISCOVER_BATCH_SIZE, maxBrowseBatchSize);

		spinalLog.log(`browsing ${this.endpointUrl} using "${browseMode}" , it may take a long time...`);

		while (queue.length && !discoverIsCancelled(this._discoverModel)) {
			let discoverState = null;
			let _error = null;

			const chunked = options.useBroadCast ? queue.splice(0, browseBatchSize) : [queue.shift()];

			try {
				discoverState = OPCUA_ORGAN_STATES.discovering; // set the state to discovering
				const children = await this._browseNode(chunked); // browse the nodes in the queue
				const newsItems = await this._addNodeToNodesObject(children, nodesObj); // add the new nodes to the nodesObj

				queue.push(...newsItems);
				if (options.useBroadCast && chunked.length === browseBatchSize && browseBatchSize < MAX_DISCOVER_BATCH_SIZE) {
					browseBatchSize++;
				}

				if (newsItems.length) spinalLog.log(`[${browseMode}] - ${newsItems.length} new nodes found !`); // log the number of new nodes found
				spinalLog.log(`[${browseMode}] - ${queue.length} nodes remaining in queue`); // log the number of nodes remaining in queue
			} catch (error) {
				queue.unshift(...chunked); // if an error occurs, put the nodes back in the queue
				if (options.useBroadCast && isTooManyBrowseOperations(error) && browseBatchSize > 1) {
					const previousBatchSize = browseBatchSize;
					maxBrowseBatchSize = Math.min(maxBrowseBatchSize, previousBatchSize - 1);
					browseBatchSize = Math.max(1, Math.floor(browseBatchSize / 2));
					browseBatchSize = Math.min(browseBatchSize, maxBrowseBatchSize);
					continue;
				}
				_error = error;
				discoverState = OPCUA_ORGAN_STATES.error; // set the state to error
			}

			if (!_error && queue.length === 0) discoverState = OPCUA_ORGAN_STATES.discovered; // if the queue is empty, set the state to discovered

			batchesSinceCheckpoint++;

			if (_error || queue.length === 0 || batchesSinceCheckpoint >= DISCOVER_CHECKPOINT_BATCH_COUNT) {
				await discoveringStore.saveProgress(this.endpointUrl, nodesObj, queue, discoverState);
				batchesSinceCheckpoint = 0;
			}

			if (_error) throw _error; // if an error occurs, throw it to stop the process
		}

		// if the discovering process is interrupted by user, stop the process
		if (discoverIsCancelled(this._discoverModel)) {
			await discoveringStore.saveProgress(this.endpointUrl, nodesObj, queue, OPCUA_ORGAN_STATES.cancelled);
			return;
		}

		const { tree, variables } = await this._convertObjToTree(options.entryPointPath, nodesObj);
		spinalLog.log(`${this.endpointUrl} discovered, ${Object.keys(nodesObj).length} nodes found.`);
		return { tree, variables };
	}

	private async _fetchBatchingLimits(options: ITreeOption, queue: any) {
		let batchesSinceCheckpoint = 0;
		let maxBrowseBatchSize = MAX_DISCOVER_BATCH_SIZE;
		if (options.useBroadCast && queue.length) {
			try {
				if (!this.session) throw noSessionError;
				const dataValue = await this.session.read({
					nodeId: VariableIds.Server_ServerCapabilities_OperationLimits_MaxNodesPerBrowse,
					attributeId: AttributeIds.Value,
				});
				const advertisedLimit = dataValue.value.value;
				if (dataValue.statusCode.value === StatusCodes.Good.value && typeof advertisedLimit === "number" && advertisedLimit > 0) {
					maxBrowseBatchSize = Math.min(MAX_DISCOVER_BATCH_SIZE, advertisedLimit);
					spinalLog.log(`[${this.endpointUrl}] MaxNodesPerBrowse=${advertisedLimit}; using batch cap ${maxBrowseBatchSize}`);
				} else if (dataValue.statusCode.value === StatusCodes.Good.value && advertisedLimit === 0) {
					spinalLog.log(`[${this.endpointUrl}] server reports no MaxNodesPerBrowse limit; using local cap ${MAX_DISCOVER_BATCH_SIZE}`);
				} else {
					spinalLog.warn(`[${this.endpointUrl}] MaxNodesPerBrowse is unavailable (${dataValue.statusCode.toString()}); using adaptive batch sizing`);
				}
			} catch (error) {
				spinalLog.warn(`[${this.endpointUrl}] could not read MaxNodesPerBrowse; using adaptive batch sizing: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		return { maxBrowseBatchSize, batchesSinceCheckpoint };
	}

	///////////////////////////////////////////////////////////////////////////

	public async readNode(node: IOPCNode | IOPCNode[]): Promise<DataValue[]> {
		if (!this.session) throw noSessionError;

		if (!Array.isArray(node)) node = [node];
		return this.session.read(node);
	}

	public async getNodePath(nodeId: string | NodeId): Promise<string> {
		if (!this.session) throw noSessionError;

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
		const translation = await this.session.translateBrowsePath(makeBrowsePath("i=84", browsePath));
		if (!translation.targets || translation.targets.length === 0) return "";

		return `${browsePath}/${translation.targets[0]?.targetId?.toString()}`;
	}

	public async readNodeValue(node: IOPCNode | IOPCNode[]): Promise<({ dataType: string; value: any } | null)[]> {
		return (await this.readNodeValueWithInvalidNodeIds(node)).values;
	}

	public async readNodeValueWithInvalidNodeIds(node: IOPCNode | IOPCNode[]): Promise<{ values: ({ dataType: string; value: any } | null)[]; invalidNodeIds: Set<string> }> {
		await this.checkAndReestablishConnection();

		if (!this.session) throw noSessionError;

		node = Array.isArray(node) ? node : [node];
		if (node.length === 0) return { values: [], invalidNodeIds: new Set<string>() };

		const batchSize = await this._getMaxNodesPerRead();
		const batches: IOPCNode[][] = [];
		for (let i = 0; i < node.length; i += batchSize) {
			batches.push(node.slice(i, i + batchSize));
		}

		const session = this.session;
		const results = await executeConcurrently<IOPCNode[], DataValue[]>(
			batches,
			(batch) => {
				const nodesToRead = batch.map((currentNode) => ({
					nodeId: currentNode.nodeId,
					attributeId: AttributeIds.Value,
				}));
				spinalLog.log(`Reading ${batch.length} node values from ${this.endpointUrl}`);
				return session.read(nodesToRead);
			},
			MAX_CONCURRENT_READ_BATCHES,
		);

		const dataValues: DataValue[] = [];
		for (const result of results) dataValues.push(...result);

		const invalidNodeIds = new Set<string>();
		const values = dataValues.map((dataValue, index) => {
			if (!dataValue.statusCode.isGoodish()) {
				if (dataValue.statusCode.value === StatusCodes.BadNodeIdUnknown.value || dataValue.statusCode.value === StatusCodes.BadNodeIdInvalid.value) {
					invalidNodeIds.add(node[index].nodeId.toString());
				}
				return null;
			}

			return this._formatDataValue(dataValue);
		});

		return { values, invalidNodeIds };
	}

	private async _getMaxNodesPerRead(): Promise<number> {
		if (this.maxNodesPerRead !== undefined) return this.maxNodesPerRead;
		if (!this.session) throw noSessionError;

		try {
			const result = await this.session.read({
				nodeId: resolveNodeId(VariableIds.Server_ServerCapabilities_OperationLimits_MaxNodesPerRead),
				attributeId: AttributeIds.Value,
			});
			const serverLimit = result.value?.value;

			if (result.statusCode.isGood() && typeof serverLimit === "number" && serverLimit > 0) {
				this.maxNodesPerRead = Math.min(serverLimit, MAX_READ_BATCH_SIZE);
			} else {
				this.maxNodesPerRead = MAX_READ_BATCH_SIZE;
				spinalLog.warn(`Could not read a valid MaxNodesPerRead from ${this.endpointUrl}; using ${MAX_READ_BATCH_SIZE}`);
			}
		} catch (error) {
			this.maxNodesPerRead = MAX_READ_BATCH_SIZE;
			spinalLog.warn(`Could not read MaxNodesPerRead from ${this.endpointUrl}; using ${MAX_READ_BATCH_SIZE}`, error);
		}

		return this.maxNodesPerRead;
	}

	public async writeNode(node: IOPCNode, value: any): Promise<any> {
		if (!this.session) throw noSessionError;

		const PossibleDataType = await this._getPossibleDataType(value);

		try {
			let statusCode: StatusCode = StatusCodes.BadTypeMismatch;
			let isGood: boolean = false; // check we found a data type

			// test each data type until we find a good one
			while (!isGood && PossibleDataType.length) {
				const dataType = PossibleDataType.shift();
				if (!dataType) break;

				let tempValue = value;

				if (dataType == DataType.Boolean) tempValue = value == 0 ? false : true; // convert 1 and 0 to boolean
				statusCode = await (this.session as any).writeSingleNode(node.nodeId.toString(), { dataType, value: tempValue });

				if (statusCode.isGoodish()) isGood = true;
			}

			spinalLog.log("statusCode", statusCode);

			if (!isGood) throw new Error("Cannot write value: " + value + " to node: " + node.nodeId + " with any data type");
			return statusCode;
		} catch (error) {
			throw error;
		}
	}

	public async monitorItem(nodes: IOPCNode | IOPCNode[], callback: CovCallbackType, isReconnection: boolean = false, onMonitorItem?: (item: ClientMonitoredItemBase) => void): Promise<void> {
		if (!this.subscription) throw noSubscriptionError;

		nodes = Array.isArray(nodes) ? nodes : [nodes];

		// if not reconnection save the monitored items for reconnexion}
		if (!isReconnection) {
			const data = { nodes, callback, onMonitorItem };
			this.monitoredItemsData.push(data);
		}

		const { numericNodes, nonNumericNodes, nodeIdToNodeObj } = this._splitNumericAndNonNumericNodes(nodes);

		await this._monitorNodeGroup(numericNodes, callback, nodeIdToNodeObj, true, onMonitorItem);
		await this._monitorNodeGroup(nonNumericNodes, callback, nodeIdToNodeObj, false, onMonitorItem);
	}

	private async _monitorNodeGroup(nodeIds: string[], callback: CovCallbackType, nodeIdToNodeObj: Record<string, IOPCNode>, isNumeric: boolean = false, onMonitorItem?: (item: ClientMonitoredItemBase) => void): Promise<void> {
		if (!this.subscription || nodeIds.length === 0) return;

		const monitoredItems = nodeIds.map((nodeId: string) => ({ nodeId, attributeId: AttributeIds.Value }));

		const parameters = {
			samplingInterval: 3 * 1000,
			filter: new DataChangeFilter({
				trigger: DataChangeTrigger.StatusValue,
				// if the node is numeric, set a deadband of 0.1 to avoid too many notifications
				...(isNumeric ? { deadbandType: DeadbandType.Absolute, deadbandValue: 0.1 } : {}),
			}),
			discardOldest: true,
			queueSize: 1,
		};

		const monitoredItemGroup = await this.subscription.monitorItems(monitoredItems, parameters, TimestampsToReturn.Both);

		for (const monitoredItem of monitoredItemGroup.monitoredItems) {
			this._listenMonitoredItemEvents(monitoredItem, callback, nodeIdToNodeObj);
			onMonitorItem?.(monitoredItem);
		}
	}

	public async getNodeByPath(nodePath: string = ""): Promise<IOPCNode | void> {
		try {
			await this.checkAndReestablishConnection();
			if (!this.session) throw noSessionError;

			// TODO: edit the path to make sure it starts with /Objects and the entry point
			// if(!nodePath.startsWith(entryPoint)) nodePath = entryPoint + nodePath;
			if (!nodePath.startsWith("/Objects")) nodePath = "/Objects/" + nodePath;

			nodePath = normalizePath(nodePath);
			const browsePaths = makeBrowsePath("RootFolder", nodePath);

			const nodesFound = await this.session.translateBrowsePath(browsePaths);

			if (!nodesFound.targets || nodesFound.targets.length === 0) {
				throw new Error(`No node found with path: ${nodePath}`); // if no node is found, throw an error to use the second method
			}

			const startNodeId = nodesFound.targets[0].targetId?.toString();
			if (!startNodeId) throw new Error(`No node found with path: ${nodePath}`); // if no node is found, throw an error to use the second method

			const startNode = await this.readNodeDescription(startNodeId, nodePath);
			if (!startNode) throw new Error(`No node found with path: ${nodePath}`); // if no node is found, throw an error to use the second method

			return startNode; // return the node with its children and path
		} catch (error) {
			return this.searchNodeUsingTreeBrowse(nodePath); // if the first method fails, use the second method
		}
	}

	public async getNodeIdByPath(nodePath: string = ""): Promise<string | void> {
		try {
			const nodeInfo = await this.getNodeByPath(nodePath);
			if (!nodeInfo) return;

			return nodeInfo?.nodeId?.toString();
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

	public async getNodesNewInfoByPath(nodes: IOPCNode | IOPCNode[]): Promise<IOPCNode[]> {
		if (!Array.isArray(nodes)) nodes = [nodes];
		const chunkSize = 10;

		const paths = nodes.map((node) => node.path || "");

		const result = await executeConcurrently<string, IOPCNode | void>(paths, this.getNodeByPath.bind(this), chunkSize);

		return result.reduce((acc: IOPCNode[], node: IOPCNode | void, index: number) => {
			if (node) acc.push(node);
			else spinalLog.log(`Node with path ${nodes[index].path} not found anymore, it may have been deleted`);
			return acc;
		}, []);
	}

	///////////////////////////////////////////////////////////////////////////

	private _listenMonitoredItemEvents(monitoredItem: ClientMonitoredItemBase, callback: CovCallbackType, nodeIdToNode: { [key: string]: IOPCNode }) {
		const nodeId = monitoredItem.itemToMonitor.nodeId.toString();
		const node = nodeIdToNode[nodeId];

		// spinalLog.log(`Monitor ${node.path} with COV`);

		monitoredItem.on("changed", (dataValue: DataValue) => {
			const nodeId = monitoredItem.itemToMonitor.nodeId.toString();
			const node = nodeIdToNode[nodeId];
			const value: any = this._formatDataValue(dataValue);
			callback(node, value, monitoredItem);
		});

		//@ts-ignore
		monitoredItem.on("err", (err: Error) => {
			const nodeId = monitoredItem.itemToMonitor.nodeId.toString();
			const node = nodeIdToNode[nodeId];
			spinalLog.log(`[Error - COV] - ${node.path} due to: ${err.message}`);
		});
	}

	private _browseNode(node: IOPCNode | IOPCNode[]): Promise<IOPCNode[]> {
		node = Array.isArray(node) ? node : [node];

		const nodeToBrowse = node.map((n) => convertToBrowseDescription(n));

		return this._browseUsingBrowseDescription(nodeToBrowse);
	}

	private async _browseUsingBrowseDescription(descriptions: BrowseDescriptionLike[]): Promise<IOPCNode[]> {
		if (!this.session) throw noSessionError;

		const browseResults = await this.session.browse(descriptions);

		const children: IOPCNode[] = [];
		for (let i = 0; i < browseResults.length; i++) {
			const browseResult = browseResults[i];
			if (browseResult.statusCode === StatusCodes.BadTooManyOperations) {
				throw new Error(browseResult.statusCode.toString());
			}
			const parentId = (descriptions[i] as any)?.nodeId?.toString();

			const refs = browseResult.references ?? [];
			for (let j = 0; j < refs.length; j++) {
				const ref = refs[j];
				const refName = ref.displayName.text || ref.browseName?.toString();
				if (!refName || refName.startsWith(".") || NAMES_TO_IGNORE.includes(refName.toLowerCase())) continue;
				children.push(this._formatReference(ref, "", parentId));
			}
		}
		return children;
	}

	private async _addNodeToNodesObject(nodes: IOPCNode[], nodesObj: { [key: string]: IOPCNode } = {}) {
		const addedNodes: IOPCNode[] = [];
		for (const child of nodes) {
			const nodeId = child.nodeId.toString();
			if (Object.prototype.hasOwnProperty.call(nodesObj, nodeId)) continue;

			const parent = nodesObj[child.parentId];

			// create the path based on the parent node
			const nodePath = parent ? `${parent.path}/${child.browseName}/` : `/${child.browseName}`;

			child.path = normalizePath(nodePath);
			nodesObj[nodeId] = child;
			addedNodes.push(child);
		}

		return addedNodes;
	}

	private _getPossibleDataType(value: any): DataType[] {
		if (!isNaN(value) && typeof value != "boolean") {
			// if the value is a number
			const numerics = [DataType.Float, DataType.Double, DataType.Int16, DataType.Int32, DataType.Int64, DataType.UInt16, DataType.UInt32, DataType.UInt64, DataType.Byte];
			if (value == 0 || value == 1) return [...numerics, DataType.Boolean]; // if the value is 0 or 1, it can be a boolean or a numeric type

			return numerics; // if the value is a number, it can be a numeric type
		}

		if (typeof value == "string") {
			// if the value is a string
			return [DataType.String, DataType.LocalizedText, DataType.XmlElement]; // if the value is a string, it can be a string or a localized text
		}

		if (typeof value == "boolean") {
			// if the value is a boolean
			return [DataType.Boolean];
		}

		if (value instanceof Date) {
			// if the value is a Date
			return [DataType.DateTime];
		}

		return [DataType.Null]; // if the value is not recognized, return null
	}

	private async readNodeDescription(nodeId: string, path: string = ""): Promise<IOPCNode> {
		if (!this.session) throw noSessionError;

		const attributesToRead = [
			{ nodeId, attributeId: AttributeIds.BrowseName },
			{ nodeId, attributeId: AttributeIds.DisplayName },
			{ nodeId, attributeId: AttributeIds.NodeClass },
			{ nodeId, attributeId: AttributeIds.Value },
		];

		const [browseNameData, displayNameData, nodeClassData, valueData] = await this.session.read(attributesToRead);

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
			value,
		};
	}

	private async _getNodeParent(nodeId: NodeId): Promise<{ sep: string; parentNodeId: NodeId } | null> {
		if (!this.session) throw noSessionError;

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

	private async _convertObjToTree(entryPointPath: string, obj: { [key: string]: IOPCNode }): Promise<{ tree: IOPCNode; variables: string[] }> {
		let entryPoint = await this._getEntryPoint(entryPointPath);
		const variables = [];

		for (const key in obj) {
			if (Object.prototype.hasOwnProperty.call(obj, key)) {
				const node = obj[key];
				const parent = obj[node.parentId];
				if (this.isVariable(node)) variables.push(node.nodeId.toString());

				if (parent) {
					if (!parent.children) parent.children = [];
					parent.children.push(node);
				}
			}
		}

		let tree = obj[entryPoint.nodeId.toString()];
		return { tree, variables };
	}

	///////////////////////////////////////////////////////
	//                                      Utils                                                    //
	///////////////////////////////////////////////////////

	private async _getEntryPoint(entryPointPath?: string): Promise<IOPCNode> {
		if (!entryPointPath || entryPointPath === "/") entryPointPath = "/Objects";

		entryPointPath = normalizePath(`/${entryPointPath}`); // make sure the path starts with a slash and is normalized

		const node = await this.getNodeByPath(entryPointPath);
		if (node) return node;

		throw new Error(`No node found with entry point : ${entryPointPath}`);
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
			parentId,
		};
	}

	private _formatDataValue(dataValue: any): { value: any; dataType: string } | null {
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

	private _formatRealValue(value: QualifiedName | LocalizedText | any): any {
		if (value instanceof QualifiedName) value = value.name; // if the value is a QualifiedName, get the name
		if (value instanceof LocalizedText) value = value.text; // if the value is a LocalizedText, get the text

		if (value == null) value = "null";

		return value; // return the value as is
	}

	private async _readBrowseName(nodeId: NodeId): Promise<QualifiedName> {
		if (!this.session) throw noSessionError;

		const node = await this.session.read({ nodeId, attributeId: AttributeIds.BrowseName });
		return node.value.value;
	}

	////////////////////////////////////////////////// REMOVE BELOW
	public async searchNodeUsingTreeBrowse(path?: string): Promise<IOPCNode | void> {
		if (!path?.startsWith("/Objects")) path = normalizePath("/Objects" + `/${path}`);

		const rootNodeId = resolveNodeId(ObjectIds.RootFolder).toString();

		let currentNode: IOPCNode | undefined = await this.readNodeDescription(rootNodeId, ""); // RootFolder nodeId
		if (!currentNode) spinalLog.log(`RootFolder node not found`);

		const pathSplitted = path.split("/").filter((el) => el !== "");

		while (pathSplitted.length && currentNode) {
			const currentPath = (pathSplitted.shift() || "").toLowerCase();

			const children = await this._browseNode(currentNode);
			currentNode = children.find((el) => [el.browseName?.toLowerCase(), el.displayName?.toLowerCase()].includes(currentPath));
		}

		if (currentNode) return this.readNodeDescription(currentNode.nodeId.toString(), path);
		return currentNode;
	}

	private _splitNumericAndNonNumericNodes(nodes: IOPCNode[]): { numericNodes: string[]; nonNumericNodes: string[]; nodeIdToNodeObj: { [key: string]: IOPCNode } } {
		const numericNodes: string[] = [];
		const nonNumericNodes: string[] = [];
		const nodeIdToNodeObj: { [key: string]: IOPCNode } = {};

		for (const node of nodes) {
			const nodeIdStr = node.nodeId.toString();
			if (typeof node.value?.dataType !== "undefined" && isNumericDataType(node.value?.dataType)) {
				numericNodes.push(nodeIdStr);
			} else {
				nonNumericNodes.push(nodeIdStr);
			}

			nodeIdToNodeObj[nodeIdStr] = node;
		}

		return { numericNodes, nonNumericNodes, nodeIdToNodeObj };
	}
}

export default OPCUAService;

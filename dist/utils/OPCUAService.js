"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPCUAService = exports.OPCUAConnectionError = void 0;
const node_opcua_1 = require("node-opcua");
const events_1 = require("events");
const utils_1 = require("./utils");
const discoveringProcessStore_1 = require("./discoveringProcessStore");
const spinal_model_opcua_1 = require("spinal-model-opcua");
const constants_1 = require("./constants");
const OPCUAFactory_1 = require("./OPCUAFactory");
const displayLog_1 = require("./displayLog");
const userIdentity = { type: node_opcua_1.UserTokenType.Anonymous };
const DISCOVER_CHECKPOINT_BATCH_COUNT = 25; // Number of nodes to process before saving a checkpoint during discovery
const INITIAL_DISCOVER_BATCH_SIZE = 10; // Initial number of nodes to process in a batch during discovery
const MAX_DISCOVER_BATCH_SIZE = 100; // Maximum number of nodes to process in a batch during discovery
const MAX_READ_BATCH_SIZE = 100;
const MAX_CONCURRENT_READ_BATCHES = 4;
function isTooManyBrowseOperations(error) {
    const message = error instanceof Error ? error.message : String(error);
    return /BadTooManyOperations|TooManyRequests?/i.test(message);
}
class OPCUAConnectionError extends Error {
    constructor(endpointUrl, error) {
        const reason = error instanceof Error ? error.message : String(error);
        super(`failed to connect to ${endpointUrl}! due to ${reason}`);
        this.name = "OPCUAConnectionError";
    }
}
exports.OPCUAConnectionError = OPCUAConnectionError;
class OPCUAService extends events_1.EventEmitter {
    constructor(url, model) {
        super();
        this.userIdentity = { type: node_opcua_1.UserTokenType.Anonymous };
        this.verbose = false;
        this.endpointUrl = "";
        this.monitoredItemsData = [];
        this.clientAlarms = new node_opcua_1.ClientAlarmList();
        this._discoverModel = undefined; // model used to save the discovering process in the spinal system, if provided in the constructor
        this.isVariable = OPCUAService.isVariable; // static method to check if a node is a variable
        this.isReconnecting = false;
        this.endpointUrl = url;
        this._discoverModel = model;
    }
    //////////////////////////// Client connection management ////////////////////////////
    createClient() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.client)
                return this.client; // if the client already exists, return it
            // const { certificateFile, clientCertificateManager, applicationUri, applicationName } = await certificatProm;
            const client = node_opcua_1.OPCUAClient.create({
                securityMode: node_opcua_1.MessageSecurityMode.None,
                securityPolicy: node_opcua_1.SecurityPolicy.None,
                endpointMustExist: false,
                defaultSecureTokenLifetime: 2 * 60 * 1000,
                requestedSessionTimeout: 5 * 60 * 1000,
                keepSessionAlive: true,
                defaultTransactionTimeout: 60 * 1000,
                transportTimeout: 90 * 1000,
                connectionStrategy: {
                    maxRetry: 3,
                    initialDelay: 1000,
                    maxDelay: 10 * 1000,
                    randomisationFactor: 0.2, // 20% randomisation
                },
            });
            this._listenClientEvents(client);
            return client;
        });
    }
    _listenClientEvents(client) {
        client.on("backoff", (number, delay) => {
            displayLog_1.default.warn(`[${this.endpointUrl}] connection attempt ${number} failed; retrying in ${delay}ms`);
        });
        client.on("after_reconnection", () => {
            const isReconnection = true;
            for (const { nodes, callback, onMonitorItem } of this.monitoredItemsData) {
                this.monitorItem(nodes, callback, isReconnection, onMonitorItem);
            }
        });
        client.on("connection_lost", () => this.reconnect());
    }
    checkAndReestablishConnection(userIdentity) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.client && this.session)
                return;
            this.client = yield this.createClient();
            yield this.connect(userIdentity);
        });
    }
    disconnect() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.session)
                yield this.session.close();
            OPCUAFactory_1.default.resetOPCUAInstance(this.endpointUrl); // reset the instance in the factory
            if (this.client)
                yield this.client.disconnect();
        });
    }
    _createSession() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!this.client)
                    this.client = yield this.createClient();
                const session = yield this.client.createSession(this.userIdentity);
                this._listenSessionEvent(session);
                return session;
            }
            catch (err) {
                displayLog_1.default.log(" Cannot create session ", err.toString());
                throw err;
            }
        });
    }
    _listenSessionEvent(session) {
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
    createSubscription() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.session)
                this.session = yield this._createSession();
            try {
                const parameters = {
                    requestedPublishingInterval: 10 * 1000,
                    requestedLifetimeCount: 100,
                    requestedMaxKeepAliveCount: 4,
                    maxNotificationsPerPublish: 10,
                    publishingEnabled: true,
                    priority: 1, // Donne une priorité à la subscription
                };
                return this.session.createSubscription2(parameters);
            }
            catch (error) {
                displayLog_1.default.log("cannot create subscription !", error.message);
                throw error;
            }
        });
    }
    connect(userIdentity) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                this.userIdentity = userIdentity || { type: node_opcua_1.UserTokenType.Anonymous };
                if (!this.client)
                    this.client = yield this.createClient();
                yield this.client.connect(this.endpointUrl);
                this.session = yield this._createSession();
                this.subscription = yield this.createSubscription();
            }
            catch (error) {
                throw new OPCUAConnectionError(this.endpointUrl, error);
            }
        });
    }
    reconnect() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (this.isReconnecting)
                    return;
                if (!this.client)
                    this.client = yield this.createClient();
                this.isReconnecting = true;
                yield this.client.disconnect();
                yield this.connect();
                this.isReconnecting = false;
            }
            catch (error) {
                displayLog_1.default.log(`Reconnection failed to ${this.endpointUrl}`, error);
                this.isReconnecting = false;
                // OPCUAFactory.resetOPCUAInstance(this.endpointUrl); // reset the instance in the factory
            }
        });
    }
    ///////////////////////////////////////////////////////////////////////////
    //              Exemple 1 : [getTree] - Browse several node              //
    //              May have timeout error if the tree is too big            //
    ///////////////////////////////////////////////////////////////////////////
    getTree(options = { useLastResult: false, useBroadCast: true, entryPointPath: "" }) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.checkAndReestablishConnection(userIdentity);
            // get the queue and nodesObj from the last discover or create a new one
            let { nodesObj, queue, browseMode } = yield this._getDiscoverStarterData(options.entryPointPath, options.useLastResult);
            const queuedNodeIds = new Set();
            // Initialize the queuedNodeIds set with the nodeIds already in the queue to avoid duplicates
            queue = queue.filter((node) => {
                const nodeId = node.nodeId.toString();
                if (queuedNodeIds.has(nodeId))
                    return false;
                queuedNodeIds.add(nodeId);
                return true;
            });
            let { maxBrowseBatchSize, batchesSinceCheckpoint } = yield this._fetchBatchingLimits(options, queue);
            let browseBatchSize = Math.min(INITIAL_DISCOVER_BATCH_SIZE, maxBrowseBatchSize);
            displayLog_1.default.log(`browsing ${this.endpointUrl} using "${browseMode}" , it may take a long time...`);
            while (queue.length && !(0, utils_1.discoverIsCancelled)(this._discoverModel)) {
                let discoverState = null;
                let _error = null;
                const chunked = options.useBroadCast ? queue.splice(0, browseBatchSize) : [queue.shift()];
                try {
                    discoverState = spinal_model_opcua_1.OPCUA_ORGAN_STATES.discovering; // set the state to discovering
                    const children = yield this._browseNode(chunked); // browse the nodes in the queue
                    const newsItems = yield this._addNodeToNodesObject(children, nodesObj); // add the new nodes to the nodesObj
                    queue.push(...newsItems);
                    if (options.useBroadCast && chunked.length === browseBatchSize && browseBatchSize < MAX_DISCOVER_BATCH_SIZE) {
                        browseBatchSize++;
                    }
                    if (newsItems.length)
                        displayLog_1.default.log(`[${browseMode}] - ${newsItems.length} new nodes found !`); // log the number of new nodes found
                    displayLog_1.default.log(`[${browseMode}] - ${queue.length} nodes remaining in queue`); // log the number of nodes remaining in queue
                }
                catch (error) {
                    queue.unshift(...chunked); // if an error occurs, put the nodes back in the queue
                    if (options.useBroadCast && isTooManyBrowseOperations(error) && browseBatchSize > 1) {
                        const previousBatchSize = browseBatchSize;
                        maxBrowseBatchSize = Math.min(maxBrowseBatchSize, previousBatchSize - 1);
                        browseBatchSize = Math.max(1, Math.floor(browseBatchSize / 2));
                        browseBatchSize = Math.min(browseBatchSize, maxBrowseBatchSize);
                        continue;
                    }
                    _error = error;
                    discoverState = spinal_model_opcua_1.OPCUA_ORGAN_STATES.error; // set the state to error
                }
                if (!_error && queue.length === 0)
                    discoverState = spinal_model_opcua_1.OPCUA_ORGAN_STATES.discovered; // if the queue is empty, set the state to discovered
                batchesSinceCheckpoint++;
                if (_error || queue.length === 0 || batchesSinceCheckpoint >= DISCOVER_CHECKPOINT_BATCH_COUNT) {
                    yield discoveringProcessStore_1.default.saveProgress(this.endpointUrl, nodesObj, queue, discoverState);
                    batchesSinceCheckpoint = 0;
                }
                if (_error)
                    throw _error; // if an error occurs, throw it to stop the process
            }
            // if the discovering process is interrupted by user, stop the process
            if ((0, utils_1.discoverIsCancelled)(this._discoverModel)) {
                yield discoveringProcessStore_1.default.saveProgress(this.endpointUrl, nodesObj, queue, spinal_model_opcua_1.OPCUA_ORGAN_STATES.cancelled);
                return;
            }
            const { tree, variables } = yield this._convertObjToTree(options.entryPointPath, nodesObj);
            displayLog_1.default.log(`${this.endpointUrl} discovered, ${Object.keys(nodesObj).length} nodes found.`);
            return { tree, variables };
        });
    }
    _fetchBatchingLimits(options, queue) {
        return __awaiter(this, void 0, void 0, function* () {
            let batchesSinceCheckpoint = 0;
            let maxBrowseBatchSize = MAX_DISCOVER_BATCH_SIZE;
            if (options.useBroadCast && queue.length) {
                try {
                    if (!this.session)
                        throw constants_1.noSessionError;
                    const dataValue = yield this.session.read({
                        nodeId: node_opcua_1.VariableIds.Server_ServerCapabilities_OperationLimits_MaxNodesPerBrowse,
                        attributeId: node_opcua_1.AttributeIds.Value,
                    });
                    const advertisedLimit = dataValue.value.value;
                    if (dataValue.statusCode.value === node_opcua_1.StatusCodes.Good.value && typeof advertisedLimit === "number" && advertisedLimit > 0) {
                        maxBrowseBatchSize = Math.min(MAX_DISCOVER_BATCH_SIZE, advertisedLimit);
                        displayLog_1.default.log(`[${this.endpointUrl}] MaxNodesPerBrowse=${advertisedLimit}; using batch cap ${maxBrowseBatchSize}`);
                    }
                    else if (dataValue.statusCode.value === node_opcua_1.StatusCodes.Good.value && advertisedLimit === 0) {
                        displayLog_1.default.log(`[${this.endpointUrl}] server reports no MaxNodesPerBrowse limit; using local cap ${MAX_DISCOVER_BATCH_SIZE}`);
                    }
                    else {
                        displayLog_1.default.warn(`[${this.endpointUrl}] MaxNodesPerBrowse is unavailable (${dataValue.statusCode.toString()}); using adaptive batch sizing`);
                    }
                }
                catch (error) {
                    displayLog_1.default.warn(`[${this.endpointUrl}] could not read MaxNodesPerBrowse; using adaptive batch sizing: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
            return { maxBrowseBatchSize, batchesSinceCheckpoint };
        });
    }
    ///////////////////////////////////////////////////////////////////////////
    readNode(node) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.session)
                throw constants_1.noSessionError;
            if (!Array.isArray(node))
                node = [node];
            return this.session.read(node);
        });
    }
    getNodePath(nodeId) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.session)
                throw constants_1.noSessionError;
            if (typeof nodeId === "string")
                nodeId = (0, node_opcua_1.coerceNodeId)(nodeId);
            const browseName = yield this._readBrowseName(nodeId);
            const pathElements = [];
            pathElements.push(`${browseName.namespaceIndex}:${browseName.name}`);
            let parent = yield this._getNodeParent(nodeId);
            while (parent) {
                if ((0, node_opcua_1.sameNodeId)(parent.parentNodeId, (0, node_opcua_1.resolveNodeId)("RootFolder"))) {
                    break;
                }
                const browseName = yield this._readBrowseName(parent.parentNodeId);
                pathElements.unshift(`${browseName.namespaceIndex}:${browseName.name}${parent.sep}`);
                parent = yield this._getNodeParent(parent.parentNodeId);
            }
            const browsePath = "/" + pathElements.join("");
            // verification
            const translation = yield this.session.translateBrowsePath((0, node_opcua_1.makeBrowsePath)("i=84", browsePath));
            if (!translation.targets || translation.targets.length === 0)
                return "";
            return `${browsePath}/${(_b = (_a = translation.targets[0]) === null || _a === void 0 ? void 0 : _a.targetId) === null || _b === void 0 ? void 0 : _b.toString()}`;
        });
    }
    readNodeValue(node) {
        return __awaiter(this, void 0, void 0, function* () {
            return (yield this.readNodeValueWithInvalidNodeIds(node)).values;
        });
    }
    readNodeValueWithInvalidNodeIds(node) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.checkAndReestablishConnection();
            if (!this.session)
                throw constants_1.noSessionError;
            node = Array.isArray(node) ? node : [node];
            if (node.length === 0)
                return { values: [], invalidNodeIds: new Set() };
            const batchSize = yield this._getMaxNodesPerRead();
            const batches = [];
            for (let i = 0; i < node.length; i += batchSize) {
                batches.push(node.slice(i, i + batchSize));
            }
            const session = this.session;
            const results = yield (0, utils_1.executeConcurrently)(batches, (batch) => {
                const nodesToRead = batch.map((currentNode) => ({
                    nodeId: currentNode.nodeId,
                    attributeId: node_opcua_1.AttributeIds.Value,
                }));
                displayLog_1.default.log(`Reading ${batch.length} node values from ${this.endpointUrl}`);
                return session.read(nodesToRead);
            }, MAX_CONCURRENT_READ_BATCHES);
            const dataValues = [];
            for (const result of results)
                dataValues.push(...result);
            const invalidNodeIds = new Set();
            const values = dataValues.map((dataValue, index) => {
                if (!dataValue.statusCode.isGoodish()) {
                    if (dataValue.statusCode.value === node_opcua_1.StatusCodes.BadNodeIdUnknown.value || dataValue.statusCode.value === node_opcua_1.StatusCodes.BadNodeIdInvalid.value) {
                        invalidNodeIds.add(node[index].nodeId.toString());
                    }
                    return null;
                }
                return this._formatDataValue(dataValue);
            });
            return { values, invalidNodeIds };
        });
    }
    _getMaxNodesPerRead() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            if (this.maxNodesPerRead !== undefined)
                return this.maxNodesPerRead;
            if (!this.session)
                throw constants_1.noSessionError;
            try {
                const result = yield this.session.read({
                    nodeId: (0, node_opcua_1.resolveNodeId)(node_opcua_1.VariableIds.Server_ServerCapabilities_OperationLimits_MaxNodesPerRead),
                    attributeId: node_opcua_1.AttributeIds.Value,
                });
                const serverLimit = (_a = result.value) === null || _a === void 0 ? void 0 : _a.value;
                if (result.statusCode.isGood() && typeof serverLimit === "number" && serverLimit > 0) {
                    this.maxNodesPerRead = Math.min(serverLimit, MAX_READ_BATCH_SIZE);
                }
                else {
                    this.maxNodesPerRead = MAX_READ_BATCH_SIZE;
                    displayLog_1.default.warn(`Could not read a valid MaxNodesPerRead from ${this.endpointUrl}; using ${MAX_READ_BATCH_SIZE}`);
                }
            }
            catch (error) {
                this.maxNodesPerRead = MAX_READ_BATCH_SIZE;
                displayLog_1.default.warn(`Could not read MaxNodesPerRead from ${this.endpointUrl}; using ${MAX_READ_BATCH_SIZE}`, error);
            }
            return this.maxNodesPerRead;
        });
    }
    writeNode(node, value) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.session)
                throw constants_1.noSessionError;
            const PossibleDataType = yield this._getPossibleDataType(value);
            try {
                let statusCode = node_opcua_1.StatusCodes.BadTypeMismatch;
                let isGood = false; // check we found a data type
                // test each data type until we find a good one
                while (!isGood && PossibleDataType.length) {
                    const dataType = PossibleDataType.shift();
                    if (!dataType)
                        break;
                    let tempValue = value;
                    if (dataType == node_opcua_1.DataType.Boolean)
                        tempValue = value == 0 ? false : true; // convert 1 and 0 to boolean
                    statusCode = yield this.session.writeSingleNode(node.nodeId.toString(), { dataType, value: tempValue });
                    if (statusCode.isGoodish())
                        isGood = true;
                }
                displayLog_1.default.log("statusCode", statusCode);
                if (!isGood)
                    throw new Error("Cannot write value: " + value + " to node: " + node.nodeId + " with any data type");
                return statusCode;
            }
            catch (error) {
                throw error;
            }
        });
    }
    monitorItem(nodes, callback, isReconnection = false, onMonitorItem) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.subscription)
                throw constants_1.noSubscriptionError;
            nodes = Array.isArray(nodes) ? nodes : [nodes];
            // if not reconnection save the monitored items for reconnexion}
            if (!isReconnection) {
                const data = { nodes, callback, onMonitorItem };
                this.monitoredItemsData.push(data);
            }
            const { numericNodes, nonNumericNodes, nodeIdToNodeObj } = this._splitNumericAndNonNumericNodes(nodes);
            yield this._monitorNodeGroup(numericNodes, callback, nodeIdToNodeObj, true, onMonitorItem);
            yield this._monitorNodeGroup(nonNumericNodes, callback, nodeIdToNodeObj, false, onMonitorItem);
        });
    }
    _monitorNodeGroup(nodeIds, callback, nodeIdToNodeObj, isNumeric = false, onMonitorItem) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.subscription || nodeIds.length === 0)
                return;
            const monitoredItems = nodeIds.map((nodeId) => ({ nodeId, attributeId: node_opcua_1.AttributeIds.Value }));
            const parameters = {
                samplingInterval: 3 * 1000,
                filter: new node_opcua_1.DataChangeFilter(Object.assign({ trigger: node_opcua_1.DataChangeTrigger.StatusValue }, (isNumeric ? { deadbandType: node_opcua_1.DeadbandType.Absolute, deadbandValue: 0.1 } : {}))),
                discardOldest: true,
                queueSize: 1,
            };
            const monitoredItemGroup = yield this.subscription.monitorItems(monitoredItems, parameters, node_opcua_1.TimestampsToReturn.Both);
            for (const monitoredItem of monitoredItemGroup.monitoredItems) {
                this._listenMonitoredItemEvents(monitoredItem, callback, nodeIdToNodeObj);
                onMonitorItem === null || onMonitorItem === void 0 ? void 0 : onMonitorItem(monitoredItem);
            }
        });
    }
    getNodeByPath(nodePath = "") {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.checkAndReestablishConnection();
                if (!this.session)
                    throw constants_1.noSessionError;
                // TODO: edit the path to make sure it starts with /Objects and the entry point
                // if(!nodePath.startsWith(entryPoint)) nodePath = entryPoint + nodePath;
                if (!nodePath.startsWith("/Objects"))
                    nodePath = "/Objects/" + nodePath;
                nodePath = (0, utils_1.normalizePath)(nodePath);
                const browsePaths = (0, node_opcua_1.makeBrowsePath)("RootFolder", nodePath);
                const nodesFound = yield this.session.translateBrowsePath(browsePaths);
                if (!nodesFound.targets || nodesFound.targets.length === 0) {
                    throw new Error(`No node found with path: ${nodePath}`); // if no node is found, throw an error to use the second method
                }
                const startNodeId = (_a = nodesFound.targets[0].targetId) === null || _a === void 0 ? void 0 : _a.toString();
                if (!startNodeId)
                    throw new Error(`No node found with path: ${nodePath}`); // if no node is found, throw an error to use the second method
                const startNode = yield this.readNodeDescription(startNodeId, nodePath);
                if (!startNode)
                    throw new Error(`No node found with path: ${nodePath}`); // if no node is found, throw an error to use the second method
                return startNode; // return the node with its children and path
            }
            catch (error) {
                return this.searchNodeUsingTreeBrowse(nodePath); // if the first method fails, use the second method
            }
        });
    }
    getNodeIdByPath(nodePath = "") {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const nodeInfo = yield this.getNodeByPath(nodePath);
                if (!nodeInfo)
                    return;
                return (_a = nodeInfo === null || nodeInfo === void 0 ? void 0 : nodeInfo.nodeId) === null || _a === void 0 ? void 0 : _a.toString();
            }
            catch (error) {
                return;
            }
        });
    }
    static isVariable(node) {
        return node.nodeClass === node_opcua_1.NodeClass.Variable;
    }
    isObject(node) {
        return node.nodeClass === node_opcua_1.NodeClass.Object;
    }
    getNodesNewInfoByPath(nodes) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!Array.isArray(nodes))
                nodes = [nodes];
            const chunkSize = 10;
            const paths = nodes.map((node) => node.path || "");
            const result = yield (0, utils_1.executeConcurrently)(paths, this.getNodeByPath.bind(this), chunkSize);
            return result.reduce((acc, node, index) => {
                if (node)
                    acc.push(node);
                else
                    displayLog_1.default.log(`Node with path ${nodes[index].path} not found anymore, it may have been deleted`);
                return acc;
            }, []);
        });
    }
    ///////////////////////////////////////////////////////////////////////////
    _listenMonitoredItemEvents(monitoredItem, callback, nodeIdToNode) {
        const nodeId = monitoredItem.itemToMonitor.nodeId.toString();
        const node = nodeIdToNode[nodeId];
        // spinalLog.log(`Monitor ${node.path} with COV`);
        monitoredItem.on("changed", (dataValue) => {
            const nodeId = monitoredItem.itemToMonitor.nodeId.toString();
            const node = nodeIdToNode[nodeId];
            const value = this._formatDataValue(dataValue);
            callback(node, value, monitoredItem);
        });
        //@ts-ignore
        monitoredItem.on("err", (err) => {
            const nodeId = monitoredItem.itemToMonitor.nodeId.toString();
            const node = nodeIdToNode[nodeId];
            displayLog_1.default.log(`[Error - COV] - ${node.path} due to: ${err.message}`);
        });
    }
    _browseNode(node) {
        node = Array.isArray(node) ? node : [node];
        const nodeToBrowse = node.map((n) => (0, utils_1.convertToBrowseDescription)(n));
        return this._browseUsingBrowseDescription(nodeToBrowse);
    }
    _browseUsingBrowseDescription(descriptions) {
        var _a, _b, _c, _d;
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.session)
                throw constants_1.noSessionError;
            const browseResults = yield this.session.browse(descriptions);
            const children = [];
            for (let i = 0; i < browseResults.length; i++) {
                const browseResult = browseResults[i];
                if (browseResult.statusCode === node_opcua_1.StatusCodes.BadTooManyOperations) {
                    throw new Error(browseResult.statusCode.toString());
                }
                const parentId = (_b = (_a = descriptions[i]) === null || _a === void 0 ? void 0 : _a.nodeId) === null || _b === void 0 ? void 0 : _b.toString();
                const refs = (_c = browseResult.references) !== null && _c !== void 0 ? _c : [];
                for (let j = 0; j < refs.length; j++) {
                    const ref = refs[j];
                    const refName = ref.displayName.text || ((_d = ref.browseName) === null || _d === void 0 ? void 0 : _d.toString());
                    if (!refName || refName.startsWith(".") || constants_1.NAMES_TO_IGNORE.includes(refName.toLowerCase()))
                        continue;
                    children.push(this._formatReference(ref, "", parentId));
                }
            }
            return children;
        });
    }
    _addNodeToNodesObject(nodes, nodesObj = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            const addedNodes = [];
            for (const child of nodes) {
                const nodeId = child.nodeId.toString();
                if (Object.prototype.hasOwnProperty.call(nodesObj, nodeId))
                    continue;
                const parent = nodesObj[child.parentId];
                // create the path based on the parent node
                const nodePath = parent ? `${parent.path}/${child.browseName}/` : `/${child.browseName}`;
                child.path = (0, utils_1.normalizePath)(nodePath);
                nodesObj[nodeId] = child;
                addedNodes.push(child);
            }
            return addedNodes;
        });
    }
    _getPossibleDataType(value) {
        if (!isNaN(value) && typeof value != "boolean") {
            // if the value is a number
            const numerics = [node_opcua_1.DataType.Float, node_opcua_1.DataType.Double, node_opcua_1.DataType.Int16, node_opcua_1.DataType.Int32, node_opcua_1.DataType.Int64, node_opcua_1.DataType.UInt16, node_opcua_1.DataType.UInt32, node_opcua_1.DataType.UInt64, node_opcua_1.DataType.Byte];
            if (value == 0 || value == 1)
                return [...numerics, node_opcua_1.DataType.Boolean]; // if the value is 0 or 1, it can be a boolean or a numeric type
            return numerics; // if the value is a number, it can be a numeric type
        }
        if (typeof value == "string") {
            // if the value is a string
            return [node_opcua_1.DataType.String, node_opcua_1.DataType.LocalizedText, node_opcua_1.DataType.XmlElement]; // if the value is a string, it can be a string or a localized text
        }
        if (typeof value == "boolean") {
            // if the value is a boolean
            return [node_opcua_1.DataType.Boolean];
        }
        if (value instanceof Date) {
            // if the value is a Date
            return [node_opcua_1.DataType.DateTime];
        }
        return [node_opcua_1.DataType.Null]; // if the value is not recognized, return null
    }
    readNodeDescription(nodeId, path = "") {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.session)
                throw constants_1.noSessionError;
            const attributesToRead = [
                { nodeId, attributeId: node_opcua_1.AttributeIds.BrowseName },
                { nodeId, attributeId: node_opcua_1.AttributeIds.DisplayName },
                { nodeId, attributeId: node_opcua_1.AttributeIds.NodeClass },
                { nodeId, attributeId: node_opcua_1.AttributeIds.Value },
            ];
            const [browseNameData, displayNameData, nodeClassData, valueData] = yield this.session.read(attributesToRead);
            const displayName = this._formatDataValue(displayNameData);
            const browseName = this._formatDataValue(browseNameData);
            const nodeClass = nodeClassData.value.value;
            const value = this._formatDataValue(valueData);
            return {
                displayName: (displayName === null || displayName === void 0 ? void 0 : displayName.value) || "",
                browseName: (browseName === null || browseName === void 0 ? void 0 : browseName.value) || "",
                nodeId: (0, node_opcua_1.coerceNodeId)(nodeId),
                nodeClass,
                children: [],
                path,
                value,
            };
        });
    }
    _getNodeParent(nodeId) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.session)
                throw constants_1.noSessionError;
            let browseResult = yield this.session.browse({
                browseDirection: node_opcua_1.BrowseDirection.Inverse,
                includeSubtypes: true,
                nodeId,
                nodeClassMask: 0xff,
                resultMask: 0xff,
                referenceTypeId: "HasChild",
            });
            if (browseResult.statusCode === node_opcua_1.StatusCodes.Good && ((_a = browseResult.references) === null || _a === void 0 ? void 0 : _a.length)) {
                const parentNodeId = browseResult.references[0].nodeId;
                return { sep: ".", parentNodeId };
            }
            // using Organizes if HasChild is not found
            browseResult = yield this.session.browse({
                browseDirection: node_opcua_1.BrowseDirection.Inverse,
                includeSubtypes: true,
                nodeId,
                nodeClassMask: 0xff,
                resultMask: 0xff,
                referenceTypeId: "Organizes",
            });
            if (browseResult.statusCode === node_opcua_1.StatusCodes.Good && ((_b = browseResult.references) === null || _b === void 0 ? void 0 : _b.length)) {
                const parentNodeId = browseResult.references[0].nodeId;
                return { sep: "/", parentNodeId };
            }
            return null;
        });
    }
    _getDiscoverStarterData(entryPointPath, useLastResult) {
        return __awaiter(this, void 0, void 0, function* () {
            let queue, nodesObj;
            let browseMode = "unicast"; //always use unicast browsing
            try {
                if (!useLastResult)
                    throw new Error("no last result"); // throw error to force new browsing
                const data = yield discoveringProcessStore_1.default.getProgress(this.endpointUrl); // get the last discover data from the store
                nodesObj = data.nodesObj;
                queue = data.queue;
            }
            catch (error) {
                // if no last result or error in file reading, use unicast browsing
                let tree = yield this._getEntryPoint(entryPointPath);
                queue = [tree];
                nodesObj = { [tree.nodeId.toString()]: tree };
            }
            return { queue, nodesObj, browseMode };
        });
    }
    _convertObjToTree(entryPointPath, obj) {
        return __awaiter(this, void 0, void 0, function* () {
            let entryPoint = yield this._getEntryPoint(entryPointPath);
            const variables = [];
            for (const key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    const node = obj[key];
                    const parent = obj[node.parentId];
                    if (this.isVariable(node))
                        variables.push(node.nodeId.toString());
                    if (parent) {
                        if (!parent.children)
                            parent.children = [];
                        parent.children.push(node);
                    }
                }
            }
            let tree = obj[entryPoint.nodeId.toString()];
            return { tree, variables };
        });
    }
    ///////////////////////////////////////////////////////
    //                                      Utils                                                    //
    ///////////////////////////////////////////////////////
    _getEntryPoint(entryPointPath) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!entryPointPath || entryPointPath === "/")
                entryPointPath = "/Objects";
            entryPointPath = (0, utils_1.normalizePath)(`/${entryPointPath}`); // make sure the path starts with a slash and is normalized
            const node = yield this.getNodeByPath(entryPointPath);
            if (node)
                return node;
            throw new Error(`No node found with entry point : ${entryPointPath}`);
        });
    }
    _formatReference(reference, parentPath, parentId) {
        var _a;
        const name = reference.displayName.text || reference.browseName.toString();
        const browseName = (_a = reference.browseName) === null || _a === void 0 ? void 0 : _a.toString();
        parentPath = parentPath.endsWith("/") ? parentPath : `${parentPath}/`;
        return {
            displayName: name,
            browseName,
            nodeId: reference.nodeId,
            nodeClass: reference.nodeClass,
            path: parentPath + browseName,
            children: [],
            parentId,
        };
    }
    _formatDataValue(dataValue) {
        var _a, _b, _c, _d, _e;
        // if dataValue.value is not a Variant, return the value and dataType
        if (typeof dataValue.value !== "object") {
            dataValue.value = this._formatRealValue(dataValue.value); // format the value if it's not a Variant
            return dataValue;
        }
        // if dataValue.value is a Variant return the value of the Variant
        if (typeof ((_a = dataValue === null || dataValue === void 0 ? void 0 : dataValue.value) === null || _a === void 0 ? void 0 : _a.value) !== "undefined") {
            const obj = { dataType: node_opcua_1.DataType[(_b = dataValue === null || dataValue === void 0 ? void 0 : dataValue.value) === null || _b === void 0 ? void 0 : _b.dataType], value: undefined };
            if (((_c = dataValue === null || dataValue === void 0 ? void 0 : dataValue.value) === null || _c === void 0 ? void 0 : _c.arrayType) == node_opcua_1.VariantArrayType.Array) {
                obj.value = obj.value = (_d = dataValue === null || dataValue === void 0 ? void 0 : dataValue.value) === null || _d === void 0 ? void 0 : _d.value.join(",");
            }
            else {
                obj.value = this._formatRealValue((_e = dataValue === null || dataValue === void 0 ? void 0 : dataValue.value) === null || _e === void 0 ? void 0 : _e.value);
            }
            return obj;
        }
        return null;
    }
    _formatRealValue(value) {
        if (value instanceof node_opcua_1.QualifiedName)
            value = value.name; // if the value is a QualifiedName, get the name
        if (value instanceof node_opcua_1.LocalizedText)
            value = value.text; // if the value is a LocalizedText, get the text
        if (value == null)
            value = "null";
        return value; // return the value as is
    }
    _readBrowseName(nodeId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.session)
                throw constants_1.noSessionError;
            const node = yield this.session.read({ nodeId, attributeId: node_opcua_1.AttributeIds.BrowseName });
            return node.value.value;
        });
    }
    ////////////////////////////////////////////////// REMOVE BELOW
    searchNodeUsingTreeBrowse(path) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!(path === null || path === void 0 ? void 0 : path.startsWith("/Objects")))
                path = (0, utils_1.normalizePath)("/Objects" + `/${path}`);
            const rootNodeId = (0, node_opcua_1.resolveNodeId)(node_opcua_1.ObjectIds.RootFolder).toString();
            let currentNode = yield this.readNodeDescription(rootNodeId, ""); // RootFolder nodeId
            if (!currentNode)
                displayLog_1.default.log(`RootFolder node not found`);
            const pathSplitted = path.split("/").filter((el) => el !== "");
            while (pathSplitted.length && currentNode) {
                const currentPath = (pathSplitted.shift() || "").toLowerCase();
                const children = yield this._browseNode(currentNode);
                currentNode = children.find((el) => { var _a, _b; return [(_a = el.browseName) === null || _a === void 0 ? void 0 : _a.toLowerCase(), (_b = el.displayName) === null || _b === void 0 ? void 0 : _b.toLowerCase()].includes(currentPath); });
            }
            if (currentNode)
                return this.readNodeDescription(currentNode.nodeId.toString(), path);
            return currentNode;
        });
    }
    _splitNumericAndNonNumericNodes(nodes) {
        var _a, _b;
        const numericNodes = [];
        const nonNumericNodes = [];
        const nodeIdToNodeObj = {};
        for (const node of nodes) {
            const nodeIdStr = node.nodeId.toString();
            if (typeof ((_a = node.value) === null || _a === void 0 ? void 0 : _a.dataType) !== "undefined" && (0, utils_1.isNumericDataType)((_b = node.value) === null || _b === void 0 ? void 0 : _b.dataType)) {
                numericNodes.push(nodeIdStr);
            }
            else {
                nonNumericNodes.push(nodeIdStr);
            }
            nodeIdToNodeObj[nodeIdStr] = node;
        }
        return { numericNodes, nonNumericNodes, nodeIdToNodeObj };
    }
}
exports.OPCUAService = OPCUAService;
exports.default = OPCUAService;
//# sourceMappingURL=OPCUAService.js.map
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
exports.OPCUAService = void 0;
const node_opcua_1 = require("node-opcua");
const events_1 = require("events");
const lodash = require("lodash");
const utils_1 = require("./utils");
const make_certificate_1 = require("../utils/make_certificate");
const discoveringProcessStore_1 = require("./discoveringProcessStore");
const spinal_model_opcua_1 = require("spinal-model-opcua");
const constants_1 = require("./constants");
const userIdentity = { type: node_opcua_1.UserTokenType.Anonymous };
class OPCUAService extends events_1.EventEmitter {
    constructor(url, model) {
        super();
        this.userIdentity = { type: node_opcua_1.UserTokenType.Anonymous };
        this.verbose = false;
        this.endpointUrl = "";
        this.monitoredItemsListData = [];
        this.clientAlarms = new node_opcua_1.ClientAlarmList();
        this.isVariable = OPCUAService.isVariable;
        this._restartConnection = () => __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.client.disconnect();
                yield this.client.connect(this.endpointUrl);
            }
            catch (error) {
                console.log("OpcUa: restartConnection", error);
            }
        });
        this.endpointUrl = url;
        this._discoverModel = model;
        // if (typeof modelOrUrl === "string")
        //      this.endpointUrl = modelOrUrl;
        // else {
        //      const server = modelOrUrl.network.get();
        //      this.endpointUrl = getServerUrl(server);
        //      this._discoverModel = modelOrUrl;
        // }
    }
    initialize() {
        return __awaiter(this, void 0, void 0, function* () {
            const { certificateFile, clientCertificateManager, applicationUri, applicationName } = yield make_certificate_1.default;
            this.client = node_opcua_1.OPCUAClient.create({
                securityMode: node_opcua_1.MessageSecurityMode.None,
                securityPolicy: node_opcua_1.SecurityPolicy.None,
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
        });
    }
    createSubscription() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.session) {
                yield this._createSession();
            }
            try {
                const parameters = {
                    requestedPublishingInterval: 10 * 1000,
                    requestedLifetimeCount: 100,
                    requestedMaxKeepAliveCount: 4,
                    maxNotificationsPerPublish: 10,
                    publishingEnabled: true,
                    priority: 1 // Donne une priorité à la subscription
                };
                this.subscription = yield this.session.createSubscription2(parameters);
            }
            catch (error) {
                console.log("cannot create subscription !", error.message);
            }
        });
    }
    connect(userIdentity) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                this.userIdentity = userIdentity || { type: node_opcua_1.UserTokenType.Anonymous };
                yield this.client.connect(this.endpointUrl);
                yield this._createSession();
                yield this.createSubscription();
            }
            catch (error) {
                throw error;
            }
        });
    }
    disconnect() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.session) {
                const session = this.session;
                this.session = undefined;
                yield session.close();
            }
            yield this.client.disconnect();
        });
    }
    ///////////////////////////////////////////////////////////////////////////
    //              Exemple 1 : [getTree] - Browse several node              //
    //              May have timeout error if the tree is too big            //
    ///////////////////////////////////////////////////////////////////////////
    getTree(entryPointPath, options = { useLastResult: false, useBroadCast: true }) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.initialize();
            yield this.connect(userIdentity);
            // get the queue and nodesObj from the last discover or create a new one
            let { nodesObj, queue, browseMode } = yield this._getDiscoverData(entryPointPath, options.useLastResult);
            console.log(`browsing ${this.endpointUrl} using "${browseMode}" , it may take a long time...`);
            while (queue.length && !(0, utils_1.discoverIsCancelled)(this._discoverModel)) {
                let discoverState = null;
                let _error = null;
                // chunk the queue to avoid timeout errors
                const chunked = options.useBroadCast ? queue.splice(0, 10) : [queue.shift()];
                try {
                    discoverState = spinal_model_opcua_1.OPCUA_ORGAN_STATES.discovering; // set the state to discovering
                    const newsItems = yield this._getChildrenAndAddToObj(chunked, nodesObj);
                    queue.push(...newsItems);
                    if (newsItems.length)
                        console.log(`[${browseMode}] - ${newsItems.length} new nodes found !`); // log the number of new nodes found
                    console.log(`[${browseMode}] - ${queue.length} nodes remaining in queue`); // log the number of nodes remaining in queue
                }
                catch (error) {
                    queue.unshift(...chunked); // if an error occurs, put the nodes back in the queue
                    _error = error;
                    discoverState = spinal_model_opcua_1.OPCUA_ORGAN_STATES.error; // set the state to error
                }
                if (!_error && queue.length === 0)
                    discoverState = spinal_model_opcua_1.OPCUA_ORGAN_STATES.discovered; // if the queue is empty, set the state to discovered
                yield discoveringProcessStore_1.default.saveProgress(this.endpointUrl, nodesObj, queue, discoverState); // save the progress in the store
                if (_error)
                    throw _error; // if an error occurs, throw it to stop the process
            }
            // if the discovering process is interrupted by user, stop the process
            if ((0, utils_1.discoverIsCancelled)(this._discoverModel))
                return;
            const { tree, variables } = yield this._convertObjToTree(entryPointPath, nodesObj);
            console.log(`${this.endpointUrl} discovered, ${Object.keys(nodesObj).length} nodes found.`);
            return { tree, variables };
        });
    }
    ///////////////////////////////////////////////////////////////////////////
    //                                      Exemple 2 : getTree (take a lot of time)                         //
    ///////////////////////////////////////////////////////////////////////////
    // public async getTree2(entryPointPath?: string): Promise<any> {
    //      console.log("discovering", this.endpointUrl || "", "inside getTree2, may take up to 1 hour or more...");
    //      const tree = await this._getEntryPoint(entryPointPath);
    //      const queue: any[] = [tree];
    //      const variables = [];
    //      const nodesObj = { [tree.nodeId.toString()]: tree };
    //      while (queue.length) {
    //              const node = queue.shift();
    //              let _error = null;
    //              let discoverState = OPCUA_ORGAN_STATES.discovering;
    //              try {
    //                      console.log("[getTree2] browsing", node.displayName);
    //                      // if (this.isVariable(node)) variables.push(node.nodeId.toString());
    //                      // const children = await this._browseNode(node);
    //                      // node.children = children;
    //                      // queue.push(...children);
    //                      const children = await this._getChildrenAndAddToObj([node], nodesObj, variables);
    //                      queue.push(...children);
    //              } catch (error) {
    //                      discoverState = OPCUA_ORGAN_STATES.error;
    //                      queue.unshift(node);
    //                      _error = error;
    //                      console.log("error", error);
    //              }
    //              if (!_error && queue.length === 0) discoverState = OPCUA_ORGAN_STATES.discovered;
    //              await discoveringStore.saveProgress(this.endpointUrl, tree, queue, discoverState);
    //              if (_error) throw _error;
    //      }
    //      return { tree, variables };
    // }
    browseNodeRec(node) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log("browsing", node.displayName, "inside browseNodeRec");
            const children = yield this._browseNode(node);
            for (const child of children) {
                yield this.browseNodeRec(child);
            }
            node.children = children;
            return children;
        });
    }
    ///////////////////////////////////////////////////////////////////////////
    _getChildrenAndAddToObj(nodes, nodesObj = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            const children = yield this._browseNode(nodes);
            for (const child of children) {
                const parent = nodesObj[child.parentId];
                // create the path based on the parent node
                const path = parent ? `${parent.path}/${child.browseName}/` : `/${child.browseName}`;
                child.path = (0, utils_1.normalizePath)(path);
                nodesObj[child.nodeId.toString()] = child;
            }
            return children;
        });
    }
    extractBrowsePath(nodeId) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
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
            const a = yield this.session.translateBrowsePath((0, node_opcua_1.makeBrowsePath)("i=84", browsePath));
            return browsePath + " (" + ((_b = (_a = a.targets[0]) === null || _a === void 0 ? void 0 : _a.targetId) === null || _b === void 0 ? void 0 : _b.toString()) + ")";
        });
    }
    readNodeValue(node) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.initialize();
            yield this.connect(userIdentity);
            if (!this.session) {
                this._createSession();
            }
            node = Array.isArray(node) ? node : [node];
            const nodesChunk = lodash.chunk(node, 500);
            const _promise = nodesChunk.reduce((prom, chunk) => __awaiter(this, void 0, void 0, function* () {
                let list = yield prom;
                const values = yield this.readNode(chunk);
                list.push(...values);
                return list;
            }), Promise.resolve([]));
            const dataValues = yield _promise;
            yield this.disconnect();
            return dataValues.map((dataValue) => this._formatDataValue(dataValue));
        });
    }
    writeNode(node, value) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.session) {
                yield this._createSession();
            }
            // const { dataType, arrayDimension, valueRank } = await this._getNodesDetails(node);
            const PossibleDataType = yield this._getDataType(value);
            try {
                let statusCode;
                let isGood = false; // check we found a data type
                while (!isGood && PossibleDataType.length) {
                    const dataType = PossibleDataType.shift();
                    if (!dataType)
                        throw new Error("No data type found for value: " + value);
                    let tempValue = value;
                    if (dataType == node_opcua_1.DataType.Boolean)
                        tempValue = value == 0 ? false : true; // convert 1 and 0 to boolean
                    statusCode = yield this.session.writeSingleNode(node.nodeId.toString(), { dataType, value: tempValue });
                    if (statusCode.isGoodish())
                        isGood = true;
                }
                return node_opcua_1.StatusCodes;
                // const _value = this._parseValue(valueRank, arrayDimension, dataType, value);
                // console.log("Value in writeNode() => ", _value);
                // const writeValue = new WriteValue({
                // 	nodeId: node.nodeId,
                // 	attributeId: AttributeIds.Value,
                // 	value: { value: _value },
                // });
                // let statusCode = await this.session.write(writeValue);
                // return statusCode;
            }
            catch (error) {
                console.log("error writing value", error);
                return node_opcua_1.StatusCodes.BadInternalError;
            }
        });
    }
    monitorItem(nodeIds, callback) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.subscription) {
                yield this.createSubscription();
            }
            ;
            nodeIds = Array.isArray(nodeIds) ? nodeIds : [nodeIds];
            const monitoredItems = nodeIds.map((nodeId) => ({ nodeId: nodeId, attributeId: node_opcua_1.AttributeIds.Value }));
            const parameters = {
                samplingInterval: 3 * 1000,
                filter: new node_opcua_1.DataChangeFilter({
                    trigger: node_opcua_1.DataChangeTrigger.StatusValue,
                    // deadbandType: DeadbandType.Absolute,
                    // deadbandValue: 0.5
                }),
                discardOldest: true,
                queueSize: 1
            };
            const monitoredItemGroup = yield this.subscription.monitorItems(monitoredItems, parameters, node_opcua_1.TimestampsToReturn.Both);
            for (const monitoredItem of monitoredItemGroup.monitoredItems) {
                this._listenMonitoredItemEvents(monitoredItem, callback);
            }
        });
    }
    ///////////////////////////////////////////////////////////////////////////
    _listenMonitoredItemEvents(monitoredItem, callback) {
        monitoredItem.on("changed", (dataValue) => {
            const value = this._formatDataValue(dataValue);
            callback(monitoredItem.itemToMonitor.nodeId.toString(), value, monitoredItem);
        });
        monitoredItem.on("err", (err) => {
            console.log(`[Error - COV] - ${monitoredItem.itemToMonitor.nodeId.toString()} : ${err}`);
        });
    }
    _browseNode(node) {
        node = Array.isArray(node) ? node : [node];
        // const nodeToBrowse = node.reduce((list, n) => {
        // 	const configs = convertToBrowseDescription(n);
        // 	list.push(...configs);
        // 	return list;
        // }, []);
        const nodeToBrowse = node.map((n) => (0, utils_1.convertToBrowseDescription)(n)).flat();
        return this._browseUsingBrowseDescription(nodeToBrowse);
    }
    _browseUsingBrowseDescription(descriptions) {
        return __awaiter(this, void 0, void 0, function* () {
            const browseResults = yield this.session.browse(descriptions);
            return browseResults.reduce((children, browseResult, index) => {
                var _a, _b, _c;
                const parentId = (_b = (_a = descriptions[index]) === null || _a === void 0 ? void 0 : _a.nodeId) === null || _b === void 0 ? void 0 : _b.toString();
                for (const ref of browseResult.references) {
                    const refName = ref.displayName.text || ((_c = ref.browseName) === null || _c === void 0 ? void 0 : _c.toString());
                    if (!refName || refName.startsWith(".") || constants_1.NAMES_TO_IGNORE.includes(refName.toLowerCase()))
                        continue; // skip unwanted nodes
                    const formatted = this._formatReference(ref, "", parentId);
                    children.push(formatted);
                }
                return children;
            }, []);
            // const references = browseResults.map((el) => el.references).flat(); // each browseResult has an array of references for each description;
            // return references.reduce((list, ref, index) => {
            //      const refName = ref.displayName.text || ref.browseName?.toString();
            //      if (!refName || refName.toLowerCase() === "server" || refName[0] === ".") return list; // skip server and hidden nodes
            //      const parentId = (descriptions[index] as any)?.nodeId?.toString();
            //      const formatted = this._formatReference(ref, "", parentId);
            //      list.push(formatted);
            //      return list;
            // }, []);
        });
    }
    _getDataType(value) {
        // try {
        // 	const dataTypeId = resolveNodeId(nodeId);
        // 	const dataType = await findBasicDataType(this.session, dataTypeId);
        // 	return dataType;
        // } catch (error) {
        // 	return this.detectOPCUAValueType(nodeId);
        // }
        if (!isNaN(value)) {
            const numerics = [node_opcua_1.DataType.Float, node_opcua_1.DataType.Double, node_opcua_1.DataType.Int16, node_opcua_1.DataType.Int32, node_opcua_1.DataType.Int64, node_opcua_1.DataType.UInt16, node_opcua_1.DataType.UInt32, node_opcua_1.DataType.UInt64];
            if (value == 0 || value == 1)
                return [...numerics, node_opcua_1.DataType.Boolean]; // if the value is 0 or 1, it can be a boolean or a numeric type
            return numerics; // if the value is a number, it can be a numeric type
        }
        if (typeof value == "string") {
            return [node_opcua_1.DataType.String, node_opcua_1.DataType.LocalizedText, node_opcua_1.DataType.XmlElement]; // if the value is a string, it can be a string or a localized text
        }
        if (typeof value == "boolean") {
            return [node_opcua_1.DataType.Boolean];
        }
        if (value instanceof Date) {
            return [node_opcua_1.DataType.DateTime];
        }
        return [node_opcua_1.DataType.Null]; // if the value is not recognized, return null
    }
    readNodeDescription(nodeId, path = "") {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            const attributesToRead = [
                { nodeId, attributeId: node_opcua_1.AttributeIds.BrowseName },
                { nodeId, attributeId: node_opcua_1.AttributeIds.DisplayName },
                { nodeId, attributeId: node_opcua_1.AttributeIds.NodeClass },
            ];
            const [displayNameData, browseNameData, nodeClassData] = yield this.session.read(attributesToRead);
            const displayName = ((_a = displayNameData.value.value) === null || _a === void 0 ? void 0 : _a.text) || "";
            const browseName = ((_b = browseNameData.value.value) === null || _b === void 0 ? void 0 : _b.name) || "";
            const nodeClass = nodeClassData.value.value;
            return {
                displayName,
                browseName,
                nodeId: (0, node_opcua_1.coerceNodeId)(nodeId),
                nodeClass,
                children: [],
                path,
            };
        });
    }
    // private async _getNodesDetails(node: IOPCNode) {
    // 	const arrayDimensionDataValue = await this.session.read({ nodeId: node.nodeId, attributeId: AttributeIds.ArrayDimensions });
    // 	const valueRankDataValue = await this.session.read({ nodeId: node.nodeId, attributeId: AttributeIds.ValueRank });
    // 	const arrayDimension = arrayDimensionDataValue.value.value as null | number[];
    // 	const valueRank = valueRankDataValue.value.value as number;
    // 	const dataType = await this._getDataType(node.nodeId.toString());
    // 	return { dataType, arrayDimension, valueRank };
    // }
    _getNodeParent(nodeId) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
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
    _getDiscoverData(entryPointPath, useLastResult) {
        return __awaiter(this, void 0, void 0, function* () {
            let queue, nodesObj, browseMode;
            try {
                if (!useLastResult)
                    throw new Error("no last result"); // throw error to force unicast browsing
                browseMode = "Multicast";
                const data = yield discoveringProcessStore_1.default.getProgress(this.endpointUrl);
                nodesObj = data.nodesObj;
                queue = data.queue;
            }
            catch (error) {
                // if no last result or error in file reading, use unicast browsing
                browseMode = "unicast";
                let tree = yield this._getEntryPoint(entryPointPath);
                queue = [tree];
                nodesObj = { [tree.nodeId.toString()]: tree };
            }
            return { queue, nodesObj, browseMode };
        });
    }
    _convertTreeToObject(tree) {
        return __awaiter(this, void 0, void 0, function* () {
            const obj = {};
            const variables = [];
            const stack = [tree];
            while (stack.length) {
                const node = stack.shift();
                obj[node.nodeId.toString()] = node;
                if (this.isVariable(node))
                    variables.push(node);
                stack.push(...node.children);
            }
            return { obj, variables };
        });
    }
    _convertObjToTree(entryPointPath, obj) {
        return __awaiter(this, void 0, void 0, function* () {
            let tree = yield this._getEntryPoint(entryPointPath);
            const variables = [];
            for (const key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    const node = obj[key];
                    const parent = obj[node.parentId];
                    if (this.isVariable(node))
                        variables.push(node.nodeId.toString());
                    if (parent)
                        parent.children.push(node);
                }
            }
            tree = obj[tree.nodeId.toString()];
            return { tree, variables };
        });
    }
    ////////////////////////////////////////////////////////////
    //                                                      Client                                            //
    ////////////////////////////////////////////////////////////
    _createSession(client) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const session = yield (client || this.client).createSession(this.userIdentity);
                if (!client) { // if no client is provided, set the session to the instance variable
                    this.session = session;
                    this._listenSessionEvent();
                }
                return session;
            }
            catch (err) {
                console.log(" Cannot create session ", err.toString());
            }
        });
    }
    _listenClientEvents() {
        this.client.on("backoff", (number, delay) => {
            if (number === 1)
                return this.client.disconnect();
            console.log(`connection failed, retrying attempt ${number + 1}`);
        });
        this.client.on("start_reconnection", () => console.log("Starting reconnection...." + this.endpointUrl));
        this.client.on("connection_reestablished", () => console.log("CONNECTION RE-ESTABLISHED !! " + this.endpointUrl));
        // monitoring des lifetimes
        this.client.on("lifetime_75", (token) => {
            if (this.verbose)
                console.log("received lifetime_75 on " + this.endpointUrl);
        });
        this.client.on("security_token_renewed", () => {
            if (this.verbose)
                console.log(" security_token_renewed on " + this.endpointUrl);
        });
        this.client.on("timed_out_request", (request) => {
            this.emit("timed_out_request", request);
        });
    }
    _listenSessionEvent() {
        this.session.on("session_closed", () => {
            // console.log(" Warning => Session closed");
        });
        this.session.on("keepalive", () => {
            // console.log("session keepalive");
        });
        this.session.on("keepalive_failure", () => {
            this._restartConnection();
        });
    }
    ///////////////////////////////////////////////////////
    //                                      Utils                                                    //
    ///////////////////////////////////////////////////////
    _getEntryPoint(entryPointPath) {
        return __awaiter(this, void 0, void 0, function* () {
            let root = {
                displayName: "Root",
                nodeId: node_opcua_1.ObjectIds.RootFolder,
                path: "/",
                children: [],
            };
            if (!entryPointPath || entryPointPath === "/")
                entryPointPath = "/Objects";
            if (!entryPointPath.startsWith("/"))
                entryPointPath = "/" + entryPointPath;
            return this._getEntryPointWithPath(root, entryPointPath);
        });
    }
    _getEntryPointWithPath(start, entryPointPath) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!entryPointPath.startsWith("/Objects"))
                    entryPointPath = "/Objects" + entryPointPath;
                const browsePaths = (0, node_opcua_1.makeBrowsePath)("RootFolder", entryPointPath);
                const nodesFound = yield this.session.translateBrowsePath(browsePaths);
                if (!nodesFound.targets || nodesFound.targets.length === 0) {
                    throw `No node found with entry point : ${entryPointPath}`;
                }
                const startNodeId = (_a = nodesFound.targets[0].targetId) === null || _a === void 0 ? void 0 : _a.toString();
                if (!startNodeId)
                    throw `No node found with entry point : ${entryPointPath}`;
                const startNode = yield this.readNodeDescription(startNodeId, entryPointPath);
                return startNode; // return the node with its children and path
                return;
            }
            catch (error) {
                throw `No node found with entry point : ${entryPointPath}`;
            }
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
            parentId
        };
    }
    _formatDataValue(dataValue) {
        var _a, _b, _c, _d, _e;
        // if dataValue.value is a Variant return the value of the Variant
        if (typeof ((_a = dataValue === null || dataValue === void 0 ? void 0 : dataValue.value) === null || _a === void 0 ? void 0 : _a.value) !== "undefined") {
            const obj = { dataType: node_opcua_1.DataType[(_b = dataValue === null || dataValue === void 0 ? void 0 : dataValue.value) === null || _b === void 0 ? void 0 : _b.dataType], value: undefined };
            switch ((_c = dataValue === null || dataValue === void 0 ? void 0 : dataValue.value) === null || _c === void 0 ? void 0 : _c.arrayType) {
                /*case VariantArrayType.Scalar:
                    obj.value = dataValue?.value?.value;
                    break;
                    */
                case node_opcua_1.VariantArrayType.Array:
                    obj.value = (_d = dataValue === null || dataValue === void 0 ? void 0 : dataValue.value) === null || _d === void 0 ? void 0 : _d.value.join(",");
                    break;
                default:
                    let value = (_e = dataValue === null || dataValue === void 0 ? void 0 : dataValue.value) === null || _e === void 0 ? void 0 : _e.value;
                    if (value == null)
                        value = "null";
                    obj.value = value;
                    break;
            }
            return obj;
        }
        // if dataValue.value is not a Variant, return the value and dataType
        if (typeof dataValue.value !== "object") {
            if (dataValue.value == null)
                dataValue.value = "null";
            return dataValue;
        }
        return null;
    }
    _readBrowseName(nodeId) {
        return __awaiter(this, void 0, void 0, function* () {
            const node = yield this.session.read({ nodeId, attributeId: node_opcua_1.AttributeIds.BrowseName });
            return node.value.value;
        });
    }
    static isVariable(node) {
        return node.nodeClass === node_opcua_1.NodeClass.Variable;
    }
    isObject(node) {
        return node.nodeClass === node_opcua_1.NodeClass.Object;
    }
    _parseValue(valueRank, arrayDimension, dataType, value) {
        const arrayType = valueRank === -1 ? node_opcua_1.VariantArrayType.Scalar : valueRank === 1 ? node_opcua_1.VariantArrayType.Array : node_opcua_1.VariantArrayType.Matrix;
        const dimensions = arrayType === node_opcua_1.VariantArrayType.Matrix ? arrayDimension : undefined;
        const _value = new node_opcua_1.Variant({
            dataType,
            arrayType,
            dimensions,
            value: (0, utils_1.coerceStringToDataType)(dataType, arrayType, node_opcua_1.VariantArrayType, value),
        });
        return _value;
    }
    readNode(node) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!Array.isArray(node))
                node = [node];
            return this.session.read(node);
        });
    }
    detectOPCUAValueType(nodeId) {
        return __awaiter(this, void 0, void 0, function* () {
            const resValue = yield this.readNodeValue({ nodeId: (0, node_opcua_1.coerceNodeId)(nodeId) });
            const value = resValue[0];
            if (!value)
                return;
            if (value.dataType)
                return node_opcua_1.DataType[value.dataType];
            return node_opcua_1.DataType[typeof value.value];
        });
    }
}
exports.OPCUAService = OPCUAService;
exports.default = OPCUAService;
//# sourceMappingURL=OPCUAService.js.map
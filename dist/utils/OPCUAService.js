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
const OPCUAFactory_1 = require("./OPCUAFactory");
const userIdentity = { type: node_opcua_1.UserTokenType.Anonymous };
class OPCUAService extends events_1.EventEmitter {
    constructor(url, model) {
        super();
        this.userIdentity = { type: node_opcua_1.UserTokenType.Anonymous };
        this.verbose = false;
        this.endpointUrl = "";
        this.monitoredItemsData = [];
        this.clientAlarms = new node_opcua_1.ClientAlarmList();
        this.isVariable = OPCUAService.isVariable; // static method to check if a node is a variable
        this.isReconnecting = false;
        this.endpointUrl = url;
        this._discoverModel = model;
    }
    checkAndRetablishConnection() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.client && this.session)
                return;
            yield this.createClient();
            yield this.connect(userIdentity);
        });
    }
    disconnect() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.session) {
                const session = this.session;
                this.session = undefined;
                yield session.close();
            }
            OPCUAFactory_1.default.resetOPCUAInstance(this.endpointUrl); // reset the instance in the factory
            yield this.client.disconnect();
        });
    }
    ///////////////////////////////////////////////////////////////////////////
    //              Exemple 1 : [getTree] - Browse several node              //
    //              May have timeout error if the tree is too big            //
    ///////////////////////////////////////////////////////////////////////////
    getTree(entryPointPath, options = { useLastResult: false, useBroadCast: true }) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.createClient();
            yield this.connect(userIdentity);
            // get the queue and nodesObj from the last discover or create a new one
            let { nodesObj, queue, browseMode } = yield this._getDiscoverStarterData(entryPointPath, options.useLastResult);
            console.log(`browsing ${this.endpointUrl} using "${browseMode}" , it may take a long time...`);
            while (queue.length && !(0, utils_1.discoverIsCancelled)(this._discoverModel)) {
                let discoverState = null;
                let _error = null;
                // chunk the queue to avoid timeout errors
                const chunked = options.useBroadCast ? queue.splice(0, 10) : [queue.shift()];
                try {
                    discoverState = spinal_model_opcua_1.OPCUA_ORGAN_STATES.discovering; // set the state to discovering
                    const children = yield this._browseNode(chunked); // browse the nodes in the queue
                    const newsItems = yield this._addNodeToNodesObject(children, nodesObj); // add the new nodes to the nodesObj
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
    readNode(node) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!Array.isArray(node))
                node = [node];
            return this.session.read(node);
        });
    }
    getNodePath(nodeId) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
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
            const a = yield this.session.translateBrowsePath((0, node_opcua_1.makeBrowsePath)("i=84", browsePath));
            return browsePath + " (" + ((_b = (_a = a.targets[0]) === null || _a === void 0 ? void 0 : _a.targetId) === null || _b === void 0 ? void 0 : _b.toString()) + ")";
        });
    }
    readNodeValue(node) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.checkAndRetablishConnection();
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
            const PossibleDataType = yield this._getPossibleDataType(value);
            try {
                let statusCode;
                let isGood = false; // check we found a data type
                // test each data type until we find a good one
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
                console.log("statusCode", statusCode);
                if (!isGood)
                    throw new Error("Cannot write value: " + value + " to node: " + node.nodeId + " with any data type");
                return statusCode;
            }
            catch (error) {
                // console.log("error writing value", error);
                // return StatusCodes.BadInternalError;
                throw error;
            }
        });
    }
    monitorItem(nodeIds, callback, isReconnection = false) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.subscription) {
                yield this.createSubscription();
            }
            ;
            nodeIds = Array.isArray(nodeIds) ? nodeIds : [nodeIds];
            // if not reconnection save the monitored items for reconnexion}
            if (!isReconnection) {
                const data = { ids: nodeIds, callback };
                this.monitoredItemsData.push(data);
            }
            const monitoredItems = nodeIds.map((nodeId) => ({ nodeId: nodeId, attributeId: node_opcua_1.AttributeIds.Value }));
            const parameters = {
                samplingInterval: 3 * 1000,
                filter: new node_opcua_1.DataChangeFilter({
                    trigger: node_opcua_1.DataChangeTrigger.StatusValue,
                    deadbandType: node_opcua_1.DeadbandType.Absolute,
                    deadbandValue: 0.1
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
    getNodeIdByPath(path) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!path.startsWith("/Objects"))
                    path = "/Objects" + path;
                if (path.endsWith("/"))
                    path = path.slice(0, -1); // remove trailing slash
                const browsePaths = (0, node_opcua_1.makeBrowsePath)("RootFolder", path);
                const nodesFound = yield this.session.translateBrowsePath(browsePaths);
                if (!nodesFound.targets || nodesFound.targets.length === 0)
                    return;
                return (_a = nodesFound.targets[0].targetId) === null || _a === void 0 ? void 0 : _a.toString();
            }
            catch (error) {
                return;
            }
        });
    }
    getNodeByPath(path) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const startNodeId = yield this.getNodeIdByPath(path);
                if (!startNodeId)
                    return;
                const startNode = yield this.readNodeDescription(startNodeId, path);
                return startNode; // return the node with its children and path
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
        if (!Array.isArray(nodes))
            nodes = [nodes];
        const promises = nodes.map(node => this.getNodeByPath(node.path));
        return Promise.all(promises).then((result) => {
            return result;
        });
    }
    ///////////////////////////////////////////////////////////////////////////
    createClient() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.client) {
                const { certificateFile, clientCertificateManager, applicationUri, applicationName } = yield make_certificate_1.default;
                this.client = node_opcua_1.OPCUAClient.create({
                    securityMode: node_opcua_1.MessageSecurityMode.None,
                    securityPolicy: node_opcua_1.SecurityPolicy.None,
                    endpointMustExist: false,
                    defaultSecureTokenLifetime: 30 * 1000,
                    requestedSessionTimeout: 50 * 1000,
                    keepSessionAlive: true,
                    transportTimeout: 5 * 60 * 1000,
                    connectionStrategy: {
                        maxRetry: 3,
                        initialDelay: 1000,
                        // maxDelay: 10 * 1000,
                    },
                });
                this._listenClientEvents();
            }
            return this.client;
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
    reconnect() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (this.isReconnecting)
                    return;
                this.isReconnecting = true;
                yield this.client.disconnect();
                yield this.connect();
                this.isReconnecting = false;
            }
            catch (error) {
                console.log(`Reconnection failed to ${this.endpointUrl}`, error);
                this.isReconnecting = false;
                // OPCUAFactory.resetOPCUAInstance(this.endpointUrl); // reset the instance in the factory
            }
        });
    }
    _listenMonitoredItemEvents(monitoredItem, callback) {
        console.log(`Monitor ${monitoredItem.itemToMonitor.nodeId.toString()} with COV`);
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
        });
    }
    _addNodeToNodesObject(nodes, nodesObj = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            for (const child of nodes) {
                const parent = nodesObj[child.parentId];
                // create the path based on the parent node
                const path = parent ? `${parent.path}/${child.browseName}/` : `/${child.browseName}`;
                child.path = (0, utils_1.normalizePath)(path);
                nodesObj[child.nodeId.toString()] = child;
            }
            return nodes;
        });
    }
    _getPossibleDataType(value) {
        if (!isNaN(value)) { // if the value is a number
            const numerics = [node_opcua_1.DataType.Float, node_opcua_1.DataType.Double, node_opcua_1.DataType.Int16, node_opcua_1.DataType.Int32, node_opcua_1.DataType.Int64, node_opcua_1.DataType.UInt16, node_opcua_1.DataType.UInt32, node_opcua_1.DataType.UInt64];
            if (value == 0 || value == 1)
                return [...numerics, node_opcua_1.DataType.Boolean]; // if the value is 0 or 1, it can be a boolean or a numeric type
            return numerics; // if the value is a number, it can be a numeric type
        }
        if (typeof value == "string") { // if the value is a string
            return [node_opcua_1.DataType.String, node_opcua_1.DataType.LocalizedText, node_opcua_1.DataType.XmlElement]; // if the value is a string, it can be a string or a localized text
        }
        if (typeof value == "boolean") { // if the value is a boolean
            return [node_opcua_1.DataType.Boolean];
        }
        if (value instanceof Date) { // if the value is a Date
            return [node_opcua_1.DataType.DateTime];
        }
        return [node_opcua_1.DataType.Null]; // if the value is not recognized, return null
    }
    readNodeDescription(nodeId, path = "") {
        return __awaiter(this, void 0, void 0, function* () {
            const attributesToRead = [
                { nodeId, attributeId: node_opcua_1.AttributeIds.BrowseName },
                { nodeId, attributeId: node_opcua_1.AttributeIds.DisplayName },
                { nodeId, attributeId: node_opcua_1.AttributeIds.NodeClass },
                { nodeId, attributeId: node_opcua_1.AttributeIds.Value },
            ];
            const [displayNameData, browseNameData, nodeClassData, valueData] = yield this.session.read(attributesToRead);
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
                value
            };
        });
    }
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
    ///////////////////////////////////////////////////////
    //                                      Utils                                                    //
    ///////////////////////////////////////////////////////
    _getEntryPoint(entryPointPath) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!entryPointPath || entryPointPath === "/")
                entryPointPath = "/Objects";
            if (!entryPointPath.startsWith("/"))
                entryPointPath = "/" + entryPointPath;
            const node = yield this.getNodeByPath(entryPointPath);
            if (node)
                return node;
            throw `No node found with entry point : ${entryPointPath}`;
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
            const node = yield this.session.read({ nodeId, attributeId: node_opcua_1.AttributeIds.BrowseName });
            return node.value.value;
        });
    }
    ////////////////////////////////////////////////////////////
    //                       Client                           //
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
            // if (number === 1) return this.client.disconnect();
            // console.log(`connection failed, retrying attempt ${number + 1}`)
        });
        // this.client.on("start_reconnection", () => console.log("Starting reconnection to" + this.endpointUrl));
        this.client.on("after_reconnection", () => {
            const isReconnection = true;
            for (const { ids, callback } of this.monitoredItemsData) {
                this.monitorItem(ids, callback, isReconnection);
            }
        });
        this.client.on("connection_lost", () => {
            this.reconnect();
        });
        // this.client.on("connection_reestablished", () => console.log("CONNECTION RE-ESTABLISHED !! " + this.endpointUrl));
        // // monitoring des lifetimes
        // this.client.on("lifetime_75", (token) => {
        // 	if (this.verbose) console.log("received lifetime_75 on " + this.endpointUrl);
        // });
        // this.client.on("security_token_renewed", () => {
        // 	if (this.verbose) console.log(" security_token_renewed on " + this.endpointUrl);
        // });
        // this.client.on("timed_out_request", (request) => {
        // 	this.emit("timed_out_request", request);
        // });
    }
    _listenSessionEvent() {
        this.session.on("session_closed", () => {
            // console.log(" Warning => Session closed");
            this.reconnect();
        });
        // this.session.on("keepalive", () => {
        // 	// console.log("session keepalive");
        // })
        this.session.on("keepalive_failure", () => {
            this.reconnect();
        });
    }
}
exports.OPCUAService = OPCUAService;
exports.default = OPCUAService;
//# sourceMappingURL=OPCUAService.js.map
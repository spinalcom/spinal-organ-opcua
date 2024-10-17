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
exports.w = exports.OPCUAService = void 0;
const node_opcua_1 = require("node-opcua");
const events_1 = require("events");
const lodash = require("lodash");
const utils_1 = require("./utils");
const make_certificate_1 = require("../utils/make_certificate");
const securityMode = node_opcua_1.MessageSecurityMode["None"];
const securityPolicy = node_opcua_1.SecurityPolicy["None"];
const userIdentity = { type: node_opcua_1.UserTokenType.Anonymous };
class OPCUAService extends events_1.EventEmitter {
    constructor() {
        super();
        this.userIdentity = { type: node_opcua_1.UserTokenType.Anonymous };
        this.verbose = false;
        this.endpointUrl = "";
        this.monitoredItemsListData = [];
        this.clientAlarms = new node_opcua_1.ClientAlarmList();
        this._restartConnection = () => __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.client.disconnect();
                yield this.client.connect(this.endpointUrl);
            }
            catch (error) {
                console.log("OpcUa: restartConnection", error);
            }
        });
    }
    initialize(endpointUrl) {
        return __awaiter(this, void 0, void 0, function* () {
            // public async initialize(endpointUrl: string, securityMode: MessageSecurityMode, securityPolicy: SecurityPolicy) {
            const { certificateFile, clientCertificateManager, applicationUri, applicationName } = yield make_certificate_1.default;
            this.endpointUrl = endpointUrl;
            this.client = node_opcua_1.OPCUAClient.create({
                endpointMustExist: false,
                securityMode,
                securityPolicy,
                // certificateFile,
                defaultSecureTokenLifetime: 30 * 1000,
                requestedSessionTimeout: 30000,
                // clientCertificateManager,
                // applicationName,
                // applicationUri,
                keepSessionAlive: true,
                transportTimeout: 60 * 1000,
                connectionStrategy: {
                    maxRetry: 3,
                    initialDelay: 1000,
                    maxDelay: 10 * 1000,
                },
            });
            this._listenClientEvents();
        });
    }
    createSubscription() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.session)
                throw new Error("Invalid Session");
            try {
                const parameters = {
                    requestedPublishingInterval: 1000,
                    requestedLifetimeCount: 10,
                    requestedMaxKeepAliveCount: 5,
                    maxNotificationsPerPublish: 10,
                    publishingEnabled: true,
                    priority: 10,
                };
                this.subscription = yield this.session.createSubscription2(parameters);
            }
            catch (error) {
                console.log("cannot create subscription !");
            }
        });
    }
    connect(endpointUrl, userIdentity) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                this.userIdentity = userIdentity || { type: node_opcua_1.UserTokenType.Anonymous };
                // console.log("connecting to", endpointUrl);
                yield this.client.connect(endpointUrl);
                yield this._createSession();
                // console.log("connected to ....", endpointUrl);
                yield this.createSubscription();
            }
            catch (error) {
                console.log(" Cannot connect", error.toString());
                this.emit("connectionError", error);
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
    //					Exemple 1 : [getTree] - Browse several node 		 //
    //					May have timeout error if the tree is too big		 //
    ///////////////////////////////////////////////////////////////////////////
    getTree(entryPointPath) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log("discovering", this.endpointUrl || "", "using getTree [1] - browsing several nodes");
            const _self = this;
            const tree = yield this._getEntryPoint(entryPointPath);
            let variables = [];
            let queue = [tree];
            const obj = {
                [tree.nodeId.toString()]: tree,
            };
            while (queue.length) {
                queue = yield getAndFormatChilren(queue);
                console.log(`[getTree] ${queue.length} nodes to browse`);
            }
            console.log(`${this.endpointUrl} discovered ${Object.keys(obj).length} nodes.`);
            return { tree, variables };
            function getAndFormatChilren(list) {
                return __awaiter(this, void 0, void 0, function* () {
                    const nodesToBrowse = list.map((el) => (0, utils_1.convertToBrowseDescription)(el)).flat();
                    const childrenObj = yield _self._chunckAndGetChildren(nodesToBrowse);
                    const newQueue = [];
                    for (const key in childrenObj) {
                        const children = childrenObj[key];
                        for (const child of children) {
                            const name = (child.displayName.text || child.browseName.toString()).toLowerCase();
                            if (name == "server" || name[0] == ".")
                                continue;
                            const parent = obj[key];
                            const nodeInfo = _self._formatReference(child, parent.path || "");
                            if (nodeInfo.nodeClass === node_opcua_1.NodeClass.Variable)
                                variables.push(nodeInfo.nodeId.toString());
                            parent.children.push(nodeInfo);
                            newQueue.push(nodeInfo);
                            obj[nodeInfo.nodeId.toString()] = nodeInfo;
                        }
                    }
                    return newQueue;
                });
            }
        });
    }
    _chunckAndGetChildren(nodesToBrowse, chunkSize = 100) {
        return __awaiter(this, void 0, void 0, function* () {
            const list = lodash.chunk(nodesToBrowse, chunkSize);
            const browseResults = [];
            for (const i of list) {
                const t = yield this.session.browse(i);
                browseResults.push(...t);
            }
            const obj = {};
            for (let index = 0; index < browseResults.length; index++) {
                const element = browseResults[index].references;
                const parentId = nodesToBrowse[index].nodeId.toString();
                if (!obj[parentId])
                    obj[parentId] = [];
                obj[parentId].push(...element);
            }
            return obj;
        });
    }
    ///////////////////////////////////////////////////////////////////////////
    //					Exemple 2 : getTree (take a lot of time)		 	 //
    ///////////////////////////////////////////////////////////////////////////
    getTree2(entryPointPath) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log("discovering", this.endpointUrl || "", "inside getTree2, may take up to 1 hour or more...");
            const tree = yield this._getEntryPoint(entryPointPath);
            const queue = [tree];
            while (queue.length > 0) {
                const node = queue.shift();
                const nodesToBrowse = (0, utils_1.convertToBrowseDescription)(node);
                const browseResults = yield this.session.browse(nodesToBrowse);
                const references = browseResults.map((el) => el.references).flat();
                const children = [];
                for (const reference of references) {
                    const name = (reference.displayName.text || reference.browseName.toString()).toLowerCase();
                    if (name === "server" || name[0] === ".")
                        continue;
                    const nodeInfo = this._formatReference(reference, node.path);
                    queue.push(nodeInfo);
                    children.push(nodeInfo);
                }
                node.children = children;
            }
            // await this.browseNodeRec(tree);
            return { tree };
        });
    }
    browseNodeRec(node) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log("browsing", node.displayName, "inside browseNodeRec");
            const nodesToBrowse = [
                {
                    nodeId: node.nodeId,
                    referenceTypeId: "Organizes",
                    includeSubtypes: true,
                    browseDirection: node_opcua_1.BrowseDirection.Forward,
                    resultMask: 0x3f,
                },
                {
                    nodeId: node.nodeId,
                    referenceTypeId: "Aggregates",
                    includeSubtypes: true,
                    browseDirection: node_opcua_1.BrowseDirection.Forward,
                    resultMask: 0x3f,
                },
                {
                    nodeId: node.nodeId,
                    referenceTypeId: "HasSubtype",
                    includeSubtypes: true,
                    browseDirection: node_opcua_1.BrowseDirection.Forward,
                    resultMask: 0x3f,
                },
            ];
            const browseResults = yield this.session.browse(nodesToBrowse);
            const references = browseResults.map((el) => el.references).flat();
            const res = [];
            for (const reference of references) {
                const name = (reference.displayName.text || reference.browseName.toString()).toLowerCase();
                if (name == "server" || name[0] == ".")
                    continue;
                const nodeInfo = this._formatReference(reference, node.path);
                yield this.browseNodeRec(nodeInfo);
                res.push(nodeInfo);
            }
            node.children.push(...res);
            return res;
        });
    }
    getNodeChildren2(node) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.session)
                throw new Error("No Session yet");
            if (this.session.isReconnecting)
                throw new Error("Session is not available (reconnecting)");
            const nodesToBrowse = [
                {
                    nodeId: node.nodeId,
                    referenceTypeId: "Organizes",
                    includeSubtypes: true,
                    browseDirection: node_opcua_1.BrowseDirection.Forward,
                    resultMask: 0x3f,
                },
                {
                    nodeId: node.nodeId,
                    referenceTypeId: "Aggregates",
                    includeSubtypes: true,
                    browseDirection: node_opcua_1.BrowseDirection.Forward,
                    resultMask: 0x3f,
                },
                {
                    nodeId: node.nodeId,
                    referenceTypeId: "HasSubtype",
                    includeSubtypes: true,
                    browseDirection: node_opcua_1.BrowseDirection.Forward,
                    resultMask: 0x3f,
                },
            ];
            try {
                const results = yield this.session.browse(nodesToBrowse);
                return results.reduce((children, result) => {
                    if (result.references) {
                        for (const ref of result.references) {
                            if (ref.displayName.text.toLowerCase() === "server")
                                continue;
                            children.push({
                                displayName: ref.displayName.text || ref.browseName.toString(),
                                browseName: ref.browseName.toString() || "",
                                nodeId: ref.nodeId,
                                nodeClass: ref.nodeClass,
                            });
                        }
                    }
                    return children;
                }, []);
            }
            catch (err) {
                console.log(err);
                return [];
            }
        });
    }
    ///////////////////////////////////////////////////////////////////////////
    //					End Exemple 2									 	 //
    ///////////////////////////////////////////////////////////////////////////
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
    readNode(node) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!Array.isArray(node))
                node = [node];
            return this.session.read(node);
        });
    }
    readNodeValue(node) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.session) {
                return null;
            }
            if (!Array.isArray(node))
                node = [node];
            const nodesChunk = lodash.chunk(node, 500);
            const dataValues = [];
            for (const i of nodesChunk) {
                const values = yield this.readNode(i);
                dataValues.push(...values);
            }
            return dataValues.map((dataValue) => formatDataValue(dataValue));
        });
    }
    writeNode(node, value) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.session) {
                return;
            }
            const { dataType, arrayDimension, valueRank } = yield this._getNodesDetails(node);
            if (dataType) {
                try {
                    const arrayType = valueRank === -1 ? node_opcua_1.VariantArrayType.Scalar : valueRank === 1 ? node_opcua_1.VariantArrayType.Array : node_opcua_1.VariantArrayType.Matrix;
                    const dimensions = arrayType === node_opcua_1.VariantArrayType.Matrix ? arrayDimension : undefined;
                    const _value = new node_opcua_1.Variant({
                        dataType,
                        arrayType,
                        dimensions,
                        value: (0, utils_1.coerceStringToDataType)(dataType, arrayType, node_opcua_1.VariantArrayType, value),
                    });
                    const writeValue = new node_opcua_1.WriteValue({
                        nodeId: node.nodeId,
                        attributeId: node_opcua_1.AttributeIds.Value,
                        value: { value: _value },
                    });
                    let statusCode = yield this.session.write(writeValue);
                    return statusCode;
                }
                catch (error) {
                    console.log("error writing value", error);
                    return node_opcua_1.StatusCodes.BadInternalError;
                }
            }
        });
    }
    monitorItem(nodeIds, callback) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.subscription)
                return;
            nodeIds = Array.isArray(nodeIds) ? nodeIds : [nodeIds];
            const monitoredItems = nodeIds.map((nodeId) => ({ nodeId: nodeId, attributeId: node_opcua_1.AttributeIds.Value }));
            const monitoredItemGroup = yield this.subscription.monitorItems(monitoredItems, { samplingInterval: 30 * 1000, discardOldest: true, queueSize: 1000 }, node_opcua_1.TimestampsToReturn.Both);
            for (const monitoredItem of monitoredItemGroup.monitoredItems) {
                monitoredItem.on("changed", (dataValue) => {
                    const value = formatDataValue(dataValue);
                    callback(monitoredItem.itemToMonitor.nodeId.toString(), (value === null || value === void 0 ? void 0 : value.value) || "null");
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
        });
    }
    isVaraiable(node) {
        return node.nodeClass === node_opcua_1.NodeClass.Variable;
    }
    isObject(node) {
        return node.nodeClass === node_opcua_1.NodeClass.Object;
    }
    ///////////////////////////////////////////////////////////////////////////
    _createSession(client) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const session = yield (client || this.client).createSession(this.userIdentity);
                if (!client) {
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
            if (number === 3)
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
            console.log("session keepalive");
        });
        this.session.on("keepalive_failure", () => {
            this._restartConnection();
        });
    }
    _readBrowseName(nodeId) {
        return __awaiter(this, void 0, void 0, function* () {
            const node = yield this.session.read({ nodeId, attributeId: node_opcua_1.AttributeIds.BrowseName });
            return node.value.value;
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
    _getNodesDetails(node) {
        return __awaiter(this, void 0, void 0, function* () {
            const dataTypeIdDataValue = yield this.session.read({ nodeId: node.nodeId, attributeId: node_opcua_1.AttributeIds.DataType });
            const arrayDimensionDataValue = yield this.session.read({ nodeId: node.nodeId, attributeId: node_opcua_1.AttributeIds.ArrayDimensions });
            const valueRankDataValue = yield this.session.read({ nodeId: node.nodeId, attributeId: node_opcua_1.AttributeIds.ValueRank });
            const dataTypeId = dataTypeIdDataValue.value.value;
            const dataType = yield (0, node_opcua_1.findBasicDataType)(this.session, dataTypeId);
            const arrayDimension = arrayDimensionDataValue.value.value;
            const valueRank = valueRankDataValue.value.value;
            return { dataType, arrayDimension, valueRank };
        });
    }
    _getEntryPoint(entryPointPath) {
        return __awaiter(this, void 0, void 0, function* () {
            let start = {
                displayName: "Objects",
                nodeId: node_opcua_1.ObjectIds.ObjectsFolder,
                path: "/",
                children: [],
            };
            if (!entryPointPath || entryPointPath === "/") {
                return start;
            }
            return this._getNodeWithPath(start, entryPointPath);
        });
    }
    _getNodeWithPath(start, entryPointPath) {
        return __awaiter(this, void 0, void 0, function* () {
            const paths = entryPointPath.split("/").filter((el) => el !== "");
            let error;
            let node = start;
            let lastNode;
            while (paths.length && !error) {
                const children = yield this.getNodeChildren2(node);
                const path = paths.shift();
                let found = children.find((el) => el.displayName.toLocaleLowerCase() === path.toLocaleLowerCase());
                if (!found) {
                    error = "Node not found";
                    break;
                }
                node = found;
                if (paths.length === 0)
                    lastNode = node;
            }
            if (error)
                throw new Error(error);
            return Object.assign(Object.assign({}, lastNode), { children: [], path: `/${paths.join("/")}` });
        });
    }
    _formatReference(reference, path) {
        const name = reference.displayName.text || reference.browseName.toString();
        path = path.endsWith("/") ? path : `${path}/`;
        return {
            displayName: name,
            browseName: reference.browseName.toString(),
            nodeId: reference.nodeId,
            nodeClass: reference.nodeClass,
            path: path + name,
            children: [],
        };
    }
}
exports.OPCUAService = OPCUAService;
function w(s, l, c) {
    c = c || " ";
    const filling = Array(25).join(c[0]);
    return (s + filling).substr(0, l);
}
exports.w = w;
function formatDataValue(dataValue) {
    if (dataValue.statusCode == node_opcua_1.StatusCodes.Good) {
        if (dataValue.value.value) {
            const obj = { dataType: node_opcua_1.DataType[dataValue.value.dataType], value: undefined };
            switch (dataValue.value.arrayType) {
                case node_opcua_1.VariantArrayType.Scalar:
                    obj.value = dataValue.value.value;
                    break;
                case node_opcua_1.VariantArrayType.Array:
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
exports.default = OPCUAService;
//# sourceMappingURL=OPCUAService.js.map
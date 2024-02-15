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
        this.data = {
            reconnectionCount: 0,
            tokenRenewalCount: 0,
            receivedBytes: 0,
            sentBytes: 0,
            sentChunks: 0,
            receivedChunks: 0,
            backoffCount: 0,
            transactionCount: 0,
        };
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
                // clientCertificateManager,
                // applicationName,
                // applicationUri,
                keepSessionAlive: true,
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
                    requestedPublishingInterval: 500,
                    requestedLifetimeCount: 1000,
                    requestedMaxKeepAliveCount: 12,
                    maxNotificationsPerPublish: 100,
                    publishingEnabled: true,
                    priority: 10,
                };
                this.subscription = yield this.session.createSubscription2(parameters);
                console.log("subscription created !");
            }
            catch (error) {
                console.log("cannot create subscription !");
            }
        });
    }
    connect(endpointUrl, userIdentity) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                this.userIdentity = userIdentity;
                console.log("connecting to", endpointUrl);
                yield this.client.connect(endpointUrl);
                yield this._createSession();
                console.log("connected to ....", endpointUrl);
                yield this.createSubscription();
            }
            catch (error) {
                console.log(" Cannot connect", error.toString());
                this.emit("connectionError", error);
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
    getTree() {
        return __awaiter(this, void 0, void 0, function* () {
            const _self = this;
            const tree = {
                displayName: "RootFolder",
                nodeId: (0, node_opcua_1.resolveNodeId)("RootFolder"),
                children: [],
            };
            let variables = [];
            let queue = [tree];
            const obj = {
                [tree.nodeId.toString()]: tree,
            };
            while (queue.length) {
                queue = yield getAndFormatChilren(queue);
            }
            return { tree, variables };
            function getAndFormatChilren(list) {
                return __awaiter(this, void 0, void 0, function* () {
                    const nodesToBrowse = list.map((el) => (0, utils_1.convertToBrowseDescription)(el)).flat();
                    const childrenObj = yield _self.getChildren(nodesToBrowse);
                    const newQueue = [];
                    for (const key in childrenObj) {
                        const children = childrenObj[key];
                        for (const child of children) {
                            const nodeInfo = {
                                displayName: child.displayName.text || child.browseName.toString(),
                                nodeId: child.nodeId,
                                nodeClass: child.nodeClass,
                                children: [],
                            };
                            if (nodeInfo.nodeClass === node_opcua_1.NodeClass.Variable)
                                variables.push(nodeInfo.nodeId.toString());
                            obj[nodeInfo.nodeId.toString()] = nodeInfo;
                            obj[key].children.push(nodeInfo);
                            newQueue.push(nodeInfo);
                        }
                    }
                    return newQueue;
                });
            }
        });
    }
    getChildren(nodesToBrowse) {
        return __awaiter(this, void 0, void 0, function* () {
            const list = lodash.chunk(nodesToBrowse, 500);
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
    //					Exemple 1 : getTree (take a lot of time)		 	 //
    ///////////////////////////////////////////////////////////////////////////
    getTree2() {
        return __awaiter(this, void 0, void 0, function* () {
            const tree = {
                displayName: "RootFolder",
                nodeId: (0, node_opcua_1.resolveNodeId)("RootFolder"),
                children: [],
            };
            yield this.browseNode(tree);
            return tree;
        });
    }
    browseNode(node) {
        return __awaiter(this, void 0, void 0, function* () {
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
                if ((reference.displayName.text || reference.browseName.toString()).toLowerCase() === "server")
                    continue;
                const nodeInfo = {
                    displayName: reference.displayName.text || reference.browseName.toString(),
                    nodeId: reference.nodeId,
                    nodeClass: reference.nodeClass,
                    children: [],
                };
                const childNodeInfo = yield this.browseNode(nodeInfo);
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
    //					End Exemple 1									 	 //
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
        this.client.on("backoff", (number, delay) => console.log(`connection failed, retrying in ${delay / 1000.0} seconds`));
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
    }
    _listenSessionEvent() {
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
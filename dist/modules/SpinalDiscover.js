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
exports.discover = void 0;
const events_1 = require("events");
const SpinalQueuing_1 = require("../utils/SpinalQueuing");
const spinal_model_opcua_1 = require("spinal-model-opcua");
const OPCUAService_1 = require("../utils/OPCUAService");
const transformTreeToGraph_1 = require("../utils/transformTreeToGraph");
const Functions_1 = require("../utils/Functions");
const node_opcua_1 = require("node-opcua");
const addNetworkToGraph_1 = require("../utils/addNetworkToGraph");
const testJSON = require("./test.json");
const userIdentity = { type: node_opcua_1.UserTokenType.Anonymous };
class SpinalDiscover extends events_1.EventEmitter {
    constructor() {
        super();
        this._discoverQueue = new SpinalQueuing_1.SpinalQueuing();
        this._isProcess = false;
        this.listenEvent();
    }
    listenEvent() {
        this._discoverQueue.on("start", () => {
            if (!this._isProcess) {
                this._isProcess = true;
                this._discoverNext();
            }
        });
        this.on("next", () => {
            this._discoverNext();
        });
    }
    addToQueue(model) {
        this._discoverQueue.addToQueue(model);
    }
    _discoverNext() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this._discoverQueue.isEmpty()) {
                const model = this._discoverQueue.dequeue();
                yield this._discoverDevice(model);
                this.emit("next");
                // let timeout = false;
                // let bindSateProcess = model.state.bind(() => {
                // 	const state = model.state.get();
                // 	switch (state) {
                // 		case OPCUA_ORGAN_STATES.discovered:
                // 			model.state.unbind(bindSateProcess);
                // 			if (!timeout) {
                // 				this.emit("next");
                // 			}
                // 			break;
                // 		case OPCUA_ORGAN_STATES.timeout:
                // 			if (!timeout) {
                // 				this.emit("next");
                // 			}
                // 			timeout = true;
                // 		default:
                // 			break;
                // 	}
                // });
            }
            else {
                this._isProcess = false;
            }
        });
    }
    _bindDiscoverModel(model) {
        const processBind = model.state.bind(() => {
            const state = model.state.get();
            switch (state) {
                case spinal_model_opcua_1.OPCUA_ORGAN_STATES.readyToCreate:
                    console.log("creating nodes...");
                    this._createNetworkTreeInGraph(model);
                    break;
                case spinal_model_opcua_1.OPCUA_ORGAN_STATES.error:
                    break;
                default:
                    break;
            }
        });
    }
    _discoverDevice(model) {
        return __awaiter(this, void 0, void 0, function* () {
            this._bindDiscoverModel(model);
            model.changeState(spinal_model_opcua_1.OPCUA_ORGAN_STATES.discovering);
            const server = model.network.get();
            return this._getOPCUATree(server)
                .then(({ tree, variables }) => __awaiter(this, void 0, void 0, function* () {
                yield model.setTreeDiscovered(tree);
                console.log(server.name, "discovered !!");
                model.changeState(spinal_model_opcua_1.OPCUA_ORGAN_STATES.discovered);
                yield writeInFile("../../tree.txt", JSON.stringify(tree));
                return tree;
            })).catch((err) => {
                model.changeState(spinal_model_opcua_1.OPCUA_ORGAN_STATES.error);
            });
        });
    }
    _getOPCUATree(server) {
        return __awaiter(this, void 0, void 0, function* () {
            const endpointUrl = (0, Functions_1.getServerUrl)(server);
            const opcuaService = new OPCUAService_1.default();
            yield opcuaService.initialize(endpointUrl);
            yield opcuaService.connect(endpointUrl, userIdentity);
            const tree = testJSON;
            return { tree, variables: [] };
            // const tree = await opcuaService.getTree(process.env.OPCUA_SERVER_ENTRYPOINT);
            // const tree = await opcuaService.getTree2(process.env.OPCUA_SERVER_ENTRYPOINT);
            // await opcuaService.disconnect();
            // return tree;
        });
    }
    _createNetworkTreeInGraph(model) {
        return __awaiter(this, void 0, void 0, function* () {
            const treeToCreate = yield model.getTreeToCreate();
            const server = model.network.get();
            const variables = (0, Functions_1.getVariablesList)(treeToCreate);
            const values = yield this._getVariablesValues(server, variables);
            const context = yield model.getContext();
            const { network, organ } = yield (0, addNetworkToGraph_1.getOrGenNetworkNode)(model, context);
            const nodesAlreadyCreated = yield (0, transformTreeToGraph_1.getNodeAlreadyCreated)(context, network);
            const promises = (treeToCreate.children || []).map((tree) => (0, transformTreeToGraph_1._transformTreeToGraphRecursively)(context, tree, nodesAlreadyCreated, undefined, values));
            const nodes = yield Promise.all(promises);
            return (0, addNetworkToGraph_1.addNetworkToGraph)(model, nodes, context, network, organ)
                .then((result) => {
                console.log("network", network.getName().get(), "created !!");
                model.changeState(spinal_model_opcua_1.OPCUA_ORGAN_STATES.created);
            })
                .catch((err) => {
                console.log(network.getName().get(), "creation failed !");
                model.changeState(spinal_model_opcua_1.OPCUA_ORGAN_STATES.error);
            });
        });
    }
    // private convertToBase64(tree: any) {
    // 	return new Promise((resolve, reject) => {
    // 		const treeString = JSON.stringify(tree);
    // 		zlib.deflate(treeString, (err, buffer) => {
    // 			if (!err) {
    // 				const base64 = buffer.toString("base64");
    // 				return resolve(base64);
    // 			}
    // 		});
    // 	});
    // }
    _getVariablesValues(server, variables) {
        return __awaiter(this, void 0, void 0, function* () {
            const endpointUrl = (0, Functions_1.getServerUrl)(server);
            const opcuaService = new OPCUAService_1.default();
            yield opcuaService.initialize(endpointUrl);
            yield opcuaService.connect(endpointUrl, userIdentity);
            return opcuaService.readNodeValue(variables).then((result) => {
                const obj = {};
                for (let index = 0; index < result.length; index++) {
                    const element = result[index];
                    obj[variables[index].nodeId.toString()] = element;
                }
                opcuaService.disconnect();
                return obj;
            });
        });
    }
    delay(ms) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                resolve(true);
            }, ms);
        });
    }
}
exports.discover = new SpinalDiscover();
const fs = require("fs");
const nodePath = require("path");
function writeInFile(argPath, text) {
    return fs.writeFileSync(nodePath.resolve(__dirname, argPath), text);
}
/*
export class SpinalDiscover {
    private bindSateProcess: any;
    private CONNECTION_TIME_OUT: number;
    private devices: Map<number, SpinalDevice> = new Map();
    private discoverModel: any;

    constructor(model) {
        this.discoverModel = model;
        this.CONNECTION_TIME_OUT = model.network?.timeout?.get() || 45000;

        this.init(model);
    }

    public init(model: any) {
        this.bindState();
    }

    private bindState(): void {
        this.bindSateProcess = this.discoverModel.state.bind(() => {
            switch (this.discoverModel.state.get()) {
                case OPCUA_ORGAN_STATES.discovering:
                    console.log("discovering");
                    this.discover();
                    break;
                case OPCUA_ORGAN_STATES.creating:
                    this.createNodes();
                default:
                    break;
            }
        });
    }

    private async discover() {
        try {
            const queue = await this.getDevicesQueue();

            let isFinish = false;

            while (!isFinish) {
                const item = queue.dequeue();

                if (typeof item !== "undefined") {
                    const info = await this.createSpinalDevice(item);
                    if (info) this.addDeviceFound(info);
                } else {
                    console.log("isFinish");
                    isFinish = true;
                }
            }

            if (this.discoverModel.devices.length !== 0) {
                console.log("discovered");
                this.discoverModel.setDiscoveredMode();
            } else {
                console.log("Timeout !");
                this.discoverModel.setTimeoutMode();
            }
        } catch (error) {
            console.log("Timeout...");
            this.discoverModel.setTimeoutMode();
        }
    }

    private getDevicesQueue(): Promise<SpinalQueuing> {
        const queue: SpinalQueuing = new SpinalQueuing();
        return new Promise((resolve, reject) => {
            // if (this.discoverModel.network?.useBroadcast?.get()) {
            //    console.log("use broadcast");
            let timeOutId;

            if (this.discoverModel.network?.useBroadcast?.get()) {
                console.log("use broadcast");

                timeOutId = setTimeout(() => {
                    reject("[TIMEOUT] - Cannot establish connection with BACnet server.");
                }, this.CONNECTION_TIME_OUT);

                this.client.whoIs();
            } else {
                // ips.forEach(({ address, deviceId }) => {
                //    this.client.whoIs({ address })
                // });
                console.log("use unicast");
                const ips = this.discoverModel.network?.ips?.get() || [];
                const devices = ips
                    .filter(({ address, deviceId }) => address && deviceId)
                    .map(({ address, deviceId }) => {
                        return { address, deviceId: parseInt(deviceId) };
                    });

                queue.setQueue(devices);
            }

            const res = [];

            this.client.on("iAm", (device) => {
                if (typeof timeOutId !== "undefined") {
                    clearTimeout(timeOutId);
                }

                console.log(device);

                const { address, deviceId } = device;
                const found = res.find((el) => el.address === address && el.deviceId === deviceId);
                if (!found) {
                    res.push(device);
                    queue.addToQueue(device);
                }
            });

            queue.on("start", () => {
                resolve(queue);
            });
        });
    }

    private createSpinalDevice(device): Promise<IDevice | void> {
        return new Promise((resolve, reject) => {
            const spinalDevice = new SpinalDevice(device, this.client);

            spinalDevice.on("initialized", (res) => {
                this.devices.set(res.device.deviceId, res);
                resolve(res.info);
            });

            spinalDevice.on("error", () => {
                resolve();
            });

            spinalDevice.init();
        });
    }

    private addDeviceFound(device: IDevice): void {
        console.log("device found", device.address);
        this.discoverModel.devices.push(device);
    }

    private async createNodes() {
        console.log("creating nodes...");

        try {
            const queue = new SpinalQueuing();
            queue.setQueue(Array.from(this.devices.keys()));
            const { networkService, network } = await SpinalNetworkServiceUtilities.initSpinalDiscoverNetwork(this.discoverModel);
            const devices = await this.getDevices(network.id.get());

            let isFinish = false;

            while (!isFinish) {
                const value = queue.dequeue();
                if (typeof value !== "undefined") {
                    const node = devices.find((el) => el.idNetwork.get() == value);
                    const device = this.devices.get(value);
                    await device.createStructureNodes(networkService, node, network.id.get());
                } else {
                    isFinish = true;
                }
            }

            this.discoverModel.setCreatedMode();
            this.discoverModel.state.unbind(this.bindSateProcess);
            this.discoverModel.remove();
            console.log("nodes created!");
        } catch (error) {
            this.discoverModel.setErrorMode();
            this.discoverModel.state.unbind(this.bindSateProcess);
            this.discoverModel.remove();
        }
    }

    private getDevices(id: string): Promise<SpinalNodeRef[]> {
        return SpinalGraphService.getChildren(id, [SpinalBmsDevice.relationName]);
    }
}
*/
//# sourceMappingURL=SpinalDiscover.js.map
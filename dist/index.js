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
// import { config as dotenvConfig } from "dotenv";
const spinal_core_connectorjs_type_1 = require("spinal-core-connectorjs_type");
const utils_1 = require("./utils/utils");
const Functions_1 = require("./utils/Functions");
const spinal_model_opcua_1 = require("spinal-model-opcua");
const spinal_connector_service_1 = require("spinal-connector-service");
const nodePath = require("path");
// dotenvConfig({ path: nodepath.resolve(__dirname, "../.env"), override: true });
const { protocol, host, port, userId, password, path, name } = (0, utils_1.getConfig)();
const url = `${protocol}://${userId}:${password}@${host}:${port}/`;
const connect = spinal_core_connectorjs_type_1.spinalCore.connect(url);
const organInfo = {
    name,
    type: spinal_model_opcua_1.OPCUA_ORGAN_TYPE,
    path: nodePath.normalize(nodePath.join(path, `${name}`)),
    model: new spinal_model_opcua_1.SpinalOrganOPCUA(name, spinal_model_opcua_1.OPCUA_ORGAN_TYPE)
};
const spinalConnectorService = spinal_connector_service_1.SpinalConnectorService.getInstance();
spinalConnectorService.initialize(connect, organInfo).then(({ alreadyExists, node }) => __awaiter(void 0, void 0, void 0, function* () {
    // initialize the list of models to bind with the organ, 
    // this is necessary to be able to bind the models with the organ when it is created or when it is found in the graph
    yield spinal_model_opcua_1.SpinalOrganOPCUA.initializeModelsList();
    // Bind the restart function to PM2 events
    const pm2_instance = (0, Functions_1.GetPm2Instance)(name);
    const pm2_id = pm2_instance ? pm2_instance.pm_id : null;
    if (pm2_id)
        node.restart.bind(() => (0, Functions_1.restartProcessById)(pm2_id));
    // end of restart function to bind
    const message = alreadyExists ? "organ found !" : "organ not found, creating new organ !";
    console.log(message);
    (0, Functions_1.bindModels)(node);
})).catch((err) => {
    console.error(err);
});
//# sourceMappingURL=index.js.map
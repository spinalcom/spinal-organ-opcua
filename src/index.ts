// import { config as dotenvConfig } from "dotenv";
import { SpinalCallBackError, spinalCore } from "spinal-core-connectorjs_type";
import { getConfig } from "./utils/utils";
import { bindModels, GetPm2Instance, restartProcessById } from "./utils/Functions";
import { OPCUA_ORGAN_TYPE, SpinalOrganOPCUA, SpinalOPCUADiscoverModel, SpinalOPCUAListener, SpinalOPCUAPilot } from "spinal-model-opcua";
import { IConnectorInfo, SpinalConnectorService } from "spinal-connector-service";
import * as nodePath from "path";

// dotenvConfig({ path: nodepath.resolve(__dirname, "../.env"), override: true });


const { protocol, host, port, userId, password, path, name } = getConfig();
const url = `${protocol}://${userId}:${password}@${host}:${port}/`;
const connect: spinal.FileSystem = spinalCore.connect(url);

const organInfo: IConnectorInfo = {
	name,
	type: OPCUA_ORGAN_TYPE,
	path: nodePath.normalize(nodePath.join(path, `${name}`)),
	model: new SpinalOrganOPCUA(name, OPCUA_ORGAN_TYPE)
}

const spinalConnectorService = SpinalConnectorService.getInstance();
spinalConnectorService.initialize(connect, organInfo).then(async ({ alreadyExists, node }: { alreadyExists: boolean, node: SpinalOrganOPCUA }) => {

	// initialize the list of models to bind with the organ, 
	// this is necessary to be able to bind the models with the organ when it is created or when it is found in the graph
	await SpinalOrganOPCUA.initializeModelsList();

	// Bind the restart function to PM2 events
	const pm2_instance = GetPm2Instance(name);
	const pm2_id = pm2_instance ? (pm2_instance as any).pm_id : null;
	if (pm2_id) node.restart.bind(() => restartProcessById(pm2_id));
	// end of restart function to bind

	const message = alreadyExists ? "organ found !" : "organ not found, creating new organ !";
	console.log(message);

	bindModels(node as SpinalOrganOPCUA);

}).catch((err) => {
	console.error(err);
});
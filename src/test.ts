import { SpinalBmsDevice } from "spinal-model-bmsnetwork";
import { getConfig } from "./utils/utils";
import discoveringStore from "./utils/discoveringProcessStore";

const { spinalCore } = require("spinal-core-connectorjs_type");
const { SpinalBmsNetwork } = require("spinal-model-bmsnetwork");
const { SpinalNode, SPINAL_RELATION_PTR_LST_TYPE, SpinalContext, SpinalGraph } = require("spinal-model-graph");
const { SpinalOPCUADiscoverModel } = require("spinal-model-opcua");

export function getNetwork(connect): Promise<{ organ: any; context: any; network: any; graph: any }> {
	return new Promise((resolve, reject) => {
		const path = "/__users__/admin/Digital twin";

		spinalCore.load(connect, path, async (graph) => {

			const contextName = "OPCUA network";
			const organName = "spinal-organ-opcua-dev";

			const context = await getContext(graph, contextName);
			const organ = await getOrgan(context, organName);

			const network = {
				ip: "172.29.32.47",
				port: "26543",
				name: "Network 1",
				endpoint: "",
			}

			return resolve({ graph, context, organ, network });
		},
			() => {
				console.log("hello");
			}
		);
	});
}

async function getContext(graph, contextName) {
	const children = await graph.getChildren();
	return children.find((el) => el.getName().get() === contextName);
}

async function getOrgan(context, organName) {
	const children = await context.getChildren();
	return children.find((el) => el.getName().get() === organName);
}


(async function () {
	const { protocol, host, port, userId, password, path, name } = getConfig();
	const url = `${protocol}://${userId}:${password}@${host}:${port}/`;
	const connect: spinal.FileSystem = spinalCore.connect(url);

	const { graph, context, organ, network } = await getNetwork(connect);
	const spinalOPCUADiscoverModel = new SpinalOPCUADiscoverModel(graph, context, organ, network);

	const excelPath = `opc.tcp://172.29.32.47:26543`;
	const excelData = await discoveringStore.getProgress(excelPath);

	spinalOPCUADiscoverModel.addToGraph();

	await spinalOPCUADiscoverModel.setTreeDiscovered(excelData);

	const tree = await spinalOPCUADiscoverModel.getTreeDiscovered();
	console.log(tree);

}())

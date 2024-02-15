import { SpinalBmsDevice } from "spinal-model-bmsnetwork";

const { spinalCore } = require("spinal-core-connectorjs_type");
const { SpinalBmsNetwork } = require("spinal-model-bmsnetwork");
const { SpinalNode, SPINAL_RELATION_PTR_LST_TYPE, SpinalContext, SpinalGraph } = require("spinal-model-graph");
const { SpinalOPCUADiscoverModel } = require("spinal-model-opcua");

export function getNetwork(connect): Promise<{ organ: any; context: any; network: any; device: any; graph: any }> {
	return new Promise((resolve, reject) => {
		const path = "/__users__/admin/Mission/Digital twin Mission";
		spinalCore.load(
			connect,
			path,
			async (graph) => {
				const contextName = "test organ opcua";
				const organName = "spinal-organ-opcua";
				const networkName = "Reseau 1";
				const deviceName = "Device 1";

				const context = await getContext(graph, contextName);
				const organ = await getOrgan(context, organName);
				const network = await getOrCreateNetwork(graph, context, organ, networkName);
				const device = await getOrCreateDevice(context, network, deviceName);

				return resolve({ graph, context, organ, network, device });
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

async function getOrCreateNetwork(graph, context, organ, networkName) {
	const children = await organ.getChildren();
	const found = children.find((el) => el.getName().get() === networkName);
	if (found) return found;

	// const service = new NetworkService(false);
	// await service.init(graph, { contextName: context.getName().get(), contextType: "Network", networkType: SpinalBmsNetwork.nodeTypeName, networkName}, false)
	const res = new SpinalBmsNetwork(networkName, "network");
	const node = new SpinalNode(networkName, SpinalBmsNetwork.nodeTypeName, res);
	return organ.addChildInContext(node, SpinalBmsNetwork.relationName, SPINAL_RELATION_PTR_LST_TYPE, context);
}

async function getOrCreateDevice(context, network, deviceName) {
	const children = await network.getChildren();
	const found = children.find((el) => el.getName().get() === deviceName);
	if (found) return found;
	const res = new SpinalBmsDevice(<any>{
		id: "mon test",
		name: deviceName,
		type: SpinalBmsDevice.nodeTypeName,
		path: "",
		address: "",
		nodeTypeName: SpinalBmsDevice.nodeTypeName,
	});
	const node = new SpinalNode(deviceName, SpinalBmsDevice.nodeTypeName, res);
	return network.addChildInContext(node, SpinalBmsDevice.relationName, SPINAL_RELATION_PTR_LST_TYPE, context);
}

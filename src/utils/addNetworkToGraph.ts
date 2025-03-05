import { SpinalNode, SPINAL_RELATION_PTR_LST_TYPE, SpinalContext } from "spinal-env-viewer-graph-service";
import { SpinalBmsNetwork } from "spinal-model-bmsnetwork";
import { SpinalOrganOPCUA } from "spinal-model-opcua";

export async function addNetworkToGraph(nodes: { node: SpinalNode; relation: string; attributes: any }[], context: SpinalContext, network: SpinalNode, organ: SpinalNode) {

	const result = [];

	for (const { node, relation } of nodes) {
		const n = await network.addChildInContext(node, relation, SPINAL_RELATION_PTR_LST_TYPE, context).catch((e) => { });
		result.push(n);
	}

	return organ.addChildInContext(network, SpinalBmsNetwork.relationName, SPINAL_RELATION_PTR_LST_TYPE, context).catch((e) => {
		return network;
	});

	// const promises = nodes.map(({ node, relation }) => {
	// 	return network.addChildInContext(node, relation, SPINAL_RELATION_PTR_LST_TYPE, context).catch((e) => { });
	// });

	// return Promise.all(promises).then(async (net) => {
	// 	return organ.addChildInContext(network, SpinalBmsNetwork.relationName, SPINAL_RELATION_PTR_LST_TYPE, context).catch((e) => {
	// 		return network;
	// 	});
	// });
}

export async function getOrGenNetworkNode(model: any, context: SpinalContext) {
	context = context || (await model.getContext());
	const organElement = await model.getOrgan();
	const organ = await getOrganNode(organElement, context.getId().get());
	const serverName = model.network.name.get();
	// delete server.address;

	const children = await organ.getChildrenInContext(context);
	let network = children.find((child) => child.getName().get() === serverName);

	if (!network) {
		const element = new SpinalBmsNetwork(serverName, SpinalBmsNetwork.nodeTypeName);
		const networkNode = new SpinalNode(serverName, SpinalBmsNetwork.nodeTypeName, element);
		network = await organ.addChildInContext(networkNode, SpinalBmsNetwork.relationName, SPINAL_RELATION_PTR_LST_TYPE, context);
	}

	// network.info.mod_attr("serverInfo", server);
	return { network, organ, context };
}

export function getOrganNode(organ: SpinalOrganOPCUA, contextId: string): Promise<SpinalNode> {
	return new Promise((resolve, reject) => {
		try {
			organ.references[contextId].load((node) => {
				if (node instanceof SpinalNode) resolve(node);
				else reject("Error: getOrganNode");
			});
		} catch (error) {
			reject(error);
		}
	});
}

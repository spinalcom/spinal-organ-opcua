import { Ptr } from "spinal-core-connectorjs";
import { SpinalNode } from "spinal-env-viewer-graph-service";
import { SpinalBmsDevice, SpinalBmsEndpoint, SpinalBmsEndpointGroup, SpinalBmsNetwork } from "spinal-model-bmsnetwork";
import { SpinalOrganOPCUA } from "spinal-model-opcua";
import spinalLog from "./displayLog";

export async function clearOrgan(organModel: SpinalOrganOPCUA) {
	const references = await getAllOrganReferences(organModel);
	const promises = references.map(clearReference);
	return Promise.all(promises).then((result) => {
		organModel.rem_attr("discover");
		organModel.rem_attr("listener");
		organModel.rem_attr("pilot");

		organModel.initializeModelsList(); // Reinitialize the models list after clearing the organ model
		spinalLog.log("Successfully cleared organ references:", result);
		return result;
	});
}

function getAllOrganReferences(organModel: SpinalOrganOPCUA): Promise<SpinalNode[]> {
	const ptrList = organModel.references._attribute_names.map((name: string) => organModel.references[name]);
	const promises = ptrList.map(_loadPtr);

	return Promise.allSettled(promises).then((result) => {
		const references: SpinalNode[] = [];

		for (const element of result) {
			if (element.status === "fulfilled") references.push(element.value);
		}

		return references;
	});
}

async function clearReference(reference: SpinalNode) {
	const { devices, endpoints } = await getAndClearDeviceAndEndpointsFromOrgan(reference);
	spinalLog.log(`Clearing reference: ${reference.getName().get()} with ${devices.length} devices and ${endpoints.length} endpoints.`);
	// devices.forEach(clearDevice);
	// endpoints.forEach(clearEndpoint);
	console.log(`${devices.length} devices and ${endpoints.length} endpoints cleared`);
}

async function getAndClearDeviceAndEndpointsFromOrgan(organNode: SpinalNode) {
	const data: { devices: SpinalNode[]; endpoints: SpinalNode[] } = { devices: [], endpoints: [] };

	const context = await organNode.findOneParent(["hasBmsNetworkOrgan"], (node) => node.getType().get() === "Network");
	if (!context) return data;

	return organNode
		.findInContext(context, (node) => {
			if (node.getType().get() === SpinalBmsDevice.nodeTypeName) {
				data.devices.push(node);
				clearDevice(node);
			} else if (node.getType().get() === SpinalBmsEndpoint.nodeTypeName) {
				data.endpoints.push(node);
				clearEndpoint(node);
			}
			return true;
		})
		.then(() => {
			return data;
		});
}

function clearEndpoint(endpoint: SpinalNode) {
	endpoint.info.rem_attr("pilot");
}

function clearDevice(device: SpinalNode) {
	device.info.rem_attr("listener");
}

function _loadPtr<S>(ptr: Ptr): Promise<S> | undefined {
	return new Promise((resolve, reject) => {
		ptr.load((node) => {
			resolve(node);
		});
	});
}

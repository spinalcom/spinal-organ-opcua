import { IOPCNode } from "../interfaces/OPCNode";
import { IConfig } from "../interfaces/IConfig";
import { BrowseDirection, ResultMask } from "node-opcua";
import { SpinalNode } from "spinal-env-viewer-graph-service";

export function getConfig(): IConfig {
	return {
		name: process.env.ORGAN_NAME || "EDIT_ME",
		userId: process.env.USER_ID || "EDIT_ME",
		password: process.env.PASSWORD || "EDIT_ME",
		protocol: process.env.PROTOCOL || "EDIT_ME",
		host: process.env.HOST || "EDIT_ME",
		port: process.env.PORT || "EDIT_ME",
		path: process.env.ORGAN_FOLDER_PATH || "EDIT_ME",
	};
}

export function convertToBrowseDescription(node: IOPCNode) {
	return [
		{
			nodeId: node.nodeId,
			referenceTypeId: "Organizes",
			includeSubtypes: true,
			browseDirection: BrowseDirection.Forward,
			resultMask: 0x3f,
		},
		{
			nodeId: node.nodeId,
			referenceTypeId: "Aggregates",
			includeSubtypes: true,
			browseDirection: BrowseDirection.Forward,
			resultMask: 0x3f,
		},
		{
			nodeId: node.nodeId,
			referenceTypeId: "HasSubtype",
			includeSubtypes: true,
			browseDirection: BrowseDirection.Forward,
			resultMask: 0x3f,
		},
	];
}

export function convertSpinalNodeToOPCNode(node: SpinalNode | string): IOPCNode {
	const isString = typeof node === "string";

	return {
		displayName: isString ? node : node.info.name.get(),
		nodeId: isString ? node : node.info.idNetwork.get(),
	};
}

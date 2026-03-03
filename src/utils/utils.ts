import { IOPCNode } from "../interfaces/OPCNode";
import { IConfig } from "../interfaces/IConfig";
import { BrowseDirection, DataType, ReferenceTypeIds } from "node-opcua";
import { SpinalNode } from "spinal-env-viewer-graph-service";
import * as path from "path";
import { config as dotenvConfig } from "dotenv";
import { OPCUA_ORGAN_STATES, SpinalOPCUADiscoverModel } from "spinal-model-opcua";


dotenvConfig({ path: path.resolve(__dirname, "../../.env"), override: true });


export function getConfig(): IConfig {
	return {
		name: process.env.ORGAN_NAME || "EDIT_ME",
		userId: process.env.USER_ID || "EDIT_ME",
		password: process.env.PASSWORD || "EDIT_ME",
		protocol: process.env.PROTOCOL || "EDIT_ME",
		host: process.env.HOST || "EDIT_ME",
		port: process.env.PORT || "EDIT_ME",
		path: process.env.ORGAN_FOLDER_PATH || "EDIT_ME",
		entryPointPath: process.env.OPCUA_SERVER_ENTRYPOINT || ""
	};
}

export function convertToBrowseDescription(node: IOPCNode) {
	return [
		{
			nodeId: node.nodeId,
			referenceTypeId: ReferenceTypeIds.Organizes,
			includeSubtypes: true,
			browseDirection: BrowseDirection.Forward,
			resultMask: 0x3f,
		},
		{
			nodeId: node.nodeId,
			referenceTypeId: ReferenceTypeIds.Aggregates,
			includeSubtypes: true,
			browseDirection: BrowseDirection.Forward,
			resultMask: 0x3f,
		},
		{
			nodeId: node.nodeId,
			referenceTypeId: ReferenceTypeIds.HasSubtype,
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

export const coerceBoolean = (data: any) => {
	return data === "true" || data === "1" || data === true;
};

export const coerceNumber = (data: any) => {
	return parseInt(data, 10);
};

export const coerceNumberR = (data: any) => {
	return parseFloat(data);
};

export const coerceNoop = (data: any) => data;

export const coerceFunc = (dataType: DataType) => {
	switch (dataType) {
		case DataType.Boolean:
			return coerceBoolean;
		case DataType.Int16:
		case DataType.Int32:
		case DataType.Int64:
		case DataType.UInt16:
		case DataType.UInt32:
		case DataType.UInt64:
			return coerceNumber;
		case DataType.Double:
		case DataType.Float:
			return coerceNumberR;
		default:
			return coerceNoop;
	}
};


export function coerceStringToDataType(dataType: DataType, arrayType: number, VariantArrayType: any, data: any) {
	const c = coerceFunc(dataType);
	if (arrayType === VariantArrayType.Scalar) {
		return c(data);
	} else {
		return data.map((d: any) => c(d));
	}
}

export function discoverIsCancelled(_discoverModel: SpinalOPCUADiscoverModel): boolean {
	return !_discoverModel || _discoverModel.state?.get() == OPCUA_ORGAN_STATES.cancelled;
}

export function normalizePath(nodePath: string): string {
	if (!nodePath) return "";

	const protocolMath = nodePath.match(/^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)/);
	let protocol = "";

	// If a protocol is found, separate it from the path
	if (protocolMath) {
		protocol = protocolMath[1];
		nodePath = nodePath.slice(protocol.length); // Remove the protocol from the path for further processing
	}

	nodePath = nodePath.replace(/\/+/g, "/"); // Replace multiple slashes with a single slash

	if (nodePath.length > 1 && nodePath.endsWith("/")) nodePath = nodePath.slice(0, -1); // Remove trailing slash if it exists

	if (protocol && nodePath.startsWith("/")) nodePath = nodePath.slice(1); // Remove leading slash if protocol exists

	return protocol + nodePath;
}
import { IOPCNode } from "../interfaces/OPCNode";
import { IConfig } from "../interfaces/IConfig";
import { BrowseDescription, BrowseDirection, DataType, ReferenceTypeIds, ResultMask } from "node-opcua";
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
			referenceTypeId: ReferenceTypeIds.Organizes,
			includeSubtypes: true,
			browseDirection: BrowseDirection.Forward,
			resultMask: 0x3f,
		},
		// {
		// 	nodeId: node.nodeId,
		// 	referenceTypeId: ReferenceTypeIds.Aggregates,
		// 	includeSubtypes: true,
		// 	browseDirection: BrowseDirection.Forward,
		// 	resultMask: 0x3f,
		// },
		// {
		// 	nodeId: node.nodeId,
		// 	referenceTypeId: ReferenceTypeIds.HasSubtype,
		// 	includeSubtypes: true,
		// 	browseDirection: BrowseDirection.Forward,
		// 	resultMask: 0x3f,
		// },
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


export function coerceStringToDataType(dataType, arrayType, VariantArrayType, data: any) {
	const c = coerceFunc(dataType);
	if (arrayType === VariantArrayType.Scalar) {
		return c(data);
	} else {
		return data.map((d: any) => c(d));
	}
}
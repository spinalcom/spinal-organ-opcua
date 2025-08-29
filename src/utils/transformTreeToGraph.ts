import { SPINAL_RELATION_PTR_LST_TYPE, SpinalContext, SpinalGraphService, SpinalNode } from "spinal-env-viewer-graph-service";
import { SpinalBmsDevice, SpinalBmsEndpoint, SpinalBmsEndpointGroup, SpinalBmsNetwork } from "spinal-model-bmsnetwork";
import { serviceDocumentation } from "spinal-env-viewer-plugin-documentation-service";
import { NodeClass } from "node-opcua";

import OPCUAService from "./OPCUAService";
import { IOPCNode } from "../interfaces/OPCNode";
import { normalizePath } from "./utils";

export async function _transformTreeToGraphRecursively(context: SpinalContext, opcNode: IOPCNode, nodesAlreadyCreated: { [key: string]: SpinalNode }, parent?: SpinalNode, values: { [key: string]: any } = {}, depth: number = 0) {

	const { node, relation, alreadyExist } = await getNodeAndRelation(opcNode, nodesAlreadyCreated, values, depth);

	const { children, attributes } = _formatTree(opcNode);
	if (attributes && attributes.length > 0) await _createNodeAttributes(node, attributes, values);

	if (parent && !alreadyExist) {
		await parent.addChildInContext(node, relation, SPINAL_RELATION_PTR_LST_TYPE, context);
	}

	const promises = (children || []).map(async (el) => {
		const childNodeInfo = await _transformTreeToGraphRecursively(context, el, nodesAlreadyCreated, node, values, depth + 1);
		return childNodeInfo;
	});

	return Promise.all(promises).then((result) => {
		return { node, relation, alreadyExist };
	});
}

export async function getNodeAlreadyCreated(context: SpinalContext, network: SpinalNode, opcNode: IOPCNode): Promise<{ [key: string]: SpinalNode }> {
	const devices = await network.getChildrenInContext(context);

	const serverInfo: IOPCNode["server"] = opcNode.server;

	const device = devices.find((el) => {
		const serverIsMatch = el.info.server?.address?.get() == serverInfo?.address && el.info.server?.port?.get() == serverInfo?.port;
		if (!serverIsMatch) return false;
		const key = el.info?.path?.get() || el.info?.idNetwork?.get();
		return normalizePath(opcNode.path) === key || opcNode.nodeId.toString() === key;
	});


	if (!device) return {}; // If no device found, return an empty object

	const key = device.info?.path?.get() || device.info?.idNetwork?.get();
	const obj = {
		[key]: device // Use the device's path or idNetwork as the key
	};



	return device.findInContext(context, (node) => {
		const id = node.info?.path?.get() || node.info?.idNetwork?.get();
		if (id) obj[id] = node;

		return true;
	}).then(() => {
		return obj;
	})
}

async function getNodeAndRelation(opcNode: IOPCNode, nodesAlreadyCreated: { [key: string]: SpinalNode }, values: { [key: string]: any } = {}, depth: number = 0): Promise<{ node: SpinalNode; relation: string; alreadyExist: boolean }> {
	const key = normalizePath(opcNode.path) || opcNode.nodeId.toString();
	let spinalNode: SpinalNode = nodesAlreadyCreated[key];

	if (!spinalNode) { // If the node does not exist, create it
		if (depth == 0) return _generateDevice(opcNode);
		return _generateNodeAndRelation(opcNode, values);
	} else {
		_updateNodeInfo(spinalNode, opcNode);
	}

	const relation = _getNodeRelationName(spinalNode.getType().get());
	const data = values[key];
	await _changeValueAndDataType(spinalNode, data);
	return { node: spinalNode, relation, alreadyExist: true };
}

function _updateNodeInfo(spinalNode: SpinalNode, opcNode: IOPCNode): SpinalNode {
	spinalNode.info.name.set(opcNode.displayName || opcNode.browseName);
	spinalNode.info.idNetwork.set(opcNode.nodeId.toString());
	spinalNode.info.path.set(normalizePath(opcNode.path) || "");

	if (spinalNode.info.displayName) spinalNode.info.displayName.set(opcNode.displayName || opcNode.browseName);
	if (spinalNode.info.browseName) spinalNode.info.browseName.set(opcNode.browseName || spinalNode.info.browseName);

	return spinalNode;
}


function _generateNodeAndRelation(node: IOPCNode, values: { [key: string]: any } = {}): { node: SpinalNode; relation: string; alreadyExist: boolean } {
	let element;
	let param: any = {
		id: node.nodeId.toString(),
		name: node.displayName,
		path: node.path,
		displayName: node.displayName || node.browseName,
		browseName: node.browseName || node.displayName
	};

	if (OPCUAService.isVariable(node)) {
		const key = normalizePath(node.path) || node.nodeId.toString();
		const dataValue = values[key];
		param = {
			...param,
			typeId: "",
			nodeTypeName: SpinalBmsEndpoint.nodeTypeName,
			type: SpinalBmsEndpoint.nodeTypeName,
			// currentValue: dataValue?.value || "null", // may be bad if value is boolean
			currentValue: dataValue?.value,
			dataType: dataValue?.dataType || "",
			unit: "",
		};

		element = new SpinalBmsEndpoint(param);
	} else {
		param = {
			...param,
			nodeTypeName: SpinalBmsEndpointGroup.nodeTypeName,
			type: SpinalBmsEndpointGroup.nodeTypeName,
		};

		element = new SpinalBmsEndpointGroup(param);
	}

	const spinalNode = new SpinalNode(param.name, param.type, element);
	spinalNode.info.add_attr({
		idNetwork: element.id,
		displayName: element.displayName || "",
		browseName: element.browseName || "",
		path: element.path
	});

	return { node: spinalNode, relation: _getNodeRelationName(param.type), alreadyExist: false };
}

function _generateDevice(node: IOPCNode) {
	let param = {
		id: node.nodeId.toString(),
		name: node.displayName,
		type: SpinalBmsDevice.nodeTypeName,
		path: node.path,
		nodeTypeName: SpinalBmsDevice.nodeTypeName,
		server: {
			address: node.server?.address,
			port: node.server?.port,
			endpoint: node.server?.endpoint || ""
		},
		displayName: node?.displayName,
		browseName: node?.browseName
	};


	let element = new SpinalBmsDevice(param as any);
	const spinalNode = new SpinalNode(param.name, param.type, element);
	spinalNode.info.add_attr({
		idNetwork: element.id,
		displayName: element.displayName || "",
		browseName: element.browseName || "",
		path: element.path,
		server: {
			address: node.server?.address,
			port: node.server?.port,
			endpoint: node.server?.endpoint || ""
		},
	});

	return { node: spinalNode, relation: _getNodeRelationName(param.type), alreadyExist: false };
}

function _getNodeRelationName(type: string) {
	switch (type) {
		case SpinalBmsEndpoint.nodeTypeName:
			return SpinalBmsEndpoint.relationName;

		case SpinalBmsEndpointGroup.nodeTypeName:
			return SpinalBmsEndpointGroup.relationName;

		case SpinalBmsDevice.nodeTypeName:
			return SpinalBmsDevice.relationName;

		case SpinalBmsNetwork.nodeTypeName:
			return SpinalBmsNetwork.relationName;
	}
}

function _formatTree(tree: IOPCNode) {
	if (tree.nodeClass != NodeClass.Variable) return { children: tree.children, attributes: [] };

	return tree.children.reduce(
		(obj, item) => {
			if (item.nodeClass == NodeClass.Variable && (!item?.children || item?.children?.length == 0)) {
				obj.attributes.push(item);
			} else {
				obj.children.push(item);
			}

			return obj;
		},
		{ children: [], attributes: [] }
	);
}

function _createNodeAttributes(node: SpinalNode, attributes: IOPCNode[], values: { [key: string]: any } = {}) {
	const categoryName: string = "OPC Attributes";

	//[TODO] use createOrUpdateAttrsAndCategories
	const formatted = attributes.reduce((obj, el) => {
		const key = normalizePath(el.path) || el.nodeId.toString();
		const value = values[key]?.value || "";
		obj[el.displayName] = value;
		return obj;
	}, {});

	//@ts-ignore
	return serviceDocumentation.createOrUpdateAttrsAndCategories(node, categoryName, formatted).then((result) => {
		return result;
	})

	// return serviceDocumentation.addCategoryAttribute(node, categoryName).then((attributeCategory) => {
	// 	const promises = [];
	// 	const formatted = attributes.map((el) => {
	// 		const key = normalizePath(el.path) || el.nodeId.toString();
	// 		return {
	// 			name: el.displayName,
	// 			value: values[key]?.value || ""
	// 		};
	// 	});

	// 	for (const { name, value } of formatted) {
	// promises.push(serviceDocumentation.addAttributeByCategory(node, attributeCategory, name, value));
	// 	}

	// 	return Promise.all(promises);
	// });
}

async function _changeValueAndDataType(node: SpinalNode, data: { value: any; dataType: string }) {
	const element = await node.getElement();
	// element.mod_attr("currentValue", data?.value || "null"); // may be bad if value is boolean
	element.mod_attr("currentValue", data?.value);
	element.mod_attr("dataType", data?.dataType || "");
}

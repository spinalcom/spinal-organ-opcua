import { SPINAL_RELATION_PTR_LST_TYPE, SpinalContext, SpinalGraphService, SpinalNode } from "spinal-env-viewer-graph-service";
import { SpinalBmsDevice, SpinalBmsEndpoint, SpinalBmsEndpointGroup, SpinalBmsNetwork } from "spinal-model-bmsnetwork";
import { serviceDocumentation } from "spinal-env-viewer-plugin-documentation-service";
import { NodeClass } from "node-opcua";

import OPCUAService from "./OPCUAService";
import { IOPCNode } from "../interfaces/OPCNode";

export async function _transformTreeToGraphRecursively(context: SpinalContext, tree: IOPCNode, nodesAlreadyCreated: {[key:string]: SpinalNode}, parent?: SpinalNode, values: { [key: string]: any } = {}, depth: number = 0) {
	
	const { node, relation, alreadyExist } = await getNodeAndRelation(tree, nodesAlreadyCreated, values, depth);

	const { children, attributes } = _formatTree(tree);
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

export async function getNodeAlreadyCreated(context: SpinalContext, network: SpinalNode): Promise<{[key:string]: SpinalNode}> {
	const obj = {};

	return network.findInContext(context, (node) => {
		if(node.info?.idNetwork?.get()) obj[node.info.idNetwork.get()] = node;
		return true;
	}).then((result) => {
		return obj;
	})
}

async function getNodeAndRelation(node: IOPCNode, nodesAlreadyCreated: {[key:string]: SpinalNode}, values: { [key: string]: any } = {}, depth: number = 0): Promise<{ node: SpinalNode; relation: string; alreadyExist: boolean }> {
	let spinalNode: SpinalNode = nodesAlreadyCreated[node.nodeId.toString()];

	if (!spinalNode) {
		if(depth == 0) return _generateDevice(node);
		return _generateNodeAndRelation(node, values);
	}

	const relation = _getNodeRelationName(spinalNode.getType().get());
	const data = values[node.nodeId.toString()];
	await _changeValueAndDataType(spinalNode, data);
	return { node: spinalNode, relation, alreadyExist: true };
}

function _generateNodeAndRelation(node: IOPCNode, values: { [key: string]: any } = {}): { node: SpinalNode; relation: string; alreadyExist: boolean } {
	let element;
	let param: any = {
		id: node.nodeId.toString(),
		name: node.displayName,
		path: node.path,
		displayName: node.displayName || "",
		browseName: node.browseName || ""
	};

	const opcuaService: OPCUAService = new OPCUAService();

	if (opcuaService.isVaraiable(node)) {
		const dataValue = values[node.nodeId.toString()];
		param = {
			...param,
			typeId: "",
			nodeTypeName: SpinalBmsEndpoint.nodeTypeName,
			type: SpinalBmsEndpoint.nodeTypeName,
			currentValue: dataValue?.value || "null",
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
		idNetwork: param.id, 
		displayName: param.displayName || "",
		browseName: param.browseName || "",
		path: param.path
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
		address: "",
		displayName: node?.displayName,
		browseName: node?.browseName
	};


	let element = new SpinalBmsDevice(param as any);
	const spinalNode = new SpinalNode(param.name, param.type, element);
	spinalNode.info.add_attr({ 
		idNetwork: param.id,
		displayName: param.displayName || "",
		browseName: param.browseName || "",
		path: param.path
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

	return serviceDocumentation.addCategoryAttribute(node, categoryName).then((attributeCategory) => {
		const promises = [];
		const formatted = attributes.map((el) => ({ name: el.displayName, value: values[el.nodeId.toString()]?.value || "" }));

		for (const { name, value } of formatted) {
			promises.push(serviceDocumentation.addAttributeByCategory(node, attributeCategory, name, value));
		}

		return Promise.all(promises);
	});
}

async function _changeValueAndDataType(node: SpinalNode, data: { value: any; dataType: string }) {
	const element = await node.getElement();
	element.mod_attr("currentValue", data?.value || "null");
	element.mod_attr("dataType", data?.dataType || "");
}

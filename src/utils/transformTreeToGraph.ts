import { SPINAL_RELATION_PTR_LST_TYPE, SpinalContext, SpinalGraphService, SpinalNode } from "spinal-env-viewer-graph-service";
import { SpinalBmsDevice, SpinalBmsEndpoint, SpinalBmsEndpointGroup, SpinalBmsNetwork } from "spinal-model-bmsnetwork";
import { serviceDocumentation } from "spinal-env-viewer-plugin-documentation-service";
import { NodeClass } from "node-opcua";

import OPCUAService from "./OPCUAService";
import { IOPCNode } from "../interfaces/OPCNode";

export async function _transformTreeToGraphRecursively(context: SpinalContext, tree: IOPCNode, parent?: SpinalNode, values: { [key: string]: any } = {}) {
	const { node, relation, alreadyExist } = getNodeAndRelation(tree, values);

	const { children, attributes } = _formatTree(tree);
	if (attributes && attributes.length > 0) await _createNodeAttributes(node, attributes, values);

	if (parent && !alreadyExist) {
		await parent.addChildInContext(node, relation, SPINAL_RELATION_PTR_LST_TYPE, context);
	}

	const promises = (children || []).map(async (el) => {
		const childNodeInfo = await _transformTreeToGraphRecursively(context, el, node, values);
		return childNodeInfo;
	});

	return Promise.all(promises).then((result) => {
		return { node, relation, alreadyExist };
	});
}

function getNodeAndRelation(node: IOPCNode, values: { [key: string]: any } = {}): { node: SpinalNode; relation: string; alreadyExist: boolean } {
	// let spinalNode: SpinalNode = this.nodes[node.nodeId.toString()];
	// if (!spinalNode) return this._generateNodeAndRelation(node, values);

	// const relation = _getNodeRelationName(spinalNode.getType().get());
	// // return { node: spinalNode, relation, alreadyExist: true };
	// return { node: spinalNode, relation, alreadyExist: true };

	return _generateNodeAndRelation(node, values);
}

function _generateNodeAndRelation(node: IOPCNode, values: { [key: string]: any } = {}): { node: SpinalNode; relation: string; alreadyExist: boolean } {
	let element;
	let param: any = {
		id: node.nodeId.toString(),
		name: node.displayName,
		path: node.path,
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
	spinalNode.info.add_attr({ idNetwork: param.id });

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

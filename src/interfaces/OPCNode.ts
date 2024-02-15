import { NodeClass, NodeId } from "node-opcua";

export interface IOPCNode {
	displayName: string;
	nodeId: NodeId;
	nodeClass?: NodeClass;
	children?: IOPCNode[];
	path?: any;
	[key: string]: any;
}

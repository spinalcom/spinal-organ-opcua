import { NodeClass, NodeId } from "node-opcua";

export interface IOPCNode {
	displayName?: string;
	browseName?: string;
	nodeId: NodeId;
	nodeClass?: NodeClass;
	children?: IOPCNode[];
	path?: string;
	server?: IServer;
	value?: { dataType: string; value: any };
	[key: string]: any;
}


export interface IServer {
	address: string;
	port: number;
	endpoint?: string
	ip?: string; // Deprecated, use address instead
}
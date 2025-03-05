import { NodeClass, NodeId } from "node-opcua";
export interface IOPCNode {
    displayName?: string;
    browseName?: string;
    nodeId: NodeId;
    nodeClass?: NodeClass;
    children?: IOPCNode[];
    path?: string;
    server?: {
        address: string;
        port: number;
        endpoint?: string;
    };
    [key: string]: any;
}

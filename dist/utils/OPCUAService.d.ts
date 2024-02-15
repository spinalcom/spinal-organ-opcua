/// <reference types="node" />
import { ReferenceDescription, UserIdentityInfo, NodeId, DataValue } from "node-opcua";
import { EventEmitter } from "events";
import { IOPCNode } from "../interfaces/OPCNode";
export declare class OPCUAService extends EventEmitter {
    private client?;
    private session?;
    private subscription?;
    private userIdentity;
    verbose: boolean;
    private endpointUrl;
    private monitoredItemsListData;
    private clientAlarms;
    data: {
        reconnectionCount: number;
        tokenRenewalCount: number;
        receivedBytes: number;
        sentBytes: number;
        sentChunks: number;
        receivedChunks: number;
        backoffCount: number;
        transactionCount: number;
    };
    constructor();
    initialize(endpointUrl: string): Promise<void>;
    createSubscription(): Promise<void>;
    connect(endpointUrl: string, userIdentity: UserIdentityInfo): Promise<void>;
    disconnect(): Promise<void>;
    getTree(): Promise<{
        tree: {
            displayName: string;
            nodeId: NodeId;
            children: any[];
        };
        variables: any[];
    }>;
    getChildren(nodesToBrowse: any[]): Promise<{
        [key: string]: ReferenceDescription[];
    }>;
    getTree2(): Promise<any>;
    browseNode(node: any): Promise<any[]>;
    getNodeChildren2(node: IOPCNode): Promise<IOPCNode[]>;
    extractBrowsePath(nodeId: NodeId): Promise<string>;
    readNode(node: IOPCNode | IOPCNode[]): Promise<DataValue[]>;
    readNodeValue(node: IOPCNode | IOPCNode[]): Promise<{
        dataType: string;
        value: any;
    }[]>;
    monitorItem(nodeIds: string | string[], callback: (id: string, data: DataValue) => any): Promise<void>;
    isVaraiable(node: IOPCNode): boolean;
    isObject(node: IOPCNode): boolean;
    private _createSession;
    private _listenClientEvents;
    private _listenSessionEvent;
    private _readBrowseName;
    private _getNodeParent;
}
export declare function w(s: string, l: number, c: string): string;
export default OPCUAService;

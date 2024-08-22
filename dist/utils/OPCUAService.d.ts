/// <reference types="node" />
import { ReferenceDescription, UserIdentityInfo, NodeId, DataValue, NodeIdLike } from "node-opcua";
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
    constructor();
    initialize(endpointUrl: string): Promise<void>;
    createSubscription(): Promise<void>;
    connect(endpointUrl: string, userIdentity?: UserIdentityInfo): Promise<void>;
    disconnect(): Promise<void>;
    getTree(entryPointPath?: string): Promise<{
        tree: {
            displayName: string;
            path: string;
            nodeId: NodeIdLike;
            children: any[];
        };
        variables: any[];
    }>;
    getChildren(nodesToBrowse: any[]): Promise<{
        [key: string]: ReferenceDescription[];
    }>;
    getTree2(entryPointPath?: string): Promise<any>;
    browseNodeRec(node: any): Promise<any[]>;
    getNodeChildren2(node: IOPCNode): Promise<IOPCNode[]>;
    extractBrowsePath(nodeId: NodeId): Promise<string>;
    readNode(node: IOPCNode | IOPCNode[]): Promise<DataValue[]>;
    readNodeValue(node: IOPCNode | IOPCNode[]): Promise<{
        dataType: string;
        value: any;
    }[]>;
    writeNode(node: IOPCNode, value: any): Promise<any>;
    monitorItem(nodeIds: string | string[], callback: (id: string, data: DataValue) => any): Promise<void>;
    isVaraiable(node: IOPCNode): boolean;
    isObject(node: IOPCNode): boolean;
    private _createSession;
    private _listenClientEvents;
    private _listenSessionEvent;
    private _readBrowseName;
    private _getNodeParent;
    private _getNodesDetails;
    private _restartConnection;
    private _getEntryPoint;
    private _getNodeWithPath;
    private _formatReference;
}
export declare function w(s: string, l: number, c: string): string;
export default OPCUAService;

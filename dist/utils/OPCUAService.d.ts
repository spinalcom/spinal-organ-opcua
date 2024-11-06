/// <reference types="node" />
import { UserIdentityInfo, NodeId, DataValue } from "node-opcua";
import { EventEmitter } from "events";
import { IOPCNode } from "../interfaces/OPCNode";
import { SpinalOPCUADiscoverModel } from "spinal-model-opcua";
import { ITreeOption } from "../interfaces/ITreeOption";
export declare class OPCUAService extends EventEmitter {
    private client?;
    private session?;
    private subscription?;
    private userIdentity;
    verbose: boolean;
    private endpointUrl;
    private monitoredItemsListData;
    private clientAlarms;
    private _discoverModel;
    isVariable: typeof OPCUAService.isVariable;
    constructor(modelOrUrl: SpinalOPCUADiscoverModel | string);
    initialize(): Promise<void>;
    createSubscription(): Promise<void>;
    connect(userIdentity?: UserIdentityInfo): Promise<void>;
    disconnect(): Promise<void>;
    getTree(entryPointPath?: string, options?: ITreeOption): Promise<{
        tree: IOPCNode;
        variables: string[];
    }>;
    browseNodeRec(node: any): Promise<IOPCNode[]>;
    _getChildrenAndSaveAddToObj(nodes: IOPCNode[], nodesObj?: {
        [key: string]: IOPCNode;
    }, variables?: string[]): Promise<IOPCNode[]>;
    extractBrowsePath(nodeId: NodeId): Promise<string>;
    readNodeValue(node: IOPCNode | IOPCNode[]): Promise<{
        dataType: string;
        value: any;
    }[]>;
    writeNode(node: IOPCNode, value: any): Promise<any>;
    monitorItem(nodeIds: string | string[], callback: (id: string, data: DataValue) => any): Promise<void>;
    private _browseNode;
    private _browseUsingBrowseDescription;
    private _getNodesDetails;
    private _getNodeParent;
    private _getDiscoverData;
    private _convertTreeToObject;
    private _createSession;
    private _listenClientEvents;
    private _listenSessionEvent;
    private _restartConnection;
    private _getEntryPoint;
    private _getEntryPointWithPath;
    private _formatReference;
    private _formatDataValue;
    private _readBrowseName;
    static isVariable(node: IOPCNode): boolean;
    isObject(node: IOPCNode): boolean;
    private _parseValue;
    readNode(node: IOPCNode | IOPCNode[]): Promise<DataValue[]>;
}
export default OPCUAService;

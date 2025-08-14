/// <reference types="node" />
import { UserIdentityInfo, NodeId, DataValue, ClientMonitoredItemBase } from "node-opcua";
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
    constructor(url: string, model?: SpinalOPCUADiscoverModel);
    initialize(): Promise<void>;
    createSubscription(): Promise<void>;
    connect(userIdentity?: UserIdentityInfo): Promise<void>;
    disconnect(): Promise<void>;
    getTree(entryPointPath?: string, options?: ITreeOption): Promise<{
        tree: IOPCNode;
        variables: string[];
    }>;
    browseNodeRec(node: any): Promise<IOPCNode[]>;
    _getChildrenAndAddToObj(nodes: IOPCNode[], nodesObj?: {
        [key: string]: IOPCNode;
    }): Promise<IOPCNode[]>;
    extractBrowsePath(nodeId: NodeId): Promise<string>;
    readNodeValue(node: IOPCNode | IOPCNode[]): Promise<{
        dataType: string;
        value: any;
    }[]>;
    writeNode(node: IOPCNode, value: any): Promise<any>;
    monitorItem(nodeIds: string | string[], callback: (id: string, data: {
        value: any;
        dataType: string;
    }, monitorItem: ClientMonitoredItemBase) => any): Promise<void>;
    private _listenMonitoredItemEvents;
    private _browseNode;
    private _browseUsingBrowseDescription;
    private _getDataType;
    private readNodeDescription;
    private _getNodeParent;
    private _getDiscoverData;
    private _convertTreeToObject;
    private _convertObjToTree;
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
    private detectOPCUAValueType;
}
export default OPCUAService;

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
    readNode(node: IOPCNode | IOPCNode[]): Promise<DataValue[]>;
    getNodePath(nodeId: string | NodeId): Promise<string>;
    readNodeValue(node: IOPCNode | IOPCNode[]): Promise<{
        dataType: string;
        value: any;
    }[]>;
    writeNode(node: IOPCNode, value: any): Promise<any>;
    monitorItem(nodeIds: string | string[], callback: (id: string, data: {
        value: any;
        dataType: string;
    }, monitorItem: ClientMonitoredItemBase) => any): Promise<void>;
    getNodeByPath(path?: string): Promise<IOPCNode>;
    static isVariable(node: IOPCNode): boolean;
    isObject(node: IOPCNode): boolean;
    getNodesNewInfoByPath(nodes: IOPCNode | IOPCNode[]): Promise<IOPCNode[]>;
    private _listenMonitoredItemEvents;
    private _browseNode;
    private _browseUsingBrowseDescription;
    private _addNodeToNodesObject;
    private _getPossibleDataType;
    private readNodeDescription;
    private _getNodeParent;
    private _getDiscoverStarterData;
    private _convertObjToTree;
    private _getEntryPoint;
    private _formatReference;
    private _formatDataValue;
    private _formatRealValue;
    private _readBrowseName;
    private _createSession;
    private _listenClientEvents;
    private _listenSessionEvent;
    private _restartConnection;
}
export default OPCUAService;

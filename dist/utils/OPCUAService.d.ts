/// <reference types="node" />
import { NodeId, DataValue, ClientMonitoredItemBase } from "node-opcua";
import { EventEmitter } from "events";
import { IOPCNode } from "../interfaces/OPCNode";
import { SpinalOPCUADiscoverModel } from "spinal-model-opcua";
import { ITreeOption } from "../interfaces/ITreeOption";
type CovCallbackType = (id: string, data: {
    value: any;
    dataType: string;
}, monitorItem: ClientMonitoredItemBase) => void;
export declare class OPCUAService extends EventEmitter {
    private client?;
    private session?;
    private subscription?;
    private userIdentity;
    verbose: boolean;
    private endpointUrl;
    private monitoredItemsData;
    private clientAlarms;
    private _discoverModel;
    isVariable: typeof OPCUAService.isVariable;
    private isReconnecting;
    constructor(url: string, model?: SpinalOPCUADiscoverModel);
    private createClient;
    private _listenClientEvents;
    checkAndRetablishConnection(): Promise<void>;
    disconnect(): Promise<void>;
    private _createSession;
    private _listenSessionEvent;
    private createSubscription;
    private connect;
    private reconnect;
    getTree(entryPointPath: string, options?: ITreeOption): Promise<{
        tree: IOPCNode;
        variables: string[];
    } | void>;
    readNode(node: IOPCNode | IOPCNode[]): Promise<DataValue[]>;
    getNodePath(nodeId: string | NodeId): Promise<string>;
    readNodeValue(node: IOPCNode | IOPCNode[]): Promise<{
        dataType: string;
        value: any;
    }[]>;
    writeNode(node: IOPCNode, value: any): Promise<any>;
    monitorItem(nodeIds: string | string[], callback: CovCallbackType, isReconnection?: boolean): Promise<void>;
    getNodeIdByPath(nodePath?: string): Promise<string | void>;
    getNodeByPath(nodePath?: string): Promise<IOPCNode | void>;
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
}
export default OPCUAService;

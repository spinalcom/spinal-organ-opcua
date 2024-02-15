/// <reference types="node" />
import { EventEmitter } from "events";
import { SpinalNode, SpinalContext } from "spinal-env-viewer-graph-service";
import { IServer } from "spinal-model-opcua";
import { IOPCNode } from "../interfaces/OPCNode";
export declare class SpinalDevice extends EventEmitter {
    private endpointUrl;
    private opcuaService;
    private isInit;
    private context;
    private network;
    private device;
    private nodes;
    private endpoints;
    private variablesIds;
    constructor(server: IServer, context: SpinalContext, network: SpinalNode, device: SpinalNode);
    createTreeInGraph(tree: IOPCNode): Promise<SpinalNode[]>;
    monitorItems(nodeIds: string | string[]): Promise<void>;
    updateEndpoints(endpointIds: string | string[], saveTimeSeries?: boolean): Promise<boolean[]>;
    launchTestFunction(): void;
    private monitorCallback;
    private _convertNodesToObj;
    private _getVariablesValues;
    private _transformTreeToGraphRecursively;
    private getNodeAndRelation;
    private _generateNodeAndRelation;
    private _formatValue;
    private _getNodeRelationName;
    private _updateEndpoint;
}

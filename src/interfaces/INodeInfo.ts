

export interface INodeInfo {
    id: string;
    name: string;
    type: string;
    [key: string]: any;
}


export interface IIntervalInfo extends INodeInfo {
    children: INodeInfo[];
}
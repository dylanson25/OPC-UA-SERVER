
export interface DeviceConfig {
    name: string;
    nodeId: string;
    tags: TagConfig[];
}

export interface TagConfig {
    type: string;
    browseName: string;
    nodeId: string;
    initialValue?: boolean;
}
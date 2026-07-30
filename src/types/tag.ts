export type BooleanTagParams = {
  addressSpace: unknown;
  namespace: {
    addVariable: (options: unknown) => unknown;
  };
  device: {
    browseName: string;
  };
  nodeId: string;
  browseName: string;
  initialValue?: boolean;
  minimumSamplingInterval?: number;
}

export type TagDefinition = {
  nodeId: string;
  browseName: string;
}

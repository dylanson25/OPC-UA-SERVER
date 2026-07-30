import type { IAddressSpace, INamespace, UAObject } from 'node-opcua-address-space-base';

export type BooleanTagParams = {
  /** Optional addressSpace reference (not required for creating variables) */
  addressSpace?: IAddressSpace;
  namespace: INamespace;
  device: UAObject;
  nodeId: string;
  browseName: string;
  initialValue?: boolean;
  minimumSamplingInterval?: number;
}

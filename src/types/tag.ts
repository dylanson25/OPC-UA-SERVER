import type {
  IAddressSpace,
  INamespace,
  UAObject,
} from 'node-opcua-address-space-base';
import { TagConfig } from './index.ts';

export type BooleanTagParams = {
  /** Optional addressSpace reference (not required for creating variables) */
  addressSpace?: IAddressSpace;
  namespace: INamespace;
  device: UAObject;
  nodeId: string;
  browseName: string;
  initialValue?: boolean;
  minimumSamplingInterval?: number;
};

export interface CreateTagParams {
  namespace: INamespace;
  device: UAObject;
  config: TagConfig;
}

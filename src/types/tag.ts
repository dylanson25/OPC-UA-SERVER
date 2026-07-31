import type {
  IAddressSpace,
  INamespace,
  UAObject,
} from 'node-opcua-address-space-base';
import type { DataType } from 'node-opcua';
import { TagConfig } from './index.ts';

export interface PrimitiveTagParams {
  namespace: INamespace;
  device: UAObject;
  nodeId: string;
  browseName: string;
  initialValue: unknown;
  minimumSamplingInterval?: number;
  dataType: string;
  valueType: DataType;
  parser: (value: unknown) => unknown;
  label: string;
  changeThreshold?: number;
}

export interface CreateTagParams {
  namespace: INamespace;
  device: UAObject;
  config: TagConfig;
}

import type {
  INamespace,
  UAObject,
} from 'node-opcua-address-space-base';
import type { DataType } from 'node-opcua';
import type { MetricsService } from '../metrics/index.ts';
import type { TagRuntime } from '../tags/tag-runtime.ts';
import { TagConfig, TagType } from './index.ts';

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
  /** This tag's config `type` (e.g. 'float') — only needed for the tagRuntime hooks below. */
  tagType?: TagType;
  /** The devices.json key of the owning device (#40's `--device` selector). */
  deviceKey?: string;
  /** Optional: registers the tag and streams every value change (#40's watch/get). */
  tagRuntime?: TagRuntime;
}

export interface CreateTagParams {
  namespace: INamespace;
  device: UAObject;
  config: TagConfig;
  metrics?: MetricsService;
  deviceKey?: string;
  tagRuntime?: TagRuntime;
}

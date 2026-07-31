export interface DeviceConfig {
  name: string;
  nodeId: string;
  tags: TagConfig[];
}

export type TagType =
  | 'boolean'
  | 'integer'
  | 'float'
  | 'double'
  | 'string'
  | 'dateTime';

export interface BaseTagConfig {
  browseName: string;
  nodeId: string;
  threshold?: number;
}

export interface BooleanTagConfig extends BaseTagConfig {
  type: 'boolean';
  initialValue?: boolean;
}

export interface IntegerTagConfig extends BaseTagConfig {
  type: 'integer';
  initialValue?: number;
}

export interface FloatTagConfig extends BaseTagConfig {
  type: 'float';
  initialValue?: number;
}

export interface DoubleTagConfig extends BaseTagConfig {
  type: 'double';
  initialValue?: number;
}

export interface StringTagConfig extends BaseTagConfig {
  type: 'string';
  initialValue?: string;
}

export interface DateTimeTagConfig extends BaseTagConfig {
  type: 'dateTime';
  initialValue?: string | number | Date;
}

export type TagConfig =
  | BooleanTagConfig
  | IntegerTagConfig
  | FloatTagConfig
  | DoubleTagConfig
  | StringTagConfig
  | DateTimeTagConfig;

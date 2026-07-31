import * as opcua from 'node-opcua';

import { addPrimitiveTag } from './primitive.js';
import { createModuleLogger } from '../infrastructure/logger/index.js';
import type { CreateTagParams } from '../types/index.ts';

const logger = createModuleLogger('address-space');

export function createTag({ namespace, device, config }: CreateTagParams): void {
  switch (config.type) {
    case 'boolean':
      addPrimitiveTag({
        namespace,
        device,
        nodeId: config.nodeId,
        browseName: config.browseName,
        initialValue: config.initialValue ?? false,
        dataType: 'Boolean',
        valueType: opcua.DataType.Boolean,
        parser: (value) => Boolean(value ?? false),
        label: 'Boolean',
      });
      return;
    case 'integer':
      addPrimitiveTag({
        namespace,
        device,
        nodeId: config.nodeId,
        browseName: config.browseName,
        initialValue: config.initialValue ?? 0,
        dataType: 'Integer',
        valueType: opcua.DataType.Int32,
        parser: (value) => Number.parseInt(String(value ?? 0), 10),
        label: 'Integer',
      });
      return;
    case 'float':
      addPrimitiveTag({
        namespace,
        device,
        nodeId: config.nodeId,
        browseName: config.browseName,
        initialValue: config.initialValue ?? 0,
        dataType: 'Float',
        valueType: opcua.DataType.Float,
        parser: (value) => Number(value ?? 0),
        label: 'Float',
      });
      return;
    case 'double':
      addPrimitiveTag({
        namespace,
        device,
        nodeId: config.nodeId,
        browseName: config.browseName,
        initialValue: config.initialValue ?? 0,
        dataType: 'Double',
        valueType: opcua.DataType.Double,
        parser: (value) => Number(value ?? 0),
        label: 'Double',
      });
      return;
    case 'string':
      addPrimitiveTag({
        namespace,
        device,
        nodeId: config.nodeId,
        browseName: config.browseName,
        initialValue: config.initialValue ?? '',
        dataType: 'String',
        valueType: opcua.DataType.String,
        parser: (value) => String(value ?? ''),
        label: 'String',
      });
      return;
    case 'dateTime':
      addPrimitiveTag({
        namespace,
        device,
        nodeId: config.nodeId,
        browseName: config.browseName,
        initialValue: config.initialValue
          ? new Date(config.initialValue)
          : new Date(),
        dataType: 'DateTime',
        valueType: opcua.DataType.DateTime,
        parser: (value) =>
          new Date(value instanceof Date ? value : String(value ?? new Date())),
        label: 'DateTime',
      });
      return;
    default:
      logger.warn({ tagType: 'unknown' }, 'Unsupported tag type');
      return;
  }
}

import * as opcua from 'node-opcua';

import { addPrimitiveTag } from './primitive.ts';
import { createModuleLogger } from '../infrastructure/logger/index.ts';
import { ErrorCode, TagError, logAppError } from '../errors/index.ts';
import type { CreateTagParams } from '../types/index.ts';

const logger = createModuleLogger('address-space');

export function createTag({ namespace, device, config, metrics, deviceKey, tagRuntime }: CreateTagParams): void {
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
        tagType: config.type,
        deviceKey,
        tagRuntime,
      });
      metrics?.recordTagCreated('boolean');
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
        changeThreshold: config.threshold,
        tagType: config.type,
        deviceKey,
        tagRuntime,
      });
      metrics?.recordTagCreated('integer');
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
        changeThreshold: config.threshold,
        tagType: config.type,
        deviceKey,
        tagRuntime,
      });
      metrics?.recordTagCreated('float');
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
        changeThreshold: config.threshold,
        tagType: config.type,
        deviceKey,
        tagRuntime,
      });
      metrics?.recordTagCreated('double');
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
        tagType: config.type,
        deviceKey,
        tagRuntime,
      });
      metrics?.recordTagCreated('string');
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
        tagType: config.type,
        deviceKey,
        tagRuntime,
      });
      metrics?.recordTagCreated('dateTime');
      return;
    default: {
      const unsupported = config as { type?: unknown; browseName?: string };
      logAppError(
        logger,
        new TagError(
          ErrorCode.TAG_TYPE_NOT_SUPPORTED,
          'Unsupported tag type',
          { tagType: unsupported.type, browseName: unsupported.browseName },
        ),
      );
      metrics?.recordError('TagError');
      return;
    }
  }
}

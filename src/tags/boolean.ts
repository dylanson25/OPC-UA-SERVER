import * as opcua from 'node-opcua';
import type { BooleanTagParams } from '../types/index.ts';
/**
 * Returns an "HH:MM:SS.mmm" timestamp for change-log lines.
 */
const timestamp = (): string => {
  const now = new Date();
  return `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}.${now.getMilliseconds()}`;
};

/**
 * Adds a Boolean variable to `device` with logged get/set semantics.
 */
export function addBooleanTag({
  namespace,
  device,
  nodeId,
  browseName,
  initialValue = true,
  minimumSamplingInterval = 1000,
}: BooleanTagParams): void {
  let currentValue = initialValue;

  namespace.addVariable({
    componentOf: device,
    nodeId,
    browseName,
    dataType: 'Boolean',
    minimumSamplingInterval,
    value: {
      get: () =>
        new opcua.Variant({
          dataType: opcua.DataType.Boolean,
          value: currentValue,
        }),
      set: (variant: { value: unknown }) => {
        const newValue = Boolean(variant.value);
        if (newValue !== currentValue) {
          console.log(
            `\n----- ${device.browseName} | ${nodeId} | ${timestamp()} -----`,
          );
          console.log(`${browseName} (${nodeId}):`, newValue);
        }
        currentValue = newValue;
        return opcua.StatusCodes.Good;
      },
    },
  });
}

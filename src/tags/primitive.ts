import * as opcua from 'node-opcua';

import { createModuleLogger } from '../infrastructure/logger/index.js';
import { hasSignificantChange } from '../utils/index.ts'
import type { PrimitiveTagParams } from '../types/index.ts';

const logger = createModuleLogger('address-space');

export function addPrimitiveTag({
    namespace,
    device,
    nodeId,
    browseName,
    initialValue,
    minimumSamplingInterval = 1000,
    dataType,
    valueType,
    parser,
    label,
    changeThreshold = 0.01
}: PrimitiveTagParams): void {
    let currentValue = initialValue;

    namespace.addVariable({
        componentOf: device,
        nodeId,
        browseName,
        dataType,
        minimumSamplingInterval,
        value: {
            get: () =>
                new opcua.Variant({
                    dataType: valueType,
                    value: currentValue,
                }),
            set: (variant: { value: unknown }) => {
                const newValue = parser(variant.value);

                if (hasSignificantChange(currentValue, newValue, changeThreshold)) {
                    logger.debug(
                        {
                            device: device.browseName.toString(),
                            nodeId: nodeId.toString(),
                            browseName,
                            oldValue: currentValue,
                            newValue,
                        },
                        `${label} tag changed`,
                    );
                }

                currentValue = newValue;
                return opcua.StatusCodes.Good;
            },
        },
    });
}

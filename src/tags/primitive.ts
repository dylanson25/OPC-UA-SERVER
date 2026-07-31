import * as opcua from 'node-opcua';

import { createModuleLogger } from '../infrastructure/logger/index.js';
import type { PrimitiveTagParams } from '../types/index.ts';

const logger = createModuleLogger('address-space');

const timestamp = (): string => {
    const now = new Date();
    return `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}.${now.getMilliseconds()}`;
};

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

                if (newValue !== currentValue) {
                    logger.info(
                        {
                            device: device.browseName,
                            nodeId,
                            browseName,
                            newValue,
                            timestamp: timestamp(),
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

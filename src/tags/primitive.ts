import * as opcua from 'node-opcua';

import { createModuleLogger } from '../infrastructure/logger/index.ts';
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
    changeThreshold = 0.01,
    tagType,
    deviceKey,
    tagRuntime,
}: PrimitiveTagParams): void {
    let currentValue = initialValue;
    const deviceLabel = device.browseName.toString();

    // Only registers when the caller passed everything needed to identify this tag on
    // the wire (#40's --device selector needs a real key, not just the OPC UA device
    // object's browseName) — every other caller (including all existing tests) simply
    // doesn't get a watch/get-able tag, exactly as before this feature existed.
    if (tagRuntime && tagType && deviceKey) {
        tagRuntime.register({
            device: deviceKey,
            deviceName: deviceLabel,
            browseName,
            nodeId,
            type: tagType,
            value: currentValue,
        });
    }

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

                // Unconditional: only ever visible at --log-level trace (pino's own level
                // filtering no-ops this call otherwise), for diagnosing whether the
                // changeThreshold deadband below is filtering out updates you expect to see.
                logger.trace(
                    {
                        device: deviceLabel,
                        nodeId: nodeId.toString(),
                        browseName,
                        oldValue: currentValue,
                        newValue,
                    },
                    `${label} tag value updated`,
                );

                // Computed once — feeds both the debug-log deadband below and the
                // `tag-updates` stream (#40), so `watch`'s default filtered view can never
                // disagree with what the server's own logs consider "a change worth noting".
                const significant = hasSignificantChange(currentValue, newValue, changeThreshold);

                if (significant) {
                    logger.debug(
                        {
                            device: deviceLabel,
                            nodeId: nodeId.toString(),
                            browseName,
                            oldValue: currentValue,
                            newValue,
                        },
                        `${label} tag changed`,
                    );
                }

                if (tagRuntime && tagType && deviceKey) {
                    tagRuntime.recordChange({
                        device: deviceKey,
                        deviceName: deviceLabel,
                        browseName,
                        nodeId,
                        type: tagType,
                        oldValue: currentValue,
                        newValue,
                        significant,
                        timestamp: new Date().toISOString(),
                    });
                }

                currentValue = newValue;
                return opcua.StatusCodes.Good;
            },
        },
    });
}

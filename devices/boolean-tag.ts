import * as opcua from 'node-opcua';

/**
 * Returns an "HH:MM:SS.mmm" timestamp for change-log lines.
 */
const timestamp = () => {
  const now = new Date();
  return `${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}.${now.getMilliseconds()}`;
};

/**
 * Adds a Boolean variable to `device` with logged get/set semantics.
 *
 * @param {object} params
 * @param {object} params.addressSpace
 * @param {object} params.namespace
 * @param {object} params.device        - parent object (componentOf)
 * @param {string} params.nodeId        - e.g. "s=PRS_20_AF"
 * @param {string} params.browseName    - e.g. "Top_Platen_Home_Switch_PRS-20"
 * @param {boolean} [params.initialValue=true]
 * @param {number} [params.minimumSamplingInterval=1000]
 */
export function addBooleanTag({
  addressSpace,
  namespace,
  device,
  nodeId,
  browseName,
  initialValue = true,
  minimumSamplingInterval = 1000,
}) {
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
      set: (variant) => {
        const newValue = !!variant.value;
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

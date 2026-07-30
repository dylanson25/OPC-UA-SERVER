import { addBooleanTag } from './boolean-tag.js';

/**
 *  Add/remove tags here only
 */
const TAGS = [
  { nodeId: 's=20_Device_1', browseName: 'Running' },
  { nodeId: 's=21_Device_1', browseName: 'Home_Switch' },
];

export const SetUpPlcDevice = (addressSpace, namespace) => {
  const devicePLC = namespace.addObject({
    organizedBy: addressSpace.rootFolder.objects,
    browseName: 'device_1',
  });

  for (const tag of TAGS) {
    addBooleanTag({ addressSpace, namespace, device: devicePLC, ...tag });
  }

  return devicePLC;
};

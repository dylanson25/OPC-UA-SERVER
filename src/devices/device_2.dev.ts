import { addBooleanTag } from '../tags/index.js';
import type { TagDefinition, AddressSpaceLike, NamespaceLike } from '../types/index.d.ts';

/**
 *  Add/remove tags here only
 */
const TAGS: TagDefinition[] = [
  { nodeId: 's=20_Device_2', browseName: 'Running' },
  { nodeId: 's=22_Device_2', browseName: 'Home_Switch' },
];

export const SetUpPlcTPDevice = (
  addressSpace: AddressSpaceLike,
  namespace: NamespaceLike | any,
) => {
  const devicePLC = namespace.addObject({
    organizedBy: addressSpace.rootFolder.objects,
    browseName: 'device_2',
  });

  for (const tag of TAGS) {
    addBooleanTag({ addressSpace, namespace, device: devicePLC, ...tag });
  }

  return devicePLC;
};

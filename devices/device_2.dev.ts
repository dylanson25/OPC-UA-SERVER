import { addBooleanTag } from './boolean-tag.js';

interface TagDefinition {
  nodeId: string;
  browseName: string;
}

interface AddressSpaceLike {
  rootFolder: {
    objects: object;
  };
}

type NamespaceLike = {
  addObject: (options: {
    browseName: string;
    organizedBy: object | string;
  }) => {
    browseName: string;
  };
  addVariable: (options: unknown) => unknown;
};

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

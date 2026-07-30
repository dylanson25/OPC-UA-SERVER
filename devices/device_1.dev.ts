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
  { nodeId: 's=20_Device_1', browseName: 'Running' },
  { nodeId: 's=21_Device_1', browseName: 'Home_Switch' },
];

export const SetUpPlcDevice = (
  addressSpace: AddressSpaceLike,
  namespace: NamespaceLike | any,
) => {
  const devicePLC = namespace.addObject({
    organizedBy: addressSpace.rootFolder.objects,
    browseName: 'device_1',
  });

  for (const tag of TAGS) {
    addBooleanTag({ addressSpace, namespace, device: devicePLC, ...tag });
  }

  return devicePLC;
};

import type {
    NamespaceLike,
    DeviceConfig
} from '../types/index.ts';


import { addBooleanTag } from '../tags/index.ts';


export function createDevice(
    namespace: NamespaceLike,
    config: DeviceConfig
) {

    const device = namespace.addObject({
        browseName: config.name,
        organizedBy: 'ObjectsFolder'
    });


    for (const tag of config.tags) {
        switch (tag.type) {
            case 'boolean':
                addBooleanTag({
                    namespace,
                    device,
                    ...tag
                });
                break;
            default:
                console.warn(
                    `Unknown tag type: ${tag.type}`
                );
        }

    }


    return device;
}
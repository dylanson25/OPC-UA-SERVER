import { BrowseDirection, DataType, NodeClass } from 'node-opcua';
import type { BaseNode, IAddressSpace, UAObject, UAVariable } from 'node-opcua-address-space-base';

import { createModuleLogger } from '../infrastructure/logger/index.ts';
import { hasSignificantChange } from '../utils/index.ts';
import type { DeviceConfig, TagConfig, TagType } from '../types/index.ts';
import type { TagRuntime } from '../tags/tag-runtime.ts';

const logger = createModuleLogger('address-space');

const DATA_TYPE_TO_TAG_TYPE: Partial<Record<DataType, TagType>> = {
    [DataType.Boolean]: 'boolean',
    [DataType.SByte]: 'integer',
    [DataType.Byte]: 'integer',
    [DataType.Int16]: 'integer',
    [DataType.UInt16]: 'integer',
    [DataType.Int32]: 'integer',
    [DataType.UInt32]: 'integer',
    [DataType.Int64]: 'integer',
    [DataType.UInt64]: 'integer',
    [DataType.Float]: 'float',
    [DataType.Double]: 'double',
    [DataType.String]: 'string',
    [DataType.DateTime]: 'dateTime',
};

/**
 * Every UAObject directly organized under the standard Objects folder (i=85) whose
 * namespace is neither the base UA namespace (0) nor the server's own devices.json
 * namespace — i.e. every top-level object an imported NodeSet2 XML file (#58's
 * `--nodeset-file`) added. Mirrors how createDevice() (device-factory.ts) organizes
 * our own devices the same way, just in a different namespace.
 */
function findImportedObjects(addressSpace: IAddressSpace, ownNamespaceIndex: number): UAObject[] {
    const objectsFolder = addressSpace.rootFolder.objects;

    return objectsFolder
        .findReferencesExAsObject('Organizes', BrowseDirection.Forward)
        .filter(
            (node: BaseNode): node is UAObject =>
                node.nodeClass === NodeClass.Object &&
                node.nodeId.namespace !== 0 &&
                node.nodeId.namespace !== ownNamespaceIndex,
        );
}

/**
 * Bridges UAVariable nodes that came from an imported NodeSet2 XML file into the same
 * `watch`/`get` machinery devices.json-declared tags use (#40). Those variables have
 * no DeviceManager/TagRuntime registration of their own — node-opcua's own NodeSet2
 * importer (driven by `nodeset_filename`, see opcua-server-manager.ts) creates them
 * directly, with no hook into TagRuntime — so without this, an imported node's value
 * changes (from an OPC UA client writing to it) would be invisible to `watch`/`get`,
 * which only know about devices.json's own tags.
 *
 * Returns a devices.json-shaped `{key, config}[]` list — one entry per imported
 * top-level object, its UAVariable children as tags — for OPCUAServerManager to merge
 * alongside `DeviceManager.list()` when resolving a `watch`/`get` selector. A variable
 * whose DataType has no TagType equivalent (e.g. NodeId, ExtensionObject) is skipped
 * and logged, the same "log and continue" approach DeviceManager.register() uses for a
 * device that fails to register.
 */
export function discoverNodesetDevices(
    addressSpace: IAddressSpace,
    ownNamespaceIndex: number,
    tagRuntime?: TagRuntime,
): { key: string; config: DeviceConfig }[] {
    return findImportedObjects(addressSpace, ownNamespaceIndex).map((object) => {
        const key = object.browseName.name ?? object.browseName.toString();
        const deviceName = object.displayName?.[0]?.text ?? key;

        const tags: TagConfig[] = [];

        for (const child of object.getComponents()) {
            if (child.nodeClass !== NodeClass.Variable) continue;

            const variable = child as UAVariable;
            const nodeId = variable.nodeId.toString();
            const browseName = variable.browseName.name ?? variable.browseName.toString();
            const dataValue = variable.readValue();
            const type = DATA_TYPE_TO_TAG_TYPE[dataValue.value.dataType as DataType];

            if (!type) {
                logger.warn(
                    { device: key, browseName, dataType: DataType[dataValue.value.dataType] },
                    'Imported nodeset variable has an unsupported DataType, skipping for watch/get',
                );
                continue;
            }

            tags.push({ type, browseName, nodeId } as TagConfig);

            if (tagRuntime) {
                tagRuntime.register({ device: key, deviceName, browseName, nodeId, type, value: dataValue.value.value });

                variable.on('value_changed', (newDataValue) => {
                    const oldValue = tagRuntime.getValue(nodeId);
                    const newValue = newDataValue.value.value;

                    tagRuntime.recordChange({
                        device: key,
                        deviceName,
                        browseName,
                        nodeId,
                        type,
                        oldValue,
                        newValue,
                        significant: hasSignificantChange(oldValue, newValue),
                        timestamp: new Date().toISOString(),
                    });
                });
            }
        }

        return { key, config: { name: deviceName, nodeId: object.nodeId.toString(), tags } };
    });
}

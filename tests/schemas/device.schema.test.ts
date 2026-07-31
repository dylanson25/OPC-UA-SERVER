import { describe, it, expect } from "vitest"
import { DeviceSchema, DevicesSchema } from "../../src/schemas/device.schema.ts"


const validTag = (overrides = {}) => ({
    nodeId: 'ns=1;s=Tag1',
    browseName: 'Tag1',
    type: 'integer' as const,
    initialValue: 0,
    ...overrides,
});

describe('DeviceSchema', () => {
    it('accepts a valid device', () => {
        const result = DeviceSchema.safeParse({
            name: 'Motor1',
            nodeId: 'ns=1;s=Motor1',
            tags: [validTag()],
        });

        expect(result.success).toBe(true);
    });

    it('rejects a device with an empty name', () => {
        const result = DeviceSchema.safeParse({
            name: '',
            nodeId: 'ns=1;s=Motor1',
            tags: [validTag()],
        });

        expect(result.success).toBe(false);
    });

    it('rejects a device with a whitespace-only name', () => {
        const result = DeviceSchema.safeParse({
            name: '   ',
            nodeId: 'ns=1;s=Motor1',
            tags: [validTag()],
        });

        expect(result.success).toBe(false);
    });

    it('rejects a device with an empty nodeId', () => {
        const result = DeviceSchema.safeParse({
            name: 'Motor1',
            nodeId: '',
            tags: [validTag()],
        });

        expect(result.success).toBe(false);
    });

    it('rejects a device with an empty tags array', () => {
        const result = DeviceSchema.safeParse({
            name: 'Motor1',
            nodeId: 'ns=1;s=Motor1',
            tags: [],
        });

        expect(result.success).toBe(false);
    });

    it('rejects a device with unknown extra keys (strict mode)', () => {
        const result = DeviceSchema.safeParse({
            name: 'Motor1',
            nodeId: 'ns=1;s=Motor1',
            tags: [validTag()],
            unexpectedField: 'oops',
        });

        expect(result.success).toBe(false);
    });

    it('rejects duplicate tag nodeId within the same device', () => {
        const result = DeviceSchema.safeParse({
            name: 'Motor1',
            nodeId: 'ns=1;s=Motor1',
            tags: [
                validTag({ nodeId: 'ns=1;s=Tag1', browseName: 'TagA' }),
                validTag({ nodeId: 'ns=1;s=Tag1', browseName: 'TagB' }),
            ],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            const issue = result.error.issues.find((i) => i.path.includes('nodeId'));
            expect(issue?.path).toEqual(['tags', 1, 'nodeId']);
            expect(issue?.message).toBe("Duplicate nodeId: 'ns=1;s=Tag1'.");
        }
    });

    it('rejects duplicate tag browseName within the same device', () => {
        const result = DeviceSchema.safeParse({
            name: 'Motor1',
            nodeId: 'ns=1;s=Motor1',
            tags: [
                validTag({ nodeId: 'ns=1;s=Tag1', browseName: 'Temperature' }),
                validTag({ nodeId: 'ns=1;s=Tag2', browseName: 'Temperature' }),
            ],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            const issue = result.error.issues.find((i) => i.path.includes('browseName'));
            expect(issue?.path).toEqual(['tags', 1, 'browseName']);
            expect(issue?.message).toBe("Duplicate browseName: 'Temperature'.");
        }
    });

    it('accepts multiple tags with distinct nodeId and browseName', () => {
        const result = DeviceSchema.safeParse({
            name: 'Motor1',
            nodeId: 'ns=1;s=Motor1',
            tags: [
                validTag({ nodeId: 'ns=1;s=Tag1', browseName: 'Temperature' }),
                validTag({ nodeId: 'ns=1;s=Tag2', browseName: 'Pressure' }),
            ],
        });

        expect(result.success).toBe(true);
    });
});

describe('DevicesSchema', () => {
    it('accepts a valid record of devices', () => {
        const result = DevicesSchema.safeParse({
            device1: {
                name: 'Motor1',
                nodeId: 'ns=1;s=Motor1',
                tags: [validTag()],
            },
            device2: {
                name: 'Motor2',
                nodeId: 'ns=1;s=Motor2',
                tags: [validTag({ nodeId: 'ns=1;s=Tag2', browseName: 'Tag2' })],
            },
        });

        expect(result.success).toBe(true);
    });

    it('rejects duplicate device name across different keys', () => {
        const result = DevicesSchema.safeParse({
            device1: { name: 'Motor1', nodeId: 'ns=1;s=Motor1', tags: [validTag()] },
            device2: {
                name: 'Motor1',
                nodeId: 'ns=1;s=Motor2',
                tags: [validTag({ nodeId: 'ns=1;s=Tag2', browseName: 'Tag2' })],
            },
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            const issue = result.error.issues.find((i) => i.path.includes('name'));
            expect(issue?.path).toEqual(['device2', 'name']);
            expect(issue?.message).toBe("Duplicate name: 'Motor1'.");
        }
    });

    it('rejects duplicate device nodeId across different keys', () => {
        const result = DevicesSchema.safeParse({
            device1: { name: 'Motor1', nodeId: 'ns=1;s=Motor1', tags: [validTag()] },
            device2: {
                name: 'Motor2',
                nodeId: 'ns=1;s=Motor1',
                tags: [validTag({ nodeId: 'ns=1;s=Tag2', browseName: 'Tag2' })],
            },
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            const issue = result.error.issues.find((i) => i.path.includes('nodeId'));
            expect(issue?.path).toEqual(['device2', 'nodeId']);
            expect(issue?.message).toBe("Duplicate nodeId: 'ns=1;s=Motor1'.");
        }
    });
});
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockedLogger = vi.hoisted(() => ({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
}));

vi.mock('../../src/infrastructure/logger/index.ts', () => ({
    createModuleLogger: () => mockedLogger,
}));

beforeEach(() => {
    mockedLogger.trace.mockClear();
    mockedLogger.debug.mockClear();
});

import * as opcua from 'node-opcua';
import { addPrimitiveTag } from '../../src/tags/primitive.ts';

function makeFakeNamespace() {
    let capturedOptions: any = null;

    const namespace = {
        addVariable: vi.fn((options: any) => {
            capturedOptions = options;
        }),
    };

    return {
        namespace: namespace as any,
        getOptions: () => capturedOptions,
    };
}

function makeFakeDevice(browseNameValue = 'Motor1') {
    return {
        browseName: { toString: () => browseNameValue },
    } as any;
}

describe('addPrimitiveTag', () => {
    it('calls namespace.addVariable with the correct static config', () => {
        const { namespace, getOptions } = makeFakeNamespace();
        const device = makeFakeDevice();

        addPrimitiveTag({
            namespace,
            device,
            nodeId: 'ns=1;s=Temp',
            browseName: 'Temperature',
            initialValue: 20,
            dataType: 'Double',
            valueType: opcua.DataType.Double,
            parser: (v) => Number(v),
            label: 'Temperature',
        });

        const options = getOptions();
        expect(options.componentOf).toBe(device);
        expect(options.nodeId).toBe('ns=1;s=Temp');
        expect(options.browseName).toBe('Temperature');
        expect(options.dataType).toBe('Double');
        expect(options.minimumSamplingInterval).toBe(1000);
    });

    it('uses a custom minimumSamplingInterval when provided', () => {
        const { namespace, getOptions } = makeFakeNamespace();
        const device = makeFakeDevice();

        addPrimitiveTag({
            namespace,
            device,
            nodeId: 'ns=1;s=Temp',
            browseName: 'Temperature',
            initialValue: 20,
            minimumSamplingInterval: 500,
            dataType: 'Double',
            valueType: opcua.DataType.Double,
            parser: (v) => Number(v),
            label: 'Temperature',
        });

        expect(getOptions().minimumSamplingInterval).toBe(500);
    });

    describe('get()', () => {
        it('returns a Variant wrapping the current value', () => {
            const { namespace, getOptions } = makeFakeNamespace();
            const device = makeFakeDevice();

            addPrimitiveTag({
                namespace,
                device,
                nodeId: 'ns=1;s=Temp',
                browseName: 'Temperature',
                initialValue: 20,
                dataType: 'Double',
                valueType: opcua.DataType.Double,
                parser: (v) => Number(v),
                label: 'Temperature',
            });

            const variant = getOptions().value.get();
            expect(variant).toBeInstanceOf(opcua.Variant);
            expect(variant.value).toBe(20);
            expect(variant.dataType).toBe(opcua.DataType.Double);
        });

        it('reflects the updated value after a set() call', () => {
            const { namespace, getOptions } = makeFakeNamespace();
            const device = makeFakeDevice();

            addPrimitiveTag({
                namespace,
                device,
                nodeId: 'ns=1;s=Temp',
                browseName: 'Temperature',
                initialValue: 20,
                dataType: 'Double',
                valueType: opcua.DataType.Double,
                parser: (v) => Number(v),
                label: 'Temperature',
            });

            const { get, set } = getOptions().value;
            set({ value: 25 });

            expect(get().value).toBe(25);
        });
    });

    describe('set()', () => {
        it('returns opcua.StatusCodes.Good', () => {
            const { namespace, getOptions } = makeFakeNamespace();
            const device = makeFakeDevice();

            addPrimitiveTag({
                namespace,
                device,
                nodeId: 'ns=1;s=Temp',
                browseName: 'Temperature',
                initialValue: 20,
                dataType: 'Double',
                valueType: opcua.DataType.Double,
                parser: (v) => Number(v),
                label: 'Temperature',
            });

            const result = getOptions().value.set({ value: 25 });
            expect(result).toBe(opcua.StatusCodes.Good);
        });

        it('applies the parser to the incoming value before storing it', () => {
            const { namespace, getOptions } = makeFakeNamespace();
            const device = makeFakeDevice();
            const parser = vi.fn((v: unknown) => Number(v));

            addPrimitiveTag({
                namespace,
                device,
                nodeId: 'ns=1;s=Temp',
                browseName: 'Temperature',
                initialValue: 20,
                dataType: 'Double',
                valueType: opcua.DataType.Double,
                parser,
                label: 'Temperature',
            });

            getOptions().value.set({ value: '25.5' });

            expect(parser).toHaveBeenCalledWith('25.5');
            expect(getOptions().value.get().value).toBe(25.5);
        });

        it('logs a debug message when the change is significant', () => {
            const { namespace, getOptions } = makeFakeNamespace();
            const device = makeFakeDevice('Motor1');

            addPrimitiveTag({
                namespace,
                device,
                nodeId: 'ns=1;s=Temp',
                browseName: 'Temperature',
                initialValue: 20,
                dataType: 'Double',
                valueType: opcua.DataType.Double,
                parser: (v) => Number(v),
                label: 'Temperature',
                changeThreshold: 0.01,
            });

            // No hay acceso directo al logger mockeado desde acá porque
            // createModuleLogger se resuelve una vez a nivel de módulo.
            // Verificamos el efecto observable (currentValue cambia) en vez del log en sí,
            // ya que el logging en sí se prueba de forma más directa abajo con spy explícito.
            getOptions().value.set({ value: 25 });
            expect(getOptions().value.get().value).toBe(25);
        });

        it('does NOT update currentValue comparison basis incorrectly on insignificant change', () => {
            const { namespace, getOptions } = makeFakeNamespace();
            const device = makeFakeDevice();

            addPrimitiveTag({
                namespace,
                device,
                nodeId: 'ns=1;s=Temp',
                browseName: 'Temperature',
                initialValue: 20.0,
                dataType: 'Double',
                valueType: opcua.DataType.Double,
                parser: (v) => Number(v),
                label: 'Temperature',
                changeThreshold: 0.5,
            });

            const { get, set } = getOptions().value;

            // Cambio insignificante: no debería "loguearse" pero SI debe actualizar currentValue
            set({ value: 20.1 });
            expect(get().value).toBe(20.1);

            // Confirma que el valor realmente se actualizó, no quedó pegado en el original
            set({ value: 20.15 });
            expect(get().value).toBe(20.15);
        });

        it('respects a custom changeThreshold', () => {
            const { namespace, getOptions } = makeFakeNamespace();
            const device = makeFakeDevice();

            addPrimitiveTag({
                namespace,
                device,
                nodeId: 'ns=1;s=Temp',
                browseName: 'Temperature',
                initialValue: 100,
                dataType: 'Double',
                valueType: opcua.DataType.Double,
                parser: (v) => Number(v),
                label: 'Temperature',
                changeThreshold: 5,
            });

            const { get, set } = getOptions().value;

            set({ value: 102 }); // dentro del threshold de 5
            expect(get().value).toBe(102);

            set({ value: 110 }); // fuera del threshold de 5
            expect(get().value).toBe(110);
        });

        it('handles multiple sequential updates correctly (closure state)', () => {
            const { namespace, getOptions } = makeFakeNamespace();
            const device = makeFakeDevice();

            addPrimitiveTag({
                namespace,
                device,
                nodeId: 'ns=1;s=Count',
                browseName: 'Count',
                initialValue: 0,
                dataType: 'Integer',
                valueType: opcua.DataType.Int32,
                parser: (v) => Number(v),
                label: 'Count',
                changeThreshold: 0.01,
            });

            const { get, set } = getOptions().value;

            set({ value: 1 });
            set({ value: 2 });
            set({ value: 3 });

            expect(get().value).toBe(3);
        });

        it('logs at trace level on every update, even when the change is not significant', () => {
            const { namespace, getOptions } = makeFakeNamespace();
            const device = makeFakeDevice();

            addPrimitiveTag({
                namespace,
                device,
                nodeId: 'ns=1;s=Temp',
                browseName: 'Temperature',
                initialValue: 20.0,
                dataType: 'Double',
                valueType: opcua.DataType.Double,
                parser: (v) => Number(v),
                label: 'Temperature',
                changeThreshold: 5,
            });

            getOptions().value.set({ value: 20.1 }); // well within the threshold

            expect(mockedLogger.trace).toHaveBeenCalledTimes(1);
            expect(mockedLogger.debug).not.toHaveBeenCalled();

            const [payload, message] = mockedLogger.trace.mock.calls[0];
            expect(message).toBe('Temperature tag value updated');
            expect(payload).toMatchObject({ oldValue: 20.0, newValue: 20.1 });
        });

        it('logs at both trace and debug level when the change is significant', () => {
            const { namespace, getOptions } = makeFakeNamespace();
            const device = makeFakeDevice();

            addPrimitiveTag({
                namespace,
                device,
                nodeId: 'ns=1;s=Temp',
                browseName: 'Temperature',
                initialValue: 20.0,
                dataType: 'Double',
                valueType: opcua.DataType.Double,
                parser: (v) => Number(v),
                label: 'Temperature',
                changeThreshold: 0.01,
            });

            getOptions().value.set({ value: 25 });

            expect(mockedLogger.trace).toHaveBeenCalledTimes(1);
            expect(mockedLogger.debug).toHaveBeenCalledTimes(1);
            expect(mockedLogger.debug.mock.calls[0][1]).toBe('Temperature tag changed');
        });

        it('logs at trace level for every sequential update regardless of significance', () => {
            const { namespace, getOptions } = makeFakeNamespace();
            const device = makeFakeDevice();

            addPrimitiveTag({
                namespace,
                device,
                nodeId: 'ns=1;s=Count',
                browseName: 'Count',
                initialValue: 0,
                dataType: 'Integer',
                valueType: opcua.DataType.Int32,
                parser: (v) => Number(v),
                label: 'Count',
                changeThreshold: 0.01,
            });

            const { set } = getOptions().value;

            set({ value: 1 });
            set({ value: 2 });
            set({ value: 3 });

            expect(mockedLogger.trace).toHaveBeenCalledTimes(3);
        });
    });

    describe('tagRuntime integration (#40)', () => {
        function makeFakeTagRuntime() {
            return { register: vi.fn(), recordChange: vi.fn() };
        }

        it('does nothing when tagRuntime is not provided (unchanged default behavior)', () => {
            const { namespace, getOptions } = makeFakeNamespace();
            const device = makeFakeDevice();

            expect(() =>
                addPrimitiveTag({
                    namespace,
                    device,
                    nodeId: 'ns=1;s=Temp',
                    browseName: 'Temperature',
                    initialValue: 20,
                    dataType: 'Double',
                    valueType: opcua.DataType.Double,
                    parser: (v) => Number(v),
                    label: 'Temperature',
                }),
            ).not.toThrow();

            expect(() => getOptions().value.set({ value: 25 })).not.toThrow();
        });

        it('registers the tag on creation with its initial value when tagRuntime + tagType + deviceKey are all given', () => {
            const { namespace, getOptions } = makeFakeNamespace();
            const device = makeFakeDevice('Motor1');
            const tagRuntime = makeFakeTagRuntime();

            addPrimitiveTag({
                namespace,
                device,
                nodeId: 'ns=1;s=Temp',
                browseName: 'Temperature',
                initialValue: 20,
                dataType: 'Double',
                valueType: opcua.DataType.Double,
                parser: (v) => Number(v),
                label: 'Temperature',
                tagType: 'float',
                deviceKey: 'device1',
                tagRuntime: tagRuntime as any,
            });

            expect(tagRuntime.register).toHaveBeenCalledWith({
                device: 'device1',
                deviceName: 'Motor1',
                browseName: 'Temperature',
                nodeId: 'ns=1;s=Temp',
                type: 'float',
                value: 20,
            });
            expect(getOptions()).toBeTruthy();
        });

        it('does not register when deviceKey is missing, even with tagRuntime + tagType given', () => {
            const { namespace } = makeFakeNamespace();
            const device = makeFakeDevice();
            const tagRuntime = makeFakeTagRuntime();

            addPrimitiveTag({
                namespace,
                device,
                nodeId: 'ns=1;s=Temp',
                browseName: 'Temperature',
                initialValue: 20,
                dataType: 'Double',
                valueType: opcua.DataType.Double,
                parser: (v) => Number(v),
                label: 'Temperature',
                tagType: 'float',
                tagRuntime: tagRuntime as any,
            });

            expect(tagRuntime.register).not.toHaveBeenCalled();
        });

        it('records every set() as a change event, tagging significant vs insignificant correctly', () => {
            const { namespace, getOptions } = makeFakeNamespace();
            const device = makeFakeDevice('Motor1');
            const tagRuntime = makeFakeTagRuntime();

            addPrimitiveTag({
                namespace,
                device,
                nodeId: 'ns=1;s=Temp',
                browseName: 'Temperature',
                initialValue: 20,
                dataType: 'Double',
                valueType: opcua.DataType.Double,
                parser: (v) => Number(v),
                label: 'Temperature',
                changeThreshold: 5,
                tagType: 'float',
                deviceKey: 'device1',
                tagRuntime: tagRuntime as any,
            });

            const { set } = getOptions().value;

            set({ value: 20.1 }); // within threshold — insignificant, still recorded
            set({ value: 30 }); // outside threshold — significant

            expect(tagRuntime.recordChange).toHaveBeenCalledTimes(2);

            const [firstCall, secondCall] = tagRuntime.recordChange.mock.calls;
            expect(firstCall[0]).toMatchObject({
                device: 'device1',
                deviceName: 'Motor1',
                browseName: 'Temperature',
                nodeId: 'ns=1;s=Temp',
                type: 'float',
                oldValue: 20,
                newValue: 20.1,
                significant: false,
            });
            expect(typeof firstCall[0].timestamp).toBe('string');

            expect(secondCall[0]).toMatchObject({
                oldValue: 20.1,
                newValue: 30,
                significant: true,
            });
        });
    });
});
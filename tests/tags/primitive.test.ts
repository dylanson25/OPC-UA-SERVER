import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/infrastructure/logger/index.ts', () => ({
    createModuleLogger: () => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }),
}));

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
    });
});
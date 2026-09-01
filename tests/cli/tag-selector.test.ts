import { describe, it, expect } from 'vitest';

import { buildTagSelectorPayload } from '../../src/cli/tag-selector.ts';
import { ErrorCode, ValidationError } from '../../src/errors/index.ts';

describe('buildTagSelectorPayload', () => {
    it('throws ValidationError(TAG_SELECTOR_INVALID) when nothing is given', () => {
        expect(() => buildTagSelectorPayload({}, { allowTags: false })).toThrowError(
            expect.objectContaining({ code: ErrorCode.TAG_SELECTOR_INVALID }),
        );
    });

    it('builds a device-only payload', () => {
        expect(buildTagSelectorPayload({ device: 'PLC1' }, { allowTags: false })).toEqual({
            device: 'PLC1',
            nodeId: undefined,
            browseName: undefined,
            tags: undefined,
        });
    });

    it('builds a nodeId-only payload', () => {
        expect(buildTagSelectorPayload({ nodeId: 'ns=1;s=PLC1.Temperature' }, { allowTags: false })).toEqual({
            device: undefined,
            nodeId: 'ns=1;s=PLC1.Temperature',
            browseName: undefined,
            tags: undefined,
        });
    });

    it('allows --browse-name combined with --device (the documented disambiguation case)', () => {
        expect(buildTagSelectorPayload({ device: 'PLC1', browseName: 'Temperature' }, { allowTags: false })).toEqual(
            { device: 'PLC1', nodeId: undefined, browseName: 'Temperature', tags: undefined },
        );
    });

    it('rejects --node-id combined with --device', () => {
        expect(() => buildTagSelectorPayload({ nodeId: 'ns=1;s=X', device: 'PLC1' }, { allowTags: false })).toThrow(
            ValidationError,
        );
    });

    it('rejects --node-id combined with --browse-name', () => {
        expect(() =>
            buildTagSelectorPayload({ nodeId: 'ns=1;s=X', browseName: 'Temperature' }, { allowTags: false }),
        ).toThrow(ValidationError);
    });

    it('rejects --node-id combined with --tags', () => {
        expect(() =>
            buildTagSelectorPayload({ nodeId: 'ns=1;s=X', tags: 'A,B' }, { allowTags: true }),
        ).toThrow(ValidationError);
    });

    describe('--tags (get only)', () => {
        it('splits, trims, and drops empty entries', () => {
            const result = buildTagSelectorPayload({ device: 'PLC1', tags: ' A, B ,,C ' }, { allowTags: true });
            expect(result.tags).toEqual(['A', 'B', 'C']);
        });

        it('rejects --tags without --device', () => {
            expect(() => buildTagSelectorPayload({ tags: 'A,B' }, { allowTags: true })).toThrow(ValidationError);
        });

        it('rejects --tags combined with --browse-name', () => {
            expect(() =>
                buildTagSelectorPayload({ device: 'PLC1', browseName: 'X', tags: 'A' }, { allowTags: true }),
            ).toThrow(ValidationError);
        });

        it('is dropped (not validated/forwarded) when the calling command disallows it', () => {
            // TagSelectorCliOptions is shared; watch.ts simply never defines --tags, so
            // options.tags is always undefined there in practice. allowTags: false covers
            // any future misuse defensively — even if a tags value somehow arrived, it's
            // ignored entirely rather than validated or sent to the server.
            const result = buildTagSelectorPayload({ device: 'PLC1', tags: 'A,B' }, { allowTags: false });
            expect(result.tags).toBeUndefined();
        });
    });
});

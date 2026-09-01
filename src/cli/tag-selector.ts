import { ErrorCode, ValidationError } from '../errors/index.ts';
import type { TagSelector } from '../control/index.ts';

export interface TagSelectorCliOptions {
    device?: string;
    nodeId?: string;
    browseName?: string;
    /** Raw comma-separated string as given on the command line; `get` only. */
    tags?: string;
}

export interface TagSelectorBuildOptions {
    /** Whether the calling command even defines a --tags flag (only `get` does). */
    allowTags: boolean;
}

/**
 * Validates the mutual-exclusivity rules `watch`/`get` (#40) share for their
 * --device / --node-id / --browse-name / --tags selectors, then builds the
 * `TagSelector` payload sent to the server's tags.resolve/tags.get handlers.
 *
 * - At least one of --device / --node-id / --browse-name is required.
 * - --node-id is a fully-qualified identifier on its own: it can't combine with
 *   --device, --browse-name, or --tags.
 * - --browse-name *can* combine with --device — that's the documented way to
 *   disambiguate a browse name that matches tags on more than one device.
 * - --tags is a device-scoped browse-name subset: it requires --device and can't
 *   combine with --browse-name.
 *
 * Thrown as a `ValidationError` (not commander's `InvalidArgumentError`) because this
 * runs inside the command's `.action()`, after commander's own option parsing has
 * already finished — see src/cli/control-error.ts's `reportControlChannelFailure`,
 * which both commands reuse to report it with the same ExitCode.VALIDATION_ERROR
 * commander itself would use for a bad flag.
 */
export function buildTagSelectorPayload(
    options: TagSelectorCliOptions,
    { allowTags }: TagSelectorBuildOptions,
): TagSelector {
    const { device, nodeId, browseName } = options;
    const tags = allowTags ? options.tags : undefined;

    if (!device && !nodeId && !browseName) {
        throw invalid('One of --device, --node-id, or --browse-name is required.');
    }

    if (nodeId && (device || browseName || tags)) {
        throw invalid('--node-id cannot be combined with --device, --browse-name, or --tags.');
    }

    if (tags !== undefined && browseName) {
        throw invalid('--tags cannot be combined with --browse-name.');
    }

    if (tags !== undefined && !device) {
        throw invalid('--tags requires --device.');
    }

    return {
        device,
        nodeId,
        browseName,
        tags: tags
            ? tags
                  .split(',')
                  .map((name) => name.trim())
                  .filter(Boolean)
            : undefined,
    };
}

function invalid(message: string): ValidationError {
    return new ValidationError(ErrorCode.TAG_SELECTOR_INVALID, message);
}

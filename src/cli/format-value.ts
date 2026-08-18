/** Renders a tag value for `watch`/`get` output — plain and scriptable, not JSON. */
export function formatTagValue(value: unknown): string {
    if (value instanceof Date) return value.toISOString();
    return String(value);
}

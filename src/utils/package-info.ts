import fs from 'node:fs';
import path from 'node:path';

/**
 * Reads the project's own package.json version. Resolved from `process.cwd()` (not
 * relative to this module) to match how the rest of the app locates runtime files —
 * consistent whether running from source, `dist/`, or a Docker image built from either.
 */
export function getPackageVersion(): string {
    try {
        const raw = fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8');
        const pkg = JSON.parse(raw) as { version?: string };
        return pkg.version ?? 'unknown';
    } catch {
        return 'unknown';
    }
}

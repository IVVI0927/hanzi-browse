/**
 * Credential import handler for mcp-bridge.
 *
 * The original mcp-bridge used chrome.runtime.sendMessage() which cannot
 * message the service worker from within itself ("Receiving end does not
 * exist"). This provides a direct-call handler using Result types.
 */
import { err, ResultAsync } from 'neverthrow';
// ── Guard ────────────────────────────────────────────────────────────
function isValidSource(source) {
    return source === 'claude' || source === 'codex';
}
// ── Handler ──────────────────────────────────────────────────────────
export function handleImportCredentials(source, deps) {
    if (!isValidSource(source)) {
        return new ResultAsync(Promise.resolve(err(`Unknown credential source: ${source}`)));
    }
    const importFn = source === 'claude' ? deps.importCLI : deps.importCodex;
    return ResultAsync.fromPromise(importFn(), (e) => e.message)
        .andThen((credentials) => ResultAsync.fromPromise(deps.loadConfig(), (e) => e.message)
        .map(() => credentials));
}

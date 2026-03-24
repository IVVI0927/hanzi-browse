/**
 * Credential import handler for mcp-bridge.
 *
 * The original mcp-bridge used chrome.runtime.sendMessage() which cannot
 * message the service worker from within itself ("Receiving end does not
 * exist"). This provides a direct-call handler using Result types.
 */
import { ResultAsync } from 'neverthrow';
export interface ImportDeps {
    importCLI: () => Promise<unknown>;
    importCodex: () => Promise<unknown>;
    loadConfig: () => Promise<null>;
}
export declare function handleImportCredentials(source: unknown, deps: ImportDeps): ResultAsync<unknown, string>;

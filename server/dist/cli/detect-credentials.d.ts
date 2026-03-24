/**
 * Credential source detection for CLI setup.
 *
 * Claude Code stores OAuth tokens in one of two locations:
 *   1. ~/.claude/.credentials.json (file-based, all platforms)
 *   2. macOS Keychain under "Claude Code-credentials" (macOS only)
 *
 * The original implementation only checked (1), missing most macOS users.
 */
export interface CredentialSource {
    name: string;
    slug: 'claude' | 'codex';
    path: string;
}
export interface DetectOptions {
    platform: string;
    homedir: string;
    fileExists: (path: string) => boolean;
    keychainHas: (service: string) => boolean;
}
export interface CredentialFlowState {
    sourcesDetected: number;
    anyImported: boolean;
    manualEntryChosen: boolean;
}
export declare function detectCredentialSources(opts: DetectOptions): CredentialSource[];
/**
 * Returns an error message if setup finished with no credentials configured,
 * or null if everything is fine.
 */
export declare function checkCredentialFlowResult(state: CredentialFlowState): string | null;

#!/usr/bin/env node
/**
 * Combined Managed Backend + Relay Server
 *
 * Single process for cloud deployment. Runs:
 * 1. WebSocket relay (for extension communication)
 * 2. Managed REST API (for client integration)
 * 3. Vertex AI LLM client
 *
 * Environment variables:
 *   VERTEX_SA_JSON  - Service account JSON string (for cloud deployment)
 *   VERTEX_SA_PATH  - Path to service account JSON file (for local)
 *   PORT            - HTTP/WS port (default: 3456, Railway sets this)
 *   RELAY_PORT      - Internal relay port (default: 7862)
 */
/** Check if a browser session is connected */
export declare function isSessionConnected(browserSessionId: string): boolean;

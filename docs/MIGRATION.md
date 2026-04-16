# CLI Binary Consolidation

## Change

Prior versions shipped two binaries:
- `hanzi-browse`  → MCP server
- `hanzi-browser` → CLI (note the trailing "r")

Starting **v2.4.0**, `hanzi-browse` handles both. A subcommand argument (e.g. `start`, `status`, `doctor`) routes to the CLI. With no arguments, it enters MCP stdio mode as before.

## Migration

- `hanzi-browser start "task"` → `hanzi-browse start "task"`
- `hanzi-browser status`       → `hanzi-browse status`
- ...and so on for all subcommands.

The `hanzi-browser` binary stays in `package.json` for one release cycle as a deprecation stub, then is removed in **v2.5.0**.

## Why

Users consistently confused the two names. Extension install flows and skill documentation now use `hanzi-browse` exclusively.

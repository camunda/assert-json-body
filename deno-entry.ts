#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net --allow-run --allow-env
/**
 * Deno compile entry point.
 *
 * This file is used exclusively by `deno compile` to produce a standalone
 * cross-platform binary of the assert-json-body CLI.
 *
 * It simply re-exports the existing Node-compatible CLI module.
 * The shebang in src/cli/index.ts (#!/usr/bin/env node) is harmless here —
 * Deno ignores it.
 */
import './src/cli/index.ts';

#!/usr/bin/env node
import { generate } from '../lib/extractor.js';
import { buildConfig, parseCliArgs, cliConfigSubset } from '../lib/config.js';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { ExtractConfig } from '../types/index.js';

function printVersion() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pkg = require('../../package.json');
  console.log(pkg.version);
}

function printHelp() {
  console.log(`assert-json-body <command> [options]\n\nCommands:\n  extract            Run extraction (default)\n  init-config        Create example assert-json-body.config.json\n  help               Show this help\n  version            Print version\n\nExtraction Options (CLI/env override config.extract):\n  --repo=URL\n  --specPath=PATH\n  --ref=REF                 (branch/tag/sha)\n  --outputDir=DIR           (default: assert-json-body)\n  --responsesFile=FILE      (override output file path)\n  --preserveCheckout        (do not delete temp git checkout)\n  --dryRun                  (simulate, no filesystem writes)\n  --failIfExists            (error if responses file exists)\n  --logLevel=VAL            (silent|error|warn|info|debug)\n  --config=FILE             (explicit config file path)\n\nValidation (env overrides only for now):\n  AJB_RECORD / TEST_RESPONSE_BODY_RECORD (enable global recording)\n  AJB_THROW_ON_FAIL (default throw behaviour)\n\nSchema file resolution precedence:\n  explicit option > env (AJB_RESPONSES_FILE / ROUTE_TEST_RESPONSES_FILE) > config.extract.responsesFile or <outputDir>/responses.json > default ./assert-json-body/responses.json\n`);
}

function initConfig() {
  const path = 'assert-json-body.config.json';
  if (existsSync(path)) {
    console.error(`Config file already exists at ${path}`);
    process.exit(1);
  }
  const example = {
    extract: {
      repo: 'https://github.com/camunda/camunda-orchestration-cluster-api',
      specPath: 'specification/openapi.yaml',
      ref: 'main',
      outputDir: 'assert-json-body',
      preserveCheckout: false,
      dryRun: false,
      logLevel: 'info',
      failIfExists: false
    },
    validate: {
      recordResponses: false,
      throwOnValidationFail: true
    }
  } as const;
  writeFileSync(path, JSON.stringify(example, null, 2));
  console.log(`Wrote example config to ${path}`);

  // Idempotently add npm script to consumer package.json if exists
  const pkgPath = 'package.json';
  if (existsSync(pkgPath)) {
    try {
      const raw = readFileSync(pkgPath, 'utf8');
      const pkg = JSON.parse(raw);
      pkg.scripts = pkg.scripts || {};
      if (pkg.scripts['responses:regenerate'] !== 'assert-json-body extract') {
        pkg.scripts['responses:regenerate'] = 'assert-json-body extract';
        writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
        console.log('Added script "responses:regenerate" to package.json');
      } else {
        console.log('Script "responses:regenerate" already present in package.json');
      }
    } catch (e) {
      console.warn('Could not update package.json with responses:regenerate script:', (e as Error).message);
    }
  }
}

async function run() {
  const { command, args } = parseCliArgs();
  const baseCommand = command || 'extract';
  if (args.help || baseCommand === 'help') return printHelp();
  if (args.version || baseCommand === 'version' || args.v) return printVersion();
  if (baseCommand === 'init-config') return initConfig();
  if (baseCommand !== 'extract') {
    console.error(`Unknown command: ${baseCommand}`);
    printHelp();
    process.exit(1);
  }
  const cfgPath = typeof args.config === 'string' ? String(args.config) : undefined;
  buildConfig(cfgPath);
  const cliOverrides: ExtractConfig = cliConfigSubset(args as Record<string,string|boolean>);
  try {
    await generate(cliOverrides);
  } catch (err) {
    console.error('[assert-json-body] extract failed:', err);
    process.exit(1);
  }
}

run();

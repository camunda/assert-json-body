/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ExtractConfig, ValidateConfig, ConfigFile, ResolvedExtractConfig, ResolvedValidateConfig, ConfigResolution, ResolvedConfig } from '../types/index.js';

const CONFIG_FILENAME = 'assert-json-body.config.json';

const DEFAULT_EXTRACT: ResolvedExtractConfig = {
  repo: 'https://github.com/camunda/camunda-orchestration-cluster-api',
  specPath: 'specification/rest-api.yaml',
  ref: 'main',
  outputDir: 'assert-json-body',
  preserveCheckout: false,
  dryRun: false,
  logLevel: 'info',
  failIfExists: false,
  responsesFile: undefined,
};

const DEFAULT_VALIDATE: ResolvedValidateConfig = {
  recordResponses: false,
  throwOnValidationFail: true,
};

export function loadConfigFile(cwd: string = process.cwd(), explicitPath?: string): { filePath?: string; file?: ConfigFile; error?: Error } {
  const path = explicitPath ? resolve(cwd, explicitPath) : resolve(cwd, CONFIG_FILENAME);
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as ConfigFile;
    return { filePath: path, file: parsed };
  } catch (err) {
    return { error: err as Error };
  }
}

export function parseCliArgs(argv: string[] = process.argv.slice(2)): { command?: string; args: Record<string,string|boolean>; positionals: string[] } {
  const args: Record<string,string|boolean> = {};
  const positionals: string[] = [];
  let command: string | undefined;
  for (const token of argv) {
    if (!command && !token.startsWith('-')) { command = token; continue; }
    if (token.startsWith('--')) {
      const [k, v] = token.slice(2).split('=');
      if (v === undefined) args[k] = true; else args[k] = v;
    } else if (token.startsWith('-')) {
      const flags = token.slice(1).split('');
      for (const f of flags) args[f] = true;
    } else {
      positionals.push(token);
    }
  }
  return { command, args, positionals };
}

function pick(obj: Record<string,string|boolean>, keys: string[]): ExtractConfig {
  const out: ExtractConfig = {};
  for (const k of keys) if (k in obj) (out as any)[k] = obj[k];
  return out;
}

export function cliConfigSubset(raw: Record<string,string|boolean>): ExtractConfig {
  return pick(raw, ['repo','specPath','ref','outputDir','preserveCheckout','dryRun','responsesFile','logLevel','failIfExists']);
}

export function envConfigSubset(env: NodeJS.ProcessEnv = process.env): { extract: ExtractConfig; validate: ValidateConfig } {
  const map: Record<string,string> = {};
  for (const [k,v] of Object.entries(env)) if (typeof v === 'string') map[k] = v;
  const getBool = (k: string): boolean | undefined => map[k] ? /^(1|true|yes)$/i.test(map[k]) : undefined;
  const extract: ExtractConfig = {
    repo: map.AJB_REPO || map.REPO,
    specPath: map.AJB_SPEC_PATH || map.SPEC_PATH,
    ref: map.AJB_REF || map.SPEC_REF || map.REF,
    outputDir: map.AJB_OUTPUT_DIR || map.OUTPUT_DIR,
    preserveCheckout: getBool('AJB_PRESERVE_CHECKOUT') ?? getBool('PRESERVE_SPEC_CHECKOUT'),
    dryRun: getBool('AJB_DRY_RUN'),
    responsesFile: map.AJB_RESPONSES_FILE || map.ROUTE_TEST_RESPONSES_FILE,
    logLevel: (map.AJB_LOG_LEVEL as any) || undefined,
    failIfExists: getBool('AJB_FAIL_IF_EXISTS'),
  };
  const validate: ValidateConfig = {
    recordResponses: getBool('AJB_RECORD') ?? getBool('TEST_RESPONSE_BODY_RECORD'),
    throwOnValidationFail: getBool('AJB_THROW_ON_FAIL'),
  };
  return { extract, validate };
}

function coerceExtract(config: ExtractConfig, warnings: string[]): ExtractConfig {
  if (typeof config.preserveCheckout === 'string') config.preserveCheckout = /^(1|true|yes)$/i.test(config.preserveCheckout);
  if (typeof config.dryRun === 'string') config.dryRun = /^(1|true|yes)$/i.test(config.dryRun);
  if (typeof config.failIfExists === 'string') config.failIfExists = /^(1|true|yes)$/i.test(config.failIfExists);
  if (config.logLevel && !['silent','error','warn','info','debug'].includes(config.logLevel)) {
    warnings.push(`Unknown logLevel '${config.logLevel}', falling back to 'info'`);
    config.logLevel = 'info';
  }
  return config;
}

export function resolveConfig(parts: { file?: ConfigFile; cli: ExtractConfig; env: { extract: ExtractConfig; validate: ValidateConfig }; warnings: string[] }): ResolvedConfig {
  const mergedExtract: ExtractConfig = { ...DEFAULT_EXTRACT, ...(parts.file?.extract||{}), ...parts.cli, ...parts.env.extract };
  const mergedValidate: ValidateConfig = { ...DEFAULT_VALIDATE, ...(parts.file?.validate||{}), ...parts.env.validate };
  coerceExtract(mergedExtract, parts.warnings);
  const extract: ResolvedExtractConfig = {
    repo: mergedExtract.repo || DEFAULT_EXTRACT.repo,
    specPath: mergedExtract.specPath || DEFAULT_EXTRACT.specPath,
    ref: mergedExtract.ref || DEFAULT_EXTRACT.ref,
    outputDir: mergedExtract.outputDir || DEFAULT_EXTRACT.outputDir,
    preserveCheckout: mergedExtract.preserveCheckout ?? DEFAULT_EXTRACT.preserveCheckout,
    dryRun: mergedExtract.dryRun ?? DEFAULT_EXTRACT.dryRun,
    logLevel: (mergedExtract.logLevel as any) || DEFAULT_EXTRACT.logLevel,
    failIfExists: mergedExtract.failIfExists ?? DEFAULT_EXTRACT.failIfExists,
    responsesFile: mergedExtract.responsesFile,
  };
  const validate: ResolvedValidateConfig = {
    recordResponses: mergedValidate.recordResponses ?? DEFAULT_VALIDATE.recordResponses,
    throwOnValidationFail: mergedValidate.throwOnValidationFail ?? DEFAULT_VALIDATE.throwOnValidationFail,
  };
  return { extract, validate };
}

export function buildConfig(explicitConfigPath?: string): ConfigResolution {
  const warnings: string[] = [];
  const { filePath, file, error } = loadConfigFile(process.cwd(), explicitConfigPath);
  if (error) warnings.push(`Failed to load config file: ${error.message}`);
  const { args } = parseCliArgs();
  // only parse config impacting args
  const cli = cliConfigSubset(args);
  const env = envConfigSubset();
  const resolved = resolveConfig({ file, cli, env, warnings });
  return { filePath, file, cli, env, resolved, warnings };
}

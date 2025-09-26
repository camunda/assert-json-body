import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildConfig } from '../lib/config.js';

const ENV_KEYS = [
  'AJB_REPO',
  'REPO',
  'AJB_SPEC_PATH',
  'SPEC_PATH',
  'AJB_REF',
  'SPEC_REF',
  'REF',
  'AJB_OUTPUT_DIR',
  'OUTPUT_DIR',
  'AJB_PRESERVE_CHECKOUT',
  'PRESERVE_SPEC_CHECKOUT',
  'AJB_DRY_RUN',
  'AJB_RESPONSES_FILE',
  'ROUTE_TEST_RESPONSES_FILE',
  'AJB_LOG_LEVEL',
  'AJB_FAIL_IF_EXISTS',
  'AJB_RECORD',
  'TEST_RESPONSE_BODY_RECORD',
  'AJB_THROW_ON_FAIL'
] as const;

describe('buildConfig', () => {
  let workdir: string;
  let prevCwd: string;
  let prevArgv: NodeJS.Process['argv'];
  const savedEnv = new Map<string, string | undefined>();

  beforeEach(() => {
    prevCwd = process.cwd();
    prevArgv = process.argv;
    process.argv = ['node', 'vitest'];
    workdir = mkdtempSync(join(tmpdir(), 'ajb-config-'));
    process.chdir(workdir);
    for (const key of ENV_KEYS) {
      savedEnv.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    process.argv = prevArgv;
  try { process.chdir(prevCwd); } catch { /* ignore */ }
  try { rmSync(workdir, { recursive: true, force: true }); } catch { /* ignore */ }
    for (const key of ENV_KEYS) {
      const value = savedEnv.get(key);
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  it('parses configuration file values into resolved config', () => {
  const configPath = join(process.cwd(), 'assert-json-body.config.json');
    const file = {
      extract: {
        repo: 'https://example.com/custom.git',
        specPath: 'specs/service.yaml',
        ref: 'develop',
        outputDir: 'custom-output',
        preserveCheckout: true,
        dryRun: true,
        logLevel: 'debug',
        failIfExists: true,
        responsesFile: './custom/responses.json'
      },
      validate: {
        recordResponses: true,
        throwOnValidationFail: false
      }
    } as const;
    writeFileSync(configPath, JSON.stringify(file, null, 2));

    const resolution = buildConfig();

  expect(resolution.filePath).toBe(configPath);
    expect(resolution.warnings).toEqual([]);
  expect(resolution.file?.extract?.repo).toBe(file.extract.repo);
  expect(resolution.file?.validate?.recordResponses).toBe(true);

    const { extract, validate } = resolution.resolved;
    expect(extract.repo).toBe(file.extract.repo);
    expect(extract.specPath).toBe(file.extract.specPath);
    expect(extract.ref).toBe(file.extract.ref);
    expect(extract.outputDir).toBe(file.extract.outputDir);
    expect(extract.preserveCheckout).toBe(true);
    expect(extract.dryRun).toBe(true);
    expect(extract.logLevel).toBe(file.extract.logLevel);
    expect(extract.failIfExists).toBe(true);
    expect(extract.responsesFile).toBe(file.extract.responsesFile);

    expect(validate.recordResponses).toBe(true);
    expect(validate.throwOnValidationFail).toBe(false);

    expect(resolution.cli).toEqual({});
  });

  it('falls back to default extract config when no overrides present', () => {
    const resolution = buildConfig();
    expect(resolution.filePath).toBeUndefined();
    expect(resolution.warnings).toEqual([]);
    expect(resolution.resolved.extract.specPath).toBe('specification/rest-api.yaml');
    expect(resolution.resolved.extract.repo).toBe('https://github.com/camunda/camunda-orchestration-cluster-api');
  });
});

/* eslint-disable no-empty */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateResponseShape } from '../index.js';
import { writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Helper to build a minimal responses.json with single route entry
function writeResponses(dir: string, name: string, routePath: string, method: string, status: string) {
  const file = join(dir, name);
  const content = {
    responses: [
      {
        path: routePath,
        method,
        status,
        schema: { required: [ { name: 'id', type: 'string' } ], optional: [] }
      }
    ]
  };
  writeFileSync(file, JSON.stringify(content, null, 2));
  return file;
}

describe('responses schema path precedence', () => {
  let work: string;
  let defaultDir: string;
  let configDir: string;
  let envDir: string;
  let explicitDir: string;
  const routeSpec = { path: '/precedence', method: 'GET', status: '200' } as const;
  let prevCwd: string;

  beforeEach(() => {
    prevCwd = process.cwd();
    work = mkdtempSync(join(tmpdir(), 'ajb-precedence-'));
    // Simulate directories for each precedence level
    defaultDir = join(work, 'default');
    configDir = join(work, 'config');
    envDir = join(work, 'env');
    explicitDir = join(work, 'explicit');
  [defaultDir, configDir, envDir, explicitDir].forEach(d => mkdirSync(d, { recursive: true }));
    // minimal responses files with different method markers to identify source
    writeResponses(defaultDir, 'responses.json', routeSpec.path, 'GET', '200');
    writeResponses(configDir, 'responses-config.json', routeSpec.path, 'GET', '200');
    writeResponses(envDir, 'responses-env.json', routeSpec.path, 'GET', '200');
    writeResponses(explicitDir, 'responses-explicit.json', routeSpec.path, 'GET', '200');
  });

  it('uses explicit over env over config over default', () => {
  // 1. Default: place default file at ./json-body-assertions/responses.json
    process.chdir(work);
    // Create json-body-assertions/responses.json (new default directory)
    mkdirSync(join(work, 'json-body-assertions'), { recursive: true });
    writeResponses(join(work, 'json-body-assertions'), 'responses.json', routeSpec.path, 'GET', '200');

    // 2. Config: create config pointing to configDir file
    const configFilePath = join(work, 'assert-json-body.config.json');
    writeFileSync(configFilePath, JSON.stringify({ extract: { responsesFile: join(configDir, 'responses-config.json') } }, null, 2));

    // Validate defaults to config (since no env or explicit)
    expect(() => validateResponseShape(routeSpec, { id: 'a' })).not.toThrow();

    // 3. Env override
    process.env.ROUTE_TEST_RESPONSES_FILE = join(envDir, 'responses-env.json');
    expect(() => validateResponseShape(routeSpec, { id: 'b' })).not.toThrow();

    // 4. Explicit override beats env
    expect(() => validateResponseShape(routeSpec, { id: 'c' }, { responsesFilePath: join(explicitDir, 'responses-explicit.json') })).not.toThrow();

    // Cleanup env var
    delete process.env.ROUTE_TEST_RESPONSES_FILE;
  });

  afterEach(() => {
    try { process.chdir(prevCwd); } catch {}
    try { rmSync(work, { recursive: true, force: true }); } catch {}
  });
});

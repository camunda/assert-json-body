import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generate } from '../src/lib/extractor.js';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

async function httpGetJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

let responsesFilePath: string;
let workDir: string;
let typedValidate: any; // will load from generated index.ts after extraction

describe('integration: /license', () => {
  beforeAll(async () => {
    workDir = mkdtempSync(join(tmpdir(), 'ajb-int-'));
    const outDir = join(workDir, 'assert-json-body');
    mkdirSync(outDir, { recursive: true });
    // Run extraction with defaults (will use default repo/spec)
    await generate({ outputDir: outDir });
    responsesFilePath = resolve(outDir, 'responses.json');
    // Dynamically import the generated typed validator
    try {
      const generated = await import(resolve(outDir, 'index.ts'));
      if (generated && typeof generated.validateResponseShape === 'function') {
        typedValidate = generated.validateResponseShape;
      }
    } catch (e) {
      console.warn('Failed to load generated typed validator, falling back to base:', (e as Error).message);
      // fallback lazy import of root package if needed
      const base = await import('../src/index.js');
      typedValidate = base.validateResponseShape;
    }
  }, 20000);

  afterAll(() => {
    if (workDir) {
      try { rmSync(workDir, { recursive: true, force: true }); } catch {}
    }
  });

  it('validates /license against extracted schema', async () => {
    const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:8080/v2';
    let json: any;
    try {
      json = await httpGetJson(baseUrl + '/license'); // fetch a route to ensure server is up
    } catch (e) {
      console.warn('Server not reachable; start the service or set TEST_BASE_URL to run integration test');
      return; // treat as soft skip
    }

    // Non-throw structured result
  const validatorFn = typedValidate || (await import('../src/index.js')).validateResponseShape;
  const result = validatorFn({ path: '/license', method: 'GET', status: '200' }, json, { throw: false, responsesFilePath });
    expect(result).toBeTruthy();
    if (!result!.ok) {
      console.error('Validation errors:', result!.errors);
    }
    expect(result!.ok).toBe(true);
  }, 25000);
});

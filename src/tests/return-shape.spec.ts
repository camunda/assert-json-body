import { describe, it, expect } from 'vitest';
import { validateResponseShape } from '../index.js';
import { writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('validateResponseShape return shape', () => {
  it('returns response, schema and routeContext in non-throw mode (success)', () => {
    const work = mkdtempSync(join(tmpdir(), 'ajb-return-'));
    const outDir = join(work, 'json-body-assertions');
    mkdirSync(outDir, { recursive: true });
    // minimal responses.json
    const responses = { responses: [ { path: '/r', method: 'GET', status: '200', schema: { required: [ { name: 'id', type: 'string' } ], optional: [] } } ] };
    writeFileSync(join(outDir, 'responses.json'), JSON.stringify(responses, null, 2));
    process.chdir(work);
    const body = { id: 'abc' };
    const result = validateResponseShape({ path: '/r', method: 'GET', status: '200' }, body, { throw: false });
    expect(result).toBeTruthy();
    expect(result!.ok).toBe(true);
    expect(result!.response).toBe(body);
    expect(result!.routeContext.requiredFields[0].name).toBe('id');
    expect(result!.routeContext.route).toBe('/r');
  });

  it('returns errors plus response/schema/routeContext in non-throw mode (failure)', () => {
    const work = mkdtempSync(join(tmpdir(), 'ajb-return-'));
    const outDir = join(work, 'json-body-assertions');
    mkdirSync(outDir, { recursive: true });
    const responses = { responses: [ { path: '/r', method: 'GET', status: '200', schema: { required: [ { name: 'id', type: 'string' } ], optional: [] } } ] };
    writeFileSync(join(outDir, 'responses.json'), JSON.stringify(responses, null, 2));
    process.chdir(work);
    const body = { other: 'x' };
    const result = validateResponseShape({ path: '/r', method: 'GET', status: '200' }, body, { throw: false });
    expect(result).toBeTruthy();
    expect(result!.ok).toBe(false);
    expect(result!.errors && result!.errors.length).toBeGreaterThan(0);
    expect(result!.response).toBe(body);
    expect(result!.routeContext.requiredFields[0].name).toBe('id');
    expect(result!.routeContext.method).toBe('GET');
  });
});

/* eslint-disable no-empty */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateResponseShape } from '../index.js';

function writeResponses(file: string) {
  const content = { responses: [ { path: '/flag/test', method: 'GET', status: '200', schema: { required: [ { name: 'id', type: 'number' } ], optional: [] } } ] };
  writeFileSync(file, JSON.stringify(content, null, 2));
}

describe('global flags (throw / record)', () => {
  let work: string;
  let prevCwd: string;
  beforeEach(() => {
    prevCwd = process.cwd();
    work = mkdtempSync(join(tmpdir(), 'ajb-flags-'));
  const out = join(work, 'json-body-assertions');
    mkdirSync(out, { recursive: true });
    writeResponses(join(out, 'responses.json'));
    process.chdir(work);
  });

  it('respects AJB_THROW_ON_FAIL=false returning structured result', () => {
    process.env.AJB_THROW_ON_FAIL = 'false';
    const res = validateResponseShape({ path: '/flag/test', method: 'GET', status: '200' }, { wrong: true });
    expect(res && res.ok).toBe(false);
    delete process.env.AJB_THROW_ON_FAIL;
  });

  it('structured override via option throw:false even if global says throw', () => {
    process.env.AJB_THROW_ON_FAIL = 'true';
    const res = validateResponseShape({ path: '/flag/test', method: 'GET', status: '200' }, { wrong: true }, { throw: false });
    expect(res && res.ok).toBe(false);
    delete process.env.AJB_THROW_ON_FAIL;
  });
  afterEach(() => {
    delete process.env.AJB_THROW_ON_FAIL;
    try { process.chdir(prevCwd); } catch {}
    try { rmSync(work, { recursive: true, force: true }); } catch {}
  });
});

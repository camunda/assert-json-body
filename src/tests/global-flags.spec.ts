/* eslint-disable no-empty */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
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
    delete process.env.TEST_RESPONSE_BODY_RECORD_DIR;
    delete process.env.AJB_RECORD;
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

  it('records to <outputDir>/recording by default when enabled', () => {
    process.env.AJB_RECORD = 'true';
    const body = { id: 42 };
    const res = validateResponseShape({ path: '/flag/test', method: 'GET', status: '200' }, body);
    expect(res && res.ok).toBe(true);
  const recordFile = join(work, 'json-body-assertions', 'recording', 'GET_200_flag_test.jsonl');
    expect(existsSync(recordFile)).toBe(true);
    const lines = readFileSync(recordFile, 'utf8').trim().split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    const last = JSON.parse(lines[lines.length - 1]);
    expect(last.present).toContain('id');
    expect(last.body).toEqual(body);
    delete process.env.AJB_RECORD;
  });
  afterEach(() => {
    delete process.env.AJB_THROW_ON_FAIL;
    delete process.env.AJB_RECORD;
    try { process.chdir(prevCwd); } catch {}
    try { rmSync(work, { recursive: true, force: true }); } catch {}
  });
});

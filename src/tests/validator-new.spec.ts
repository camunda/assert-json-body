import { validateResponseShape } from '../index.js';
import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'node:path';

const responsesFile = resolve(process.cwd(), 'src/tests/assertion/__fixtures__/sample-responses.json');

beforeAll(() => {
  // Do not rely on env anymore; use explicit option path so we exercise new resolver precedence.
});

describe('validator positive cases (framework-agnostic)', () => {
  it('validates flat createProcessInstance response', () => {
    const body = { processInstanceKey: 123, bpmnProcessId: 'proc', version: 1, tenantId: 't1' };
    expect(() => validateResponseShape({ path: '/process-instance/create', method: 'POST', status: '200' }, body, { responsesFilePath: responsesFile })).not.toThrow();
  const res = validateResponseShape({ path: '/process-instance/create', method: 'POST', status: '200' }, body, { throw: false, responsesFilePath: responsesFile });
  expect(res && res.ok).toBe(true);
  expect(res && res.response).toBe(body);
  expect(res && res.schema.required.find(f => f.name === 'processInstanceKey')).toBeTruthy();
  });

  it('validates searchProcessInstances with child array', () => {
    const body = { items: [ { processInstanceKey: 1, bpmnProcessId: 'p1' }, { processInstanceKey: 2, bpmnProcessId: 'p2', tenantId: 't2' } ], count: 2 };
    expect(() => validateResponseShape({ path: '/process-instance/search', method: 'POST', status: '200' }, body, { responsesFilePath: responsesFile })).not.toThrow();
  });

  it('validates object with optional fields present & absent', () => {
    const body = { id: 'abc', state: 'ACTIVE', description: 'desc', extra: { flag: true } };
    expect(() => validateResponseShape({ path: '/mixed/optional', method: 'GET', status: '200' }, body, { responsesFilePath: responsesFile })).not.toThrow();
  });
});

describe('validator negative cases (framework-agnostic)', () => {
  it('fails when required field missing', () => {
    const body = { bpmnProcessId: 'proc', version: 1 };
    expect(() => validateResponseShape({ path: '/process-instance/create', method: 'POST', status: '200' }, body, { responsesFilePath: responsesFile })).toThrow(/MISSING.*processInstanceKey/i);
  });

  it('fails when required field wrong type', () => {
    const body = { processInstanceKey: 'not-a-number', bpmnProcessId: 'proc', version: 1 };
    expect(() => validateResponseShape({ path: '/process-instance/create', method: 'POST', status: '200' }, body, { responsesFilePath: responsesFile })).toThrow(/processInstanceKey/);
  });

  it('fails when optional field wrong type (if present)', () => {
    const body = { id: 'abc', state: 'DONE', description: 42, priority: 10, extra: { flag: true } };
    expect(() => validateResponseShape({ path: '/mixed/optional', method: 'GET', status: '200' }, body, { responsesFilePath: responsesFile })).toThrow(/description/);
  });

  it('fails for undeclared additional properties', () => {
    const body = { processInstanceKey: 1, bpmnProcessId: 'p', version: 1, unexpected: 'extra' };
    expect(() => validateResponseShape({ path: '/process-instance/create', method: 'POST', status: '200' }, body, { responsesFilePath: responsesFile })).toThrow(/EXTRA/);
  });
});

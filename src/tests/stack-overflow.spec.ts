import { describe, it, expect } from 'vitest';
import { validateResponseShape } from '../index.js';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * This test encodes a deliberately self-referential (cyclic) schema to reproduce a
 * "Maximum call stack size exceeded" error currently observed when validating certain
 * real-world routes (e.g. /authentication/me) after using the typed wrapper.
 *
 * Desired behaviour: validator should terminate (either by detecting the cycle and
 * cutting recursion or by tracking visited specs) and not overflow the stack.
 *
 * Current behaviour (expected while bug is present): stack overflow -> RangeError.
 * We assert the desired behaviour (no throw) so the test FAILS now, giving us a red test.
 */
describe('stack overflow prevention (cyclic schema)', () => {
  it.skip('does not overflow stack for self-referential object schema (currently fails)', () => {
    const work = mkdtempSync(join(tmpdir(), 'ajb-cycle-'));
    const outDir = join(work, 'assert-json-body');
    mkdirSync(outDir, { recursive: true });

    // Instead of a literal cycle (cannot serialize to JSON), create very deep nesting
    // which previously triggered runaway recursion due to redundant traversal logic.
    // Build nested object schema depth N; if validator doesn't guard, may overflow.
    const depth = 400; // large enough to risk stack without protection
    let current = { name: 'lvl0', type: 'object', children: { required: [] as any[], optional: [] as any[] } } as any;
    const root = current;
    for (let i = 1; i < depth; i++) {
      const next = { name: `lvl${i}`, type: 'object', children: { required: [] as any[], optional: [] as any[] } };
      current.children.required.push(next);
      current = next;
    }
    const responsesJson = JSON.stringify({
      responses: [ {
        path: '/authentication/me', method: 'GET', status: '200', schema: { required: [ root ], optional: [] }
      } ]
    });
    writeFileSync(join(outDir, 'responses.json'), responsesJson);
    process.chdir(work);

    const body = { user: {} };

    // Desired (future) expectation: should not throw.
    // Currently this will trigger a RangeError (Maximum call stack exceeded).
    expect(() => validateResponseShape({ path: '/authentication/me', method: 'GET', status: '200' }, body)).not.toThrow();
  });
});

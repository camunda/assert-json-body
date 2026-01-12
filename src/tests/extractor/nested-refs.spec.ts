
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { buildSchemaTree } from '../../extractor/src/lib/child-expansion.js';

const nestedHelpers = {
  // A component that is just a reference to another component
  "Alias": {
    "$ref": "#/components/schemas/Real"
  },
  "Real": {
    "type": "object",
    "properties": {
      "foo": { "type": "string" }
    }
  },
  // Property pointing to Alias
  "Container": {
    "type": "object",
    "properties": {
      "items": {
        "type": "array",
        "items": {
          "$ref": "#/components/schemas/Alias"
        }
      },
      "direct": {
        "$ref": "#/components/schemas/Alias"
      }
    }
  }
};

describe('nested ref resolution', () => {
  it('resolves array items when ref points to a ref', () => {
    const tree = buildSchemaTree({ $ref: '#/components/schemas/Container' }, nestedHelpers as any);
    const items = tree.optional.find(f => f.name === 'items');
    expect(items).toBeDefined();
    // Before fix, children was undefined. After fix, should be defined.
    expect(items?.children).toBeDefined();
    expect(items?.children?.optional[0].name).toBe('foo');
  });

  it('resolves direct fields when ref points to a ref', () => {
    const tree = buildSchemaTree({ $ref: '#/components/schemas/Container' }, nestedHelpers as any);
    const direct = tree.optional.find(f => f.name === 'direct');
    expect(direct).toBeDefined();
    expect(direct?.children).toBeDefined();
    expect(direct?.children?.optional[0].name).toBe('foo');
  });
});

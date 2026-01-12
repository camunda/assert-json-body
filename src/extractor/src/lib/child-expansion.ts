import { SchemaGroup as OutputSchema } from '../../../types/index.js';
import { refNameOf } from './type-utils.js';
import { flatten, SchemaOrRef } from './schema-flatten.js';
import { resolveRef } from './ref-resolver.js';
import { OpenAPIV3 } from 'openapi-types';

export function buildSchemaTree(schema: SchemaOrRef, components: Record<string, SchemaOrRef>, seen = new Set<string>(), doc?: OpenAPIV3.Document): OutputSchema {
  const flat = flatten(schema, components, seen, doc);
  for (const group of [flat.required, flat.optional]) {
    for (const field of group) {
      const resolved = resolveFieldSchema(field.name, schema, components, doc);
      if (resolved) {
        const { kind, target } = resolved;
        if ((kind === 'object' || kind === 'array-object') && target) {
          field.children = buildSchemaTree(target, components, new Set(seen), doc);
        } else if (kind === 'ref-object' && target) {
          field.children = buildSchemaTree(target, components, new Set(seen.add(refNameOf(field.type))), doc);
        }
      }
    }
  }
  return flat;
}

export function resolveFieldSchema(fieldName: string, parentSchema: SchemaOrRef, components: Record<string, SchemaOrRef>, doc?: OpenAPIV3.Document): { kind: string; target?: SchemaOrRef } | null {
  const isRef = (s: SchemaOrRef): s is OpenAPIV3.ReferenceObject => '$ref' in s;
  const isSchemaObject = (s: SchemaOrRef): s is OpenAPIV3.SchemaObject => !('$ref' in s);

  const resolveTarget = (s: SchemaOrRef): OpenAPIV3.SchemaObject | null => {
    let curr = s;
    const seen = new Set<string>();
    while (isRef(curr)) {
      const refKey = curr.$ref;
      if (seen.has(refKey)) return null;
      seen.add(refKey);
      const next = resolveRef(refKey, components, doc);
      if (!next) return null;
      curr = next;
    }
    return curr;
  };

  const visited = new Set<string>();
  const propertyDefs: Record<string, SchemaOrRef> = {};
  const collect = (sch: SchemaOrRef | undefined) => {
    if (!sch) return;
    if (isRef(sch)) {
      const refKey = sch.$ref;
      if (visited.has(refKey)) return;
      visited.add(refKey);
      const target = resolveRef(refKey, components, doc);
      if (target) collect(target);
      return;
    }
    if (isSchemaObject(sch) && sch.allOf) for (const part of sch.allOf as SchemaOrRef[]) collect(part);
    if (isSchemaObject(sch) && sch.properties) Object.assign(propertyDefs, sch.properties);
  };
  collect(parentSchema);

  const propSchema = propertyDefs[fieldName];
  if (!propSchema) return null;

  if (isRef(propSchema)) {
    const target = resolveTarget(propSchema);
    if (target && (target.type === 'object' || target.properties || target.allOf)) return { kind: 'ref-object', target };
    return { kind: 'ref' };
  }

  if (propSchema.type === 'object' || propSchema.properties || propSchema.allOf) return { kind: 'object', target: propSchema };

  if (propSchema.type === 'array' && propSchema.items) {
    const it = propSchema.items as SchemaOrRef;
    const target = resolveTarget(it);
    if (target && (target.type === 'object' || target.properties || target.allOf)) {
      return { kind: 'array-object', target };
    }
  }
  return null;
}

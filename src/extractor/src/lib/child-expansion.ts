import { SchemaGroup as OutputSchema } from '../../../types/index.js';
import { refNameOf } from './type-utils.js';
import { flatten, SchemaOrRef } from './schema-flatten.js';
import { OpenAPIV3 } from 'openapi-types';

export function buildSchemaTree(schema: SchemaOrRef, components: Record<string, SchemaOrRef>, seen = new Set<string>()): OutputSchema {
  const flat = flatten(schema, components, seen);
  for (const group of [flat.required, flat.optional]) {
    for (const field of group) {
      const resolved = resolveFieldSchema(field.name, schema, components);
      if (resolved) {
        const { kind, target } = resolved;
        if ((kind === 'object' || kind === 'array-object') && target) {
          field.children = buildSchemaTree(target, components, new Set(seen));
        } else if (kind === 'ref-object' && target) {
          field.children = buildSchemaTree(target, components, new Set(seen.add(refNameOf(field.type))));
        }
      }
    }
  }
  return flat;
}

export function resolveFieldSchema(fieldName: string, parentSchema: SchemaOrRef, components: Record<string, SchemaOrRef>): { kind: string; target?: SchemaOrRef } | null {
  const isRef = (s: SchemaOrRef): s is OpenAPIV3.ReferenceObject => '$ref' in s;
  const isSchemaObject = (s: SchemaOrRef): s is OpenAPIV3.SchemaObject => !('$ref' in s);
  const visited = new Set<string>();
  const propertyDefs: Record<string, SchemaOrRef> = {};
  const collect = (sch: SchemaOrRef | undefined) => {
    if (!sch) return;
    if (isRef(sch)) {
      const refName = sch.$ref.split('/').pop()!;
      if (visited.has(refName)) return;
      visited.add(refName);
      const target = components[refName];
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
    const refName = propSchema.$ref.split('/').pop()!;
    const target = components[refName];
    if (target && isSchemaObject(target) && (target.type === 'object' || target.properties || target.allOf)) return { kind: 'ref-object', target };
    return { kind: 'ref' };
  }
  if (propSchema.type === 'object' || propSchema.properties || propSchema.allOf) return { kind: 'object', target: propSchema };
  if (propSchema.type === 'array' && propSchema.items) {
    const it = propSchema.items as SchemaOrRef;
    if (isRef(it)) {
      const refName = it.$ref.split('/').pop()!;
      const target = components[refName];
      if (target && isSchemaObject(target) && (target.type === 'object' || target.properties || target.allOf)) return { kind: 'array-object', target };
    } else if ((it as OpenAPIV3.SchemaObject).type === 'object' || (it as OpenAPIV3.SchemaObject).properties || (it as OpenAPIV3.SchemaObject).allOf) {
      return { kind: 'array-object', target: it };
    }
  }
  return null;
}

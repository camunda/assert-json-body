import { FieldSpec, FlattenResult, SchemaGroup as OutputSchema } from '../../../types/index.js';
import { normalizeType, dedupeFields } from './type-utils.js';
import { OpenAPIV3 } from 'openapi-types';

// Local helper union & type guards for OpenAPI schemas / refs
export type SchemaOrRef = OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject;
function isRef(s: SchemaOrRef | undefined | null): s is OpenAPIV3.ReferenceObject { return !!s && '$ref' in s; }
function isSchemaObject(s: SchemaOrRef | undefined | null): s is OpenAPIV3.SchemaObject { return !!s && !('$ref' in s); }

// Functions here are extracted from original single-file implementation for clarity and testability.

export function flatten(schema: SchemaOrRef, components: Record<string, SchemaOrRef>, seen = new Set<string>()): OutputSchema {
  const { required, optional } = flattenInternal(schema, components, seen);
  return { required, optional };
}

export function flattenInternal(schema: SchemaOrRef, components: Record<string, SchemaOrRef>, seen = new Set<string>()): FlattenResult {
  if (isRef(schema)) {
    const ref = schema.$ref.split('/').pop()!;
    if (seen.has(ref)) return { required: [], optional: [] };
    seen.add(ref);
    const target = components[ref];
    if (!target) return { required: [], optional: [] };
    return flattenInternal(target, components, seen);
  }
  let reqFields: FieldSpec[] = [];
  let optFields: FieldSpec[] = [];

  const expand = (sch: SchemaOrRef | undefined, acc: OpenAPIV3.SchemaObject[], refSeen: Set<string>) => {
    if (!sch) return;
    if (isRef(sch)) {
      const name = sch.$ref.split('/').pop()!;
      if (refSeen.has(name)) return;
      refSeen.add(name);
      const target = components[name];
      if (target) expand(target, acc, refSeen);
      return;
    }
    if (sch.allOf) for (const part of sch.allOf as SchemaOrRef[]) expand(part, acc, refSeen);
    if (isSchemaObject(sch)) acc.push(sch);
  };

  const directSchemas: OpenAPIV3.SchemaObject[] = [];
  expand(schema, directSchemas, new Set<string>());

  const collectedRequired = new Set<string>();
  const collectedProps: Record<string, SchemaOrRef> = {};
  for (const s of directSchemas) {
    for (const r of (s.required || [])) collectedRequired.add(r);
    if (s.properties) Object.assign(collectedProps, s.properties);
  }

  for (const [prop, propSchema] of Object.entries<SchemaOrRef>(collectedProps)) {
    const metadata = deriveFieldMetadata(propSchema, components);
    const rawType = describeType(propSchema, components);
    const spec: FieldSpec = {
      name: prop,
      type: normalizeType(rawType),
      ...metadata,
    };
    if (collectedRequired.has(prop)) reqFields.push(spec); else optFields.push(spec);
  }

  reqFields = dedupeFields(reqFields);
  optFields = dedupeFields(optFields.filter(f => !reqFields.some(r => r.name === f.name)));
  return { required: reqFields, optional: optFields };
}

export function describeType(schema: SchemaOrRef | undefined, components: Record<string, SchemaOrRef>, stack: string[] = []): string {
  if (!schema) return 'unknown';
  if (isRef(schema)) {
    const ref = schema.$ref.split('/').pop()!;
    const target = components[ref];
    if (!target) return ref;
    const prim = primitiveFromSchema(target, components, [...stack, ref]);
    return prim ?? ref;
  }
  if (schema.type === 'array') {
    const items = (schema as OpenAPIV3.ArraySchemaObject).items as SchemaOrRef | undefined;
    return `array<${normalizeType(describeType(items, components, stack))}>`;
  }
  if (schema.allOf) {
    const primCandidates: string[] = (schema.allOf as SchemaOrRef[])
      .map((s)=>primitiveFromSchema(s, components, stack))
      .filter((t: string | null): t is string => !!t && t !== 'object');
    const unique: string[] = [...new Set(primCandidates)];
    if (unique.length === 1) return unique[0];
    const hasObject = (schema.allOf as SchemaOrRef[]).some((s)=>isObjectLike(s));
    if (hasObject) return 'object';
  }
  if (schema.type === 'object' || schema.properties) return 'object';
  if (schema.type) {
    if (schema.type === 'string') return 'string';
    return schema.format ? `${schema.type}(${schema.format})` : schema.type;
  }
  if (schema.oneOf) {
    const branches = (schema.oneOf as SchemaOrRef[]).map((s)=>normalizeType(describeType(s, components, stack)));
    return branches.join('|');
  }
  if (schema.anyOf) {
    const branches = (schema.anyOf as SchemaOrRef[]).map((s)=>normalizeType(describeType(s, components, stack)));
    return branches.join('|');
  }
  return 'unknown';
}

export function deriveFieldMetadata(schema: SchemaOrRef, components: Record<string, SchemaOrRef>): Partial<FieldSpec> {
  const meta: Partial<FieldSpec> = {};
  const collectEnum = (sch: SchemaOrRef | undefined): string[] | undefined => {
    if (!sch) return undefined;
    if (isSchemaObject(sch) && Array.isArray(sch.enum)) return sch.enum.map((v: unknown) => String(v));
    if (isSchemaObject(sch) && sch.allOf) {
      const enums = (sch.allOf as SchemaOrRef[])
        .map((p) => collectEnum(p))
        .filter((e: string[] | undefined): e is string[] => Array.isArray(e));
      if (enums.length) return [...new Set((enums as string[][]).flat())];
    }
    return undefined;
  };

  const detectWrapper = (refName: string, target: SchemaOrRef | undefined): { underlying?: string; wrapper?: boolean; enumValues?: string[] } => {
    if (!target) return {};
    const enumValues = collectEnum(target);
    const underlyingPrim = primitiveFromSchema(target, components, [refName]);
    const isPrimitiveLike = !!underlyingPrim && !(isSchemaObject(target) && (target.properties || target.type === 'object'));
    return {
      underlying: underlyingPrim ? normalizeType(underlyingPrim) : undefined,
      wrapper: !!underlyingPrim && isPrimitiveLike,
      enumValues,
    };
  };

  if (isRef(schema)) {
    const ref = schema.$ref.split('/').pop()!;
    const target = components[ref];
    const { underlying, wrapper, enumValues } = detectWrapper(ref, target);
    if (enumValues?.length) meta.enumValues = enumValues;
    if (wrapper && underlying) meta.underlyingPrimitive = underlying;
    meta.rawRefName = ref;
    if (wrapper) meta.wrapper = true;
    return meta;
  }
  if (schema.allOf) {
    const enumValues = collectEnum(schema);
    if (enumValues?.length) meta.enumValues = enumValues;
  } else if (isSchemaObject(schema) && schema.enum) {
    meta.enumValues = schema.enum.map((v: unknown) => String(v));
  }
  return meta;
}

export function isObjectLike(s: SchemaOrRef | undefined | null): boolean {
  if (!s) return false;
  if (isRef(s)) return false; // handled elsewhere
  return !!(s.type === 'object' || s.properties || s.allOf);
}

export function primitiveFromSchema(schema: SchemaOrRef | undefined, components: Record<string, SchemaOrRef>, stack: string[]): string | null {
  if (!schema) return null;
  if (isRef(schema)) {
    const ref = schema.$ref.split('/').pop()!;
    if (stack.includes(ref)) return ref; // cycle guard returns ref name
    const target = components[ref];
    if (!target) return ref;
    const rec = primitiveFromSchema(target, components, [...stack, ref]);
    return rec ?? ref;
  }
  if (schema.allOf) {
    const parts = (schema.allOf as SchemaOrRef[]).map((p)=>primitiveFromSchema(p, components, stack)).filter(Boolean) as string[];
    const uniq = [...new Set(parts)];
    if (uniq.length === 1) return uniq[0];
    const bases = [...new Set(uniq.map(u => u.split('(')[0]))];
    if (bases.length === 1) {
      const withFormat = uniq.filter(u => u.includes('('));
      if (withFormat.length === 1) return withFormat[0];
      return uniq.sort((a,b)=>b.length - a.length)[0];
    }
    return null;
  }
  if (schema.type && schema.type !== 'object' && !schema.properties && (schema as OpenAPIV3.ArraySchemaObject).items === undefined) {
    if (schema.type === 'string') return 'string';
    return schema.format ? `${schema.type}(${schema.format})` : schema.type;
  }
  return null;
}

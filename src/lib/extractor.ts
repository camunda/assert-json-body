import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import crypto from 'node:crypto';
import SwaggerParser from '@apidevtools/swagger-parser';
import { fileURLToPath } from 'node:url';
import { OpenAPIV3 } from 'openapi-types';
import { sparseCheckout } from './git.js';
import { buildSchemaTree } from './child-expansion.js';
import { ResponsesFile, ResponseEntry, SchemaGroup, ExtractConfig, ResolvedExtractConfig } from '../types/index.js';
import { buildConfig } from './config.js';

// Backwards compatibility defaults retained via config module default values

type ResponsesMap = Record<string, OpenAPIV3.ResponseObject | OpenAPIV3.ReferenceObject>;
type ComponentsLike = { components?: { responses?: ResponsesMap; schemas?: Record<string, OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject> } };
type PathItemLike = OpenAPIV3.PathItemObject;
type OperationLike = OpenAPIV3.OperationObject;

function formatRouteIndex(routeIndex: Record<string, Record<string, Record<string, 1>>>): string {
  const json = JSON.stringify(routeIndex, null, 2);
  const escaped = json.replace(/'/g, "\\'");
  return escaped.replace(/"/g, "'");
}

function isRef(obj: unknown): obj is OpenAPIV3.ReferenceObject {
  return !!obj && typeof obj === 'object' && '$ref' in (obj as Record<string, unknown>);
}

function resolveResponse(resp: OpenAPIV3.ResponseObject | OpenAPIV3.ReferenceObject, doc: ComponentsLike): OpenAPIV3.ResponseObject | OpenAPIV3.ReferenceObject {
  if (isRef(resp)) { const refName = resp.$ref.split('/').pop(); return doc.components?.responses?.[refName!] || resp; }
  return resp;
}

export function extractResponses(doc: OpenAPIV3.Document): ResponseEntry[] {
  const entries: ResponseEntry[] = [];
  const paths: Record<string, PathItemLike> = (doc.paths || {}) as Record<string, PathItemLike>;
  for (const [path, pathItem] of Object.entries(paths)) {
    for (const method of ['get','post','put','patch','delete'] as const) {
      const op: OperationLike | undefined = (pathItem as Record<string, unknown>)[method] as OperationLike | undefined;
      if (!op) continue;
      const responses: ResponsesMap = (op.responses || {}) as ResponsesMap;
      for (const [status, response] of Object.entries(responses)) {
        const resolved = resolveResponse(response, doc);
        const content = (resolved as OpenAPIV3.ResponseObject).content;
        const appJson = content?.['application/json'];
        const schema = appJson?.schema as (OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | undefined);
        if (!schema) continue;
        const flattened = buildSchemaTree(
          schema,
          (doc.components?.schemas || {}) as Record<string, OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject>,
          undefined,
          doc
        );
        entries.push({ path, method: method.toUpperCase(), status, schema: { required: flattened.required, optional: flattened.optional } });
      }
    }
  }
  return entries;
}

export function pruneSchema(schema: SchemaGroup) {
  const visit = (sch: SchemaGroup) => {
    for (const group of [sch.required, sch.optional]) {
      for (const field of group) {
        if (field.children) {
          visit(field.children);
          if (field.children.required.length === 0 && field.children.optional.length === 0) {
            delete field.children;
          }
        }
      }
    }
  };
  visit(schema);
}

export async function generate(cfg?: ExtractConfig, options?: { configPath?: string }) {
  // Resolve configuration (allows direct call with partial overrides)
  const resolution = buildConfig(options?.configPath);
  const base = resolution.resolved.extract;
  const effective: ResolvedExtractConfig = {
    repo: cfg?.repo || base.repo,
    specPath: cfg?.specPath || base.specPath,
    ref: cfg?.ref || base.ref,
    outputDir: cfg?.outputDir || base.outputDir,
    preserveCheckout: cfg?.preserveCheckout ?? base.preserveCheckout,
    dryRun: cfg?.dryRun ?? base.dryRun,
  logLevel: (cfg?.logLevel as ExtractConfig['logLevel']) || base.logLevel,
    failIfExists: cfg?.failIfExists ?? base.failIfExists,
    responsesFile: cfg?.responsesFile || base.responsesFile,
  };
  const REPO = effective.repo;
  const SPEC_PATH = effective.specPath;
  if (effective.logLevel == 'info') {
    console.info(effective)
  }
  const { workdir, commit } = sparseCheckout(REPO, SPEC_PATH, effective.ref);
  try {
    const fullPath = join(workdir, SPEC_PATH);
    const doc = await SwaggerParser.bundle(fullPath) as OpenAPIV3.Document;
    
    const responses = extractResponses(doc);
    for (const entry of responses) pruneSchema(entry.schema);
    const sha256 = crypto.createHash('sha256').update(JSON.stringify(doc)).digest('hex');
    const out: ResponsesFile = { metadata: { sourceRepo: REPO, commit, generatedAt: new Date().toISOString(), specPath: SPEC_PATH, specSha256: sha256 }, responses };
  const outDir = effective.outputDir;
  const targetFile = effective.responsesFile ? resolve(effective.responsesFile) : join(outDir, 'responses.json');
    if (effective.failIfExists && existsSync(targetFile)) {
      throw new Error(`Target file already exists: ${targetFile}`);
    }
    if (!effective.dryRun) {
      mkdirSync(outDir, { recursive: true });
      writeFileSync(targetFile, JSON.stringify(out, null, 2));
      // Emit TypeScript index.ts with strongly-typed validateResponseShape wrapper
      try {
        const routeIndex: Record<string, Record<string, Record<string, 1>>> = {};
        for (const r of responses) {
          if (!routeIndex[r.path]) routeIndex[r.path] = {};
          if (!routeIndex[r.path][r.method]) routeIndex[r.path][r.method] = {};
          routeIndex[r.path][r.method][r.status] = 1;
        }
        const indexSource = `/* Auto-generated by assert-json-body extract. Do not edit manually. */\n` +
          `import {validateResponseShape as _baseValidateResponseShape, validateResponse as _baseValidateResponse} from 'assert-json-body';\n` +
          `import type {PlaywrightAPIResponse} from 'assert-json-body';\n\n` +
          `export const RESPONSE_INDEX = ${formatRouteIndex(routeIndex)} as const;\n\n` +
          `export type RoutePath = keyof typeof RESPONSE_INDEX;\n` +
          `export type MethodFor<P extends RoutePath> = Extract<keyof typeof RESPONSE_INDEX[P], string>;\n` +
          `export type StatusFor<P extends RoutePath, M extends MethodFor<P>> = Extract<keyof typeof RESPONSE_INDEX[P][M], string>;\n\n` +
          `export interface TypedRouteSpec<P extends RoutePath = RoutePath, M extends MethodFor<P> = MethodFor<P>, S extends StatusFor<P, M> = StatusFor<P, M>> {\n` +
          `  path: P;\n  method: M;\n  status: S;\n}` + '\n\n' +
          `export function validateResponseShape<P extends RoutePath, M extends MethodFor<P>, S extends StatusFor<P,M>>(spec: { path: P; method: M; status: S }, body: unknown, options?: { responsesFilePath?: string; configPath?: string; throw?: boolean; record?: boolean | { label?: string } }) {\n` +
          `  // Cast to base signature (method/status widened to string) for internal call.\n` +
          `  const baseFn = _baseValidateResponseShape;\n` +
      `  if (baseFn === (validateResponseShape as unknown)) {\n` +
      `    throw new Error(
"Typed validator resolved to itself. Avoid aliasing the package name to the generated typed file. Use a relative import to the generated ./json-body-assertions/index or import from 'assert-json-body/base' for the core API."
  );\n` +
          `  }\n` +
          `  return baseFn(spec as unknown as { path: string; method?: string; status?: string }, body, options);\n}` + '\n' +
          `export function validateResponse<P extends RoutePath, M extends MethodFor<P>, S extends StatusFor<P,M>>(spec: { path: P; method: M; status: S }, response: PlaywrightAPIResponse, options?: { responsesFilePath?: string; configPath?: string; throw?: boolean; record?: boolean | { label?: string } }) {\n` +
          `  return _baseValidateResponse(spec, response, options)\n}`;
        writeFileSync(join(outDir, 'index.ts'), indexSource);
      } catch (e) {
        if (effective.logLevel === 'debug') console.warn('Failed to emit typed index.ts:', (e as Error).message);
      }
    }
    if (effective.logLevel !== 'silent') {
      console.log(`Extracted ${responses.length} response schemas from commit ${commit}` + (effective.dryRun ? ' (dry-run: no files written)' : ''));
      if (effective.responsesFile && effective.logLevel === 'debug') {
        console.log(`Responses file explicit: ${targetFile}`);
      }
      if (resolution.warnings.length) { for (const w of resolution.warnings) console.warn(`[config] ${w}`); }
    }
  } finally {
    if (effective.preserveCheckout) {
      if (effective.logLevel === 'debug') console.log('Preserving temporary spec checkout.');
  } else { try { rmSync(workdir, { recursive: true, force: true }); } catch { /* ignore cleanup error */ } }
  }
}

// Runtime main guard (ESM safe). For CJS compiled output we skip auto-exec to avoid import.meta requirement.
try {
  // Access import.meta.url only in ESM environments.
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const thisUrl: string | undefined = typeof import.meta !== 'undefined' ? import.meta.url : undefined;
  if (thisUrl) {
    const isMain = process.argv[1] && fileURLToPath(thisUrl) === process.argv[1];
    if (isMain) { generate(); }
  }
} catch { /* ignore */ }

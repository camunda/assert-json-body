import { readFileSync, existsSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { ResponseEntry, ResponsesFile, RouteContext } from '../types/index.js';
import { buildConfig } from './config.js';

interface ResolverOptions { responsesFilePath?: string; configPath?: string }
interface ResolvedPath { path: string; source: 'explicit'|'env'|'config'|'default' }

let cachedConfig: ReturnType<typeof buildConfig> | null = null;
const responseIndexCache = new Map<string, Map<string, ResponseEntry[]>>();

function loadConfigOnce(configPath?: string) {
  if (!cachedConfig) { cachedConfig = buildConfig(configPath); }
  return cachedConfig;
}

function resolveResponsesFile(opts: ResolverOptions = {}): ResolvedPath {
  // 1. explicit option
  if (opts.responsesFilePath) {
    const p = isAbsolute(opts.responsesFilePath) ? opts.responsesFilePath : resolve(process.cwd(), opts.responsesFilePath);
    return { path: p, source: 'explicit' };
  }
  // 2. env var
  const envPath = process.env.ROUTE_TEST_RESPONSES_FILE || process.env.AJB_RESPONSES_FILE;
  if (envPath) {
    const p = isAbsolute(envPath) ? envPath : resolve(process.cwd(), envPath);
    return { path: p, source: 'env' };
  }
  // 3. config (load lazily)
  const cfg = loadConfigOnce(opts.configPath);
  const configured = cfg.resolved.extract.responsesFile || (cfg.resolved.extract.outputDir ? resolve(process.cwd(), cfg.resolved.extract.outputDir, 'responses.json') : undefined);
  if (configured) return { path: configured, source: 'config' };
  // 4. default (cwd/json-body-assertions/responses.json)
  return { path: resolve(process.cwd(), 'json-body-assertions', 'responses.json'), source: 'default' };
}

function buildIndex(filePath: string): Map<string, ResponseEntry[]> {
  if (!existsSync(filePath)) {
    throw new Error(`Responses schema file not found at ${filePath}`);
  }
  let raw: string;
  try { raw = readFileSync(filePath, 'utf8'); } catch (e) { throw new Error(`Failed to read responses schema at ${filePath}: ${(e as Error).message}`); }
  let parsed: ResponsesFile;
  try { parsed = JSON.parse(raw) as ResponsesFile; } catch (e) { throw new Error(`Failed to parse responses schema JSON at ${filePath}: ${(e as Error).message}`); }
  if (!parsed || !Array.isArray(parsed.responses)) {
    throw new Error(`Invalid responses schema format at ${filePath}: missing 'responses' array`);
  }
  const map = new Map<string, ResponseEntry[]>();
  for (const entry of parsed.responses) {
    if (!entry || typeof entry !== 'object' || !entry.path) continue; // skip malformed entries silently
    const list = map.get(entry.path) || [];
    list.push(entry);
    map.set(entry.path, list);
  }
  return map;
}

function getIndex(filePath: string): Map<string, ResponseEntry[]> {
  let idx = responseIndexCache.get(filePath);
  if (!idx) { idx = buildIndex(filePath); responseIndexCache.set(filePath, idx); }
  return idx;
}

export interface PickRouteOptions extends ResolverOptions { method?: string; status?: string }

export function pickRoute(path: string, method?: string, status?: string, _deprecated?: unknown): RouteContext;
export function pickRoute(path: string, options?: PickRouteOptions): RouteContext;
export function pickRoute(path: string, a?: PickRouteOptions | string, b?: string, _d?: unknown): RouteContext {
  // Hard break: if second arg is object treat as options, else legacy signature still partially honored this release but will throw if 4th param used.
  let method: string | undefined;
  let status: string | undefined;
  let opts: PickRouteOptions = {};
  if (a && typeof a === 'object' && !Array.isArray(a)) {
    opts = a as PickRouteOptions;
    method = opts.method;
    status = opts.status;
  } else {
    method = a as string;
    status = b;
    if (_d !== undefined) throw new Error('Fourth argument to pickRoute removed; use options object instead.');
  }
  const resolved = resolveResponsesFile({ responsesFilePath: opts.responsesFilePath, configPath: opts.configPath });
  const idx = getIndex(resolved.path);
  const entries = idx.get(path) || [];
  if (entries.length === 0) {
    throw new Error(`No OpenAPI response spec entries found for path '${path}' (schema source: ${resolved.source} @ ${resolved.path}).`);
  }
  let filtered = entries;
  if (method) filtered = filtered.filter(e => e.method.toLowerCase() === method.toLowerCase());
  if (status) filtered = filtered.filter(e => e.status === status);
  if ((method || status) && filtered.length === 0) {
    const available = entries.map(e => `${e.method} ${e.status}`).sort().join(', ');
    throw new Error(`No matching spec entry for ${path} with method=${method || '*'} status=${status || '*'} (schema: ${resolved.path}).\nAvailable: ${available}`);
  }
  const chosen = filtered.find(e => e.status === '200' && e.method === 'GET') || filtered.find(e => e.status === '200') || filtered.find(e => e.status === '201') || filtered[0];
  const required = chosen.schema.required || [];
  const optional = chosen.schema.optional || [];
  return {
    route: path,
    method: chosen.method,
    status: chosen.status,
    requiredFieldNames: required.map(f => f.name),
    requiredFields: required,
    optionalFields: optional,
  };
}

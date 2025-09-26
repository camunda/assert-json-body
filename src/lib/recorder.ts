import {appendFileSync, existsSync, mkdirSync} from 'node:fs';
import {isAbsolute, resolve} from 'node:path';
import {RouteContext} from '../types/index.js';
import { buildConfig } from './config.js';

function ensureRecordDir(dir: string): void {
  if (!existsSync(dir)) {
    try { mkdirSync(dir, {recursive: true}); } catch { /* ignore */ }
  }
}

function toAbsolute(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

export function resolveRecordDirectory(opts: { directory?: string; outputDir?: string; configPath?: string } = {}): string | undefined {
  if (opts.directory) return toAbsolute(opts.directory);
  const envDir = process.env.TEST_RESPONSE_BODY_RECORD_DIR;
  if (envDir) return toAbsolute(envDir);
  const outputDir = opts.outputDir ?? buildConfig(opts.configPath).resolved.extract.outputDir;
  if (!outputDir) return undefined;
  const absoluteOutput = toAbsolute(outputDir);
  return resolve(absoluteOutput, 'recording');
}

function sanitizeForFile(name: string): string {
  return name.replace(/^\//, '').replace(/[^A-Za-z0-9._-]+/g, '_');
}

export function recordBody(opts: { routeCtx: RouteContext; body: unknown; testTitle?: string; label?: string; directory?: string; configPath?: string; outputDir?: string; }): void {
  const recordDir = opts.directory ?? resolveRecordDirectory({ outputDir: opts.outputDir, configPath: opts.configPath });
  if (!recordDir) return;
  try {
    ensureRecordDir(recordDir);
    const {routeCtx, body} = opts;
    const testTitle = opts.testTitle || opts.label;
    const fileBase = `${(routeCtx.method || 'ANY').toUpperCase()}_${routeCtx.status || 'ANY'}_${sanitizeForFile(routeCtx.route)}`;
    const file = `${recordDir}/${fileBase}.jsonl`;
    const present: string[] = [];
    const deepSet = new Set<string>();
    const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
    const escape = (seg: string) => seg.replace(/~/g, '~0').replace(/\//g, '~1');
    const addPath = (p: string) => { if (p) deepSet.add(p); };
    const walk = (val: unknown, base: string) => {
      if (isObj(val)) {
        for (const key of Object.keys(val)) {
          const ptr = `${base}/${escape(key)}`;
          addPath(ptr);
          walk((val as Record<string, unknown>)[key], ptr);
        }
      } else if (Array.isArray(val)) {
        for (let i = 0; i < val.length; i++) {
          const el = val[i];
            if (isObj(el) || Array.isArray(el)) walk(el, `${base}/*`);
        }
      }
    };
    if (isObj(body)) {
      for (const k of Object.keys(body)) present.push(k);
      walk(body, '');
    }
    const deepPresent = Array.from(deepSet).sort();
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      route: routeCtx.route,
      method: routeCtx.method,
      status: routeCtx.status,
      test: testTitle,
      required: routeCtx.requiredFieldNames,
      present,
      deepPresent,
      body,
    });
    appendFileSync(file, line + '\n');
  } catch { /* ignore */ }
}

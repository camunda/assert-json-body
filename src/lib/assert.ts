import { pickRoute } from './responses.js';
import { recordBody, resolveRecordDirectory } from './recorder.js';
import { _validateRouteContext } from './validator.js';
import { RouteContext } from '../types/index.js';

export interface AssertionSpec { path: string; method?: string; status?: string }
export interface AssertionOptions {
  /** If false, do not throw; instead return { ok:false, errors } */
  throw?: boolean;
  /** Enable body recording (requires env TEST_RESPONSE_BODY_RECORD_DIR); optional test label */
  record?: boolean | { label?: string };
  /** Alternate responses file path (overrides environment resolution) */
  responsesFilePath?: string;
  /** Optional explicit config file path (looked up relative to cwd if relative) */
  configPath?: string;
}

export interface AssertionResult { ok: boolean; errors?: string[] }

/**
 * High-level assertion helper: resolves the route spec entry and validates the given body.
 * Throws by default on mismatch; pass { throw:false } to receive a structured result instead.
 */
export function assertResponseShape(spec: AssertionSpec, body: unknown, options: AssertionOptions = {}): AssertionResult | void {
  const routeCtx: RouteContext = pickRoute(spec.path, { method: spec.method, status: spec.status, responsesFilePath: options.responsesFilePath, configPath: options.configPath });
  const wantRecord = !!options.record;
  if (wantRecord) {
    let label: string | undefined;
    if (typeof options.record === 'object' && options.record) label = options.record.label;
    const recordDir = resolveRecordDirectory({ configPath: options.configPath });
    recordBody({ routeCtx, body, label, directory: recordDir });
  }
  try {
  _validateRouteContext(routeCtx, body);
    if (options.throw === false) return { ok: true };
  } catch (err) {
    if (options.throw === false) {
      const msg = (err as Error).message || '';
      // first line is summary; retain full message lines after summary for detail
      const lines = msg.split('\n');
      return { ok: false, errors: lines.slice(1).filter(Boolean) };
    }
    throw err;
  }
}

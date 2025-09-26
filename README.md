# assert-json-body

[![Release](https://github.com/camunda/assert-json-body/actions/workflows/release.yml/badge.svg)](https://github.com/camunda/assert-json-body/actions/workflows/release.yml)
[![npm version](https://img.shields.io/npm/v/assert-json-body.svg)](https://www.npmjs.com/package/assert-json-body)

Framework-agnostic toolkit to:
- Extract OpenAPI response schemas into a compact `responses.json` artifact
- Validate real JSON response bodies against the extracted required/optional field model
- Assert inside any test runner (Vitest, Jest, Playwright, etc.)

## Installation

```
npm install assert-json-body
```

## Quick Start

1. (Optional) Initialize a config file:
	 ```
	 npx assert-json-body config:init
	 ```
	 Produces `assert-json-body.config.json` (edit repo, spec path, output dir, etc.).

2. Extract responses from your OpenAPI spec:
	 ```
	 npx assert-json-body extract
	 ```
	 This writes (by default):
	 - `./json-body-assertions/responses.json` (schema bundle)
	 - `./json-body-assertions/index.ts` (auto-generated typed wrapper)
	 or the configured `responsesFile` for the JSON schema artifact.

	 The init step also adds an npm script for convenience:
	 ```jsonc
	 // package.json
	 {
	   "scripts": {
	     "responses:regenerate": "assert-json-body extract"
	   }
	 }
	 ```
	 So you can run:
	 ```
	 npm run responses:regenerate
	 ```

3. Validate in a test (untyped import):
	 ```ts
	 import { validateResponseShape } from 'assert-json-body';

	 // Suppose you just performed an HTTP request and have jsonBody
	 validateResponseShape({ path: '/process-instance/create', method: 'POST', status: '200' }, jsonBody);
	 // Throws if JSON shape violates required field presence / type rules.
	 ```

4. Prefer typed validation (after extract):
	 ```ts
	 import { validateResponseShape } from './json-body-assertions/index';

	 // Now path/method/status are constrained to extracted endpoints
	 validateResponseShape({ path: '/process-instance/create', method: 'POST', status: '200' }, jsonBody);

	 // @ts-expect-error invalid status not in spec
	 // validateResponseShape({ path: '/process-instance/create', method: 'POST', status: '418' }, jsonBody);
	 ```

Regenerate typed file whenever the spec changes by re-running `extract` (commit both `responses.json` and `index.ts` if you track API contract changes in version control).

You can control default throw/record behavior globally via config or env (see below) and override per call.

### CI Integration
Keep the generated artifacts (`responses.json`, `index.ts`) in sync with the upstream spec during continuous integration:

Example GitHub Actions step (add after install):
```yaml
	- name: Regenerate response schemas
		run: npm run responses:regenerate
```

If you commit the generated files:
1. Run the regenerate step early (before tests).
2. Add a check that the working tree is clean to ensure developers didn’t forget to re-run extraction locally:
```yaml
	- name: Verify no uncommitted changes
		run: |
			git diff --exit-code || (echo 'Generated response artifacts out of date. Run: npm run responses:regenerate' && exit 1)
```

If you prefer not to commit generated artifacts:
- Add the output directory (default `json-body-assertions/`) to `.gitignore`.
- Always run `npm run responses:regenerate` before building / testing.

Caching tip: if your spec repo is large, you can cache the sparse checkout directory by keying on the spec ref (commit SHA) to speed up subsequent runs.

## Configuration

Config file: `assert-json-body.config.json` (created with `npx assert-json-body config:init`).

The configuration is now split into two blocks:

1. `extract`: Controls OpenAPI repo checkout and artifact generation.
2. `validate`: Controls global validation behaviour (recording & throw semantics).

### extract block

| Field | Type | Default | Description | Env override(s) |
|-------|------|---------|-------------|-----------------|
| `repo` | string | `https://github.com/camunda/camunda-orchestration-cluster-api` | Git repository containing the OpenAPI spec | `AJB_REPO`, `REPO` |
| `specPath` | string | `specification/rest-api.yaml` | Path to OpenAPI spec inside the repo | `AJB_SPEC_PATH`, `SPEC_PATH` |
| `ref` | string | `main` | Git ref (branch/tag/sha) to checkout | `AJB_REF`, `SPEC_REF`, `REF` |
| `outputDir` | string | `json-body-assertions` | Directory to write `responses.json` + generated `index.ts` | `AJB_OUTPUT_DIR`, `OUTPUT_DIR` |
| `preserveCheckout` | boolean | `false` | Keep sparse checkout working copy (debug) | `AJB_PRESERVE_CHECKOUT`, `PRESERVE_SPEC_CHECKOUT` |
| `dryRun` | boolean | `false` | Parse spec but do not write files | `AJB_DRY_RUN` |
| `logLevel` | enum | `info` | `silent` `error` `warn` `info` `debug` | `AJB_LOG_LEVEL` |
| `failIfExists` | boolean | `false` | Abort if target responses file already exists | `AJB_FAIL_IF_EXISTS` |
| `responsesFile` | string | — | Optional explicit path for responses JSON (advanced) | `AJB_RESPONSES_FILE`, `ROUTE_TEST_RESPONSES_FILE` |

### validate block

| Field | Type | Default | Description | Env override(s) |
|-------|------|---------|-------------|-----------------|
| `recordResponses` | boolean | `false` | Globally enable body recording | `AJB_RECORD`, `TEST_RESPONSE_BODY_RECORD` |
| `throwOnValidationFail` | boolean | `true` | Throw vs structured `{ ok:false }` result | `AJB_THROW_ON_FAIL` |

Additional env variables:

| Env | Purpose |
|-----|---------|
| `TEST_RESPONSE_BODY_RECORD_DIR` | Directory where JSONL body recordings are written when recording is active |

Example full config:
```json
{
	"extract": {
		"repo": "https://github.com/camunda/camunda-orchestration-cluster-api",
		"specPath": "specification/openapi.yaml",
		"ref": "main",
		"outputDir": "json-body-assertions",
		"preserveCheckout": false,
		"dryRun": false,
		"logLevel": "info",
		"failIfExists": false
	},
	"validate": {
		"recordResponses": false,
		"throwOnValidationFail": true
	}
}
```

Notes:
- The responses schema file defaults to `<outputDir>/responses.json` unless overridden.
- Boolean env overrides accept `1|true|yes` (case-insensitive).
- Precedence per value: CLI flag > environment variable > config file > built-in default.

## Schema Resolution Precedence

When `validateResponseShape` looks for the schema artifact, precedence is:
1. Explicit option: `responsesFilePath` passed to the function
2. Environment variable: `ROUTE_TEST_RESPONSES_FILE` or `AJB_RESPONSES_FILE`
3. Config file: `extract.responsesFile` or `<outputDir>/responses.json`
4. Default fallback: `./json-body-assertions/responses.json`

All file issues (missing, unreadable, parse errors, malformed structure) throw clear errors.

## API Reference

### `validateResponseShape(spec, body, options?)`
Single unified API: validates `body` against the schema entry. Supports optional structured result mode and recording.

```ts
validateResponseShape(
	{ path: '/foo', method: 'GET', status: '200' },
	jsonBody,
	{ responsesFilePath: './custom/responses.json', configPath: './custom-config.json' }
);
```
Default behavior: throws on mismatch (configurable). If you pass `throw:false` (or set global flag) it returns a structured object:

```ts
interface ValidateResultBase {
	ok: boolean;
	errors?: string[];          // present when ok === false
	response: unknown;          // the original response body you passed in
	schema: {                   // the schema fragment used for validation
		required: FieldSpec[];
		optional: FieldSpec[];
	};
	routeContext: RouteContext; // resolved route/method/status + flattened field specs
}
```

Examples:
```ts
// Success (non-throw mode)
const r1 = validateResponseShape({ path: '/foo', method: 'GET', status: '200' }, body, { throw: false });
if (!r1.ok) throw new Error('unexpected');
console.log(r1.schema.required.map(f => f.name));

// Failure (non-throw mode)
const r2 = validateResponseShape({ path: '/foo', method: 'GET', status: '200' }, otherBody, { throw: false });
if (!r2.ok) {
	console.warn(r2.errors);            // array of error lines
	console.log(r2.routeContext.status); // resolved status used
}
```

#### Options
- `responsesFilePath` / `configPath` – override resolution
- `throw?: boolean` – override global throw setting
- `record?: boolean | { label?: string }` – enable recording for this call

### Types
`FieldSpec`, `RouteContext`, and other structural types are exported from `@/types`.

### Generated Typed Entry (after extract)
After running the extractor you can import a strongly-typed version of `validateResponseShape` that constrains `path`, `method` and `status` to only the extracted endpoints:
```ts
import { validateResponseShape } from './json-body-assertions/index';

// Autocomplete + compile-time safety for path/method/status
validateResponseShape({ path: '/process-instance/create', method: 'POST', status: '200' }, body);

// @ts-expect-error invalid status for that route will fail type-check
// validateResponseShape({ path: '/process-instance/create', method: 'POST', status: '418' }, body);
```
You can also use the exported helper types:
```ts
import type { RoutePath, MethodFor, StatusFor } from './json-body-assertions/index';

type AnyRoute = RoutePath;
type GetStatus<P extends RoutePath> = StatusFor<P, MethodFor<P>>;
```

## FAQ

**Why do I get two files (`responses.json` and `index.ts`)?**  
`responses.json` is the runtime artifact used for validation. `index.ts` adds compile-time safety and autocomplete for route specifications.

**Do I need to commit `index.ts`?**  
Recommended: yes. Changes in that file make API evolution explicit in diffs. If you prefer to ignore it, ensure your build pipeline runs `assert-json-body extract` first.

**Can I disable type emission?**  
Not yet—emission is always on. Open an issue if you need a toggle.

**Large spec performance concerns?**  
The generated `index.ts` only stores a nested map of route/method/status flags, not full schema trees, keeping file size modest. Extremely large specs are still typically < a few hundred KB.

**How do I update types after the spec changes?**  
Re-run `npx assert-json-body extract`. The `index.ts` file is regenerated deterministically.

**Do I still need to import from the package root?**  
Use the package root for generic validation utilities (`validateResponseShape`), and the generated `./json-body-assertions/index` for strongly typed validation.

## Releasing & Versioning

This project uses [semantic-release](https://semantic-release.gitbook.io/) with Conventional Commits to automate:
- Version determination (based on commit messages)
- CHANGELOG generation (`CHANGELOG.md`)
- GitHub release notes
- npm publication

Every push to `main` triggers the release workflow. Ensure your commits follow Conventional Commit prefixes so changes are categorized correctly:

Common types:
- `feat:` – new feature (minor release)
- `fix:` – bug fix (patch release)
- `docs:` – documentation only
- `refactor:` – code change that neither fixes a bug nor adds a feature
- `perf:` – performance improvement
- `test:` – adding or correcting tests
- `chore:` – build / tooling / infra

Breaking changes: add a footer line `BREAKING CHANGE: <description>` (or use `!` after the type, e.g. `feat!: drop Node 16`).

Example commit message:
```
feat: add structured validation result for non-throw mode

BREAKING CHANGE: removed deprecated assertResponseShape in favor of unified validateResponseShape
```

Manual version bumps in `package.json` are not needed; semantic-release will handle it.

Local commit messages are validated by commitlint + husky (commit-msg hook). If a commit is rejected, adjust the prefix / format to match Conventional Commits.

## CLI Commands

| Command | Description |
|---------|-------------|
| `assert-json-body extract` | Performs sparse checkout + OpenAPI parse + response schema flattening into `responses.json` and emits typed `index.ts`. |
| `assert-json-body config:init` | Creates a starter `assert-json-body.config.json`. |

Environment variables (selected):
- `ROUTE_TEST_RESPONSES_FILE` / `AJB_RESPONSES_FILE` – override schema file
- `TEST_RESPONSE_BODY_RECORD_DIR` – directory to write JSONL body recordings
- `AJB_RECORD` / `TEST_RESPONSE_BODY_RECORD` – set default recording on (true/1/yes)
- `AJB_THROW_ON_FAIL` – set default throw behavior (true/false)

## Recording (Optional)

Set `TEST_RESPONSE_BODY_RECORD_DIR=./recordings` and either:
```ts
// Per-call recording
validateResponseShape({ path: '/foo', method: 'GET', status: '200' }, body, { record: { label: 'GET /foo success' } });

// Or enable globally (env): AJB_RECORD=true
```
Produces JSONL rows with required field list, top-level present, deep presence and body snapshot.

## Integration Tests

An optional end-to-end integration test suite lives under `integration/` and is excluded from the default unit test run.

Run unit tests (fast, pure):
```
npm test
```

Run integration tests (performs real OpenAPI extraction and live HTTP calls):
```
npm run test:integration
```

Local requirements:
- Start the target service (expected at `http://localhost:8080` by default), or
- Set `TEST_BASE_URL` to point to a running instance

CI (Docker) example:
```yaml
	- name: Start API container
		run: |
			docker run -d --name api -p 8080:8080 your/api:image
			for i in {1..30}; do curl -sf http://localhost:8080/license && break; sleep 1; done
	- name: Run integration tests
		run: npm run test:integration
```

If the service is unreachable, the integration test logs a warning and exits early (treated as a soft skip).

## Error Messages

Errors show a capped (first 15) list of issues (missing, type, enum, extra) with JSON Pointer paths. Additional errors are summarized with a count.

## Precedence Test Illustration

See `src/tests/precedence.spec.ts` for an executable example verifying explicit > env > config > default ordering.

## License
ISC (see `LICENSE`).


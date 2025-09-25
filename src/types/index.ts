/* Unified type definitions combining assertion ResponseFieldSpec and extractor FieldSpec */

export interface FieldSpec {
  name: string;
  type: string; // normalized display type (primitive | array<...> | object | ref name)
  children?: SchemaGroup; // present for object or array<object>
  enumValues?: string[];
  underlyingPrimitive?: string; // underlying primitive if wrapper
  rawRefName?: string; // original $ref name
  wrapper?: boolean; // true if a named wrapper schema over a primitive
}

export interface SchemaGroup { required: FieldSpec[]; optional: FieldSpec[] }

export interface ResponseEntry {
  path: string;
  method: string;
  status: string;
  schema: SchemaGroup;
}

export interface ResponsesFileMetadata {
  sourceRepo: string;
  commit: string;
  generatedAt: string;
  specPath: string;
  specSha256: string;
}

export interface ResponsesFile {
  metadata?: ResponsesFileMetadata;
  responses: ResponseEntry[];
}

export interface RouteContext {
  route: string;
  method?: string;
  status?: string;
  requiredFieldNames: string[];
  requiredFields: FieldSpec[];
  optionalFields: FieldSpec[];
}

export interface FlattenResult { required: FieldSpec[]; optional: FieldSpec[] }

// ---------------------------
// Config model (split blocks)
// ---------------------------

/** Extraction (generate) configuration options */
export interface ExtractConfig {
  repo?: string;
  specPath?: string;
  ref?: string;
  outputDir?: string;
  preserveCheckout?: boolean;
  dryRun?: boolean;
  responsesFile?: string; // advanced override
  logLevel?: 'silent' | 'error' | 'warn' | 'info' | 'debug';
  failIfExists?: boolean;
}

/** Validation behaviour configuration options */
export interface ValidateConfig {
  /** Enable recording of validated bodies globally (can still be overridden per call) */
  recordResponses?: boolean;
  /** Throw on validation failure by default (true) vs structured result mode */
  throwOnValidationFail?: boolean;
}

/** Root JSON configuration file shape */
export interface ConfigFile {
  extract?: ExtractConfig;
  validate?: ValidateConfig;
  /** Room for future config sections */
  assert?: Record<string, unknown>;
}

export interface ResolvedExtractConfig extends Required<Pick<ExtractConfig,
  'repo' | 'specPath' | 'ref' | 'outputDir' | 'preserveCheckout' | 'dryRun' | 'logLevel' | 'failIfExists'>> {
  responsesFile?: string;
}

export interface ResolvedValidateConfig extends Required<Pick<ValidateConfig,
  'recordResponses' | 'throwOnValidationFail'>> {}

export interface ResolvedConfig {
  extract: ResolvedExtractConfig;
  validate: ResolvedValidateConfig;
}

export interface ConfigResolution {
  filePath?: string;
  file?: ConfigFile;
  cli: ExtractConfig; // extraction flags only
  env: { extract: ExtractConfig; validate: ValidateConfig };
  resolved: ResolvedConfig;
  warnings: string[];
}

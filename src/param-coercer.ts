import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { coerceTime } from './time-coercer.js';
import type { ParamConfig, ParamItems } from './types.js';

/**
 * Options for customizing parameter coercion behavior.
 */
export interface CoerceOptions {
  /** Working directory for relative file path resolution. */
  cwd?: string;

  /** Pre-resolved or piped standard input string. */
  stdinContent?: string;
}

const FLAG_TRUTHY_VALUES = new Set(['1', 'true', 'y', 'yes']);
const FLAG_FALSY_VALUES = new Set(['0', 'false', 'n', 'no']);

/**
 * Validates and converts date parameters.
 */
function coerceDate(value: unknown, paramName: string): Date {
  const date = new Date(String(value));

  if (isNaN(date.getTime())) {
    throw new TypeError(`Parameter '${paramName}' expects a valid date, received: '${value}'`);
  }

  return date;
}

/**
 * Validates file path and confirms existence on disk.
 */
function coerceFile(value: unknown, paramName: string, cwd: string): string {
  const resolved = path.resolve(cwd, String(value));

  if (!fs.existsSync(resolved)) {
    throw new Error(`Parameter '${paramName}' file does not exist: '${resolved}'`);
  }

  return resolved;
}

/**
 * Validates and converts flag parameters to boolean.
 */
function coerceFlag(value: unknown, paramName: string): boolean {
  if (typeof value === 'boolean') return value;

  const normalized = String(value).toLowerCase().trim();

  return parseBooleanString(normalized, paramName, value);
}

/**
 * Validates keyword identifier parameters.
 */
function coerceKeyword(value: unknown, paramName: string): string {
  const str = String(value);

  if (!/^[a-zA-Z0-9_-]+$/.test(str)) {
    throw new TypeError(
      `Parameter '${paramName}' expects a keyword identifier, received: '${value}'`,
    );
  }

  return str;
}

/**
 * Validates and converts numeric parameters.
 */
function coerceNumber(value: unknown, paramName: string): number {
  const parsed = Number(value);

  if (value === '' || isNaN(parsed)) {
    throw new TypeError(`Parameter '${paramName}' expects a valid number, received: '${value}'`);
  }

  return parsed;
}

/**
 * Validates and converts select parameters matching defined choice items.
 */
function coerceSelect(value: unknown, param: ParamConfig): string | number {
  const items = extractSyncSelectItems(param.items);

  if (!hasSyncItems(items)) return String(value);

  if (param.allowCustom) return matchCustomSelect(value, items as (string | number)[]);

  return dispatchSelectMatch(value, items as (string | number)[], param.name);
}

/**
 * Validates and resolves stdin content.
 */
function coerceStdin(value: unknown, stdinContent?: string): string {
  if (stdinContent !== undefined) return stdinContent;

  if (isDirectString(value)) return value as string;

  return readStdinSync();
}

/**
 * Validates URL string and returns a URL instance.
 */
function coerceUrl(value: unknown, paramName: string): URL {
  try {
    return new URL(String(value));
  } catch {
    throw new TypeError(`Parameter '${paramName}' expects a valid URL, received: '${value}'`);
  }
}

/**
 * Dispatches selection matching depending on whether choices are purely numeric.
 */
function dispatchSelectMatch(
  value: unknown,
  items: (string | number)[],
  name: string,
): string | number {
  return isNumericList(items)
    ? matchNumberSelect(value, items, name)
    : matchStringSelect(value, items, name);
}

/**
 * Dispatches value coercion according to parameter configuration type.
 */
function dispatchValue(param: ParamConfig, rawValue: unknown, ctx: CoerceContext): unknown {
  const handler = TYPE_COERCERS[param.type];

  return handler ? handler(ctx) : String(rawValue);
}

/**
 * Extracts optional choice items synchronously from a ParamItems definition.
 */
function extractSyncSelectItems(items?: ParamItems): (string | number)[] | undefined {
  const raw = resolveRawSyncItems(items);

  return Array.isArray(raw) ? raw : undefined;
}

/**
 * Extracts optional standard input content from coercion options.
 */
function getOptionStdin(options?: CoerceOptions): string | undefined {
  return options ? options.stdinContent : undefined;
}

/**
 * Checks whether items list has at least one element.
 */
function hasSyncItems(items?: (string | number)[]): boolean {
  return Boolean(items && items.length > 0);
}

/**
 * Determines whether raw value represents a direct non-stdin-hyphen string.
 */
function isDirectString(value: unknown): boolean {
  return typeof value === 'string' && value !== '-';
}

/**
 * Checks if a value is null or undefined.
 */
function isNullish(value: unknown): boolean {
  return value === undefined || value === null;
}

/**
 * Checks whether all items in the selection list are numbers.
 */
function isNumericList(items: (string | number)[]): boolean {
  return items.every((item) => typeof item === 'number');
}

/**
 * Matches custom select value against items with numeric conversion if applicable.
 */
function matchCustomSelect(value: unknown, items: (string | number)[]): string | number {
  const str = String(value);

  if (items.map(String).includes(str)) return isNumericList(items) ? Number(value) : str;

  return str;
}

/**
 * Validates and matches numeric selection from items list.
 */
function matchNumberSelect(value: unknown, items: (string | number)[], name: string): number {
  const num = Number(value);

  if (!isNaN(num) && items.includes(num)) return num;

  throw new TypeError(
    `Parameter '${name}' expects one of [${items.join(', ')}], received: '${value}'`,
  );
}

/**
 * Validates and matches string selection from items list.
 */
function matchStringSelect(value: unknown, items: (string | number)[], name: string): string {
  const str = String(value);

  if (items.map(String).includes(str)) return str;

  throw new TypeError(
    `Parameter '${name}' expects one of [${items.join(', ')}], received: '${value}'`,
  );
}

/**
 * Parses and maps normalized string values to boolean flag state.
 */
function parseBooleanString(normalized: string, paramName: string, value: unknown): boolean {
  if (FLAG_TRUTHY_VALUES.has(normalized)) return true;

  if (FLAG_FALSY_VALUES.has(normalized)) return false;

  throw new TypeError(`Parameter '${paramName}' expects a boolean flag, received: '${value}'`);
}

/**
 * Reads piped input synchronously from standard input stream.
 */
function readStdinSync(): string {
  try {
    return fs.readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Resolves working directory with fallback to default directory.
 */
function resolveCwd(defaultCwd: string, options?: CoerceOptions): string {
  return options?.cwd ?? defaultCwd;
}

const TYPE_COERCERS: Record<string, CoercerFn | undefined> = {
  date: (ctx) => coerceDate(ctx.rawValue, ctx.param.name),
  file: (ctx) => coerceFile(ctx.rawValue, ctx.param.name, ctx.cwd),
  flag: (ctx) => coerceFlag(ctx.rawValue, ctx.param.name),
  keyword: (ctx) => coerceKeyword(ctx.rawValue, ctx.param.name),
  number: (ctx) => coerceNumber(ctx.rawValue, ctx.param.name),
  select: (ctx) => coerceSelect(ctx.rawValue, ctx.param),
  stdin: (ctx) => coerceStdin(ctx.rawValue, ctx.stdinContent),
  time: (ctx) => coerceTime(ctx.rawValue, ctx.param.name),
  url: (ctx) => coerceUrl(ctx.rawValue, ctx.param.name),
};

/**
 * Resolves fallback value when parameter is omitted from input.
 */
function resolveDefaultValue(param: ParamConfig): unknown {
  if (param.default !== undefined) return param.default;

  if (param.type === 'flag') return false;

  return undefined;
}

/**
 * Resolves raw choice item output synchronously from static list or item provider function.
 */
function resolveRawSyncItems(items?: ParamItems): unknown {
  if (typeof items === 'function') return items();

  return items;
}

/**
 * Creates a parameter coercion and validation utility.
 *
 * @param defaultCwd Working directory for file path resolution
 * @returns Parameter coercer instance
 * @example
 * ```ts
 * const coercer = createParamCoercer();
 * const date = coercer.coerce({ name: 'start', type: 'date' }, '2026-10-02');
 * // Returns a parsed Date object
 * ```
 */
export function createParamCoercer(defaultCwd: string = process.cwd()) {
  const _ = {
    cwd: defaultCwd,
  };

  /**
   * Internal dispatcher for coercing an individual parameter value.
   */
  function coerce(param: ParamConfig, rawValue: unknown, options?: CoerceOptions): unknown {
    if (isNullish(rawValue)) return resolveDefaultValue(param);

    const ctx: CoerceContext = {
      cwd: resolveCwd(_.cwd, options),
      param,
      rawValue,
      stdinContent: getOptionStdin(options),
    };

    return dispatchValue(param, rawValue, ctx);
  }

  return {
    coerce,
  };
}

interface CoerceContext {
  cwd: string;
  param: ParamConfig;
  rawValue: unknown;
  stdinContent?: string;
}

type CoercerFn = (ctx: CoerceContext) => unknown;

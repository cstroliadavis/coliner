import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import type { ParamConfig } from './types.js';

export interface CoerceOptions {
  cwd?: string;
  stdinContent?: string;
}

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
 * Validates keyword identifier parameters.
 */
function coerceKeyword(value: unknown, paramName: string): string {
  const str = String(value);

  if (!/^[a-zA-Z0-9_\-]+$/.test(str)) {
    throw new TypeError(
      `Parameter '${paramName}' expects a keyword identifier, received: '${value}'`
    );
  }

  return str;
}

/**
 * Validates and converts flag parameters to boolean.
 */
function coerceFlag(value: unknown, paramName: string): boolean {
  if (typeof value === 'boolean') return value;

  const normalized = String(value).toLowerCase().trim();

  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;

  throw new TypeError(`Parameter '${paramName}' expects a boolean flag, received: '${value}'`);
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
 * Validates and resolves stdin content.
 */
function coerceStdin(value: unknown, stdinContent?: string): string {
  if (stdinContent !== undefined) return stdinContent;
  if (typeof value === 'string' && value !== '-') return value;

  try {
    return fs.readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Creates a parameter coercion and validation utility.
 *
 * @param defaultCwd Working directory for file path resolution
 * @returns Parameter coercer object
 * @example
 * ```ts
 * const coercer = createParamCoercer();
 * const date = coercer.coerce({ name: 'start', type: 'date' }, '2026-10-02');
 * // Returns Date object for 2026-10-02
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
    if (rawValue === undefined || rawValue === null) {
      if (param.default !== undefined) return param.default;
      if (param.type === 'flag') return false;

      return undefined;
    }

    const currentCwd = options?.cwd || _.cwd;
    const { name, type } = param;

    if (type === 'flag') return coerceFlag(rawValue, name);
    if (type === 'number') return coerceNumber(rawValue, name);
    if (type === 'date') return coerceDate(rawValue, name);
    if (type === 'url') return coerceUrl(rawValue, name);
    if (type === 'file') return coerceFile(rawValue, name, currentCwd);
    if (type === 'keyword') return coerceKeyword(rawValue, name);
    if (type === 'stdin') return coerceStdin(rawValue, options?.stdinContent);

    return String(rawValue);
  }

  return {
    coerce,
  };
}

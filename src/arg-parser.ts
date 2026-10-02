import { createParamCoercer } from './param-coercer.js';
import type { CommandConfig, ParamConfig } from './types.js';

interface ParamLookups {
  aliases: Map<string, ParamConfig>;
  flags: Map<string, ParamConfig>;
  names: Map<string, ParamConfig>;
  negators: Map<string, ParamConfig>;
}

interface TokenParseResult {
  consumedNext: boolean;
  handled: boolean;
}

/**
 * Builds indexing maps for fast parameter lookup by name, alias, flag, or negator.
 */
function buildParamLookups(params: ParamConfig[]): ParamLookups {
  const lookups: ParamLookups = {
    aliases: new Map(),
    flags: new Map(),
    names: new Map(),
    negators: new Map(),
  };

  for (const param of params) {
    lookups.names.set(param.name, param);

    if (param.type === 'flag') {
      lookups.flags.set(param.name, param);
    }

    if (param.negator) {
      lookups.negators.set(`no-${param.name}`, param);
    }

    const aliases = Array.isArray(param.alias)
      ? param.alias
      : param.alias
        ? [param.alias]
        : [];

    for (const alias of aliases) {
      lookups.aliases.set(alias, param);

      if (param.type === 'flag' && alias.length === 1) {
        lookups.flags.set(alias, param);
      }

      if (param.negator && alias.length > 1) {
        lookups.negators.set(`no-${alias}`, param);
      }
    }
  }

  return lookups;
}

/**
 * Parses and verifies chained single-character flags (e.g. -abc).
 */
function parseChainedFlags(
  token: string,
  flags: Map<string, ParamConfig>,
  assigned: Map<ParamConfig, unknown>
): boolean {
  const chars = token.slice(1);

  for (const char of chars) {
    const param = flags.get(char);

    if (!param) return false;
  }

  for (const char of chars) {
    const param = flags.get(char)!;
    assigned.set(param, true);
  }

  return true;
}

/**
 * Parses double-dash named arguments and negators.
 */
function parseDoubleDashToken(
  token: string,
  nextToken: string | undefined,
  lookups: ParamLookups,
  assigned: Map<ParamConfig, unknown>
): TokenParseResult {
  const content = token.slice(2);
  const negatorParam = lookups.negators.get(content);

  if (negatorParam) {
    assigned.set(negatorParam, false);
    return { consumedNext: false, handled: true };
  }

  const eqIdx = content.indexOf('=');

  if (eqIdx !== -1) {
    const key = content.slice(0, eqIdx);
    const value = content.slice(eqIdx + 1);
    const param = lookups.names.get(key) || lookups.aliases.get(key);

    if (!param) throw new Error(`Unknown option: '--${key}'`);

    assigned.set(param, value);
    return { consumedNext: false, handled: true };
  }

  const param = lookups.names.get(content) || lookups.aliases.get(content);

  if (!param) throw new Error(`Unknown option: '--${content}'`);

  if (param.type === 'flag') {
    assigned.set(param, true);
    return { consumedNext: false, handled: true };
  }

  if (nextToken === undefined) throw new Error(`Option '--${content}' requires a value`);

  assigned.set(param, nextToken);
  return { consumedNext: true, handled: true };
}

/**
 * Parses single-dash alias arguments or chained flags.
 */
function parseSingleDashToken(
  token: string,
  nextToken: string | undefined,
  lookups: ParamLookups,
  assigned: Map<ParamConfig, unknown>
): TokenParseResult {
  const content = token.slice(1);
  const eqIdx = content.indexOf('=');

  if (eqIdx !== -1) {
    const alias = content.slice(0, eqIdx);
    const value = content.slice(eqIdx + 1);
    const param = lookups.aliases.get(alias);

    if (!param) throw new Error(`Unknown option: '-${alias}'`);

    assigned.set(param, value);
    return { consumedNext: false, handled: true };
  }

  if (content.length > 1 && parseChainedFlags(token, lookups.flags, assigned)) {
    return { consumedNext: false, handled: true };
  }

  const param = lookups.aliases.get(content);

  if (!param) throw new Error(`Unknown option: '-${content}'`);

  if (param.type === 'flag') {
    assigned.set(param, true);
    return { consumedNext: false, handled: true };
  }

  if (nextToken === undefined) throw new Error(`Option '-${content}' requires a value`);

  assigned.set(param, nextToken);
  return { consumedNext: true, handled: true };
}

/**
 * Assigns remaining positional arguments to unfilled parameters in order of definition.
 */
function assignPositionalValues(
  params: ParamConfig[],
  positionals: string[],
  assigned: Map<ParamConfig, unknown>
): void {
  let posIdx = 0;

  for (const param of params) {
    if (assigned.has(param)) continue;
    if (posIdx >= positionals.length) break;

    assigned.set(param, positionals[posIdx]);
    posIdx++;
  }
}

/**
 * Scans tokens to extract named options and preserves positional values in order.
 */
function scanTokens(
  rawArgs: string[],
  lookups: ParamLookups,
  assigned: Map<ParamConfig, unknown>
): string[] {
  const positionals: string[] = [];
  let i = 0;

  while (i < rawArgs.length) {
    const token = rawArgs[i];

    if (token === '--') {
      positionals.push(...rawArgs.slice(i + 1));
      break;
    }

    if (token.startsWith('--')) {
      const res = parseDoubleDashToken(token, rawArgs[i + 1], lookups, assigned);
      if (res.consumedNext) i++;
      i++;
      continue;
    }

    if (token.startsWith('-') && token.length > 1 && !/^-[0-9]/.test(token)) {
      const res = parseSingleDashToken(token, rawArgs[i + 1], lookups, assigned);
      if (res.consumedNext) i++;
      i++;
      continue;
    }

    positionals.push(token);
    i++;
  }

  return positionals;
}

/**
 * Creates an argument parser for processing command tokens.
 *
 * @param coercer Parameter coercion utility
 * @returns Argument parser object
 * @example
 * ```ts
 * const parser = createArgParser();
 * const params = parser.parseCommandArgs(cmdConfig, ['--flag', 'value']);
 * // Returns parsed and coerced parameter record
 * ```
 */
export function createArgParser(coercer = createParamCoercer()) {
  const _ = {
    coercer,
  };

  /**
   * Parses command arguments and maps them to defined parameters.
   */
  function parseCommandArgs(
    command: CommandConfig,
    rawArgs: string[],
    options?: { cwd?: string; stdinContent?: string }
  ): Record<string, unknown> {
    const params = command.params || [];
    const lookups = buildParamLookups(params);
    const assigned = new Map<ParamConfig, unknown>();

    const positionals = scanTokens(rawArgs, lookups, assigned);
    assignPositionalValues(params, positionals, assigned);

    const result: Record<string, unknown> = {};

    for (const param of params) {
      const rawValue = assigned.get(param);
      result[param.name] = _.coercer.coerce(param, rawValue, options);
    }

    return result;
  }

  return {
    parseCommandArgs,
  };
}

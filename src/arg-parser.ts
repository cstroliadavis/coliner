import { createParamCoercer } from './param-coercer.js';
import { scanTokens } from './token-scanner.js';
import type { CommandConfig, ParamConfig, ParamLookups } from './types.js';

/**
 * Instantiates an empty parameter lookup collection.
 */
function createEmptyLookups(): ParamLookups {
  return {
    aliases: new Map(),
    flags: new Map(),
    names: new Map(),
    negators: new Map(),
  };
}

/**
 * Normalizes alias parameter into an array of string tokens.
 */
function getAliases(alias: string | string[] = []): string[] {
  return Array.isArray(alias) ? alias : [alias];
}

/**
 * Indexes an individual alias and registers single-character flags.
 */
function indexAlias(alias: string, param: ParamConfig, lookups: ParamLookups): void {
  lookups.aliases.set(alias, param);

  if (param.type === 'flag' && alias.length === 1) {
    lookups.flags.set(alias, param);
  }
}

/**
 * Indexes inverted negator names for multi-character alias parameters.
 */
function indexAliasNegator(alias: string, param: ParamConfig, lookups: ParamLookups): void {
  if (param.negator && alias.length > 1) {
    lookups.negators.set(`no-${alias}`, param);
  }
}

/**
 * Indexes parameter configuration across names, aliases, flags, and negator maps.
 */
function indexParam(param: ParamConfig, lookups: ParamLookups): void {
  indexParamBase(param, lookups);
  indexParamAliases(param, lookups);
}

/**
 * Registers all alias variants and associated negators for a parameter.
 */
function indexParamAliases(param: ParamConfig, lookups: ParamLookups): void {
  const aliases = getAliases(param.alias);

  for (const alias of aliases) {
    indexAlias(alias, param, lookups);
    indexAliasNegator(alias, param, lookups);
  }
}

/**
 * Indexes primary name, flag configuration, and primary negator for a parameter.
 */
function indexParamBase(param: ParamConfig, lookups: ParamLookups): void {
  lookups.names.set(param.name, param);

  if (param.type === 'flag') {
    lookups.flags.set(param.name, param);
  }

  if (param.negator) {
    lookups.negators.set(`no-${param.name}`, param);
  }
}

/**
 * Maps coerced parameter values into a resulting record.
 */
function mapParamValues(
  params: ParamConfig[],
  assigned: Map<ParamConfig, unknown>,
  coerce: (param: ParamConfig, rawValue: unknown) => unknown,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const param of params) {
    result[param.name] = coerce(param, assigned.get(param));
  }

  return result;
}

/**
 * Assigns remaining positional arguments to unfilled parameters in order of definition.
 *
 * @param params List of parameter configurations
 * @param positionals Collected positional argument strings
 * @param assigned Map receiving assigned values
 * @example
 * ```ts
 * assignPositionalValues(params, ['file.txt'], assigned);
 * // Maps 'file.txt' to the first unfilled positional parameter
 * ```
 */
export function assignPositionalValues(
  params: ParamConfig[],
  positionals: string[],
  assigned: Map<ParamConfig, unknown>,
): void {
  const unfilled = params.filter((p) => !assigned.has(p));

  unfilled.forEach((param, idx) => {
    if (idx < positionals.length) {
      assigned.set(param, positionals[idx]);
    }
  });
}

/**
 * Builds indexing maps for fast parameter lookup by name, alias, flag, or negator.
 *
 * @param params List of parameter configurations
 * @returns Populated parameter lookup tables
 * @example
 * ```ts
 * const lookups = buildParamLookups([{ name: 'output', type: 'text', alias: 'o' }]);
 * // Returns lookup tables with 'output' in names and 'o' in aliases
 * ```
 */
export function buildParamLookups(params: ParamConfig[]): ParamLookups {
  const lookups = createEmptyLookups();

  for (const param of params) {
    indexParam(param, lookups);
  }

  return lookups;
}

/**
 * Creates an argument parser for processing command tokens.
 *
 * @param coercer Parameter coercion utility
 * @returns Argument parser instance
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
    options?: { cwd?: string; stdinContent?: string },
  ): Record<string, unknown> {
    const params = command.params ?? [];
    const lookups = buildParamLookups(params);
    const assigned = new Map<ParamConfig, unknown>();
    const positionals = scanTokens(rawArgs, lookups, assigned);

    assignPositionalValues(params, positionals, assigned);

    return mapParamValues(params, assigned, (param, val) => _.coercer.coerce(param, val, options));
  }

  return {
    parseCommandArgs,
  };
}

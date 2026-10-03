import type { ParamConfig, ParamLookups } from './types.js';

/**
 * Advances scanning index according to whether next argument was consumed.
 */
function advanceToken(res: TokenParseResult, state: ScanState): void {
  if (res.consumedNext) {
    state.i += 1;
  }

  state.i += 1;
}

/**
 * Validates that all single characters represent valid flag configurations.
 */
function areAllFlagsValid(chars: string[], flags: Map<string, ParamConfig>): boolean {
  return chars.every((char) => flags.has(char));
}

/**
 * Assigns boolean true to each matched chained flag parameter.
 */
function assignChainedFlags(
  chars: string[],
  flags: Map<string, ParamConfig>,
  assigned: Map<ParamConfig, unknown>,
): void {
  for (const char of chars) {
    const param = flags.get(char);

    if (param) {
      assigned.set(param, true);
    }
  }
}

/**
 * Assigns flag boolean or consumes next token for option value.
 */
function assignDoubleDashValue(
  param: ParamConfig,
  content: string,
  ctx: TokenContext,
): TokenParseResult {
  if (param.type === 'flag') {
    ctx.assigned.set(param, true);

    return { consumedNext: false, handled: true };
  }

  if (ctx.nextToken === undefined) {
    throw new Error(`Option '--${content}' requires a value`);
  }

  ctx.assigned.set(param, ctx.nextToken);

  return { consumedNext: true, handled: true };
}

/**
 * Assigns flag boolean or consumes next token for alias value.
 */
function assignSingleDashValue(
  param: ParamConfig,
  alias: string,
  ctx: TokenContext,
): TokenParseResult {
  if (param.type === 'flag') {
    ctx.assigned.set(param, true);

    return { consumedNext: false, handled: true };
  }

  if (ctx.nextToken === undefined) {
    throw new Error(`Option '-${alias}' requires a value`);
  }

  ctx.assigned.set(param, ctx.nextToken);

  return { consumedNext: true, handled: true };
}

/**
 * Constructs token execution context from scanner state.
 */
function buildTokenContext(state: ScanState): TokenContext {
  return {
    assigned: state.assigned,
    lookups: state.lookups,
    nextToken: state.rawArgs[state.i + 1],
    token: state.rawArgs[state.i],
  };
}

/**
 * Checks and parses multiple chained flag characters in single-dash token.
 */
function checkChainedFlags(content: string, ctx: TokenContext): boolean {
  return content.length > 1 && parseChainedFlags(ctx.token, ctx.lookups.flags, ctx.assigned);
}

/**
 * Matches token against registered negator parameters and assigns false.
 */
function checkNegator(content: string, ctx: TokenContext): boolean {
  const param = ctx.lookups.negators.get(content);

  if (param) {
    ctx.assigned.set(param, false);

    return true;
  }

  return false;
}

/**
 * Looks up parameter by exact name or alias.
 */
function findParam(key: string, lookups: ParamLookups): ParamConfig | undefined {
  return lookups.names.get(key) ?? lookups.aliases.get(key);
}

/**
 * Dispatches double-dash or single-dash argument handling.
 */
function handleDashOption(state: ScanState): boolean {
  const token = state.rawArgs[state.i];

  if (token.startsWith('--')) {
    const res = parseDoubleDashToken(buildTokenContext(state));

    advanceToken(res, state);

    return true;
  }

  if (isSingleDashOption(token)) {
    const res = parseSingleDashToken(buildTokenContext(state));

    advanceToken(res, state);

    return true;
  }

  return false;
}

/**
 * Handles explicit double-dash argument separator by preserving rest as positionals.
 */
function handleDoubleDashDelimiter(state: ScanState): boolean {
  if (state.rawArgs[state.i] !== '--') return false;

  state.positionals.push(...state.rawArgs.slice(state.i + 1));
  state.i = state.rawArgs.length;

  return true;
}

/**
 * Validates whether token represents an option rather than a negative number.
 */
function isSingleDashOption(token: string): boolean {
  return token.startsWith('-') && token.length > 1 && !/^-[0-9]/.test(token);
}

/**
 * Parses and verifies chained single-character flags (e.g. -abc).
 */
function parseChainedFlags(
  token: string,
  flags: Map<string, ParamConfig>,
  assigned: Map<ParamConfig, unknown>,
): boolean {
  const chars = token.slice(1).split('');

  if (!areAllFlagsValid(chars, flags)) return false;

  assignChainedFlags(chars, flags, assigned);

  return true;
}

/**
 * Parses double-dash token for negators, inline values, or flag options.
 */
function parseDoubleDashToken(ctx: TokenContext): TokenParseResult {
  const content = ctx.token.slice(2);

  if (checkNegator(content, ctx)) return { consumedNext: false, handled: true };

  const inlineResult = parseInlineDoubleDash(content, ctx);

  if (inlineResult) return inlineResult;

  const param = requireParam(content, '--', ctx.lookups);

  return assignDoubleDashValue(param, content, ctx);
}

/**
 * Parses double-dash option with inline value separator (--key=value).
 */
function parseInlineDoubleDash(content: string, ctx: TokenContext): TokenParseResult | null {
  const eqIdx = content.indexOf('=');

  if (eqIdx === -1) return null;

  const key = content.slice(0, eqIdx);
  const param = requireParam(key, '--', ctx.lookups);

  ctx.assigned.set(param, content.slice(eqIdx + 1));

  return { consumedNext: false, handled: true };
}

/**
 * Parses single-dash alias option with inline value separator (-a=value).
 */
function parseInlineSingleDash(content: string, ctx: TokenContext): TokenParseResult | null {
  const eqIdx = content.indexOf('=');

  if (eqIdx === -1) return null;

  const alias = content.slice(0, eqIdx);
  const param = ctx.lookups.aliases.get(alias);

  if (!param) {
    throw new Error(`Unknown option: '-${alias}'`);
  }

  ctx.assigned.set(param, content.slice(eqIdx + 1));

  return { consumedNext: false, handled: true };
}

/**
 * Parses single-dash token for inline value, chained flags, or single alias.
 */
function parseSingleDashToken(ctx: TokenContext): TokenParseResult {
  const content = ctx.token.slice(1);
  const inlineResult = parseInlineSingleDash(content, ctx);

  if (inlineResult) return inlineResult;

  if (checkChainedFlags(content, ctx)) return { consumedNext: false, handled: true };

  const param = requireAliasParam(content, ctx.lookups);

  return assignSingleDashValue(param, content, ctx);
}

/**
 * Processes a single scanning step for tokens.
 */
function processScanStep(state: ScanState): void {
  if (handleDoubleDashDelimiter(state)) return;

  if (handleDashOption(state)) return;

  state.positionals.push(state.rawArgs[state.i]);
  state.i += 1;
}

/**
 * Resolves parameter configuration for alias character.
 */
function requireAliasParam(alias: string, lookups: ParamLookups): ParamConfig {
  const param = lookups.aliases.get(alias);

  if (!param) {
    throw new Error(`Unknown option: '-${alias}'`);
  }

  return param;
}

/**
 * Resolves required parameter or throws unknown option error.
 */
function requireParam(name: string, prefix: string, lookups: ParamLookups): ParamConfig {
  const param = findParam(name, lookups);

  if (!param) {
    throw new Error(`Unknown option: '${prefix}${name}'`);
  }

  return param;
}

/**
 * Scans tokens to extract named options and preserves positional values in order.
 *
 * @param rawArgs Raw CLI argument tokens
 * @param lookups Pre-indexed parameter maps
 * @param assigned Map receiving parsed parameter assignments
 * @returns Positional argument tokens in order of appearance
 * @example
 * ```ts
 * const positionals = scanTokens(['--flag', 'posVal'], lookups, assigned);
 * // Returns ['posVal'] with assigned containing flag mapping
 * ```
 */
export function scanTokens(
  rawArgs: string[],
  lookups: ParamLookups,
  assigned: Map<ParamConfig, unknown>,
): string[] {
  const state: ScanState = {
    assigned,
    i: 0,
    lookups,
    positionals: [],
    rawArgs,
  };

  while (state.i < state.rawArgs.length) {
    processScanStep(state);
  }

  return state.positionals;
}

interface TokenParseResult {
  consumedNext: boolean;
  handled: boolean;
}

interface TokenContext {
  assigned: Map<ParamConfig, unknown>;
  lookups: ParamLookups;
  nextToken?: string;
  token: string;
}

interface ScanState {
  assigned: Map<ParamConfig, unknown>;
  i: number;
  lookups: ParamLookups;
  positionals: string[];
  rawArgs: string[];
}

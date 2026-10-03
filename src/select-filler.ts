import process from 'node:process';
import { promptSelect } from './select-prompt.js';
import type { ParamConfig, ParamItems, ParsedCommandResult } from './types.js';

interface PromptStreams {
  input?: NodeJS.ReadableStream & { setRawMode?: (mode: boolean) => void };
  output?: NodeJS.WritableStream;
}

interface CoercerLike {
  coerce: (param: ParamConfig, raw: unknown) => unknown;
}

interface PromptContext {
  coercer: CoercerLike;
  params: Record<string, unknown>;
  streams: PromptStreams;
}

/**
 * Resolves select choice items asynchronously from a ParamItems definition.
 */
async function extractSelectItems(items?: ParamItems): Promise<(string | number)[]> {
  const raw = await resolveRawItems(items);

  return Array.isArray(raw) ? raw : [];
}

/**
 * Filters command parameters returning list of unsupplied select parameters.
 */
function getMissingSelectParams(
  commandParams: ParamConfig[] = [],
  values: Record<string, unknown>,
): ParamConfig[] {
  return commandParams.filter((p) => isMissingSelect(p, values[p.name]));
}

/**
 * Checks whether items list has at least one element or is an item provider.
 */
function hasItems(items?: ParamItems): boolean {
  if (typeof items === 'function') return true;

  return Boolean(items && items.length > 0);
}

/**
 * Checks whether readable stream supports interactive terminal operations.
 */
function isInteractiveStream(stream?: NodeJS.ReadableStream): boolean {
  return Boolean(stream && 'isTTY' in stream && stream.isTTY);
}

/**
 * Checks whether parameter represents an unfilled select choice.
 */
function isMissingSelect(param: ParamConfig, value: unknown): boolean {
  return param.type === 'select' && value === undefined && hasItems(param.items);
}

/**
 * Prompts user sequentially for each missing select parameter.
 */
async function promptAllMissing(missing: ParamConfig[], ctx: PromptContext): Promise<void> {
  for (const param of missing) {
    await promptAndAssignSelect(param, ctx);
  }
}

/**
 * Prompts user for a single select parameter and coerces chosen value.
 */
async function promptAndAssignSelect(param: ParamConfig, ctx: PromptContext): Promise<void> {
  const items = await extractSelectItems(param.items);
  const chosen = await promptSelect({
    allowCustom: param.allowCustom,
    input: ctx.streams.input,
    items,
    output: ctx.streams.output,
    paramName: param.name,
  });

  ctx.params[param.name] = ctx.coercer.coerce(param, chosen);
}

/**
 * Resolves input stream with default to process.stdin.
 */
function resolveInput(
  streams?: PromptStreams,
): NodeJS.ReadableStream & { setRawMode?: (mode: boolean) => void } {
  return streams?.input ?? process.stdin;
}

/**
 * Resolves output stream with default to process.stdout.
 */
function resolveOutput(streams?: PromptStreams): NodeJS.WritableStream {
  return streams?.output ?? process.stdout;
}

/**
 * Resolves raw choice item output asynchronously from static list or item provider function.
 */
async function resolveRawItems(items?: ParamItems): Promise<unknown> {
  if (typeof items === 'function') return items();

  return items;
}

/**
 * Bundles resolved standard I/O streams into a single options record.
 */
function resolveStreams(streams?: PromptStreams): PromptStreams {
  return {
    input: resolveInput(streams),
    output: resolveOutput(streams),
  };
}

/**
 * Prompts user interactively for any unsupplied select parameters.
 *
 * @param result Parsed command execution result
 * @param coercer Parameter coercer instance
 * @param streams Input and output stream options
 * @returns Updated parsed command result
 * @example
 * ```ts
 * await fillMissingSelectParams(result, coercer, { input, output });
 * ```
 */
export async function fillMissingSelectParams(
  result: ParsedCommandResult,
  coercer: CoercerLike,
  streams?: PromptStreams,
): Promise<ParsedCommandResult> {
  const io = resolveStreams(streams);

  if (!isInteractiveStream(io.input)) return result;

  const missing = getMissingSelectParams(result.command.params, result.params);
  const ctx: PromptContext = { coercer, params: result.params, streams: io };

  await promptAllMissing(missing, ctx);

  return result;
}

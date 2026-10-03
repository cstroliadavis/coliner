import process from 'node:process';
import { createArgParser } from './arg-parser.js';
import { createConfigLoader } from './config-loader.js';
import { createHelpFormatter } from './help-formatter.js';
import { detectHelp } from './help-detector.js';
import { createParamCoercer } from './param-coercer.js';
import { generateCompletionScript } from './completion-generator.js';
import { handleCompletionCommand, isCompletionCommand } from './completion-handler.js';
import { resolveCompletions } from './completion-resolver.js';
import { fillMissingSelectParams } from './select-filler.js';
import type {
  CliConfig,
  ColinerInstance,
  ColinerOptions,
  CommandConfig,
  EventHandler,
  ExecutionOptions,
  ParsedCommandResult,
  ResolvedCommand,
} from './types.js';

export type { ColinerOptions } from './types.js';

/**
 * Constructs parsed command result for help screens.
 */
function buildHelpResult(
  helpText: string,
  config: CliConfig,
  rawArgs: string[],
): ParsedCommandResult {
  console.log(helpText);

  return {
    command: { name: 'help', triggers: 'help' },
    config,
    params: { text: helpText },
    rawArgs,
    triggers: 'help',
  };
}

/**
 * Checks for built-in completion or help trigger flags and returns synthetic result.
 */
async function checkSpecialCommands(
  opts: NormalizedExecutionOptions,
  context: ColinerContext,
): Promise<ParsedCommandResult | null> {
  if (isCompletionCommand(opts.args, context.config.commands)) {
    return handleCompletionCommand(opts.args, context.config);
  }

  const helpCheck = detectHelp(opts.args, context.config.commands);

  if (helpCheck.isHelp) {
    const helpText = context.helpFormatter.render(helpCheck.commandName);

    return buildHelpResult(helpText, context.config, opts.args);
  }

  return null;
}

/**
 * Runs the end-to-end command execution workflow with prompts and handlers.
 */
async function executeWorkflow(
  context: ColinerContext,
  options?: ExecutionOptions | string[],
): Promise<ParsedCommandResult> {
  const opts = normalizeOptions(options);
  const specialResult = await checkSpecialCommands(opts, context);

  if (specialResult) return specialResult;

  const result = parseCliArgs(opts.args, context, opts.stdinContent);

  await fillMissingSelectParams(result, context.coercer, opts);
  await triggerHandlers(context.eventHandlers.get(result.triggers), result);

  return result;
}

/**
 * Extracts optional custom working directory from options argument.
 */
function extractOptionCwd(options: CliConfig | ColinerOptions | string): string | undefined {
  return typeof options === 'object' && 'cwd' in options ? options.cwd : undefined;
}

/**
 * Formats unknown command error message.
 */
function formatUnknownCommandError(token?: string): Error {
  const cmd = token ? `'${token}'` : "''";

  return new Error(`Unknown command: ${cmd}. Run with --help to see available commands.`);
}

/**
 * Initializes shared internal services and context for Coliner.
 */
function initColinerContext(initOptions: CliConfig | ColinerOptions | string): ColinerContext {
  const cwd = resolveColinerCwd(initOptions);
  const loader = createConfigLoader(cwd);
  const resolvedConfig = resolveColinerConfig(initOptions, loader, cwd);
  const coercer = createParamCoercer(cwd);
  const parser = createArgParser(coercer);
  const helpFormatter = createHelpFormatter(resolvedConfig);

  return {
    coercer,
    config: resolvedConfig,
    cwd,
    eventHandlers: new Map<string, EventHandler[]>(),
    helpFormatter,
    parser,
  };
}

/**
 * Type guard checking if argument is an inline CliConfig object.
 */
function isRawCliConfig(options: CliConfig | ColinerOptions): options is CliConfig {
  return 'commands' in options && Array.isArray(options.commands);
}

/**
 * Normalizes input execution parameters into a standard options structure.
 */
function normalizeOptions(options?: ExecutionOptions | string[]): NormalizedExecutionOptions {
  if (!options) return { args: process.argv.slice(2) };

  if (Array.isArray(options)) return { args: options };

  return {
    args: resolveArgList(options.args),
    input: options.input,
    output: options.output,
    stdinContent: options.stdinContent,
  };
}

/**
 * Parses command line tokens and maps them to command parameters.
 */
function parseCliArgs(
  args: string[],
  context: ColinerContext,
  stdinContent?: string,
): ParsedCommandResult {
  const { command, commandArgs } = resolveTargetCommand(args, context.config.commands);
  const params = context.parser.parseCommandArgs(command, commandArgs, {
    cwd: context.cwd,
    stdinContent,
  });

  return {
    command,
    config: context.config,
    params,
    rawArgs: commandArgs,
    triggers: command.triggers,
  };
}

/**
 * Adds an event handler callback to the event registry map.
 */
function registerEventHandler(
  eventName: string,
  handler: EventHandler,
  handlersMap: Map<string, EventHandler[]>,
): void {
  const handlers = handlersMap.get(eventName) ?? [];

  handlers.push(handler);
  handlersMap.set(eventName, handlers);
}

/**
 * Resolves argument array with fallback to process.argv slice.
 */
function resolveArgList(args?: string[]): string[] {
  return args ?? process.argv.slice(2);
}

/**
 * Resolves and validates CLI configuration across supported initialization inputs.
 */
function resolveColinerConfig(
  initOptions: CliConfig | ColinerOptions | string,
  loader: ReturnType<typeof createConfigLoader>,
  cwd: string,
): CliConfig {
  if (typeof initOptions === 'string') return loader.loadFromFile(initOptions, cwd);

  if (isRawCliConfig(initOptions)) {
    loader.validateCliConfig(initOptions);

    return initOptions;
  }

  return resolveFromObjectConfig(initOptions as ColinerOptions, loader, cwd);
}

/**
 * Determines effective working directory from options or system process.
 */
function resolveColinerCwd(initOptions: CliConfig | ColinerOptions | string): string {
  const customCwd = extractOptionCwd(initOptions);

  return customCwd ?? process.cwd();
}

/**
 * Resolves configuration from ColinerOptions object.
 */
function resolveFromObjectConfig(
  options: ColinerOptions,
  loader: ReturnType<typeof createConfigLoader>,
  cwd: string,
): CliConfig {
  if (typeof options.config === 'string') return loader.loadFromFile(options.config, cwd);

  if (options.config) {
    loader.validateCliConfig(options.config);

    return options.config;
  }

  return loader.loadFromFile(undefined, cwd);
}

/**
 * Resolves the targeted command from arguments or identifies the default fallback.
 */
function resolveTargetCommand(args: string[], commands: CommandConfig[]): ResolvedCommand {
  const matched = commands.find((c) => c.name === args[0]);

  if (matched) return { command: matched, commandArgs: args.slice(1) };

  const defaultCmd = commands.find((c) => c.isDefault);

  if (defaultCmd) return { command: defaultCmd, commandArgs: args };

  throw formatUnknownCommandError(args[0]);
}

/**
 * Triggers asynchronous event handlers for an executed command.
 */
async function triggerHandlers(
  handlers: EventHandler[] | undefined,
  result: ParsedCommandResult,
): Promise<void> {
  if (!handlers) return;

  for (const handler of handlers) {
    await handler(result);
  }
}

/**
 * Creates and initializes a Coliner CLI application instance.
 *
 * @param initOptions Configuration object, file path, or options
 * @returns Coliner application instance
 * @example
 * ```ts
 * const cli = createColiner({ config: 'coliner.yaml' });
 * cli.on('create-user', ({ params }) => console.log(params));
 * await cli.execute();
 * // Executes the CLI and triggers handlers
 * ```
 */
export function createColiner(
  initOptions: CliConfig | ColinerOptions | string = {},
): ColinerInstance {
  const _ = initColinerContext(initOptions);

  const instance: ColinerInstance = {
    execute: (opts) => executeWorkflow(_, opts),
    generateCompletionScript: (shell) =>
      generateCompletionScript(shell, _.config.name ?? 'coliner'),
    getCommand: (name) => _.config.commands.find((c) => c.name === name),
    getCompletions: (args) => resolveCompletions(_.config, args),
    getConfig: () => _.config,
    getHelp: (cmdName) => _.helpFormatter.render(cmdName),
    on: (eventName, handler) => {
      registerEventHandler(eventName, handler, _.eventHandlers);

      return instance;
    },
    parse: (args) => parseCliArgs(args, _),
  };

  return instance;
}

interface ColinerContext {
  coercer: ReturnType<typeof createParamCoercer>;
  config: CliConfig;
  cwd: string;
  eventHandlers: Map<string, EventHandler[]>;
  helpFormatter: ReturnType<typeof createHelpFormatter>;
  parser: ReturnType<typeof createArgParser>;
}

interface NormalizedExecutionOptions {
  args: string[];
  input?: NodeJS.ReadableStream & { setRawMode?: (mode: boolean) => void };
  output?: NodeJS.WritableStream;
  stdinContent?: string;
}

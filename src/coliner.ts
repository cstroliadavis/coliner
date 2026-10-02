import process from 'node:process';
import { createArgParser } from './arg-parser.js';
import { createConfigLoader } from './config-loader.js';
import { createHelpFormatter } from './help-formatter.js';
import { createParamCoercer } from './param-coercer.js';
import type {
  CliConfig,
  ColinerInstance,
  CommandConfig,
  EventHandler,
  ExecutionOptions,
  ParsedCommandResult,
} from './types.js';

interface HelpDetection {
  commandName?: string;
  isHelp: boolean;
}

interface ResolvedCommand {
  command: CommandConfig;
  commandArgs: string[];
}

export interface ColinerOptions {
  config?: CliConfig | string;
  cwd?: string;
}

/**
 * Normalizes input execution parameters into a standard options structure.
 */
function normalizeOptions(options?: ExecutionOptions | string[]): ExecutionOptions {
  if (!options) return { args: process.argv.slice(2) };
  if (Array.isArray(options)) return { args: options };

  return {
    args: options.args || process.argv.slice(2),
    stdinContent: options.stdinContent,
  };
}

/**
 * Checks whether arguments correspond to a global or command-specific help request.
 */
function detectHelp(args: string[], commands: CommandConfig[]): HelpDetection {
  if (args.length === 0 && !commands.some((c) => c.isDefault)) {
    return { isHelp: true };
  }

  if (args.length === 1 && ['--help', '-h', 'help'].includes(args[0])) {
    return { isHelp: true };
  }

  if (args[0] === 'help' && args[1]) {
    return { commandName: args[1], isHelp: true };
  }

  const hasHelpFlag = args.some((arg) => ['--help', '-h'].includes(arg));

  if (hasHelpFlag) {
    const cmdCandidate = args.find((arg) => commands.some((c) => c.name === arg));
    return { commandName: cmdCandidate, isHelp: true };
  }

  return { isHelp: false };
}

/**
 * Resolves the targeted command from arguments or identifies the default fallback.
 */
function resolveTargetCommand(args: string[], commands: CommandConfig[]): ResolvedCommand {
  const firstToken = args[0];
  const matched = commands.find((c) => c.name === firstToken);

  if (matched) {
    return { command: matched, commandArgs: args.slice(1) };
  }

  const defaultCmd = commands.find((c) => c.isDefault);

  if (defaultCmd) {
    return { command: defaultCmd, commandArgs: args };
  }

  throw new Error(
    `Unknown command: '${firstToken || ''}'. Run with --help to see available commands.`
  );
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
 * ```
 */
export function createColiner(
  initOptions: CliConfig | ColinerOptions | string = {}
): ColinerInstance {
  const cwd = typeof initOptions === 'object' && 'cwd' in initOptions && initOptions.cwd
    ? initOptions.cwd
    : process.cwd();

  const loader = createConfigLoader(cwd);
  let resolvedConfig: CliConfig;

  if (typeof initOptions === 'string') {
    resolvedConfig = loader.loadFromFile(initOptions, cwd);
  } else if ('commands' in initOptions && Array.isArray(initOptions.commands)) {
    loader.validateCliConfig(initOptions);
    resolvedConfig = initOptions;
  } else if ('config' in initOptions && initOptions.config) {
    resolvedConfig = typeof initOptions.config === 'string'
      ? loader.loadFromFile(initOptions.config, cwd)
      : initOptions.config;
    loader.validateCliConfig(resolvedConfig);
  } else {
    resolvedConfig = loader.loadFromFile(undefined, cwd);
  }

  const coercer = createParamCoercer(cwd);
  const parser = createArgParser(coercer);
  const helpFormatter = createHelpFormatter(resolvedConfig);

  const _ = {
    config: resolvedConfig,
    cwd,
    eventHandlers: new Map<string, EventHandler[]>(),
    helpFormatter,
    parser,
  };

  /**
   * Registers an event callback for a specific trigger name.
   */
  function on(eventName: string, handler: EventHandler): ColinerInstance {
    const handlers = _.eventHandlers.get(eventName) || [];
    handlers.push(handler);
    _.eventHandlers.set(eventName, handlers);

    return instance;
  }

  /**
   * Parses CLI argument tokens and maps them to command parameters.
   */
  function parse(args: string[], stdinContent?: string): ParsedCommandResult {
    const { command, commandArgs } = resolveTargetCommand(args, _.config.commands);
    const params = _.parser.parseCommandArgs(command, commandArgs, {
      cwd: _.cwd,
      stdinContent,
    });

    return {
      command,
      config: _.config,
      params,
      rawArgs: commandArgs,
      triggers: command.triggers,
    };
  }

  /**
   * Executes the CLI workflow and triggers registered event listeners.
   */
  async function execute(options?: ExecutionOptions | string[]): Promise<ParsedCommandResult> {
    const opts = normalizeOptions(options);
    const helpCheck = detectHelp(opts.args || [], _.config.commands);

    if (helpCheck.isHelp) {
      const helpText = _.helpFormatter.render(helpCheck.commandName);
      console.log(helpText);

      return {
        command: { name: 'help', triggers: 'help' },
        config: _.config,
        params: { text: helpText },
        rawArgs: opts.args || [],
        triggers: 'help',
      };
    }

    const result = parse(opts.args || [], opts.stdinContent);
    const handlers = _.eventHandlers.get(result.triggers) || [];

    for (const handler of handlers) {
      await handler(result);
    }

    return result;
  }

  const instance: ColinerInstance = {
    execute,
    getCommand: (name) => _.config.commands.find((c) => c.name === name),
    getConfig: () => _.config,
    getHelp: (cmdName) => _.helpFormatter.render(cmdName),
    on,
    parse: (args) => parse(args),
  };

  return instance;
}

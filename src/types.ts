/**
 * Supported data types for command parameter parsing and validation.
 */
export type ParamType =
  'date' | 'file' | 'flag' | 'keyword' | 'number' | 'select' | 'stdin' | 'text' | 'time' | 'url';

/**
 * Supported shell environments for tab-completion script generation.
 */
export type CompletionShell = 'bash' | 'fish' | 'zsh';

/**
 * Dynamic candidate item provider function for completion suggestions.
 */
export type ItemProvider = () => (string | number)[] | Promise<(string | number)[]>;

/**
 * Static or dynamic candidate choices for command parameters.
 */
export type ParamItems = (string | number)[] | ItemProvider;

/**
 * Configuration schema for an individual command parameter.
 */
export interface ParamConfig {
  /** Optional single-character or multi-character alias flags. */
  alias?: string | string[];

  /** If true, allows custom unlisted values for select parameters. */
  allowCustom?: boolean;

  /** Default fallback value if parameter is not supplied in CLI arguments. */
  default?: unknown;

  /** Human-readable explanation of parameter purpose for help documentation. */
  description?: string;

  /** Indicates if this parameter serves as the primary positional argument. */
  isDefault?: boolean;

  /** Available options or choices for parameter type or suggestions. */
  items?: ParamItems;

  /** Unique name identifier for the parameter. */
  name: string;

  /** If true, enables automatic `--no-<name>` boolean inversion flag. */
  negator?: boolean;

  /** Data type used for coercion and validation. */
  type: ParamType;
}

/**
 * Fast lookup indexes mapping flag tokens and names to parameter configurations.
 */
export interface ParamLookups {
  /** Map of alias tokens (e.g. 'f' or 'force') to parameter configurations. */
  aliases: Map<string, ParamConfig>;

  /** Map of boolean flag names and single-letter characters to configurations. */
  flags: Map<string, ParamConfig>;

  /** Map of primary parameter names to configurations. */
  names: Map<string, ParamConfig>;

  /** Map of negator names (e.g. 'no-force') to parameter configurations. */
  negators: Map<string, ParamConfig>;
}

/**
 * Configuration schema for a CLI command.
 */
export interface CommandConfig {
  /** Summary of what the command performs for help screens. */
  description?: string;

  /** If true, executes this command when no command name is provided. */
  isDefault?: boolean;

  /** Command verb or name invoked on the CLI. */
  name: string;

  /** List of parameters and options accepted by this command. */
  params?: ParamConfig[];

  /** Event topic name triggered when this command executes. */
  triggers: string;
}

/**
 * Top-level CLI configuration specification.
 */
export interface CliConfig {
  /** Collection of executable commands in the CLI suite. */
  commands: CommandConfig[];

  /** Top-level description of the CLI tool. */
  description?: string;

  /** Binary executable or program name. */
  name?: string;

  /** Semantic version string of the CLI suite. */
  version?: string;
}

/**
 * Suggestion candidate returned during shell tab-completion.
 */
export interface CompletionItem {
  /** Explanatory description shown in shell completion menus. */
  description?: string;

  /** The candidate completion text inserted into the command line. */
  value: string;
}

/**
 * Result payload generated after successfully parsing command line input.
 */
export interface ParsedCommandResult {
  /** Matched command configuration. */
  command: CommandConfig;

  /** Active top-level CLI configuration. */
  config: CliConfig;

  /** Coerced and validated parameter dictionary. */
  params: Record<string, unknown>;

  /** Unparsed or raw argument tokens passed to the command. */
  rawArgs: string[];

  /** Event topic name triggered by this command. */
  triggers: string;
}

/**
 * Callback function signature for event listeners handling command execution.
 */
export type EventHandler = (payload: ParsedCommandResult) => unknown | Promise<unknown>;

/**
 * Options passed to customize CLI execution at runtime.
 */
export interface ExecutionOptions {
  /** Custom argument list overriding process.argv. */
  args?: string[];

  /** Optional input stream for interactive prompts. */
  input?: NodeJS.ReadableStream & { setRawMode?: (mode: boolean) => void };

  /** Optional output stream for interactive prompts and help display. */
  output?: NodeJS.WritableStream;

  /** Simulated or piped standard input string. */
  stdinContent?: string;
}

/**
 * Initialization options for creating a Coliner application instance.
 */
export interface ColinerOptions {
  /** Inline CliConfig object or relative path to a configuration file. */
  config?: CliConfig | string;

  /** Custom working directory for resolving configuration and file paths. */
  cwd?: string;
}

/**
 * Result of inspecting arguments for help commands or flags.
 */
export interface HelpDetection {
  /** Optional target command name for command-specific help. */
  commandName?: string;

  /** Whether the arguments represent a help request. */
  isHelp: boolean;
}

/**
 * Target command resolved from argument tokens.
 */
export interface ResolvedCommand {
  /** Matched command definition. */
  command: CommandConfig;

  /** Remaining argument tokens after consuming command verb. */
  commandArgs: string[];
}

/**
 * Core interface representing an initialized Coliner CLI application instance.
 */
export interface ColinerInstance {
  /**
   * Executes CLI parsing and triggers registered event listeners.
   *
   * @param options Execution options or raw arguments
   * @returns Promise resolving to parsed command result
   */
  execute: (options?: ExecutionOptions | string[]) => Promise<ParsedCommandResult>;

  /**
   * Generates a shell completion script for the given shell.
   *
   * @param shell Target shell ('bash', 'fish', or 'zsh')
   * @returns Generated shell completion script string
   */
  generateCompletionScript: (shell: CompletionShell) => string;

  /**
   * Retrieves a command configuration by its name.
   *
   * @param name Command name
   * @returns Command configuration if found
   */
  getCommand: (name?: string) => CommandConfig | undefined;

  /**
   * Resolves completion suggestions for the provided argument list.
   *
   * @param args Current command line argument tokens
   * @returns Promise resolving to array of completion suggestions
   */
  getCompletions: (args: string[]) => Promise<CompletionItem[]>;

  /**
   * Retrieves the active CLI configuration.
   *
   * @returns Active CLI configuration
   */
  getConfig: () => CliConfig;

  /**
   * Renders help documentation for a command or general usage.
   *
   * @param commandName Optional command name
   * @returns Formatted help text
   */
  getHelp: (commandName?: string) => string;

  /**
   * Registers an event callback for a specific command trigger.
   *
   * @param eventName Event trigger name
   * @param handler Event callback handler
   * @returns Coliner instance for chaining
   */
  on: (eventName: string, handler: EventHandler) => ColinerInstance;

  /**
   * Parses argument tokens without triggering event handlers.
   *
   * @param args Command argument tokens
   * @returns Parsed command result
   */
  parse: (args: string[]) => ParsedCommandResult;
}

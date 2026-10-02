export type ParamType =
  | 'date'
  | 'file'
  | 'flag'
  | 'keyword'
  | 'number'
  | 'stdin'
  | 'text'
  | 'url';

export interface ParamConfig {
  alias?: string | string[];
  default?: unknown;
  description?: string;
  isDefault?: boolean;
  name: string;
  negator?: boolean;
  type: ParamType;
}

export interface CommandConfig {
  description?: string;
  isDefault?: boolean;
  name: string;
  params?: ParamConfig[];
  triggers: string;
}

export interface CliConfig {
  commands: CommandConfig[];
  description?: string;
  name?: string;
  version?: string;
}

export interface ParsedCommandResult {
  command: CommandConfig;
  config: CliConfig;
  params: Record<string, unknown>;
  rawArgs: string[];
  triggers: string;
}

export type EventHandler = (payload: ParsedCommandResult) => unknown | Promise<unknown>;

export interface ExecutionOptions {
  args?: string[];
  stdinContent?: string;
}

export interface ColinerInstance {
  execute: (options?: ExecutionOptions | string[]) => Promise<ParsedCommandResult>;
  getCommand: (name?: string) => CommandConfig | undefined;
  getConfig: () => CliConfig;
  getHelp: (commandName?: string) => string;
  on: (eventName: string, handler: EventHandler) => ColinerInstance;
  parse: (args: string[]) => ParsedCommandResult;
}

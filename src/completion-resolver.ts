import type { CliConfig, CommandConfig, CompletionItem, ParamConfig } from './types.js';

const GLOBAL_COMPLETIONS: CompletionItem[] = [
  { description: 'Path to configuration file', value: '--config' },
  { description: 'Path to configuration file', value: '-c' },
  { description: 'Display help information', value: '--help' },
  { description: 'Display help information', value: '-h' },
];

/**
 * Gathers all option and flag completions for a command.
 */
function collectCommandOptions(cmd: CommandConfig): CompletionItem[] {
  const items: CompletionItem[] = [];

  for (const param of cmd.params ?? []) {
    items.push(...paramFlagsToCompletions(param));
  }

  items.push(...GLOBAL_COMPLETIONS);

  return items;
}

/**
 * Gathers positional parameter select completions for a command.
 */
function collectPositionalSelects(params: ParamConfig[] = []): CompletionItem[] {
  return params.filter((p) => p.type === 'select').flatMap(selectItemsToCompletions);
}

/**
 * Converts a command configuration to a completion item.
 */
function commandToCompletion(cmd: CommandConfig): CompletionItem {
  return {
    description: cmd.description ?? `Execute ${cmd.name}`,
    value: cmd.name,
  };
}

/**
 * Filters completion items by case-insensitive prefix match.
 */
function filterCompletions(items: CompletionItem[], prefix: string): CompletionItem[] {
  if (!prefix) return items;

  const query = prefix.toLowerCase();

  return items.filter((item) => item.value.toLowerCase().startsWith(query));
}

/**
 * Safely extracts the trailing argument token or defaults to empty string.
 */
function getLastArg(rawArgs: string[]): string {
  return rawArgs.length === 0 ? '' : rawArgs[rawArgs.length - 1];
}

/**
 * Checks whether parameter is defined as select type.
 */
function isSelectParam(param?: ParamConfig): boolean {
  return param?.type === 'select';
}

/**
 * Checks if parameter alias matches stripped flag token.
 */
function matchAlias(alias: string | string[] = [], stripped: string): boolean {
  return Array.isArray(alias) ? alias.includes(stripped) : alias === stripped;
}

/**
 * Locates parameter configuration matching flag or alias token.
 */
function matchParamByFlag(token: string, params: ParamConfig[]): ParamConfig | undefined {
  const stripped = token.replace(/^-+/, '');

  return params.find((p) => p.name === stripped || matchAlias(p.alias, stripped));
}

/**
 * Generates flag and negator completion suggestions for a parameter.
 */
function paramFlagsToCompletions(param: ParamConfig): CompletionItem[] {
  const items: CompletionItem[] = [
    {
      description: param.description ?? `Option --${param.name}`,
      value: `--${param.name}`,
    },
  ];

  if (param.negator) {
    items.push({
      description: `Invert --${param.name}`,
      value: `--no-${param.name}`,
    });
  }

  return items;
}

/**
 * Resolves flag value completions if previous token corresponds to a select flag.
 */
function resolveFlagValueItems(
  prevToken: string | undefined,
  cmd: CommandConfig,
  lastToken: string,
): CompletionItem[] | null {
  if (!prevToken) return null;

  const valueItems = resolveValueCompletion(prevToken, cmd);

  if (valueItems) return filterCompletions(valueItems, lastToken);

  return null;
}

/**
 * Resolves completions when user is at the root command level.
 */
function resolveRootCompletions(config: CliConfig, prefix: string): CompletionItem[] {
  const cmdItems = config.commands.map(commandToCompletion);
  const candidates = [...cmdItems, ...GLOBAL_COMPLETIONS];

  return filterCompletions(candidates, prefix);
}

/**
 * Resolves completions when user is within a specific command context.
 */
function resolveSubcommandCompletions(cmd: CommandConfig, rawArgs: string[]): CompletionItem[] {
  const lastToken = rawArgs[rawArgs.length - 1] || '';
  const flagValueItems = resolveFlagValueItems(rawArgs[rawArgs.length - 2], cmd, lastToken);

  if (flagValueItems) return flagValueItems;

  const options = collectCommandOptions(cmd);
  const positionals = collectPositionalSelects(cmd.params);

  return filterCompletions([...options, ...positionals], lastToken);
}

/**
 * Resolves completions for parameter values if previous token was an option flag.
 */
function resolveValueCompletion(prevToken: string, cmd: CommandConfig): CompletionItem[] | null {
  const param = matchParamByFlag(prevToken, cmd.params ?? []);

  return isSelectParam(param) ? selectItemsToCompletions(param as ParamConfig) : null;
}

/**
 * Converts select parameter items into completion suggestions.
 */
function selectItemsToCompletions(param: ParamConfig): CompletionItem[] {
  return param.items
    ? param.items.map((item) => ({
        description: `Choice for ${param.name}`,
        value: String(item),
      }))
    : [];
}

/**
 * Resolves context-aware tab completion suggestions for commands, flags, and select items.
 *
 * @param config CLI configuration specification
 * @param rawArgs Array of tokens currently entered on the command line
 * @returns Array of completion suggestions
 * @example
 * ```ts
 * const completions = resolveCompletions(config, ['deploy', '--env']);
 * // Returns completions matching select items for --env
 * ```
 */
export function resolveCompletions(config: CliConfig, rawArgs: string[]): CompletionItem[] {
  if (rawArgs.length <= 1) return resolveRootCompletions(config, getLastArg(rawArgs));

  const cmd = config.commands.find((c) => c.name === rawArgs[0]);

  if (!cmd) return resolveRootCompletions(config, getLastArg(rawArgs));

  return resolveSubcommandCompletions(cmd, rawArgs.slice(1));
}

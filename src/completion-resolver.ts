import type { CliConfig, CommandConfig, CompletionItem, ParamConfig, ParamItems } from './types.js';

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
 * Gathers positional parameter completions for a command.
 */
async function collectPositionalItems(params: ParamConfig[] = []): Promise<CompletionItem[]> {
  const candidates = params.filter(hasParamItems);
  const result: CompletionItem[] = [];

  for (const param of candidates) {
    const items = await paramItemsToCompletions(param);

    result.push(...items);
  }

  return result;
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
 * Resolves parameter choice items asynchronously from parameter configuration.
 */
async function extractParamItems(param: ParamConfig): Promise<(string | number)[]> {
  const raw = await resolveRawItems(param.items);

  return Array.isArray(raw) ? raw : [];
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
 * Checks whether parameter has items defined for suggestions.
 */
function hasParamItems(param?: ParamConfig): boolean {
  if (!param) return false;

  return hasValidParamItems(param.items);
}

/**
 * Validates whether candidate items collection contains valid choices.
 */
function hasValidParamItems(items?: ParamItems): boolean {
  if (typeof items === 'function') return true;

  return Array.isArray(items) && items.length > 0;
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
 * Converts parameter items into completion suggestions.
 */
async function paramItemsToCompletions(param: ParamConfig): Promise<CompletionItem[]> {
  const items = await extractParamItems(param);

  return items.map((item) => ({
    description: `Choice for ${param.name}`,
    value: String(item),
  }));
}

/**
 * Resolves flag value completions if previous token corresponds to a select flag.
 */
async function resolveFlagValueItems(
  prevToken: string | undefined,
  cmd: CommandConfig,
  lastToken: string,
): Promise<CompletionItem[] | null> {
  if (!prevToken) return null;

  const valueItems = await resolveValueCompletion(prevToken, cmd);

  if (valueItems) return filterCompletions(valueItems, lastToken);

  return null;
}

/**
 * Resolves raw item candidate output from static list or item provider function.
 */
async function resolveRawItems(items?: ParamItems): Promise<unknown> {
  if (typeof items === 'function') return items();

  return items;
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
async function resolveSubcommandCompletions(
  cmd: CommandConfig,
  rawArgs: string[],
): Promise<CompletionItem[]> {
  const lastToken = rawArgs[rawArgs.length - 1] || '';
  const flagValueItems = await resolveFlagValueItems(rawArgs[rawArgs.length - 2], cmd, lastToken);

  if (flagValueItems) return flagValueItems;

  const options = collectCommandOptions(cmd);
  const positionals = await collectPositionalItems(cmd.params);

  return filterCompletions([...options, ...positionals], lastToken);
}

/**
 * Resolves completions for parameter values if previous token was an option flag.
 */
async function resolveValueCompletion(
  prevToken: string,
  cmd: CommandConfig,
): Promise<CompletionItem[] | null> {
  const param = matchParamByFlag(prevToken, cmd.params ?? []);

  return hasParamItems(param) ? paramItemsToCompletions(param as ParamConfig) : null;
}

/**
 * Resolves context-aware tab completion suggestions for commands, flags, and select items.
 *
 * @param config CLI configuration specification
 * @param rawArgs Array of tokens currently entered on the command line
 * @returns Array of completion suggestions
 * @example
 * ```ts
 * const completions = await resolveCompletions(config, ['deploy', '--env']);
 * // Returns completions matching select items for --env
 * ```
 */
export async function resolveCompletions(
  config: CliConfig,
  rawArgs: string[],
): Promise<CompletionItem[]> {
  if (rawArgs.length <= 1) return resolveRootCompletions(config, getLastArg(rawArgs));

  const cmd = config.commands.find((c) => c.name === rawArgs[0]);

  if (!cmd) return resolveRootCompletions(config, getLastArg(rawArgs));

  return resolveSubcommandCompletions(cmd, rawArgs.slice(1));
}

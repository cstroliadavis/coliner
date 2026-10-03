import type { CliConfig, CommandConfig, ParamConfig } from './types.js';

/**
 * Formats a single or multi-character alias token with hyphens.
 */
function formatAliasFlag(alias: string): string {
  return alias.length === 1 ? `-${alias}` : `--${alias}`;
}

/**
 * Formats CLI program name and version banner string.
 */
function formatCliTitle(name?: string, version?: string): string {
  const cliName = name ?? 'coliner';
  const ver = version ? ` v${version}` : '';

  return `${cliName}${ver}`;
}

/**
 * Builds the header lines for command-specific help documentation.
 */
function formatCommandHeader(command: CommandConfig, cliName: string): string[] {
  const desc = command.description ? ` - ${command.description}` : '';

  return [
    `Command: ${command.name}${desc}`,
    `Triggers: '${command.triggers}'`,
    '',
    `Usage: ${cliName} ${command.name} [options] [arguments]`,
  ];
}

/**
 * Generates formatted help documentation for a specific command.
 */
function formatCommandHelp(command: CommandConfig, cliName: string): string {
  const header = formatCommandHeader(command, cliName);
  const paramSection = formatCommandParams(command.params);

  return [...header, ...paramSection].join('\n');
}

/**
 * Formats parameter entries for command help screens.
 */
function formatCommandParams(params?: ParamConfig[]): string[] {
  if (!params || params.length === 0) return [];

  const paramLines = params.map(formatParamLine);

  return ['', 'Parameters:', ...paramLines];
}

/**
 * Formats an individual command summary line for general help listings.
 */
function formatCommandRow(cmd: CommandConfig): string {
  const isDef = cmd.isDefault ? ' (default)' : '';
  const namePart = `${cmd.name}${isDef}`.padEnd(24);
  const cmdDesc = cmd.description ? `  ${cmd.description}` : '';

  return `  ${namePart}${cmdDesc}`;
}

/**
 * Formats the header portion of general CLI usage help.
 */
function formatGeneralHeader(config: CliConfig): string[] {
  const title = formatCliTitle(config.name, config.version);
  const cliName = config.name ?? 'coliner';
  const lines = [title];

  if (config.description) {
    lines.push(config.description);
  }

  lines.push(`Usage: ${cliName} <command> [arguments] [options]`);

  return lines;
}

/**
 * Generates formatted help documentation for the entire CLI suite.
 */
function formatGeneralHelp(config: CliConfig): string {
  const header = formatGeneralHeader(config);
  const commandLines = config.commands.map(formatCommandRow);
  const footer = ['', 'Global Options:', '  -h, --help               Display help information'];

  return [...header, '', 'Commands:', ...commandLines, ...footer].join('\n');
}

/**
 * Formats a single parameter detail line with type, defaults, and description.
 */
function formatParamLine(param: ParamConfig): string {
  const sig = formatParamSignature(param).padEnd(30);
  const desc = param.description ? `${param.description} ` : '';
  const def = param.default !== undefined ? `[default: ${JSON.stringify(param.default)}] ` : '';
  const typeInfo = `(${param.type})`;

  return `  ${sig} ${desc}${def}${typeInfo}`.trimEnd();
}

/**
 * Builds the flag/alias signature for a parameter (e.g. -a, --alias <text>).
 */
function formatParamSignature(param: ParamConfig): string {
  const flags = getParamFlags(param);
  const placeholder = getValuePlaceholder(param.type);

  return `${flags.join(', ')}${placeholder}`;
}

/**
 * Gathers and formats all flag representation tokens for a parameter.
 */
function getParamFlags(param: ParamConfig): string[] {
  const flags = normalizeAliases(param.alias).map(formatAliasFlag);

  flags.push(`--${param.name}`);

  if (param.negator) {
    flags.push(`[--no-${param.name}]`);
  }

  return flags;
}

/**
 * Returns value type placeholder string for non-flag parameters.
 */
function getValuePlaceholder(type: string): string {
  return type === 'flag' ? '' : ` <${type}>`;
}

/**
 * Normalizes alias configuration into an array of string aliases.
 */
function normalizeAliases(alias: string | string[] = []): string[] {
  return Array.isArray(alias) ? alias : [alias];
}

/**
 * Creates a help formatter instance for CLI usage and documentation rendering.
 *
 * @param config Active CLI configuration
 * @returns Help formatter instance
 * @example
 * ```ts
 * const formatter = createHelpFormatter(config);
 * const helpText = formatter.renderGeneralHelp();
 * // Generates full CLI usage help string
 * ```
 */
export function createHelpFormatter(config: CliConfig) {
  const _ = {
    cliName: config.name ?? 'coliner',
    config,
  };

  /**
   * Renders help for a specific command or general overview.
   */
  function render(commandName?: string): string {
    if (!commandName) return formatGeneralHelp(_.config);

    const cmd = _.config.commands.find((c) => c.name === commandName);

    if (!cmd) return formatGeneralHelp(_.config);

    return formatCommandHelp(cmd, _.cliName);
  }

  return {
    render,
    renderCommandHelp: (cmd: CommandConfig) => formatCommandHelp(cmd, _.cliName),
    renderGeneralHelp: () => formatGeneralHelp(_.config),
  };
}

import type { CliConfig, CommandConfig, ParamConfig } from './types.js';

/**
 * Builds the flag/alias signature for a parameter (e.g. -a, --alias <text>).
 */
function formatParamSignature(param: ParamConfig): string {
  const parts: string[] = [];
  const aliases = Array.isArray(param.alias)
    ? param.alias
    : param.alias
      ? [param.alias]
      : [];

  for (const alias of aliases) {
    if (alias.length === 1) {
      parts.push(`-${alias}`);
    } else {
      parts.push(`--${alias}`);
    }
  }

  parts.push(`--${param.name}`);

  if (param.negator) {
    parts.push(`[--no-${param.name}]`);
  }

  const valuePlaceholder = param.type === 'flag' ? '' : ` <${param.type}>`;

  return `${parts.join(', ')}${valuePlaceholder}`;
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
 * Generates formatted help documentation for a specific command.
 */
function formatCommandHelp(command: CommandConfig, cliName: string): string {
  const lines: string[] = [];
  const desc = command.description ? ` - ${command.description}` : '';

  lines.push(`Command: ${command.name}${desc}`);
  lines.push(`Triggers: '${command.triggers}'`);
  lines.push('');
  lines.push(`Usage: ${cliName} ${command.name} [options] [arguments]`);

  const params = command.params || [];

  if (params.length > 0) {
    lines.push('');
    lines.push('Parameters:');

    for (const param of params) {
      lines.push(formatParamLine(param));
    }
  }

  return lines.join('\n');
}

/**
 * Generates formatted help documentation for the entire CLI suite.
 */
function formatGeneralHelp(config: CliConfig): string {
  const lines: string[] = [];
  const cliName = config.name || 'coliner';
  const desc = config.description ? `${config.description}\n` : '';

  lines.push(`${cliName}${config.version ? ` v${config.version}` : ''}`);

  if (desc) {
    lines.push(desc);
  }

  lines.push(`Usage: ${cliName} <command> [arguments] [options]`);
  lines.push('');
  lines.push('Commands:');

  for (const cmd of config.commands) {
    const isDef = cmd.isDefault ? ' (default)' : '';
    const namePart = `${cmd.name}${isDef}`.padEnd(24);
    const cmdDesc = cmd.description ? `  ${cmd.description}` : '';

    lines.push(`  ${namePart}${cmdDesc}`);
  }

  lines.push('');
  lines.push('Global Options:');
  lines.push('  -h, --help               Display help information');

  return lines.join('\n');
}

/**
 * Creates a help formatter instance for CLI usage and documentation rendering.
 *
 * @param config Active CLI configuration
 * @returns Help formatter instance
 * @example
 * ```ts
 * const formatter = createHelpFormatter(config);
 * console.log(formatter.renderGeneralHelp());
 * ```
 */
export function createHelpFormatter(config: CliConfig) {
  const _ = {
    cliName: config.name || 'coliner',
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

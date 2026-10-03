import { formatCompletionsForShell, generateCompletionScript } from './completion-generator.js';
import { resolveCompletions } from './completion-resolver.js';
import type { CliConfig, CommandConfig, CompletionShell, ParsedCommandResult } from './types.js';

const VALID_SHELLS = new Set<string>(['bash', 'fish', 'zsh']);

/**
 * Creates parsed command result structure for completion operations.
 */
function buildCompletionResult(
  config: CliConfig,
  rawArgs: string[],
  output: string,
): ParsedCommandResult {
  return {
    command: { name: 'completion', triggers: 'completion' },
    config,
    params: { output },
    rawArgs,
    triggers: 'completion',
  };
}

/**
 * Resolves raw command line tokens targeted for completion query.
 */
function extractCompletionTokens(args: string[]): {
  shell?: CompletionShell;
  tokens: string[];
} {
  const subArgs = args.slice(2);
  let shell: CompletionShell | undefined;
  let remaining = subArgs;

  if (isShellToken(subArgs[0])) {
    shell = subArgs[0];
    remaining = subArgs.slice(1);
  }

  const dashDashIdx = remaining.indexOf('--');
  const tokens = dashDashIdx >= 0 ? remaining.slice(dashDashIdx + 1) : remaining;

  return { shell, tokens };
}

/**
 * Executes dynamic completion query for shell integrations.
 */
async function handleCompleteSubcommand(
  args: string[],
  config: CliConfig,
): Promise<ParsedCommandResult> {
  const { shell, tokens } = extractCompletionTokens(args);
  const items = await resolveCompletions(config, tokens);
  const output = formatCompletionsForShell(items, shell);

  if (output.length > 0) {
    console.log(output);
  }

  return buildCompletionResult(config, args, output);
}

/**
 * Displays completion help documentation.
 */
function handleHelpSubcommand(args: string[], config: CliConfig): ParsedCommandResult {
  const cliName = config.name ?? 'coliner';
  const helpText = renderCompletionHelp(cliName);

  console.log(helpText);

  return buildCompletionResult(config, args, helpText);
}

/**
 * Outputs generated completion script for target shell environment.
 */
function handleScriptSubcommand(
  shell: CompletionShell,
  args: string[],
  config: CliConfig,
): ParsedCommandResult {
  const cliName = config.name ?? 'coliner';
  const script = generateCompletionScript(shell, cliName);

  console.log(script);

  return buildCompletionResult(config, args, script);
}

/**
 * Checks whether token represents a supported completion shell name.
 */
function isShellToken(token?: string): token is CompletionShell {
  return Boolean(token && VALID_SHELLS.has(token));
}

/**
 * Renders usage instructions for the built-in completion command.
 */
function renderCompletionHelp(cliName: string): string {
  return [
    `Usage: ${cliName} completion <bash|fish|zsh>`,
    '',
    'Generates shell tab-completion scripts for your shell environment.',
    '',
    'Supported shells:',
    '  bash      Generate completion script for Bash',
    '  fish      Generate completion script for Fish',
    '  zsh       Generate completion script for Zsh',
  ].join('\n');
}

/**
 * Dispatches completion subcommands for script generation and dynamic querying.
 *
 * @param args Raw argument tokens starting with 'completion'
 * @param config CLI configuration specification
 * @returns Parsed command result payload
 * @example
 * ```ts
 * const result = handleCompletionCommand(['completion', 'bash'], config);
 * ```
 */
export async function handleCompletionCommand(
  args: string[],
  config: CliConfig,
): Promise<ParsedCommandResult> {
  const sub = args[1];

  if (sub === 'complete') return handleCompleteSubcommand(args, config);

  if (isShellToken(sub)) return handleScriptSubcommand(sub, args, config);

  return handleHelpSubcommand(args, config);
}

/**
 * Checks whether argument tokens target the built-in completion command.
 *
 * @param args Raw argument tokens
 * @param commands Defined commands in CLI config
 * @returns True if arguments target built-in completion
 * @example
 * ```ts
 * const isCompletion = isCompletionCommand(['completion', 'zsh'], []);
 * ```
 */
export function isCompletionCommand(args: string[], commands: CommandConfig[]): boolean {
  return args[0] === 'completion' && !commands.some((c) => c.name === 'completion');
}

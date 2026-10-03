import type { CommandConfig, HelpDetection } from './types.js';

const HELP_FLAGS = new Set(['--help', '-h', 'help']);

/**
 * Checks for subcommand or flag-based explicit help requests.
 */
function checkExplicitHelp(args: string[], commands: CommandConfig[]): HelpDetection | null {
  const subResult = detectHelpSubcommand(args);

  if (subResult) return subResult;

  return detectFlaggedHelp(args, commands);
}

/**
 * Checks if argument list consists of a single global help flag or verb.
 */
function checkSingleHelpToken(args: string[]): boolean {
  return args.length === 1 && HELP_FLAGS.has(args[0]);
}

/**
 * Checks for help flags in arguments and determines target command name.
 */
function detectFlaggedHelp(args: string[], commands: CommandConfig[]): HelpDetection | null {
  if (!args.some(isHelpFlag)) return null;

  const commandName = args.find((arg) => commands.some((c) => c.name === arg));

  return { commandName, isHelp: true };
}

/**
 * Checks for help subcommand or single help argument.
 */
function detectHelpSubcommand(args: string[]): HelpDetection | null {
  if (checkSingleHelpToken(args)) return { isHelp: true };

  if (args[0] === 'help') return { commandName: args[1], isHelp: true };

  return null;
}

/**
 * Detects if help should be displayed when no arguments are supplied.
 */
function isHelpDueToNoArgs(args: string[], commands: CommandConfig[]): boolean {
  return args.length === 0 && !commands.some((c) => c.isDefault);
}

/**
 * Checks if a string token matches --help or -h.
 */
function isHelpFlag(arg: string): boolean {
  return ['--help', '-h'].includes(arg);
}

/**
 * Checks whether arguments correspond to a global or command-specific help request.
 *
 * @param args Command argument tokens
 * @param commands Defined commands in CLI configuration
 * @returns Detection result indicating if help was requested and optional command name
 * @example
 * ```ts
 * const result = detectHelp(['--help'], commands);
 * // Returns { isHelp: true }
 * ```
 */
export function detectHelp(args: string[], commands: CommandConfig[]): HelpDetection {
  if (isHelpDueToNoArgs(args, commands)) return { isHelp: true };

  const explicitHelp = checkExplicitHelp(args, commands);

  if (explicitHelp) return explicitHelp;

  return { isHelp: false };
}

import type { CompletionItem, CompletionShell } from './types.js';

/**
 * Formats an individual completion candidate item for the target shell.
 */
function formatCompletionItem(item: CompletionItem, shell?: CompletionShell): string {
  if (shell === 'zsh') return formatZshItem(item);

  if (shell === 'fish') return formatFishItem(item);

  return item.value;
}

/**
 * Formats completion item for Fish with tab description separator.
 */
function formatFishItem(item: CompletionItem): string {
  return item.description ? `${item.value}\t${item.description}` : item.value;
}

/**
 * Formats completion item for Zsh with colon description separator.
 */
function formatZshItem(item: CompletionItem): string {
  return item.description ? `${item.value}:${item.description.replace(/:/g, ' ')}` : item.value;
}

/**
 * Generates Bash completion script for CLI command.
 */
function generateBashCompletion(cliName: string): string {
  const func = sanitizeShellName(cliName);

  return [
    `# Bash completion for ${cliName}`,
    `_${func}_completions() {`,
    '  local cur prev',
    '  cur="${COMP_WORDS[COMP_CWORD]}"',
    '  prev="${COMP_WORDS[COMP_CWORD-1]}"',
    `  local reply=$("\${COMP_WORDS[0]}" completion complete bash -- "\${COMP_WORDS[@]:1}" 2>/dev/null)`,
    '  COMPREPLY=($(compgen -W "$reply" -- "$cur"))',
    '}',
    `complete -o default -F _${func}_completions ${cliName}`,
    '',
  ].join('\n');
}

/**
 * Generates Fish completion script for CLI command.
 */
function generateFishCompletion(cliName: string): string {
  const func = sanitizeShellName(cliName);

  return [
    `# Fish completion for ${cliName}`,
    `function __${func}_complete`,
    '  set -l tokens (commandline -cop)',
    `  ${cliName} completion complete fish -- $tokens[2..-1] 2>/dev/null`,
    'end',
    `complete -c ${cliName} -f -a "(__${func}_complete)"`,
    '',
  ].join('\n');
}

/**
 * Generates Zsh completion script for CLI command.
 */
function generateZshCompletion(cliName: string): string {
  const func = sanitizeShellName(cliName);

  return [
    `#compdef ${cliName}`,
    `# Zsh completion for ${cliName}`,
    `_${func}_completions() {`,
    '  local -a completions',
    '  local -a reply',
    "  local IFS=$'\\n'",
    `  reply=($("\${words[1]}" completion complete zsh -- "\${words[@]:1}" 2>/dev/null))`,
    '  for item in "${reply[@]}"; do',
    '    if [[ -n "$item" ]]; then',
    '      completions+=("$item")',
    '    fi',
    '  done',
    `  _describe '${cliName}' completions`,
    '}',
    `_${func}_completions "$@"`,
    '',
  ].join('\n');
}

/**
 * Strips non-alphanumeric characters to make a safe shell function name.
 */
function sanitizeShellName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

const SCRIPT_GENERATORS: Record<CompletionShell, (name: string) => string> = {
  bash: generateBashCompletion,
  fish: generateFishCompletion,
  zsh: generateZshCompletion,
};

/**
 * Formats completion candidate items according to the requested shell protocol.
 *
 * @param items Array of completion items
 * @param shell Optional target shell environment
 * @returns Newline-delimited formatted completion string
 * @example
 * ```ts
 * const output = formatCompletionsForShell([{ value: 'build' }], 'bash');
 * ```
 */
export function formatCompletionsForShell(
  items: CompletionItem[],
  shell?: CompletionShell,
): string {
  return items.map((item) => formatCompletionItem(item, shell)).join('\n');
}

/**
 * Generates an automated shell tab-completion script for Bash, Zsh, or Fish.
 *
 * @param shell Target shell type
 * @param cliName Name of the CLI binary executable
 * @returns Shell script contents ready for sourcing
 * @example
 * ```ts
 * const script = generateCompletionScript('zsh', 'my-cli');
 * ```
 */
export function generateCompletionScript(shell: CompletionShell, cliName: string): string {
  return SCRIPT_GENERATORS[shell](cliName);
}

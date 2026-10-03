import process from 'node:process';

export interface SelectPromptOptions {
  allowCustom?: boolean;
  input?: NodeJS.ReadableStream & { setRawMode?: (mode: boolean) => void };
  items: (string | number)[];
  output?: NodeJS.WritableStream;
  paramName: string;
}

/**
 * Builds menu text string from prompt state.
 */
function buildMenuText(state: PromptState): string {
  const filterInfo = state.filter ? ` (filter: ${state.filter})` : '';
  let text = `? Select ${state.paramName}:${filterInfo}\n`;

  state.filtered.forEach((item, idx) => {
    text += formatOptionLine(item, idx === state.selectedIndex);
  });

  return text;
}

/**
 * Clears previously rendered menu lines on the output stream.
 */
function clearPreviousLines(output: NodeJS.WritableStream, lineCount: number): void {
  if (lineCount > 0) {
    output.write(`\x1b[${lineCount}A\x1b[0J`);
  }
}

/**
 * Dispatches keypress event updating prompt state if modified.
 */
function dispatchKeyPress(key: string, state: PromptState): boolean {
  if (handleArrowKey(key, state)) return true;

  return handleTypingKey(key, state);
}

/**
 * Filters item list based on case-insensitive query string.
 */
function filterSelectItems(items: (string | number)[], filter: string): (string | number)[] {
  if (!filter) return items;

  const query = filter.toLowerCase();

  return items.filter((item) => String(item).toLowerCase().includes(query));
}

/**
 * Cleans up raw mode and renders final chosen value.
 */
function finalizeSelection(
  output: NodeJS.WritableStream,
  state: PromptState,
  chosen: string | number,
): void {
  clearPreviousLines(output, state.previousLineCount);
  output.write(`? Select ${state.paramName}: \x1b[32m${chosen}\x1b[0m\n`);
}

/**
 * Formats a single menu option line with selection indicator.
 */
function formatOptionLine(item: string | number, isSelected: boolean): string {
  return isSelected ? ` \x1b[36m❯ ${item}\x1b[0m\n` : `    ${item}\n`;
}

/**
 * Handles arrow navigation keys.
 */
function handleArrowKey(key: string, state: PromptState): boolean {
  if (key === '\u001b[A') {
    moveSelection(-1, state);

    return true;
  }

  if (key === '\u001b[B') {
    moveSelection(1, state);

    return true;
  }

  return false;
}

/**
 * Dispatches key interaction when navigating or filtering the menu.
 */
function handleMenuKey(key: string, ctrl: PromptController): void {
  if (dispatchKeyPress(key, ctrl.state)) {
    renderMenu(ctrl.output, ctrl.state);
  }
}

/**
 * Handles filter editing via printable keys or backspace.
 */
function handleTypingKey(key: string, state: PromptState): boolean {
  if (isBackspace(key)) {
    popFilter(state);

    return true;
  }

  if (isPrintableChar(key)) {
    updateFilter(key, state);

    return true;
  }

  return false;
}

/**
 * Creates initial prompt state record.
 */
function initPromptState(options: SelectPromptOptions): PromptState {
  return {
    allowCustom: options.allowCustom,
    filter: '',
    filtered: [...options.items],
    items: options.items,
    paramName: options.paramName,
    previousLineCount: 0,
    selectedIndex: 0,
  };
}

/**
 * Checks if key represents a backspace character.
 */
function isBackspace(key: string): boolean {
  return ['\u007f', '\b'].includes(key);
}

/**
 * Checks if readable stream supports interactive TTY operations.
 */
function isInteractiveTty(stream: NodeJS.ReadableStream): boolean {
  return Boolean('isTTY' in stream && stream.isTTY);
}

/**
 * Checks if a key string represents a single printable ASCII character.
 */
function isPrintableChar(key: string): boolean {
  return key.length === 1 && key >= ' ' && key <= '~';
}

/**
 * Checks if key represents Enter / newline submission.
 */
function isSubmitKey(key: string): boolean {
  return ['\r', '\n'].includes(key);
}

/**
 * Updates selected cursor index with wrapping within range.
 */
function moveSelection(delta: number, state: PromptState): void {
  if (state.filtered.length === 0) return;

  const count = state.filtered.length;
  const next = (state.selectedIndex + delta + count) % count;

  state.selectedIndex = next;
}

/**
 * Removes the trailing character from active filter query.
 */
function popFilter(state: PromptState): void {
  if (state.filter.length === 0) return;

  state.filter = state.filter.slice(0, -1);
  state.filtered = filterSelectItems(state.items, state.filter);
  state.selectedIndex = 0;
}

/**
 * Processes incoming data chunk and triggers prompt reaction.
 */
function processKeyChunk(key: string, ctrl: PromptController): void {
  if (key === '\u0003') {
    ctrl.cleanup();
    ctrl.reject(new Error('User cancelled prompt'));

    return;
  }

  if (isSubmitKey(key)) {
    submitSelection(ctrl);

    return;
  }

  handleMenuKey(key, ctrl);
}

/**
 * Redraws interactive selection menu onto the output stream.
 */
function renderMenu(output: NodeJS.WritableStream, state: PromptState): void {
  clearPreviousLines(output, state.previousLineCount);

  const text = buildMenuText(state);

  output.write(text);
  state.previousLineCount = text.split('\n').length - 1;
}

/**
 * Resolves typed filter value as fallback choice when allowCustom is enabled.
 */
function resolveCustomFilter(state: PromptState): string | undefined {
  if (state.allowCustom && state.filter.length > 0) return state.filter;

  return undefined;
}

/**
 * Resolves streams with default fallbacks to process standard I/O.
 */
function resolvePromptStreams(options: SelectPromptOptions): {
  input: NodeJS.ReadableStream & { setRawMode?: (mode: boolean) => void };
  output: NodeJS.WritableStream;
} {
  return {
    input: options.input ?? process.stdin,
    output: options.output ?? process.stdout,
  };
}

/**
 * Resolves current selected item or throws if filtered list is empty.
 */
function resolveSelectedItem(state: PromptState): string | number {
  if (state.filtered.length > 0) return state.filtered[state.selectedIndex];

  const customChoice = resolveCustomFilter(state);

  if (customChoice !== undefined) return customChoice;

  throw new Error(`No option matching filter: '${state.filter}'`);
}

/**
 * Executes interactive selection event loop over streams.
 */
function runInteractivePrompt(
  options: SelectPromptOptions,
  input: NodeJS.ReadableStream & { setRawMode?: (mode: boolean) => void },
  output: NodeJS.WritableStream,
): Promise<string | number> {
  return new Promise((resolve, reject) => {
    const state = initPromptState(options);

    toggleRawMode(input, true);
    renderMenu(output, state);

    const cleanup = () => {
      toggleRawMode(input, false);
      input.off('data', onData);
    };

    const ctrl: PromptController = { cleanup, output, reject, resolve, state };

    const onData = (chunk: Buffer | string) => {
      processKeyChunk(String(chunk), ctrl);
    };

    input.on('data', onData);
  });
}

/**
 * Submits active choice and finalizes display.
 */
function submitSelection(ctrl: PromptController): void {
  try {
    const chosen = resolveSelectedItem(ctrl.state);

    ctrl.cleanup();
    finalizeSelection(ctrl.output, ctrl.state, chosen);
    ctrl.resolve(chosen);
  } catch (err) {
    ctrl.cleanup();
    ctrl.reject(err);
  }
}

/**
 * Toggles raw mode on input stream if supported.
 */
function toggleRawMode(
  input: NodeJS.ReadableStream & { setRawMode?: (mode: boolean) => void },
  enabled: boolean,
): void {
  if (input.setRawMode) {
    input.setRawMode(enabled);
  }
}

/**
 * Updates filter text and recalculates filtered options list.
 */
function updateFilter(char: string, state: PromptState): void {
  state.filter += char;
  state.filtered = filterSelectItems(state.items, state.filter);
  state.selectedIndex = 0;
}

/**
 * Prompts user interactively to select an item using arrow keys or filtering.
 *
 * @param options Configuration options for the select prompt
 * @returns Selected choice value
 * @example
 * ```ts
 * const choice = await promptSelect({ items: ['dev', 'prod'], paramName: 'env' });
 * // Prompts user and returns chosen string or number
 * ```
 */
export async function promptSelect(options: SelectPromptOptions): Promise<string | number> {
  const streams = resolvePromptStreams(options);

  if (!isInteractiveTty(streams.input)) {
    throw new Error(
      `Cannot prompt for parameter '${options.paramName}' in a non-interactive terminal.`,
    );
  }

  return runInteractivePrompt(options, streams.input, streams.output);
}

interface PromptController {
  cleanup: () => void;
  output: NodeJS.WritableStream;
  reject: (reason?: unknown) => void;
  resolve: (value: string | number) => void;
  state: PromptState;
}

interface PromptState {
  allowCustom?: boolean;
  filter: string;
  filtered: (string | number)[];
  items: (string | number)[];
  paramName: string;
  previousLineCount: number;
  selectedIndex: number;
}

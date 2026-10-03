# Coliner

A declarative, YAML/JSON-driven command line tool builder for **Bun** with event triggers, strict
type coercion, and smart named-first positional argument assignment.

## Features

- **Built for Bun**: Native execution of TypeScript CLI files and fast test execution via `bun test`
  without requiring a compile step.
- **Declarative YAML/JSON Schema**: Define commands, parameters, aliases, types, and events in a
  clear configuration file.
- **Priority-Based Argument Resolution**: Named flags/options (`--param=val`, `-a val`) are parsed
  first, followed by assigning remaining positional tokens to unfilled parameters in order of
  definition.
- **Rich Parameter Types**: Built-in validation and coercion for `text`, `keyword`, `flag`, `date`,
  `number`, `file`, `stdin`, `time`, `url`, and `select`.
- **Interactive Select Prompts**: `select` parameters provide an interactive, type-to-filter menu
  with arrow-key selection in interactive TTY terminals when omitted. Set `allowCustom: true` to
  accept arbitrary custom values.
- **Shell Tab Completions**: Native script generation and dynamic completion lookup for **Bash**,
  **Zsh**, and **Fish** supporting commands, options, `select` choices, `text` suggestions, and
  dynamic function providers.
- **Event-Driven Execution**: Each command declares a `triggers` event name that dispatches parsed
  parameters to registered listeners.
- **Single & Multi-Character Aliases**: Single-letter flags can be chained (`-abc`), and
  multi-character aliases require `--`.
- **Negators**: Parameters with `negator: true` support `--no-<name>` syntax to set flags to
  `false`.
- **Automatic Help Generation**: Formatted global and command-specific help screens with usage,
  descriptions, defaults, and type hints.

## Schema

```yaml
commands:
  - name: kebab-case-command-name
    description: A helpful description to show if the "help" command is made
    isDefault: true # Optional: command to invoke when none is specified
    triggers: event-name-to-trigger
    params:
      - name: kebab-case-param-name
        description: A helpful description to show in help
        type: select # "text" | "keyword" | "flag" | "date" | "number" | "file" | "stdin" | "time" | "url" | "select"
        items: [dev, staging, prod] # Choices for "select" or suggestions for "text"
        allowCustom: true # Optional: allows custom unlisted values for "select"
        negator: true # Optional: enables --no-<name>
        default: fallback-value # Optional
        alias: [a, alias-name] # Optional: single letter or multi-character string
```

### Parameter Types

| Type      | Coerced Value      | Description & Validation                                         |
| :-------- | :----------------- | :--------------------------------------------------------------- |
| `text`    | `string`           | General string; accepts optional `items` for tab completions.    |
| `keyword` | `string`           | Alphanumeric or kebab-case identifier (`/^[a-zA-Z0-9_\-]+$/`).   |
| `flag`    | `boolean`          | `true` if supplied without value; accepts true/false/yes/no.     |
| `date`    | `Date`             | JavaScript Date instance; validated with `!isNaN(getTime())`.    |
| `number`  | `number`           | Numeric float or integer; validated with `!isNaN(Number(val))`.  |
| `file`    | `string`           | Validated filesystem path; verifies existence synchronously.     |
| `stdin`   | `string`           | Input read from process standard input stream or passed content. |
| `time`    | `string`           | 24-hr time (`HH:MM`); accepts 24h (`14:30`) or 12h (`2:30pm`).   |
| `url`     | `URL`              | Validated WHATWG URL instance (`new URL(val)`).                  |
| `select`  | `string \| number` | Item from `items` list; accepts custom input when `allowCustom`. |

## Shell Tab Completions

Coliner automatically equips any CLI application created with it with a built-in `completion` command.
There is no boilerplate or custom completion code required in your application logic.

### 1. Activating in Zsh

**Instant activation for current session:**

```zsh
source <(your-cli completion zsh)
```

**Permanent setup via `~/.zshrc`:**

Add this line to your `~/.zshrc`:

```zsh
eval "$(your-cli completion zsh)"
```

Alternatively, if you organize completions in a function directory on your `$fpath` (e.g. `~/.zfunc`):

```zsh
# 1. Output the completion definition to your fpath folder:
your-cli completion zsh > ~/.zfunc/_your-cli

# 2. Ensure your ~/.zshrc initializes fpath before compinit:
# fpath=(~/.zfunc $fpath)
# autoload -Uz compinit && compinit
```

### 2. Activating in Bash

**Instant activation for current session:**

```bash
source <(your-cli completion bash)
```

**Permanent setup via `~/.bashrc`:**

```bash
echo 'eval "$(your-cli completion bash)"' >> ~/.bashrc
```

Or install it into your system's bash-completion directory:

```bash
# Linux
your-cli completion bash | sudo tee /etc/bash_completion.d/your-cli

# macOS (Homebrew bash-completion)
your-cli completion bash > $(brew --prefix)/etc/bash_completion.d/your-cli
```

### 3. Activating in Fish

Fish automatically discovers completions saved in `~/.config/fish/completions/`:

```fish
your-cli completion fish > ~/.config/fish/completions/your-cli.fish
```

Or activate immediately in the current shell session:

```fish
your-cli completion fish | source
```

### 4. Programmatic API

You can also generate completion scripts or query completions programmatically:

```typescript
import { createColiner } from 'coliner';

const cli = createColiner({ config: 'cli.yaml' });

// Generate shell script string:
const zshScript = cli.generateCompletionScript('zsh');

// Query dynamic suggestions for an array of tokens:
const suggestions = cli.getCompletions(['deploy', '--env', '']);
// Returns: [{ value: 'development', description: '...' }, ...]
```

### Dynamic Capabilities

Generated completion scripts dynamically delegate to your CLI:

- **Root Level**: Suggests all commands and global options (`--help`, `--config`).
- **Command Flags**: Suggests all flags, short aliases, and inverted `--no-<flag>` negators.
- **Select Parameters**: Suggests all valid `items` choices when typing options or positional values.
- **Text Parameter Suggestions**: Suggests `items` defined on `text` parameters while still accepting
  arbitrary values.
- **Dynamic Item Providers**: `items` can be specified as a sync or async function returning an array
  of values (e.g. querying tasks or records dynamically).

## Positional and Named Assignment Rules

Named parameters are extracted first. All remaining unnamed positional tokens are assigned to the
remaining unfilled parameters in their schema definition order.

### Example

Given a command with parameters `param-1`, `param-2` (alias `-a`), `param-3`, `param-4`, `param-5`,
`param-6`, and `some-param`:

```bash
bun run ./bin/coliner.ts --config example/cli.yaml some-command \
  "My first Param is assigned to the first parameter" \
  --some-param="assigned to some-param" \
  -a "assigned to the command with alias a" \
  "Assuming that the param with alias a was the second param, this value will be assigned to the 3rd param" \
  4 true \
  "this will be assigned to the 6th param and the previous 2 would have been assigned to the 4th and 5th respectively"
```

Resulting parameters payload:

```json
{
  "param-1": "My first Param is assigned to the first parameter",
  "param-2": "assigned to the command with alias a",
  "param-3": "Assuming that the param with alias a was the second param, this value will be assigned to the 3rd param",
  "param-4": 4,
  "param-5": true,
  "param-6": "this will be assigned to the 6th param and the previous 2 would have been assigned to the 4th and 5th respectively",
  "some-param": "assigned to some-param"
}
```

## Programmatic Usage

```typescript
import { createColiner } from 'coliner';

const cli = createColiner({
  config: 'example/cli.yaml',
});

cli.on('user-created', async ({ params, rawArgs, triggers }) => {
  console.log('Event triggered:', triggers);
  console.log('Params:', params);
});

await cli.execute();
```

## Running with Bun

```bash
# Run all tests (unit and e2e)
bun test

# Run end-to-end CLI tests exclusively
bun run test:e2e

# Display help
bun run ./bin/coliner.ts --config example/cli.yaml --help

# Display command-specific help
bun run ./bin/coliner.ts --config example/cli.yaml help user-add

# Execute a command
bun run ./bin/coliner.ts --config example/cli.yaml user-add alice -e alice@example.com --no-active
```

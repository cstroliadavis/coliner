# Coliner

A declarative, YAML/JSON-driven command line tool builder with event triggers, strict type coercion,
and smart named-first positional argument assignment.

## Features

- **Declarative YAML/JSON Schema**: Define your commands, parameters, aliases, types, and events in
  a clear configuration file.
- **Priority-Based Argument Resolution**: Named flags/options (`--param=val`, `-a val`) are parsed
  first, followed by assigning remaining positional tokens to unfilled parameters in order of
  definition.
- **Rich Parameter Types**: Built-in validation and coercion for `text`, `keyword`, `flag`, `date`,
  `number`, `file`, `stdin`, and `url`.
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
        type: text # "text" | "keyword" | "flag" | "date" | "number" | "file" | "stdin" | "url"
        negator: true # Optional: enables --no-<name>
        default: fallback-value # Optional
        alias: [a, alias-name] # Optional: single letter or multi-character string
```

### Parameter Types

| Type      | Coerced Value | Description & Validation                                         |
| :-------- | :------------ | :--------------------------------------------------------------- |
| `text`    | `string`      | General string value.                                            |
| `keyword` | `string`      | Alphanumeric or kebab-case identifier (`/^[a-zA-Z0-9_\-]+$/`).   |
| `flag`    | `boolean`     | `true` if supplied without value; accepts true/false/yes/no.     |
| `date`    | `Date`        | JavaScript Date instance; validated with `!isNaN(getTime())`.    |
| `number`  | `number`      | Numeric float or integer; validated with `!isNaN(Number(val))`.  |
| `file`    | `string`      | Validated filesystem path; verifies existence synchronously.     |
| `stdin`   | `string`      | Input read from process standard input stream or passed content. |
| `url`     | `URL`         | Validated WHATWG URL instance (`new URL(val)`).                  |

## Positional and Named Assignment Rules

Named parameters are extracted first. All remaining unnamed positional tokens are assigned to the
remaining unfilled parameters in their schema definition order.

### Example

Given a command with parameters `param-1`, `param-2` (alias `-a`), `param-3`, `param-4`, `param-5`,
`param-6`, and `some-param`:

```bash
coliner some-command "My first Param is assigned to the first parameter" \
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
import { createColiner } from "coliner";

const cli = createColiner({
  config: "cli.yaml",
});

cli.on("user-created", async ({ params, rawArgs, triggers }) => {
  console.log("Event triggered:", triggers);
  console.log("Params:", params);
});

await cli.execute();
```

## CLI Usage

```bash
# Display help
coliner --config cli.yaml --help

# Display command-specific help
coliner --config cli.yaml help user-add

# Run a command
coliner --config cli.yaml user-add alice -e alice@example.com --no-active
```

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import YAML from 'yaml';
import type { CliConfig, CommandConfig, ParamConfig, ParamItems, ParamType } from './types.js';

const VALID_PARAM_TYPES: ParamType[] = [
  'date',
  'file',
  'flag',
  'keyword',
  'number',
  'select',
  'stdin',
  'text',
  'time',
  'url',
];

const DEFAULT_CONFIG_FILENAMES = [
  'coliner.yaml',
  'coliner.yml',
  'coliner.json',
  'cli.yaml',
  'cli.yml',
  'cli.json',
  'commands.yaml',
  'commands.yml',
  'commands.json',
];

/**
 * Asserts configuration structure includes a valid commands array.
 */
function assertValidCommandsArray(config: CliConfig | null | undefined): void {
  if (!config || !Array.isArray(config.commands)) {
    throw new Error("Configuration must have a 'commands' array");
  }
}

/**
 * Iterates command list verifying unique names and default counts.
 */
function countDefaultCommands(commands: CommandConfig[]): number {
  const seen = new Set<string>();
  let count = 0;

  for (const cmd of commands) {
    count += registerCommand(cmd, seen);
  }

  return count;
}

/**
 * Searches default configuration filenames in current working directory.
 */
function findDefaultCandidate(cwd: string): string | undefined {
  for (const candidate of DEFAULT_CONFIG_FILENAMES) {
    const resolved = path.resolve(cwd, candidate);

    if (fs.existsSync(resolved)) return resolved;
  }

  return undefined;
}

/**
 * Checks if parameter provides a non-empty array of items or an item provider.
 */
function hasValidItems(items?: ParamItems): boolean {
  if (typeof items === 'function') return true;

  return Array.isArray(items) && items.length > 0;
}

/**
 * Validates and indexes a single command while tracking default command flags.
 */
function registerCommand(command: CommandConfig, seen: Set<string>): number {
  validateCommandConfig(command);

  if (seen.has(command.name)) {
    throw new Error(`Duplicate command name '${command.name}' in configuration`);
  }

  seen.add(command.name);

  return command.isDefault ? 1 : 0;
}

/**
 * Validates and records a parameter configuration for duplicate prevention.
 */
function registerCommandParam(param: ParamConfig, commandName: string, seen: Set<string>): void {
  validateParamConfig(param, commandName);

  if (seen.has(param.name)) {
    throw new Error(`Duplicate parameter '${param.name}' detected in command '${commandName}'`);
  }

  seen.add(param.name);
}

/**
 * Locates an existing configuration file among standard default candidates.
 */
function resolveConfigFile(customPath?: string, cwd?: string): string {
  const activeCwd = cwd ?? process.cwd();

  return customPath ? resolveCustomPath(customPath, activeCwd) : resolveDefaultConfig(activeCwd);
}

/**
 * Resolves a specified custom file path against the working directory.
 */
function resolveCustomPath(customPath: string, cwd: string): string {
  const resolved = path.resolve(cwd, customPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Configuration file not found: '${resolved}'`);
  }

  return resolved;
}

/**
 * Searches and validates default configuration file presence.
 */
function resolveDefaultConfig(cwd: string): string {
  const found = findDefaultCandidate(cwd);

  if (found) return found;

  throw new Error(`No configuration file found. Checked: ${DEFAULT_CONFIG_FILENAMES.join(', ')}`);
}

/**
 * Validates the entire CLI schema configuration.
 */
function validateCliConfig(config: CliConfig): void {
  assertValidCommandsArray(config);

  const defaultCount = countDefaultCommands(config.commands);

  if (defaultCount > 1) {
    throw new Error('Only one command can be marked as default (isDefault: true)');
  }
}

/**
 * Validates command configuration rules and parameter integrity.
 */
function validateCommandConfig(command: CommandConfig): void {
  validateCommandIdentity(command);
  validateCommandParams(command.params, command.name);
}

/**
 * Validates presence of command name and trigger event.
 */
function validateCommandIdentity(command: CommandConfig): void {
  if (!command.name) {
    throw new Error("Command is missing required 'name'");
  }

  if (!command.triggers) {
    throw new Error(`Command '${command.name}' is missing required 'triggers' event name`);
  }
}

/**
 * Validates parameter collection on a command definition.
 */
function validateCommandParams(params: ParamConfig[] | undefined, commandName: string): void {
  if (!params) return;

  const seen = new Set<string>();

  for (const param of params) {
    registerCommandParam(param, commandName, seen);
  }
}

/**
 * Validates an individual parameter schema definition.
 */
function validateParamConfig(param: ParamConfig, commandName: string): void {
  if (!param.name) {
    throw new Error(`Parameter in command '${commandName}' is missing required 'name'`);
  }

  validateParamType(param, commandName);
  validateSelectItems(param, commandName);
}

/**
 * Validates parameter data type against supported types.
 */
function validateParamType(param: ParamConfig, commandName: string): void {
  if (!VALID_PARAM_TYPES.includes(param.type)) {
    throw new Error(
      `Parameter '${param.name}' in command '${commandName}' has invalid type: '${param.type}'. ` +
        `Expected one of: ${VALID_PARAM_TYPES.join(', ')}`,
    );
  }
}

/**
 * Validates that select parameters provide an items choice array.
 */
function validateSelectItems(param: ParamConfig, commandName: string): void {
  if (param.type !== 'select') return;

  if (!hasValidItems(param.items)) {
    throw new Error(
      `Parameter '${param.name}' in command '${commandName}' of type 'select' requires a non-empty 'items' array.`,
    );
  }
}

/**
 * Creates a configuration loader for reading and validating CLI configuration files.
 *
 * @param defaultCwd Working directory for config resolution
 * @returns Config loader instance
 * @example
 * ```ts
 * const loader = createConfigLoader();
 * const config = loader.loadFromFile('cli.yaml');
 * // Returns validated CliConfig
 * ```
 */
export function createConfigLoader(defaultCwd: string = process.cwd()) {
  const _ = {
    cwd: defaultCwd,
  };

  /**
   * Loads configuration from a file path or standard candidate.
   */
  function loadFromFile(filePath?: string, customCwd?: string): CliConfig {
    const targetCwd = customCwd ?? _.cwd;
    const resolvedPath = resolveConfigFile(filePath, targetCwd);
    const content = fs.readFileSync(resolvedPath, 'utf-8');

    return parseConfigString(content);
  }

  /**
   * Parses and validates raw configuration text (YAML or JSON).
   */
  function parseConfigString(content: string): CliConfig {
    let parsed: unknown;

    try {
      parsed = YAML.parse(content);
    } catch (yamlErr) {
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error(`Failed to parse configuration: ${(yamlErr as Error).message}`);
      }
    }

    const config = parsed as CliConfig;

    validateCliConfig(config);

    return config;
  }

  return {
    loadFromFile,
    parseConfigString,
    validateCliConfig,
  };
}

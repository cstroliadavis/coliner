import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import YAML from 'yaml';
import type { CliConfig, CommandConfig, ParamConfig, ParamType } from './types.js';

const VALID_PARAM_TYPES: ParamType[] = [
  'date',
  'file',
  'flag',
  'keyword',
  'number',
  'stdin',
  'text',
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
 * Validates an individual parameter schema definition.
 */
function validateParamConfig(param: ParamConfig, commandName: string): void {
  if (!param.name) {
    throw new Error(`Parameter in command '${commandName}' is missing required 'name'`);
  }

  if (!param.type || !VALID_PARAM_TYPES.includes(param.type)) {
    throw new Error(
      `Parameter '${param.name}' in command '${commandName}' has invalid type: '${param.type}'. ` +
        `Expected one of: ${VALID_PARAM_TYPES.join(', ')}`
    );
  }
}

/**
 * Validates command configuration rules and parameter integrity.
 */
function validateCommandConfig(command: CommandConfig): void {
  if (!command.name) {
    throw new Error("Command is missing required 'name'");
  }

  if (!command.triggers) {
    throw new Error(`Command '${command.name}' is missing required 'triggers' event name`);
  }

  const seenParams = new Set<string>();

  for (const param of command.params || []) {
    validateParamConfig(param, command.name);

    if (seenParams.has(param.name)) {
      throw new Error(
        `Duplicate parameter '${param.name}' detected in command '${command.name}'`
      );
    }

    seenParams.add(param.name);
  }
}

/**
 * Validates the entire CLI schema configuration.
 */
function validateCliConfig(config: CliConfig): void {
  if (!config || !Array.isArray(config.commands)) {
    throw new Error("Configuration must have a 'commands' array");
  }

  const seenCommands = new Set<string>();
  let defaultCount = 0;

  for (const command of config.commands) {
    validateCommandConfig(command);

    if (seenCommands.has(command.name)) {
      throw new Error(`Duplicate command name '${command.name}' in configuration`);
    }

    seenCommands.add(command.name);

    if (command.isDefault) {
      defaultCount++;
    }
  }

  if (defaultCount > 1) {
    throw new Error('Only one command can be marked as default (isDefault: true)');
  }
}

/**
 * Locates an existing configuration file among standard default candidates.
 */
function resolveConfigFile(customPath?: string, cwd: string = process.cwd()): string {
  if (customPath) {
    const resolved = path.resolve(cwd, customPath);

    if (!fs.existsSync(resolved)) {
      throw new Error(`Configuration file not found: '${resolved}'`);
    }

    return resolved;
  }

  for (const candidate of DEFAULT_CONFIG_FILENAMES) {
    const resolved = path.resolve(cwd, candidate);

    if (fs.existsSync(resolved)) return resolved;
  }

  throw new Error(
    `No configuration file found. Checked: ${DEFAULT_CONFIG_FILENAMES.join(', ')}`
  );
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
 * // Returns parsed CliConfig
 * ```
 */
export function createConfigLoader(defaultCwd: string = process.cwd()) {
  const _ = {
    cwd: defaultCwd,
  };

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

  /**
   * Loads configuration from a file path or standard candidate.
   */
  function loadFromFile(filePath?: string, customCwd?: string): CliConfig {
    const targetCwd = customCwd || _.cwd;
    const resolvedPath = resolveConfigFile(filePath, targetCwd);
    const content = fs.readFileSync(resolvedPath, 'utf-8');

    return parseConfigString(content);
  }

  return {
    loadFromFile,
    parseConfigString,
    validateCliConfig,
  };
}

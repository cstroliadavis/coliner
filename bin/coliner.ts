#!/usr/bin/env bun

import process from 'node:process';
import { createColiner } from '../src/index.js';

/**
 * Extracts CLI-level configuration options such as --config or -c.
 */
function extractCliOptions(argv: string[]): ParsedCliOptions {
  const state: CliScanState = { cleanArgs: [], i: 0 };

  while (state.i < argv.length) {
    processArg(argv, state);
  }

  return { cleanArgs: state.cleanArgs, configPath: state.configPath };
}

/**
 * Checks whether argument string matches the config flag or alias.
 */
function isConfigAlias(arg: string): boolean {
  return ['--config', '-c'].includes(arg);
}

/**
 * Parses config flag at current argument index.
 */
function parseConfigFlag(argv: string[], index: number): { path?: string; step: number } | null {
  const arg = argv[index];

  if (isConfigAlias(arg)) return { path: argv[index + 1], step: 2 };

  return arg.startsWith('--config=') ? { path: arg.slice('--config='.length), step: 1 } : null;
}

/**
 * Processes an individual argument token during CLI option scanning.
 */
function processArg(argv: string[], state: CliScanState): void {
  const configFlag = parseConfigFlag(argv, state.i);

  if (configFlag) {
    state.configPath = configFlag.path;
    state.i += configFlag.step;

    return;
  }

  state.cleanArgs.push(argv[state.i]);
  state.i += 1;
}

/**
 * Main command line execution runner for the Bun runtime.
 */
async function run(): Promise<void> {
  const { cleanArgs, configPath } = extractCliOptions(process.argv.slice(2));

  try {
    const cli = createColiner({
      config: configPath,
      cwd: process.cwd(),
    });
    const config = cli.getConfig();

    for (const cmd of config.commands) {
      cli.on(cmd.triggers, (payload) => {
        console.log(`[Event Triggered: ${payload.triggers}]`);
        console.log(JSON.stringify(payload.params, null, 2));
      });
    }

    await cli.execute(cleanArgs);
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}

run();

interface CliScanState {
  cleanArgs: string[];
  configPath?: string;
  i: number;
}

interface ParsedCliOptions {
  cleanArgs: string[];
  configPath?: string;
}

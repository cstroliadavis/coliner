#!/usr/bin/env node

import process from 'node:process';
import { createColiner } from '../dist/index.js';

/**
 * Extracts CLI-level configuration options such as --config or -c.
 */
function extractCliOptions(argv) {
  let configPath;
  const cleanArgs = [];

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    if (arg === '--config' || arg === '-c') {
      configPath = argv[i + 1];
      i += 2;
      continue;
    }

    if (arg.startsWith('--config=')) {
      configPath = arg.slice('--config='.length);
      i++;
      continue;
    }

    cleanArgs.push(arg);
    i++;
  }

  return { cleanArgs, configPath };
}

/**
 * Main command line execution runner.
 */
async function run() {
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
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

run();

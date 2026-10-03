import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it } from 'bun:test';
import { createColiner } from '../src/coliner.js';
import {
  formatCompletionsForShell,
  generateCompletionScript,
} from '../src/completion-generator.js';
import { resolveCompletions } from '../src/completion-resolver.js';
import type { CliConfig } from '../src/types.js';

describe('completions', () => {
  const setup = () => {
    const config: CliConfig = {
      commands: [
        {
          description: 'Deploy services',
          name: 'deploy',
          params: [
            {
              alias: 'e',
              description: 'Target environment',
              items: ['development', 'staging', 'production'],
              name: 'env',
              type: 'select',
            },
            {
              alias: 'r',
              description: 'Replica count',
              items: [1, 3, 5],
              name: 'replicas',
              type: 'select',
            },
            {
              description: 'Verbose logging',
              name: 'verbose',
              negator: true,
              type: 'flag',
            },
          ],
          triggers: 'deploy-triggered',
        },
        {
          description: 'Build artifacts',
          name: 'build',
          params: [
            {
              description: 'Output format',
              items: ['esm', 'cjs'],
              name: 'format',
              type: 'select',
            },
          ],
          triggers: 'build-triggered',
        },
        {
          description: 'Record work task',
          name: 'add-task',
          params: [
            {
              description: 'Task title or ticket',
              items: ['Ticket-100', 'Ticket-200'],
              name: 'task',
              type: 'text',
            },
          ],
          triggers: 'task-added',
        },
      ],
      description: 'Test deployment CLI',
      name: 'deployer',
      version: '1.0.0',
    };

    const cli = createColiner(config);

    const createMockStreams = () => {
      const input = new EventEmitter() as EventEmitter & {
        isTTY?: boolean;
        setRawMode?: (mode: boolean) => void;
      };

      input.isTTY = true;
      input.setRawMode = () => {};

      let outputText = '';
      const output = {
        write: (chunk: string) => {
          outputText += chunk;

          return true;
        },
      };

      return {
        getOutput: () => outputText,
        input,
        output,
      };
    };

    return Object.freeze({
      cli,
      config,
      createMockStreams,
    });
  };

  afterEach(() => {
    // Teardown per unit-test-setup
  });

  it('resolves root level command suggestions matching prefix', () => {
    const { config } = setup();

    const all = resolveCompletions(config, ['']);

    expect(all.some((c) => c.value === 'deploy')).toBe(true);
    expect(all.some((c) => c.value === 'build')).toBe(true);
    expect(all.some((c) => c.value === '--help')).toBe(true);

    const filtered = resolveCompletions(config, ['dep']);

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.value).toBe('deploy');
  });

  it('resolves command option flags and select items', () => {
    const { config } = setup();

    const flags = resolveCompletions(config, ['deploy', '--']);

    expect(flags.some((c) => c.value === '--env')).toBe(true);
    expect(flags.some((c) => c.value === '--replicas')).toBe(true);
    expect(flags.some((c) => c.value === '--verbose')).toBe(true);
    expect(flags.some((c) => c.value === '--no-verbose')).toBe(true);
  });

  it('resolves select parameter choice items following flag', () => {
    const { config } = setup();

    const envChoices = resolveCompletions(config, ['deploy', '--env', '']);

    expect(envChoices.map((c) => c.value)).toEqual(['development', 'staging', 'production']);

    const filteredEnv = resolveCompletions(config, ['deploy', '--env', 'prod']);

    expect(filteredEnv).toHaveLength(1);
    expect(filteredEnv[0]?.value).toBe('production');

    const replicaChoices = resolveCompletions(config, ['deploy', '-r', '']);

    expect(replicaChoices.map((c) => c.value)).toEqual(['1', '3', '5']);
  });

  it('resolves completion suggestions for text parameters configured with items', () => {
    const { config } = setup();

    const taskChoices = resolveCompletions(config, ['add-task', '']);

    expect(taskChoices.some((c) => c.value === 'Ticket-100')).toBe(true);
    expect(taskChoices.some((c) => c.value === 'Ticket-200')).toBe(true);

    const filteredChoices = resolveCompletions(config, ['add-task', 'Tick']);

    expect(filteredChoices.map((c) => c.value)).toEqual(['Ticket-100', 'Ticket-200']);
  });

  it('accepts unlisted custom values for text parameters with items without throwing', async () => {
    const { cli } = setup();

    const result = await cli.execute(['add-task', 'Ticket-999-new']);

    expect(result.params.task).toBe('Ticket-999-new');
  });

  it('generates shell completion scripts for bash, zsh, and fish', () => {
    const bashScript = generateCompletionScript('bash', 'deployer');

    expect(bashScript).toContain('_deployer_completions()');
    expect(bashScript).toContain('complete -o default -F _deployer_completions deployer');

    const zshScript = generateCompletionScript('zsh', 'deployer');

    expect(zshScript).toContain('#compdef deployer');
    expect(zshScript).toContain("_describe 'deployer' completions");

    const fishScript = generateCompletionScript('fish', 'deployer');

    expect(fishScript).toContain('complete -c deployer -f -a "(__deployer_complete)"');
  });

  it('formats completion items according to shell requirements', () => {
    const items = [
      { description: 'Development environment', value: 'development' },
      { description: 'Production environment', value: 'production' },
    ];

    const bashFormat = formatCompletionsForShell(items, 'bash');

    expect(bashFormat).toBe('development\nproduction');

    const zshFormat = formatCompletionsForShell(items, 'zsh');

    expect(zshFormat).toBe(
      'development:Development environment\nproduction:Production environment',
    );

    const fishFormat = formatCompletionsForShell(items, 'fish');

    expect(fishFormat).toBe(
      'development\tDevelopment environment\nproduction\tProduction environment',
    );
  });

  it('executes built-in completion script generation through CLI', async () => {
    const { cli } = setup();

    const bashResult = await cli.execute(['completion', 'bash']);

    expect(bashResult.triggers).toBe('completion');
    expect(String(bashResult.params.output)).toContain('_deployer_completions');

    const zshResult = await cli.execute(['completion', 'zsh']);

    expect(String(zshResult.params.output)).toContain('#compdef deployer');
  });

  it('executes dynamic completion queries through CLI complete subcommand', async () => {
    const { cli } = setup();

    const result = await cli.execute([
      'completion',
      'complete',
      'zsh',
      '--',
      'deploy',
      '--env',
      'dev',
    ]);

    expect(result.triggers).toBe('completion');
    expect(String(result.params.output)).toContain('development:Choice for env');
  });

  it('prompts interactively for missing select parameter in TTY mode', async () => {
    const { cli, createMockStreams } = setup();
    const { input, output } = createMockStreams();

    const executionPromise = cli.execute({
      args: ['deploy'],
      input,
      output,
    });

    setTimeout(() => {
      input.emit('data', '\r');
      setTimeout(() => {
        input.emit('data', '\r');
      }, 10);
    }, 10);

    const result = await executionPromise;

    expect(result.params.env).toBe('development');
    expect(result.params.replicas).toBe(1);
  });

  it('accepts CLI select arguments directly without prompting', async () => {
    const { cli } = setup();

    const result = await cli.execute(['deploy', '--env', 'production', '-r', '5']);

    expect(result.params.env).toBe('production');
    expect(result.params.replicas).toBe(5);
  });
});

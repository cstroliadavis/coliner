import { afterEach, describe, expect, it, mock } from 'bun:test';
import { createColiner } from '../src/coliner.js';
import type { CliConfig } from '../src/types.js';

describe('coliner', () => {
  const setup = () => {
    const sampleConfig: CliConfig = {
      commands: [
        {
          description: 'Deploy application services',
          isDefault: true,
          name: 'deploy',
          params: [
            { description: 'Target environment', name: 'env', type: 'text' },
            { alias: 'r', default: 'us-central1', name: 'region', type: 'text' },
            { alias: 'f', name: 'force', negator: true, type: 'flag' },
          ],
          triggers: 'deploy-triggered',
        },
        {
          description: 'Rollback deployments',
          name: 'rollback',
          params: [
            { description: 'Revision ID', name: 'revision', type: 'number' },
          ],
          triggers: 'rollback-triggered',
        },
      ],
      description: 'Test deployment CLI tool',
      name: 'deploy-cli',
      version: '1.0.0',
    };

    const cli = createColiner(sampleConfig);

    return Object.freeze({
      cli,
      sampleConfig,
    });
  };

  afterEach(() => {
    // Teardown per unit-test-setup
  });

  it('triggers registered event listeners with parsed parameters', async () => {
    const { cli } = setup();
    const handler = mock();

    cli.on('deploy-triggered', handler);

    const result = await cli.execute([
      'deploy',
      'production',
      '--region',
      'europe-west1',
      '-f',
    ]);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(result);
    expect(result.params.env).toBe('production');
    expect(result.params.region).toBe('europe-west1');
    expect(result.params.force).toBe(true);
    expect(result.triggers).toBe('deploy-triggered');
  });

  it('uses default command when no command name is specified', async () => {
    const { cli } = setup();
    const handler = mock();

    cli.on('deploy-triggered', handler);

    const result = await cli.execute(['staging', '--no-force']);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.command.name).toBe('deploy');
    expect(result.params.env).toBe('staging');
    expect(result.params.force).toBe(false);
    expect(result.params.region).toBe('us-central1');
  });

  it('renders command-specific help information', () => {
    const { cli } = setup();

    const helpText = cli.getHelp('deploy');
    expect(helpText).toContain('Command: deploy');
    expect(helpText).toContain('Triggers: \'deploy-triggered\'');
    expect(helpText).toContain('--env <text>');
    expect(helpText).toContain('-f, --force, [--no-force]');
  });

  it('renders general help information with all commands', () => {
    const { cli } = setup();

    const generalHelp = cli.getHelp();
    expect(generalHelp).toContain('deploy-cli v1.0.0');
    expect(generalHelp).toContain('deploy (default)');
    expect(generalHelp).toContain('rollback');
  });

  it('handles help command execution without error', async () => {
    const { cli } = setup();

    const result = await cli.execute(['--help']);
    expect(result.triggers).toBe('help');
    expect(result.params.text).toContain('deploy-cli');
  });
});

import path from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';

interface CliResult {
  exitCode: number;
  payload?: Record<string, unknown>;
  stderr: string;
  stdout: string;
}

/**
 * Spawns CLI executable binary as a subprocess and captures standard streams.
 */
async function spawnCli(args: string[], options: { stdin?: string } = {}): Promise<CliResult> {
  const binPath = path.resolve('bin/coliner.ts');
  const proc = Bun.spawn(['bun', 'run', binPath, '--config', 'example/cli.yaml', ...args], {
    stdin: options.stdin ? 'pipe' : undefined,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  if (options.stdin && proc.stdin) {
    proc.stdin.write(options.stdin);
    proc.stdin.end();
  }

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  let payload: Record<string, unknown> | undefined;
  const match = stdout.match(/\{[\s\S]*\}/);

  if (match) {
    try {
      payload = JSON.parse(match[0]);
    } catch {
      // Ignored if output does not contain JSON payload
    }
  }

  return { exitCode, payload, stderr, stdout };
}

describe('e2e cli execution', () => {
  const setup = () => {
    return Object.freeze({
      run: spawnCli,
    });
  };

  afterEach(() => {
    // Teardown per unit-test-setup
  });

  it('executes complex commands prioritizing named flags over positionals', async () => {
    const { run } = setup();

    const result = await run([
      'some-command',
      'My first Param is assigned to the first parameter',
      '--some-param=assigned to some-param',
      '-a',
      'assigned to the command with alias a',
      'Assuming that the param with alias a was the second param, this value will be assigned to the 3rd param',
      '4',
      'true',
      'this will be assigned to the 6th param and the previous 2 would have been assigned to the 4th and 5th respectively',
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('[Event Triggered: some-command-event]');
    expect(result.payload?.['param-1']).toBe('My first Param is assigned to the first parameter');
    expect(result.payload?.['param-2']).toBe('assigned to the command with alias a');
    expect(result.payload?.['param-4']).toBe(4);
    expect(result.payload?.['param-5']).toBe(true);
    expect(result.payload?.['some-param']).toBe('assigned to some-param');
  });

  it('assigns schema defaults when optional parameters are omitted', async () => {
    const { run } = setup();

    const result = await run(['user-add', 'alice', '-e', 'alice@example.com', '--no-active']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('[Event Triggered: user-added]');
    expect(result.payload?.username).toBe('alice');
    expect(result.payload?.email).toBe('alice@example.com');
    expect(result.payload?.age).toBe(18);
    expect(result.payload?.role).toBe('member');
    expect(result.payload?.active).toBe(false);
  });

  it('captures piped standard input in subprocess execution', async () => {
    const { run } = setup();

    const result = await run(['fetch-data', 'https://example.com/api', 'package.json', '-'], {
      stdin: 'Piped content from stdin stream',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('[Event Triggered: data-fetched]');
    expect(result.payload?.['source-url']).toBe('https://example.com/api');
    expect(result.payload?.['input-stream']).toBe('Piped content from stdin stream');
  });

  it('exits with status 1 and error message on invalid number input', async () => {
    const { run } = setup();

    const result = await run(['user-add', 'bob', '--age', 'not-a-number']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Parameter 'age' expects a valid number");
  });

  it('exits with status 1 and error message on invalid select choice', async () => {
    const { run } = setup();

    const result = await run(['deploy', '-e', 'invalid-env']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "Parameter 'environment' expects one of [development, staging, production]",
    );
  });

  it('renders global help screen with status code 0', async () => {
    const { run } = setup();

    const result = await run(['--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('my-cli v1.0.0');
    expect(result.stdout).toContain('some-command (default)');
    expect(result.stdout).toContain('user-add');
    expect(result.stdout).toContain('deploy');
  });

  it('renders command-specific help screen with status code 0', async () => {
    const { run } = setup();
    const result = await run(['help', 'deploy']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Command: deploy');
    expect(result.stdout).toContain('-e, --environment <select>');
    expect(result.stdout).toContain('-r, --replicas <select>');
  });

  it('generates shell completion scripts for all supported shells', async () => {
    const { run } = setup();
    const zsh = await run(['completion', 'zsh']);

    expect(zsh.exitCode).toBe(0);
    expect(zsh.stdout).toContain('#compdef my-cli');

    const bash = await run(['completion', 'bash']);

    expect(bash.exitCode).toBe(0);
    expect(bash.stdout).toContain('_my_cli_completions()');

    const fish = await run(['completion', 'fish']);

    expect(fish.exitCode).toBe(0);
    expect(fish.stdout).toContain('__my_cli_complete');
  });

  it('resolves dynamic completion queries through subprocess CLI complete command', async () => {
    const { run } = setup();
    const result = await run(['completion', 'complete', 'zsh', '--', 'deploy', '-e', '']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('development:Choice for environment');
    expect(result.stdout).toContain('staging:Choice for environment');
    expect(result.stdout).toContain('production:Choice for environment');
  });
});

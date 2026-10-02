import { afterEach, describe, expect, it } from 'bun:test';
import { createArgParser } from '../src/arg-parser.js';
import type { CommandConfig } from '../src/types.js';

describe('arg-parser', () => {
  const setup = () => {
    const parser = createArgParser();

    return Object.freeze({
      parser,
    });
  };

  afterEach(() => {
    // Teardown per unit-test-setup
  });

  it('parses the user example correctly prioritizing named arguments over positionals', () => {
    const { parser } = setup();

    const command: CommandConfig = {
      name: 'some-command',
      params: [
        { name: 'param-1', type: 'text' },
        { alias: 'a', name: 'param-2', type: 'text' },
        { name: 'param-3', type: 'text' },
        { name: 'param-4', type: 'number' },
        { name: 'param-5', type: 'flag' },
        { name: 'param-6', type: 'text' },
        { name: 'some-param', type: 'text' },
      ],
      triggers: 'example-triggered',
    };

    const rawArgs = [
      'My first Param is assigned to the first parameter',
      '--some-param=assigned to some-param',
      '-a',
      'assigned to the command with alias a',
      'Assuming that the param with alias a was the second param, this value will be assigned to the 3rd param',
      '4',
      'true',
      'this will be assigned to the 6th param and the previous 2 would have been assigned to the 4th and 5th respectively',
    ];

    const result = parser.parseCommandArgs(command, rawArgs);

    expect(result['param-1']).toBe('My first Param is assigned to the first parameter');
    expect(result['param-2']).toBe('assigned to the command with alias a');
    expect(result['param-3']).toBe(
      'Assuming that the param with alias a was the second param, this value will be assigned to the 3rd param'
    );
    expect(result['param-4']).toBe(4);
    expect(result['param-5']).toBe(true);
    expect(result['param-6']).toBe(
      'this will be assigned to the 6th param and the previous 2 would have been assigned to the 4th and 5th respectively'
    );
    expect(result['some-param']).toBe('assigned to some-param');
  });

  it('handles chained single-character flags', () => {
    const { parser } = setup();

    const command: CommandConfig = {
      name: 'archive',
      params: [
        { alias: 'a', name: 'all', type: 'flag' },
        { alias: 'b', name: 'brief', type: 'flag' },
        { alias: 'c', name: 'compress', type: 'flag' },
        { name: 'target', type: 'text' },
      ],
      triggers: 'archive-event',
    };

    const result = parser.parseCommandArgs(command, ['-abc', 'output.tar']);

    expect(result.all).toBe(true);
    expect(result.brief).toBe(true);
    expect(result.compress).toBe(true);
    expect(result.target).toBe('output.tar');
  });

  it('handles negators with --no- prefix', () => {
    const { parser } = setup();

    const command: CommandConfig = {
      name: 'build',
      params: [
        { default: true, name: 'cache', negator: true, type: 'flag' },
        { name: 'minify', negator: true, type: 'flag' },
      ],
      triggers: 'build-event',
    };

    const result = parser.parseCommandArgs(command, ['--no-cache', '--minify']);

    expect(result.cache).toBe(false);
    expect(result.minify).toBe(true);
  });

  it('assigns defaults when parameters are omitted', () => {
    const { parser } = setup();

    const command: CommandConfig = {
      name: 'serve',
      params: [
        { default: 3000, name: 'port', type: 'number' },
        { default: 'localhost', name: 'host', type: 'text' },
        { name: 'open', type: 'flag' },
      ],
      triggers: 'serve-event',
    };

    const result = parser.parseCommandArgs(command, []);

    expect(result.port).toBe(3000);
    expect(result.host).toBe('localhost');
    expect(result.open).toBe(false);
  });
});

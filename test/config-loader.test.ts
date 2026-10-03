import { afterEach, describe, expect, it } from 'bun:test';
import { createConfigLoader } from '../src/config-loader.js';

describe('config-loader', () => {
  const setup = () => {
    const loader = createConfigLoader();

    return Object.freeze({
      loader,
    });
  };

  afterEach(() => {
    // Teardown per unit-test-setup
  });

  it('parses valid YAML configuration with commands and parameters', () => {
    const { loader } = setup();

    const yamlContent = `
commands:
  - name: create-user
    description: Create a new system user
    isDefault: true
    triggers: user-created
    params:
      - name: username
        description: The login username
        type: text
      - name: age
        type: number
        default: 18
      - name: admin
        type: flag
        negator: true
        alias: [a, adm]
`;

    const config = loader.parseConfigString(yamlContent);

    expect(config.commands.length).toBe(1);
    expect(config.commands[0].name).toBe('create-user');
    expect(config.commands[0].isDefault).toBe(true);
    expect(config.commands[0].triggers).toBe('user-created');
    expect(config.commands[0].params?.length).toBe(3);
    expect(config.commands[0].params?.[2].negator).toBe(true);
  });

  it('parses valid JSON configuration', () => {
    const { loader } = setup();

    const jsonContent = JSON.stringify({
      commands: [
        {
          name: 'ping',
          triggers: 'ping-event',
        },
      ],
    });

    const config = loader.parseConfigString(jsonContent);

    expect(config.commands[0].name).toBe('ping');
    expect(config.commands[0].triggers).toBe('ping-event');
  });

  it('rejects configurations missing triggers event', () => {
    const { loader } = setup();

    const invalidYaml = `
commands:
  - name: invalid-cmd
`;

    expect(() => loader.parseConfigString(invalidYaml)).toThrow(/triggers/);
  });

  it('rejects multiple default commands', () => {
    const { loader } = setup();

    const invalidYaml = `
commands:
  - name: first
    isDefault: true
    triggers: first-event
  - name: second
    isDefault: true
    triggers: second-event
`;

    expect(() => loader.parseConfigString(invalidYaml)).toThrow(/default/);
  });

  it('rejects invalid parameter types', () => {
    const { loader } = setup();

    const invalidYaml = `
commands:
  - name: test-cmd
    triggers: test-event
    params:
      - name: bad-param
        type: unsupported-type
`;

    expect(() => loader.parseConfigString(invalidYaml)).toThrow(/invalid type/);
  });

  it('accepts time as a valid parameter type', () => {
    const { loader } = setup();

    const validYaml = `
commands:
  - name: log-time
    triggers: time-logged
    params:
      - name: start
        type: time
`;

    const config = loader.parseConfigString(validYaml);

    expect(config.commands[0]?.params?.[0]?.type).toBe('time');
  });
});

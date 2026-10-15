import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'bun:test';
import { promptSelect } from '../src/select-prompt.js';

describe('select-prompt', () => {
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

  it('rejects when executed in non-interactive environment', async () => {
    const input = new EventEmitter() as EventEmitter & { isTTY?: boolean };

    input.isTTY = false;

    const promise = promptSelect({
      input,
      items: ['a', 'b'],
      output: { write: () => true },
      paramName: 'test',
    });

    await expect(promise).rejects.toThrow('non-interactive terminal');
  });

  it('selects first item on immediate Enter keypress', async () => {
    const { input, output } = createMockStreams();

    const promise = promptSelect({
      input,
      items: ['alpha', 'beta', 'gamma'],
      output,
      paramName: 'greek',
    });

    input.emit('data', '\r');

    const result = await promise;

    expect(result).toBe('alpha');
  });

  it('navigates with down arrow key to select second item', async () => {
    const { input, output } = createMockStreams();

    const promise = promptSelect({
      input,
      items: ['alpha', 'beta', 'gamma'],
      output,
      paramName: 'greek',
    });

    input.emit('data', '\u001b[B'); // down arrow
    input.emit('data', '\n');

    const result = await promise;

    expect(result).toBe('beta');
  });

  it('filters items by typed characters before selecting', async () => {
    const { input, output } = createMockStreams();

    const promise = promptSelect({
      input,
      items: ['apple', 'banana', 'cherry'],
      output,
      paramName: 'fruit',
    });

    input.emit('data', 'c');
    input.emit('data', 'h');
    input.emit('data', '\r');

    const result = await promise;

    expect(result).toBe('cherry');
  });

  it('submits custom typed value when allowCustom is true and no item matches filter', async () => {
    const { input, output } = createMockStreams();

    const promise = promptSelect({
      allowCustom: true,
      input,
      items: ['alpha', 'beta'],
      output,
      paramName: 'item',
    });

    input.emit('data', 'c');
    input.emit('data', 'u');
    input.emit('data', 's');
    input.emit('data', 't');
    input.emit('data', 'o');
    input.emit('data', 'm');
    input.emit('data', '\r');

    const result = await promise;

    expect(result).toBe('custom');
  });

  it('rejects on cancellation with ctrl-c', async () => {
    const { input, output } = createMockStreams();

    const promise = promptSelect({
      input,
      items: ['apple', 'banana'],
      output,
      paramName: 'fruit',
    });

    input.emit('data', '\u0003');

    await expect(promise).rejects.toThrow('User cancelled prompt');
  });
});

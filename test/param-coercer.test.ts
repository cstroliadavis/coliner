import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import { createParamCoercer } from '../src/param-coercer.js';

describe('param-coercer', () => {
  const setup = () => {
    const tempDir = path.resolve(process.cwd(), 'scratch-test');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const testFile = path.resolve(tempDir, 'sample.txt');
    fs.writeFileSync(testFile, 'hello file content');

    const coercer = createParamCoercer(tempDir);

    return Object.freeze({
      coercer,
      tempDir,
      testFile,
    });
  };

  afterEach(() => {
    const tempDir = path.resolve(process.cwd(), 'scratch-test');
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('coerces and validates number parameters', () => {
    const { coercer } = setup();

    expect(coercer.coerce({ name: 'count', type: 'number' }, '42')).toBe(42);
    expect(coercer.coerce({ name: 'rate', type: 'number' }, '3.14')).toBe(3.14);
    expect(() => coercer.coerce({ name: 'invalid', type: 'number' }, 'abc')).toThrow(
      TypeError
    );
  });

  it('coerces and validates date parameters', () => {
    const { coercer } = setup();

    const date = coercer.coerce({ name: 'created', type: 'date' }, '2026-10-02') as Date;
    expect(date).toBeInstanceOf(Date);
    expect(date.getFullYear()).toBe(2026);
    expect(() => coercer.coerce({ name: 'invalid', type: 'date' }, 'not-a-date')).toThrow(
      TypeError
    );
  });

  it('coerces and validates boolean flags', () => {
    const { coercer } = setup();

    expect(coercer.coerce({ name: 'verbose', type: 'flag' }, true)).toBe(true);
    expect(coercer.coerce({ name: 'verbose', type: 'flag' }, 'yes')).toBe(true);
    expect(coercer.coerce({ name: 'verbose', type: 'flag' }, 'false')).toBe(false);
    expect(coercer.coerce({ name: 'verbose', type: 'flag' }, undefined)).toBe(false);
    expect(() => coercer.coerce({ name: 'verbose', type: 'flag' }, 'maybe')).toThrow(
      TypeError
    );
  });

  it('coerces and validates url parameters', () => {
    const { coercer } = setup();

    const url = coercer.coerce(
      { name: 'endpoint', type: 'url' },
      'https://example.com/api'
    ) as URL;
    expect(url).toBeInstanceOf(URL);
    expect(url.hostname).toBe('example.com');
    expect(() => coercer.coerce({ name: 'invalid', type: 'url' }, 'invalid-url')).toThrow(
      TypeError
    );
  });

  it('coerces and validates keyword parameters', () => {
    const { coercer } = setup();

    expect(coercer.coerce({ name: 'action', type: 'keyword' }, 'deploy-app')).toBe(
      'deploy-app'
    );
    expect(() =>
      coercer.coerce({ name: 'action', type: 'keyword' }, 'hello world with spaces')
    ).toThrow(TypeError);
  });

  it('coerces and validates file paths confirming file existence', () => {
    const { coercer, testFile } = setup();

    const resolved = coercer.coerce({ name: 'input', type: 'file' }, 'sample.txt');
    expect(resolved).toBe(testFile);
    expect(() =>
      coercer.coerce({ name: 'input', type: 'file' }, 'non-existent-file.xyz')
    ).toThrow();
  });

  it('resolves stdin input when provided', () => {
    const { coercer } = setup();

    const result = coercer.coerce(
      { name: 'piped', type: 'stdin' },
      '-',
      { stdinContent: 'stream data' }
    );
    expect(result).toBe('stream data');
  });
});

import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';
import ts from 'typescript';

const source = await readFile(
  new URL('../src/utils/language.ts', import.meta.url),
  'utf8'
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const language = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

test('resolveLanguage defaults to Chinese and accepts English', () => {
  assert.equal(language.resolveLanguage(null), 'zh-CN');
  assert.equal(language.resolveLanguage('unsupported'), 'zh-CN');
  assert.equal(language.resolveLanguage('zh-CN'), 'zh-CN');
  assert.equal(language.resolveLanguage('en'), 'en');
});

test('stored language is persisted and storage failures are safe', () => {
  const originalWindow = globalThis.window;
  const values = new Map();

  try {
    globalThis.window = {
      localStorage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
      },
    };

    assert.equal(language.persistLanguage('en'), true);
    assert.equal(language.getStoredLanguage(), 'en');

    globalThis.window.localStorage.getItem = () => {
      throw new Error('storage unavailable');
    };
    globalThis.window.localStorage.setItem = () => {
      throw new Error('storage unavailable');
    };

    assert.equal(language.getStoredLanguage(), 'zh-CN');
    assert.equal(language.persistLanguage('en'), false);
  } finally {
    if (originalWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  }
});

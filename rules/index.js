import { guardPatternsRule } from './guard-patterns.js';
import { preferIncludesRule } from './prefer-includes.js';
import { sortFunctionDeclarationsRule } from './sort-function-declarations.js';

export default {
  meta: {
    name: 'local',
  },
  rules: {
    'guard-patterns': guardPatternsRule,
    'prefer-includes': preferIncludesRule,
    'sort-function-declarations': sortFunctionDeclarationsRule,
  },
};

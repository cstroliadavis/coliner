import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';
import prettier from 'eslint-config-prettier';

const localControlFlowPlugin = {
  rules: {
    'prefer-includes': {
      meta: {
        docs: {
          description:
            'Enforce Array.prototype.includes or String.prototype.includes over chained || equality checks',
        },
        fixable: 'code',
        messages: {
          preferArrayIncludes:
            'Use [{{candidates}}].includes({{target}}) instead of chained || equality checks.',
          preferStringIncludes:
            "Use '{{candidates}}'.includes({{target}}) instead of chained || equality checks.",
        },
        type: 'suggestion',
      },
      create(context) {
        const sourceCode = context.sourceCode || context.getSourceCode();

        function flattenOrChain(node) {
          const branches = [];

          function walk(n) {
            if (n.type === 'LogicalExpression' && n.operator === '||') {
              walk(n.left);
              walk(n.right);
            } else {
              branches.push(n);
            }
          }

          walk(node);

          return branches;
        }

        function getEqualityBranch(branch) {
          if (branch.type !== 'BinaryExpression') return null;

          if (branch.operator !== '===' && branch.operator !== '==') return null;

          if (branch.right.type === 'Literal') {
            return {
              raw: sourceCode.getText(branch.right),
              target: sourceCode.getText(branch.left),
              val: branch.right.value,
            };
          }

          if (branch.left.type === 'Literal') {
            return {
              raw: sourceCode.getText(branch.left),
              target: sourceCode.getText(branch.right),
              val: branch.left.value,
            };
          }

          return null;
        }

        return {
          LogicalExpression(node) {
            if (node.operator !== '||') return;

            if (
              node.parent &&
              node.parent.type === 'LogicalExpression' &&
              node.parent.operator === '||'
            ) {
              return;
            }

            const branches = flattenOrChain(node);

            if (branches.length < 2) return;

            const eqList = branches.map(getEqualityBranch);

            if (eqList.some((e) => e === null)) return;

            const firstTarget = eqList[0].target;

            if (!eqList.every((e) => e.target === firstTarget)) return;

            const isAllSingleCharStrings = eqList.every(
              (e) =>
                typeof e.val === 'string' && e.val.length === 1 && !/[\r\n\t\b\f\0\\]/.test(e.val),
            );

            if (isAllSingleCharStrings) {
              const chars = eqList.map((e) => e.val).join('');
              const replacement = `'${chars}'.includes(${firstTarget})`;

              context.report({
                data: { candidates: chars, target: firstTarget },
                fix(fixer) {
                  return fixer.replaceText(node, replacement);
                },
                messageId: 'preferStringIncludes',
                node,
              });
            } else {
              const candidates = eqList.map((e) => e.raw).join(', ');
              const replacement = `[${candidates}].includes(${firstTarget})`;

              context.report({
                data: { candidates, target: firstTarget },
                fix(fixer) {
                  return fixer.replaceText(node, replacement);
                },
                messageId: 'preferArrayIncludes',
                node,
              });
            }
          },
        };
      },
    },
    'guard-patterns': {
      meta: {
        docs: {
          description:
            'Enforce single-line syntax without braces for guards (return, continue, break, yield) <= maxLen, and multiline with braces for all other if statements.',
        },
        fixable: 'code',
        messages: {
          preferSingleLineGuard: 'Guard statement must be written on a single line without braces.',
          requireAlternateBracesAndMultiline:
            'Else clause must have braces and span multiple lines.',
          requireBracesAndMultiline:
            'Non-guard if statement must have braces and span multiple lines.',
          requireMultilineForLongGuard:
            'Guard statement exceeding {{maxLen}} characters must have braces and span multiple lines.',
        },
        schema: [
          {
            additionalProperties: false,
            properties: {
              maxLen: { type: 'number' },
            },
            type: 'object',
          },
        ],
        type: 'layout',
      },
      create(context) {
        const sourceCode = context.sourceCode || context.getSourceCode();
        const options = context.options[0] || {};
        const maxLen = typeof options.maxLen === 'number' ? options.maxLen : 100;

        function checkAlternate(node, indent) {
          if (!node.alternate || node.alternate.type === 'IfStatement') return;

          if (node.alternate.type !== 'BlockStatement') {
            context.report({
              fix(fixer) {
                const altText = sourceCode.getText(node.alternate).trim();

                return fixer.replaceText(node.alternate, `{\n${indent}  ${altText}\n${indent}}`);
              },
              messageId: 'requireAlternateBracesAndMultiline',
              node: node.alternate,
            });
          } else if (node.alternate.loc.start.line === node.alternate.loc.end.line) {
            context.report({
              fix(fixer) {
                const altBodyText = node.alternate.body
                  .map((s) => sourceCode.getText(s).trim())
                  .join(`\n${indent}  `);

                return fixer.replaceText(
                  node.alternate,
                  `{\n${indent}  ${altBodyText}\n${indent}}`,
                );
              },
              messageId: 'requireAlternateBracesAndMultiline',
              node: node.alternate,
            });
          }
        }

        function getIndent(node) {
          const line = sourceCode.lines[node.loc.start.line - 1] || '';
          const match = line.match(/^\s*/);

          return match ? match[0] : '';
        }

        function hasCommentsInside(node) {
          return sourceCode.getCommentsInside(node).length > 0;
        }

        function isGuardStatement(stmt) {
          if (!stmt) return false;

          if (['ReturnStatement', 'ContinueStatement', 'BreakStatement'].includes(stmt.type)) {
            return true;
          }

          if (
            stmt.type === 'ExpressionStatement' &&
            stmt.expression &&
            stmt.expression.type === 'YieldExpression'
          ) {
            return true;
          }

          return false;
        }

        return {
          IfStatement(node) {
            const hasAlternate = node.alternate !== null;
            let singleStatement = null;
            let isBlock = false;

            if (node.consequent.type === 'BlockStatement') {
              isBlock = true;

              if (node.consequent.body.length === 1) {
                singleStatement = node.consequent.body[0];
              }
            } else {
              singleStatement = node.consequent;
            }

            const isGuard =
              !hasAlternate && singleStatement !== null && isGuardStatement(singleStatement);
            const indent = getIndent(node);

            if (isGuard) {
              const testText = sourceCode.getText(node.test).trim();
              let stmtText = sourceCode.getText(singleStatement).trim();

              if (!stmtText.endsWith(';')) {
                stmtText += ';';
              }

              const hasComments = hasCommentsInside(node);
              const singleLineTest = testText.replace(/\s+/g, ' ');
              const singleLineStmt = stmtText.replace(/\s+/g, ' ');
              const singleLineCandidate = `${indent}if (${singleLineTest}) ${singleLineStmt}`;

              const fitsOnSingleLine =
                !hasComments &&
                !singleLineTest.includes('\n') &&
                !singleLineStmt.includes('\n') &&
                singleLineCandidate.length <= maxLen;

              if (fitsOnSingleLine) {
                const isSingleLineWithoutBraces =
                  !isBlock && node.loc.start.line === node.loc.end.line;

                if (!isSingleLineWithoutBraces) {
                  context.report({
                    fix(fixer) {
                      return fixer.replaceText(node, `if (${singleLineTest}) ${singleLineStmt}`);
                    },
                    messageId: 'preferSingleLineGuard',
                    node,
                  });
                }

                return;
              }

              if (!isBlock) {
                context.report({
                  data: { maxLen: String(maxLen) },
                  fix(fixer) {
                    return fixer.replaceText(
                      node.consequent,
                      `{\n${indent}  ${stmtText}\n${indent}}`,
                    );
                  },
                  messageId: 'requireMultilineForLongGuard',
                  node: node.consequent,
                });

                return;
              }

              if (node.consequent.loc.start.line === node.consequent.loc.end.line) {
                context.report({
                  data: { maxLen: String(maxLen) },
                  fix(fixer) {
                    return fixer.replaceText(
                      node.consequent,
                      `{\n${indent}  ${stmtText}\n${indent}}`,
                    );
                  },
                  messageId: 'requireMultilineForLongGuard',
                  node: node.consequent,
                });

                return;
              }

              return;
            }

            if (!isBlock) {
              context.report({
                fix(fixer) {
                  const stmtText = sourceCode.getText(node.consequent).trim();

                  return fixer.replaceText(
                    node.consequent,
                    `{\n${indent}  ${stmtText}\n${indent}}`,
                  );
                },
                messageId: 'requireBracesAndMultiline',
                node: node.consequent,
              });
            } else if (node.consequent.loc.start.line === node.consequent.loc.end.line) {
              context.report({
                fix(fixer) {
                  const bodyText = node.consequent.body
                    .map((s) => sourceCode.getText(s).trim())
                    .join(`\n${indent}  `);

                  return fixer.replaceText(
                    node.consequent,
                    `{\n${indent}  ${bodyText}\n${indent}}`,
                  );
                },
                messageId: 'requireBracesAndMultiline',
                node: node.consequent,
              });
            }

            checkAlternate(node, indent);
          },
        };
      },
    },
    'sort-function-declarations': {
      meta: {
        docs: {
          description:
            'Enforce alphabetical sorting of function declarations, separating internal helpers from exported functions',
        },
        fixable: 'code',
        messages: {
          sortExported:
            "Function '{{current}}' (exported) should appear before '{{expected}}' in alphabetical order.",
          sortInternal:
            "Function '{{current}}' should appear before '{{expected}}' in alphabetical order.",
          sortInternalBeforeExported:
            "Function '{{current}}' (internal helper) should be declared before exported functions.",
        },
        type: 'suggestion',
      },
      create(context) {
        const sourceCode = context.sourceCode || context.getSourceCode();

        function checkBlock(node) {
          const funcs = [];

          for (const stmt of node.body) {
            let funcNode = null;
            let isExported = false;

            if (stmt.type === 'FunctionDeclaration') {
              funcNode = stmt;
            } else if (
              ['ExportNamedDeclaration', 'ExportDefaultDeclaration'].includes(stmt.type) &&
              stmt.declaration &&
              stmt.declaration.type === 'FunctionDeclaration'
            ) {
              funcNode = stmt.declaration;
              isExported = true;
            }

            if (funcNode && funcNode.id) {
              const targetStmt = isExported ? stmt : funcNode;
              const prevToken = sourceCode.getTokenBefore(targetStmt, { includeComments: false });
              const allComments = sourceCode.getCommentsBefore(targetStmt);
              const comments = prevToken
                ? allComments.filter((c) => c.range[0] >= prevToken.range[1])
                : allComments;
              const start = comments.length > 0 ? comments[0].range[0] : targetStmt.range[0];
              const end = targetStmt.range[1];

              funcs.push({
                end,
                isExported,
                name: funcNode.id.name,
                node: targetStmt,
                start,
                text: sourceCode.text.slice(start, end),
              });
            }
          }

          if (funcs.length <= 1) return;

          const sorted = sortFunctions(funcs);
          const isSorted = funcs.every((f, idx) => f.name === sorted[idx].name);

          if (isSorted) return;

          for (let i = 0; i < funcs.length; i++) {
            if (funcs[i].name !== sorted[i].name) {
              const current = sorted[i];
              const expectedAtSlot = funcs[i];

              let messageId = 'sortInternal';

              if (current.isExported && expectedAtSlot.isExported) {
                messageId = 'sortExported';
              } else if (!current.isExported && expectedAtSlot.isExported) {
                messageId = 'sortInternalBeforeExported';
              }

              context.report({
                data: {
                  current: current.name,
                  expected: expectedAtSlot.name,
                },
                fix(fixer) {
                  return funcs.map((orig, idx) =>
                    fixer.replaceTextRange([orig.start, orig.end], sorted[idx].text),
                  );
                },
                messageId,
                node: expectedAtSlot.node,
              });

              break;
            }
          }
        }

        function sortFunctions(funcs) {
          const internal = funcs
            .filter((f) => !f.isExported)
            .sort((x, y) => x.name.localeCompare(y.name));
          const exported = funcs
            .filter((f) => f.isExported)
            .sort((x, y) => x.name.localeCompare(y.name));

          return [...internal, ...exported];
        }

        return {
          BlockStatement: checkBlock,
          Program: checkBlock,
        };
      },
    },
  },
};

export default tseslint.config(
  {
    ignores: ['dist/**', 'docs/**', 'node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
    },
  },
  {
    plugins: {
      '@stylistic': stylistic,
      local: localControlFlowPlugin,
    },
    rules: {
      'local/guard-patterns': ['error', { maxLen: 100 }],
      'local/prefer-includes': 'error',
      'local/sort-function-declarations': 'error',
      // Stylistic Rules
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/max-len': [
        'error',
        {
          code: 100,
          comments: 100,
          ignoreRegExpLiterals: true,
          ignoreTemplateLiterals: true,
          ignoreUrls: true,
          tabWidth: 2,
        },
      ],
      '@stylistic/padding-line-between-statements': [
        'error',
        { blankLine: 'always', next: '*', prev: ['const', 'let'] },
        { blankLine: 'any', next: ['const', 'let'], prev: ['const', 'let'] },
        { blankLine: 'always', next: ['return', 'continue', 'break'], prev: '*' },
        { blankLine: 'always', next: 'block-like', prev: '*' },
        { blankLine: 'always', next: '*', prev: 'block-like' },
        { blankLine: 'any', next: '*', prev: 'singleline-block-like' },
        { blankLine: 'any', next: 'singleline-block-like', prev: '*' },
      ],
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],

      // Code Metrics & Complexity Rules
      complexity: ['error', 3],
      'max-depth': ['error', 4],
      'max-lines': ['error', { max: 300, skipBlankLines: true }],
      'max-lines-per-function': ['error', 50],
      'max-params': ['error', 3],
      'max-statements': ['error', 10],
    },
  },
  {
    files: ['tests/**/*.ts', '**/*.test.ts', '**/*.spec.ts', 'eslint.config.js'],
    rules: {
      complexity: 'off',
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'max-statements': 'off',
    },
  },
  prettier,
);

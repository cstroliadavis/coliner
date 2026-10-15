/**
 * Custom ESLint Rule: guard-patterns
 * Enforces single-line syntax without braces for guards (return, continue, break, yield) <= maxLen,
 * and multiline with braces for all other if statements.
 */
export const guardPatternsRule = {
  meta: {
    docs: {
      description:
        'Enforce single-line syntax without braces for guards (return, continue, break, yield) <= maxLen, and multiline with braces for all other if statements.',
    },
    fixable: 'code',
    messages: {
      preferSingleLineGuard: 'Guard statement must be written on a single line without braces.',
      requireAlternateBracesAndMultiline: 'Else clause must have braces and span multiple lines.',
      requireBracesAndMultiline: 'Non-guard if statement must have braces and span multiple lines.',
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

            return fixer.replaceText(node.alternate, `{\n${indent}  ${altBodyText}\n${indent}}`);
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
            const isSingleLineWithoutBraces = !isBlock && node.loc.start.line === node.loc.end.line;

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
                return fixer.replaceText(node.consequent, `{\n${indent}  ${stmtText}\n${indent}}`);
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
                return fixer.replaceText(node.consequent, `{\n${indent}  ${stmtText}\n${indent}}`);
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

              return fixer.replaceText(node.consequent, `{\n${indent}  ${stmtText}\n${indent}}`);
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

              return fixer.replaceText(node.consequent, `{\n${indent}  ${bodyText}\n${indent}}`);
            },
            messageId: 'requireBracesAndMultiline',
            node: node.consequent,
          });
        }

        checkAlternate(node, indent);
      },
    };
  },
};

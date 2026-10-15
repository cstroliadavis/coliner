/**
 * Custom ESLint Rule: sort-function-declarations
 * Enforces alphabetical sorting of function declarations, separating internal helpers from exported functions.
 */
export const sortFunctionDeclarationsRule = {
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
          const prevToken = sourceCode.getTokenBefore(targetStmt, {
            includeComments: false,
          });
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
};

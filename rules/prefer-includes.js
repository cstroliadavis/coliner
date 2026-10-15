/**
 * Custom ESLint Rule: prefer-includes
 * Enforces Array.prototype.includes or String.prototype.includes over chained || equality checks.
 */
export const preferIncludesRule = {
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
          (e) => typeof e.val === 'string' && e.val.length === 1 && !/[\r\n\t\b\f\0\\]/.test(e.val),
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
};

// Lint rules, including the architecture checks from docs/ARCHITECTURE.md.
// Never disable or weaken a rule here to make a change pass (CLAUDE.md rule 2).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';
import arch from './tools/architecture.cjs';

const {
  MODULES,
  MODULE_RULES,
  ADAPTER_RULES,
  CONNECTOR_RULES,
  APP_RULES,
  CORE_ALLOWED_PACKAGES,
  AI_PACKAGES,
} = arch;

const CONTRACT = 'contract.ts';
const MODULE_UI = ['ui/index.ts', 'ui/index.tsx'];

/** An entity selector for one element (plugin v7 format). */
const el = (selector) => ({ element: selector });

/** Turn one row of the dependency table into "allow" targets for boundaries. */
function allowedTargets(rule) {
  const to = [];
  if (rule.core) to.push({ type: 'core' });
  if (rule.platform) to.push({ type: 'platform' });
  for (const name of rule.modules) {
    to.push({
      type: 'module',
      captured: { name },
      fileInternalPath: rule.moduleUi ? [CONTRACT, ...MODULE_UI] : CONTRACT,
    });
  }
  for (const [type, list] of [
    ['adapter', rule.adapters],
    ['connector', rule.connectors],
  ]) {
    for (const name of list) {
      to.push(name === '*' ? { type, fileInternalPath: CONTRACT } : { type, captured: { name }, fileInternalPath: CONTRACT });
    }
  }
  return to.map(el);
}

const policies = [
  // Files inside the same element may import each other freely.
  { allow: { dependency: { relationship: { to: 'internal' } } } },
  ...MODULES.map((name) => ({
    from: el({ type: 'module', captured: { name } }),
    allow: { to: allowedTargets(MODULE_RULES[name]) },
  })),
  { from: el({ type: 'core' }), allow: { to: [el({ type: 'core' })] } },
  { from: el({ type: 'platform' }), allow: { to: [el({ type: 'core' })] } },
  { from: el({ type: 'adapter' }), allow: { to: allowedTargets(ADAPTER_RULES) } },
  { from: el({ type: 'connector' }), allow: { to: allowedTargets(CONNECTOR_RULES) } },
  { from: el({ type: 'app' }), allow: { to: allowedTargets(APP_RULES) } },
];

/** A no-restricted-syntax list that bans the clock and randomness. */
const NO_CLOCK_OR_RANDOM = [
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: 'No clock here (P5). Pass the time in as an argument.',
  },
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message: 'No clock here (P5). `new Date()` reads the clock; pass the time in as an argument.',
  },
  {
    selector: "MemberExpression[object.name='Math'][property.name='random']",
    message: 'No randomness here (P5). Pass IDs and values in as arguments.',
  },
  {
    selector: "MemberExpression[object.name='crypto'][property.name=/^(randomUUID|getRandomValues)$/]",
    message: 'No randomness here (P5). Pass IDs and values in as arguments.',
  },
  {
    selector: "MemberExpression[object.name='performance'][property.name='now']",
    message: 'No clock here (P5). Pass the time in as an argument.',
  },
];

/** Applies everywhere: an empty catch (even one with only a comment) hides a failure. */
const NO_EMPTY_CATCH = {
  selector: 'CatchClause > BlockStatement[body.length=0]',
  message: 'No empty catch (rule 7: fail closed, fail loudly). Handle the error, raise an alert, or rethrow.',
};

const AI_IMPORT_MESSAGE = 'No AI SDKs in core or adapters (rule 8: translation is deterministic).';

export default tseslint.config(
  {
    ignores: ['node_modules/', '.next/', 'out/', 'test-results/', 'playwright-report/', 'next-env.d.ts', 'modules/_TEMPLATE/'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,cjs,mjs}'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', require: 'readonly', module: 'writable', __dirname: 'readonly' } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  // Everywhere: no empty catch blocks.
  {
    rules: {
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-restricted-syntax': ['error', NO_EMPTY_CATCH],
    },
  },
  // Architecture: the dependency table (docs/ARCHITECTURE.md), contracts only.
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'import/resolver': { typescript: { alwaysTryTypes: true, project: './tsconfig.json' } },
      'boundaries/include': ['src/**/*'],
      'boundaries/elements': [
        { type: 'core', pattern: 'src/core' },
        { type: 'platform', pattern: 'src/platform' },
        { type: 'module', pattern: 'src/modules/*', capture: ['name'] },
        { type: 'adapter', pattern: 'src/adapters/*', capture: ['name'] },
        { type: 'connector', pattern: 'src/connectors/*', capture: ['name'] },
        { type: 'app', pattern: 'src/app' },
      ],
    },
    rules: {
      'boundaries/dependencies': ['error', { default: 'disallow', policies }],
      'boundaries/no-unknown-dependencies': 'error',
      'boundaries/no-unknown-files': 'error',
    },
  },
  // Core is pure: only the listed packages, and no clock or randomness.
  {
    files: ['src/core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: `^(?!(${CORE_ALLOWED_PACKAGES.join('|')})$)(?!\\.)(?!@/core/).*`,
              message: `Core is pure: it may import only ${CORE_ALLOWED_PACKAGES.join(', ')} and its own files (spec 5.1).`,
            },
          ],
        },
      ],
      'no-restricted-syntax': ['error', NO_EMPTY_CATCH, ...NO_CLOCK_OR_RANDOM],
    },
  },
  // Adapters: no AI SDKs.
  {
    files: ['src/adapters/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: AI_PACKAGES, message: AI_IMPORT_MESSAGE }] }],
    },
  },
  // Adapter writers and readers: no clock or randomness.
  {
    files: ['src/adapters/*/writer/**/*.{ts,tsx}', 'src/adapters/*/reader/**/*.{ts,tsx}', 'src/adapters/*/writer.ts', 'src/adapters/*/reader.ts'],
    rules: {
      'no-restricted-syntax': ['error', NO_EMPTY_CATCH, ...NO_CLOCK_OR_RANDOM],
    },
  },
  // Tests inside core may also use the test runner.
  {
    files: ['src/core/**/__tests__/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: `^(?!(${[...CORE_ALLOWED_PACKAGES, 'vitest'].join('|')})$)(?!\\.)(?!@/core/).*`,
              message: `Core tests may import only ${CORE_ALLOWED_PACKAGES.join(', ')}, vitest and core's own files.`,
            },
          ],
        },
      ],
    },
  },
);

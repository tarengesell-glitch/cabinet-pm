// The second, independent check of the dependency table in docs/ARCHITECTURE.md.
// It reads the same table as eslint.config.js (tools/architecture.cjs).
// Never disable or weaken a rule here to make a change pass (CLAUDE.md rule 2).
const arch = require('./tools/architecture.cjs');

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Paths a folder may import, from one row of the table. */
function allowedPaths(rule) {
  const paths = [];
  if (rule.core) paths.push('^src/core/');
  if (rule.platform) paths.push('^src/platform/');
  for (const name of rule.modules) {
    paths.push(`^src/modules/${esc(name)}/contract\\.ts$`);
    if (rule.moduleUi) paths.push(`^src/modules/${esc(name)}/ui/index\\.tsx?$`);
  }
  for (const [folder, list] of [
    ['adapters', rule.adapters],
    ['connectors', rule.connectors],
  ]) {
    for (const name of list) {
      paths.push(name === '*' ? `^src/${folder}/[^/]+/contract\\.ts$` : `^src/${folder}/${esc(name)}/contract\\.ts$`);
    }
  }
  return paths;
}

const rule = (name, comment, fromPath, allowed) => ({
  name,
  comment,
  severity: 'error',
  from: { path: fromPath },
  to: { path: '^src/', pathNot: allowed },
});

const forbidden = [
  rule('core-is-pure', 'core imports nothing else in src (spec 5.1).', '^src/core/', ['^src/core/']),
  {
    name: 'core-packages',
    comment: `core may import only: ${arch.CORE_ALLOWED_PACKAGES.join(', ')} (spec 5.1).`,
    severity: 'error',
    from: { path: '^src/core/', pathNot: '/__tests__/' },
    to: {
      dependencyTypesNot: ['local', 'aliased-tsconfig', 'aliased-tsconfig-paths', 'aliased-tsconfig-base-url', 'aliased', 'type-only'],
      pathNot: arch.CORE_ALLOWED_PACKAGES.map((p) => `(^|/)node_modules/${esc(p)}/`),
    },
  },
  rule('platform-imports', 'platform may import core only.', '^src/platform/', ['^src/platform/', '^src/core/']),
  ...arch.MODULES.map((name) =>
    rule(
      `module-${name}`,
      `${name} may import only what docs/ARCHITECTURE.md allows, and other modules only through contract.ts.`,
      `^src/modules/${esc(name)}/`,
      [`^src/modules/${esc(name)}/`, ...allowedPaths(arch.MODULE_RULES[name])],
    ),
  ),
  rule('adapter-imports', 'adapters may import core, platform and the catalog contract only.', '^src/adapters/([^/]+)/', [
    '^src/adapters/$1/',
    ...allowedPaths(arch.ADAPTER_RULES),
  ]),
  rule('connector-imports', 'connectors may import core and platform only.', '^src/connectors/([^/]+)/', [
    '^src/connectors/$1/',
    ...allowedPaths(arch.CONNECTOR_RULES),
  ]),
  rule('app-imports', 'app may import module contracts and ui/index only, plus core and platform.', '^src/app/', [
    '^src/app/',
    ...allowedPaths(arch.APP_RULES),
  ]),
  {
    name: 'no-ai-in-translation-path',
    comment: 'No AI SDKs in core or adapters (rule 8).',
    severity: 'error',
    from: { path: '^src/(core|adapters)/' },
    to: {
      path: arch.AI_PACKAGES.map((p) => `(^|/)node_modules/${esc(p).replace('\\*', '[^/]+')}/`),
    },
  },
  {
    name: 'no-unresolvable',
    comment: 'Every import must resolve.',
    severity: 'error',
    from: {},
    to: { couldNotResolve: true },
  },
];

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden,
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.d.ts'],
    },
    exclude: { path: '(^|/)\\.next/' },
  },
};

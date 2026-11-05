// The dependency table from docs/ARCHITECTURE.md "Dependency rules", as data.
// Both eslint.config.js (eslint-plugin-boundaries) and .dependency-cruiser.cjs read
// this file, so the two checks enforce the same table. Change it only when
// docs/ARCHITECTURE.md changes, and never to make a violation pass.
//
// Each entry: what a folder may import.
//   core, platform:        may import those layers freely.
//   modules:               other modules, only through their contract.ts.
//   adapters / connectors: other adapters / connectors, only through their contract.ts
//                          ("*" means every adapter).

/** @type {readonly string[]} */
const MODULES = [
  'catalog',
  'shop-settings',
  'visual-library',
  'designer',
  'ai-design',
  'comparer',
  'projects',
  'test-library',
  'intake',
  'appliances',
  'site-measure',
  'approvals',
  'job-notes',
  'client-messaging',
  'purchasing',
];

const BASE = { core: true, platform: true, modules: [], adapters: [], connectors: [] };

/** What each module may import. */
const MODULE_RULES = {
  catalog: { ...BASE },
  'shop-settings': { ...BASE, modules: ['catalog'] },
  // Spec: "Catalog (item IDs only)". No core in the table.
  'visual-library': { ...BASE, core: false, modules: ['catalog'] },
  designer: {
    ...BASE,
    modules: ['catalog', 'shop-settings', 'visual-library', 'appliances'],
  },
  // Never designer.
  'ai-design': {
    ...BASE,
    modules: ['catalog', 'shop-settings', 'intake', 'appliances'],
  },
  comparer: { ...BASE },
  projects: { ...BASE, modules: ['catalog'] },
  'test-library': { ...BASE, adapters: ['*'] },
  intake: { ...BASE, modules: ['catalog'] },
  appliances: { ...BASE },
  'site-measure': { ...BASE },
  approvals: { ...BASE },
  'job-notes': { ...BASE },
  'client-messaging': {
    ...BASE,
    modules: ['projects', 'intake', 'appliances', 'site-measure', 'approvals'],
  },
  purchasing: { ...BASE, modules: ['catalog'] },
};

/** Every adapter: core, platform, catalog. Never designer, ai-design, projects. */
const ADAPTER_RULES = { ...BASE, modules: ['catalog'] };

/** Every connector: core and platform only. */
const CONNECTOR_RULES = { ...BASE };

/**
 * The app (composition root): any module's contract.ts and ui/index.ts,
 * adapter and connector contracts, plus core and platform.
 */
const APP_RULES = {
  ...BASE,
  modules: [...MODULES],
  adapters: ['*'],
  connectors: ['*'],
  moduleUi: true,
};

/** Core may import only these packages (pure libraries). */
const CORE_ALLOWED_PACKAGES = ['zod'];

/** AI SDKs that may never be imported in core or adapters (no AI in the translation path). */
const AI_PACKAGES = [
  '@anthropic-ai/*',
  'anthropic',
  'openai',
  'ai',
  '@ai-sdk/*',
  'langchain',
  '@langchain/*',
  '@google/generative-ai',
  '@google/genai',
  'cohere-ai',
  '@mistralai/*',
  'ollama',
  'groq-sdk',
];

module.exports = {
  MODULES,
  MODULE_RULES,
  ADAPTER_RULES,
  CONNECTOR_RULES,
  APP_RULES,
  CORE_ALLOWED_PACKAGES,
  AI_PACKAGES,
};

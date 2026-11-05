// The vendor-name check (CLAUDE.md rule 3, docs/ARCHITECTURE.md).
// Fails if the CAD vendor's name or file format appears in a file's contents or
// path outside the folders allowed to know about it.
//
// This file has to spell out the words it looks for, so it is listed in
// SELF below. Nothing else may be added to the allowlist without a decision in
// docs/DECISIONS.md.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** The words, in any case, with or without a space, hyphen or underscore. */
const PATTERN = /cabinet[\s_-]*vision|ordx/i;

/** Folders allowed to name the vendor (docs/ARCHITECTURE.md). */
const ALLOWED_FOLDERS = [
  'src/adapters/cabinet-vision/',
  'helpers/cabinet-vision/',
  'golden/cabinet-vision/',
  'samples/cabinet-vision/',
  'docs/',
];

/**
 * Root-level project documents that describe the whole platform, including the
 * vendor. They are documentation, like docs/, but predate this check and live
 * at the root. Listed one by one so new root files are still checked.
 */
const ALLOWED_DOCUMENTS = ['CLAUDE.md', 'README.md', 'prompts/'];

/** This checker itself (it must contain the words to look for them). */
const SELF = ['scripts/check-vendor-names.mjs'];

const allowed = (path) =>
  [...ALLOWED_FOLDERS, ...ALLOWED_DOCUMENTS, ...SELF].some((prefix) =>
    prefix.endsWith('/') ? path.startsWith(prefix) : path === prefix,
  );

// Tracked files plus new files not yet committed (but not ignored ones).
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
  encoding: 'utf8',
})
  .split('\0')
  .filter(Boolean);

const problems = [];
for (const path of files) {
  if (allowed(path)) continue;
  if (PATTERN.test(path)) {
    problems.push(`${path}: the file or folder name names the vendor`);
    continue;
  }
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    // A file listed by git that cannot be read is a failure, not something to skip.
    problems.push(`${path}: could not be read (${error.code ?? error.message})`);
    continue;
  }
  if (path.endsWith('package-lock.json')) {
    // Integrity hashes are random letters and could spell the format name by chance.
    // Everything else in the lock file (package names, URLs) is still checked.
    text = text.replace(/"integrity": "[^"]*"/g, '"integrity": ""');
  }
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (PATTERN.test(line)) problems.push(`${path}:${i + 1}: ${line.trim().slice(0, 120)}`);
  });
}

if (problems.length > 0) {
  console.error('Vendor-name check FAILED. Only the adapter may name the vendor (CLAUDE.md rule 3):');
  for (const p of problems) console.error(`  ${p}`);
  console.error(`Allowed folders: ${ALLOWED_FOLDERS.join(', ')}`);
  process.exit(1);
}
console.log(`Vendor-name check passed (${files.length} files checked).`);

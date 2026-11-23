// Verifies that the esbuild dist output is complete and loadable by n8n's
// CustomDirectoryLoader: both bundles exist as non-empty CJS files, the node
// icon is shipped next to the node, and every emitted path is covered by the
// package.json `n8n` manifest globs. Failures are aggregated across all
// categories and reported together before exiting non-zero.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const distDir = join(packageRoot, 'dist');

const requiredFiles = [
  'dist/nodes/GetMyOpinion/GetMyOpinion.node.js',
  'dist/credentials/GetMyOpinionApi.credentials.js',
];
const requiredIcon = 'dist/nodes/GetMyOpinion/getmyopinion.svg';

// Matches top-level `import ...` statements — a compiled CJS bundle must not
// contain any (esbuild emits `require` calls instead).
const topLevelImport = /^\s*import\s/m;

const failures = [];

function fail(message) {
  failures.push(message);
}

// Minimal glob -> RegExp supporting `*` (within one segment) and `**`
// (across segments) — enough for manifest entries like `dist/nodes/*.node.js`.
function globToRegExp(glob) {
  const source = glob
    .split('**')
    .map((chunk) =>
      chunk
        .split('*')
        .map((literal) => literal.replace(/[|\\{}()[\]^$+?./-]/g, '\\$&'))
        .join('[^/]*'),
    )
    .join('.*');
  return new RegExp(`^${source}$`);
}

function listFilesRecursive(dir) {
  if (!existsSync(dir)) return [];
  const entries = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      entries.push(...listFilesRecursive(path));
    } else {
      entries.push(path);
    }
  }
  return entries;
}

for (const file of [...requiredFiles, requiredIcon]) {
  const path = join(packageRoot, file);
  if (!existsSync(path)) {
    fail(`Missing file: ${file} — run \`pnpm build\` first.`);
    continue;
  }
  if (statSync(path).size === 0) {
    fail(`Empty file: ${file}.`);
  }
}

for (const file of requiredFiles) {
  const path = join(packageRoot, file);
  if (!existsSync(path)) continue;
  const content = readFileSync(path, 'utf8');
  if (topLevelImport.test(content)) {
    fail(
      `${file} looks like ESM (contains a top-level \`import\` statement) — ` +
        `n8n loads custom extensions as CJS. Check the esbuild \`format\` setting.`,
    );
  }
}

const manifest = JSON.parse(
  readFileSync(join(packageRoot, 'package.json'), 'utf8'),
).n8n;

const nodeGlobs = manifest?.nodes ?? [];
const credentialGlobs = manifest?.credentials ?? [];
if (nodeGlobs.length === 0 || credentialGlobs.length === 0) {
  fail(
    'package.json `n8n` manifest must list both `nodes` and `credentials` globs.',
  );
}

const emittedFiles = listFilesRecursive(distDir).map((path) =>
  relative(packageRoot, path),
);

const emittedNodes = emittedFiles.filter((file) => file.endsWith('.node.js'));
const emittedCredentials = emittedFiles.filter((file) =>
  file.endsWith('.credentials.js'),
);

function checkCoverage(files, globs, kind) {
  for (const file of files) {
    if (!globs.some((glob) => globToRegExp(glob).test(file))) {
      fail(
        `${file} is emitted but matches no ${kind} glob in the \`n8n\` manifest.`,
      );
    }
  }
  for (const glob of globs) {
    const pattern = globToRegExp(glob);
    if (!files.some((file) => pattern.test(file))) {
      fail(`Manifest glob "${glob}" matches no emitted ${kind} file.`);
    }
  }
}

checkCoverage(emittedNodes, nodeGlobs, 'nodes');
checkCoverage(emittedCredentials, credentialGlobs, 'credentials');

if (emittedNodes.length === 0) {
  fail('No *.node.js file found in dist/.');
}
if (emittedCredentials.length === 0) {
  fail('No *.credentials.js file found in dist/.');
}

if (failures.length > 0) {
  console.error(
    `verify:dist failed (${failures.length} issue${failures.length === 1 ? '' : 's'}):`,
  );
  for (const message of failures) {
    console.error(`  - ${message}`);
  }
  process.exit(1);
}

console.log(
  `verify:dist passed: ${emittedNodes.length} node bundle(s), ` +
    `${emittedCredentials.length} credential bundle(s), icon present, ` +
    `manifest globs satisfied.`,
);

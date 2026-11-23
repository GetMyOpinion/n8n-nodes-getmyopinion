// Bundles the node and credential into the two CJS files n8n discovers by
// glob (*.node.js / *.credentials.js). The shared core (src/core/) is
// inlined into the bundles; n8n-core / n8n-workflow stay external because
// the host n8n process provides them at runtime.
//
// Public build: NO sourcemaps — the private monorepo build embeds
// `sourcesContent`, which must not ship in the public npm artifact.

import esbuild from 'esbuild';

import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('.', import.meta.url));

await esbuild
  .build({
    absWorkingDir: packageRoot,
    outdir: packageRoot,
    entryPoints: {
      'dist/nodes/GetMyOpinion.node': join(
        packageRoot,
        'src/nodes/GetMyOpinion.node.ts',
      ),
      'dist/credentials/GetMyOpinionApi.credentials': join(
        packageRoot,
        'src/credentials/GetMyOpinionApi.credentials.ts',
      ),
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    sourcemap: false,
    external: ['n8n-core', 'n8n-workflow', 'n8n-core/*', 'n8n-workflow/*'],
    logLevel: 'info',
  })
  .catch(() => process.exit(1));

// esbuild does not copy assets referenced through data URIs; the icon base64
// in the node description is generated from this SVG at development time.
const iconTarget = join(packageRoot, 'dist/nodes/getmyopinion.svg');
mkdirSync(dirname(iconTarget), { recursive: true });
copyFileSync(join(packageRoot, 'assets/getmyopinion.svg'), iconTarget);

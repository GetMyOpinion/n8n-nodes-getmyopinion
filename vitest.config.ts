import { defineConfig } from 'vitest/config';

import { readFileSync } from 'node:fs';

// n8n-workflow's ESM dist ships one .js.map per module with no
// `sourcesContent` and `sources` pointing at src/ files that are not part of
// the npm package. Vitest inlines that dist (it is not importable by Node
// directly — extensionless internal imports), and vite then logs one
// "Sourcemap for ... points to missing source files" warning per module on
// every run. The maps cannot resolve to real sources anyway, so this plugin
// strips the sourceMappingURL comments and the warnings go with them.
const n8nEsmDistFile =
  /node_modules[\\/]n8n-(?:workflow|core)[\\/]dist[\\/]esm[\\/].+\.js$/;

export default defineConfig({
  plugins: [
    {
      name: 'drop-unresolvable-n8n-sourcemaps',
      enforce: 'pre',
      load(id) {
        const file = id.split('?')[0];
        if (!n8nEsmDistFile.test(file)) return null;
        return readFileSync(file, 'utf8').replace(
          /^\/\/# sourceMappingURL=.*$/gm,
          '',
        );
      },
    },
  ],
});

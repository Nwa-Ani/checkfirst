import { defineConfig, loadEnv } from 'vite';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appCheckDefines, shouldUseAppCheckDebug } from './vite.appcheck.js';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(root, 'dist-extension');

function walkFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walkFiles(full, acc);
    else acc.push(full);
  }
  return acc;
}


function tokenHostPermission(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}/*`;
  } catch {
    return null;
  }
}

function patchManifest(tokenUrl) {
  const dest = join(outDir, 'manifest.json');
  if (!existsSync(dest)) return;
  const man = JSON.parse(readFileSync(dest, 'utf8'));
  const hosts = new Set(man.host_permissions || []);
  const perm = tokenHostPermission(tokenUrl);
  if (perm) hosts.add(perm);
  man.host_permissions = [...hosts];
  writeFileSync(dest, JSON.stringify(man, null, 2) + '\n');
}

function flattenAndCopy(tokenUrl = "") {
  mkdirSync(outDir, { recursive: true });
  // Move any nested build files up to the extension root, except fonts which can stay in subfolders if referenced relatively.
  for (const file of walkFiles(outDir)) {
    const rel = file.slice(outDir.length + 1);
    if (!rel.includes('/') && !rel.includes('\\')) continue;
    // Keep font files if already referenced with subpaths; also flatten CSS/JS/HTML.
    if (!/\.(html|js|css)$/.test(file)) continue;
    const dest = join(outDir, rel.split(/[/\\]/).pop());
    if (file !== dest && !existsSync(dest)) renameSync(file, dest);
  }
  copyFileSync(resolve(root, 'extension/background.js'), join(outDir, 'background.js'));
  copyFileSync(resolve(root, 'extension/manifest.json'), join(outDir, 'manifest.json'));
  patchManifest(tokenUrl);

  const flat = join(outDir, 'result.html');
  if (existsSync(flat)) {
    let html = readFileSync(flat, 'utf8');
    html = html.replace(/\s+crossorigin(="[^"]*")?/g, '');
    html = html.replace(/src="[^"]*result[^"]*\.js"/, 'src="./result.js"');
    const css = walkFiles(outDir).filter((f) => f.endsWith('.css')).map((f) => f.split(/[/\\]/).pop());
    const cssName = css.includes('result.css') ? 'result.css' : css[0];
    if (cssName) {
      if (/rel="stylesheet"/.test(html)) {
        html = html.replace(/href="[^"]+\.css"/, `href="./${cssName}"`);
      } else {
        html = html.replace('</head>', `  <link rel="stylesheet" href="./${cssName}">\n</head>`);
      }
    }
    writeFileSync(flat, html);
  }
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, root, 'VITE_');
  const tokenUrl = env.VITE_APPCHECK_TOKEN_URL || process.env.VITE_APPCHECK_TOKEN_URL || '';
  return {
  envDir: root,
  base: './',
  define: {
    ...appCheckDefines(shouldUseAppCheckDebug(command, mode)),
    'import.meta.env.VITE_APPCHECK_USE_CUSTOM': JSON.stringify('true'),
  },
  publicDir: false,
  build: {
    outDir,
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
    modulePreload: false,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(root, 'extension/result.html'),
      output: {
        entryFileNames: 'result.js',
        chunkFileNames: 'chunk-[name].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
  plugins: [
    {
      name: 'extension-pack',
      closeBundle() {
        flattenAndCopy(tokenUrl);
      },
    },
  ],
};
});

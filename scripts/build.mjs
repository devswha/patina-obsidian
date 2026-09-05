import { build } from 'esbuild';
await build({ entryPoints: ['src/plugin.js'], bundle: true, outfile: 'main.js', format: 'cjs', platform: 'node', target: 'es2020', external: ['obsidian'], sourcemap: false });

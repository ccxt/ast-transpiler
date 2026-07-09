import { defineConfig } from 'tsup';

export default defineConfig({
    entry: [ 'src/transpiler.ts' ],
    format: [ 'cjs', 'esm' ],
    clean: true,
    splitting: true,
    shims: true,
    sourcemap: true,
    dts: {
        // tsup's dts pipeline unconditionally injects `baseUrl` into the
        // compiler options it hands to its bundled rollup-plugin-dts
        // (node_modules/tsup/dist/rollup.js: `baseUrl: compilerOptions.baseUrl || "."`,
        // still present as of tsup 8.5.1). `baseUrl` is deprecated in
        // TypeScript 6 (TS5101, https://aka.ms/ts6), which turns the dts build
        // into a hard error. Until tsup stops injecting it, silence
        // deprecations for the dts program ONLY — tsconfig.json stays
        // deprecation-free, so tsc / ts-jest / eslint still surface real
        // deprecations in our own configuration.
        compilerOptions: {
            ignoreDeprecations: '6.0',
        },
    },
});

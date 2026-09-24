import { defineConfig } from 'tsup';

export default defineConfig({
    entry: [ 'src/transpiler.ts', 'src/tsUtils.ts' ],
    format: [ 'cjs', 'esm' ],
    clean: true,
    splitting: true,
    shims: true,
    sourcemap: true,
    // declarations come from the TS7 tsc itself: tsup's rollup-plugin-dts needs the TS6 compiler API
    onSuccess: 'tsc -p tsconfig.json --emitDeclarationOnly --declarationMap false --noCheck',
});

import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// getCacheIndex delta-buffer rows: row 0 under a length check, row i inside a loop bounded by the buffer length
describe ('go getCacheIndex delta rows', () => {
    const root = path.join (__dirname, 'files', 'tmp-h28a24', 'ts', 'src', 'pro');
    const SRC =
        'type Dict = { [key: string]: any };\n' +
        'class Exchange {\n' +
        '    safeDict (o: any, k: any, d: any = undefined): any { return o; }\n' +
        '    safeInteger (o: any, k: any): any { return o; }\n' +
        '    getCacheIndex (orderbook: Dict, deltas: any[]): number { return -1; }\n' +
        '}\n' +
        'class venue extends Exchange {\n' +
        '    getCacheIndex (orderbook: Dict, cache: any[]): number {\n' +
        '        const firstDelta = this.safeDict (cache, 0);\n' +
        '        const start = this.safeInteger (firstDelta, \'U\');\n' +
        '        for (let i = 0; i < cache.length; i++) {\n' +
        '            const delta = this.safeDict (cache, i);\n' +
        '            if (this.safeInteger (delta, \'u\') === start) {\n' +
        '                return i;\n' +
        '            }\n' +
        '        }\n' +
        '        const j = 1;\n' +
        '        const other = this.safeDict (cache, j);\n' +
        '        return this.safeInteger (other, \'x\');\n' +
        '    }\n' +
        '    otherMethod (cache: any[]): any {\n' +
        '        const head = this.safeDict (cache, 0);\n' +
        '        return head;\n' +
        '    }\n' +
        '}\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (root, { recursive: true });
        const file = path.join (root, 'venue.ts');
        fs.writeFileSync (file, SRC);
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoLocalTypes (t.goTranspiler);
        out = t.transpileGoByPath (file).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h28a24'), { recursive: true, force: true }));

    test ('positive: row 0 is a length-checked map assertion', () => {
        expect (out).toMatch (/var firstDelta map\[string\]any\n\s*if len\(cache\) > 0 \{\n\s*firstDelta, _ = cache\[0\]\.\(map\[string\]any\)\n\s*\}/);
    });

    test ('positive: a loop-bounded row is a comma-ok map read', () => {
        expect (out).toMatch (/var delta, _ = cache\[i\]\.\(map\[string\]any\)/);
    });

    test ('negative: an index outside the bounded loop is not read natively', () => {
        expect (out).not.toMatch (/cache\[j\]/);
    });

    test ('negative: another method is not a delta buffer', () => {
        expect (out).not.toMatch (/head, _ = cache\[0\]/);
    });
});

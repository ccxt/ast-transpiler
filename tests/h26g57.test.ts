import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a for-loop counter seeded by a local whose declared Go type is int64 prints a native int conversion;
// a seed of another or unknown type keeps the helper.
describe ('h26g57: for-loop counter seeded by an int64 local', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Int = number | undefined;\nclass BaseExchange {\n'
        + '    sum (...xs: any[]): any { return xs[0]; }\n    safeInteger (o: any, k: any, d: number): number;\n    safeInteger (o: any, k: any, d?: number): Int;\n    safeInteger (o: any, k: any, d: number = undefined): Int { return d; }\n    options: Dict = {};\n    note (h: any): any { return h; }\n}\nexport default BaseExchange;\n';
    const print = (body: string, int64Local?: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h26g57-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\nclass x extends Exchange {\n' + body + '}\n');
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
            const t: any = new Transpiler (config);
            installCcxtGoHooks (t.goTranspiler);
            if (int64Local !== undefined) {
                // the declared-type answer the ccxt hooks give polymarket's `let startIndex = 0` summed with an int64
                const declared = t.goTranspiler.goDeclaredTypeOfIdentifier;
                t.goTranspiler.goDeclaredTypeOfIdentifier = function (node) {
                    return (node?.text === int64Local) ? 'int64' : declared.call (this, node);
                };
            }
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const loop = (seed: string) => '    f (xs: string[], n: number) {\n' + seed
        + '        const out = [];\n        for (let i = startIndex; i < n; i++) {\n            out.push (xs[i]);\n        }\n'
        + '        startIndex = startIndex + 1;\n        return out;\n    }\n';
    const chunked = (seed: string) => '    f (xs: string[]) {\n        const n = xs.length;\n'
        + '        const chunkSize = this.safeInteger (this.options, \'c\', 50);\n' + seed + '        const out = [];\n'
        + '        while (startIndex < n) {\n            let endIndex = this.sum (startIndex, chunkSize);\n'
        + '            for (let i = startIndex; i < endIndex; i++) {\n                out.push (xs[i]);\n            }\n'
        + '            startIndex = this.sum (startIndex, chunkSize);\n        }\n        return out;\n    }\n';
    test ('an int64 seed prints a native int conversion', () => {
        const out = print (loop ('        let startIndex = this.note (n);\n'), 'startIndex');
        expect (out).toContain ('for i := int(startIndex); ');
        expect (out).not.toContain ('ParseInt(startIndex)');
    });
    test ('an any seed keeps the box', () => {
        const out = print (loop ('        let startIndex = this.note (n);\n'));
        expect (out).not.toContain ('for i := int(startIndex); ');
    });
    test ('a nil-able seed keeps the box', () => {
        const out = print (loop ('        const startIndex = this.safeInteger (this.options, \'s\');\n').replace ('        startIndex = startIndex + 1;\n', ''));
        expect (out).not.toContain ('for i := int(startIndex); ');
    });
    test ('a seed of another declared type keeps its form', () => {
        const out = print (loop ('        let startIndex: number = 0;\n'));
        expect (out).toContain ('for i := startIndex; ');
    });
});

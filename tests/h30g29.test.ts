import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a for counter printed `i := int(seed)` is a Go int: `i < end` against an int64 bound widens natively
describe ('h30g29: ordered compare on a for counter seeded by an int64 local', () => {
    const HEAD = 'type Dict = { [key: string]: any };\nclass BaseExchange {\n'
        + '    sum (...xs: any[]): any { return xs[0]; }\n    note (h: any): any { return h; }\n}\nexport default BaseExchange;\n';
    const print = (body: string, int64Locals: string[]): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h30g29-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\nclass x extends Exchange {\n' + body + '}\n');
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
            const t: any = new Transpiler (config);
            installCcxtGoHooks (t.goTranspiler);
            // the declared-type answer the ccxt hooks give polymarket's int64 chunk locals
            const declared = t.goTranspiler.goDeclaredTypeOfIdentifier;
            t.goTranspiler.goDeclaredTypeOfIdentifier = function (node) {
                return (int64Locals.indexOf (node?.text) >= 0) ? 'int64' : declared.call (this, node);
            };
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const loop = (bound: string) => '    f (xs: string[], n: number) {\n        let startIndex = this.note (n);\n'
        + '        let endIndex = this.note (n);\n        const out = [];\n'
        + '        for (let i = startIndex; i < ' + bound + '; i++) {\n            out.push (xs[i]);\n        }\n'
        + '        startIndex = startIndex + 1;\n        endIndex = endIndex + 1;\n        return out;\n    }\n';
    test ('an int64 bound compares natively (fails on the base printer)', () => {
        const out = print (loop ('endIndex'), [ 'startIndex', 'endIndex' ]);
        expect (out).toContain ('for i := int(startIndex); int64(i) < endIndex; i++');
        expect (out).not.toContain ('IsLessThan(i, endIndex)');
    });
    test ('a bound boxed as any keeps the helper', () => {
        const out = print (loop ('endIndex'), [ 'startIndex' ]);
        expect (out).toContain ('IsLessThan(i, endIndex)');
        expect (out).not.toContain ('int64(i) < endIndex');
    });
    test ('a counter whose seed is boxed is not claimed', () => {
        const out = print (loop ('endIndex'), [ 'endIndex' ]);
        expect (out).not.toContain ('int64(i) < endIndex');
        expect (out).not.toContain ('for i := int(startIndex)');
    });
});

import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

const HEAD = 'type Dict = { [key: string]: any };\ntype Int = number | undefined;\nclass BaseExchange {\n'
    + '    sum (...xs: any[]): any { return xs[0]; }\n    milliseconds (): number { return 1; }\n'
    + '    safeInteger (o: any, k: any, d: number): number;\n    safeInteger (o: any, k: any, d?: number): Int;\n    safeInteger (o: any, k: any, d: number = undefined): Int { return d; }\n'
    + '    note (h: any): any { return h; }\n}\nexport default BaseExchange;\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h27g06-'));
    try {
        fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
        const file = path.join (dir, 'ts', 'src', 'x.ts');
        fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
        fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\nclass x extends Exchange {\n' + body + '}\n');
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGoByPath (file).content;
    } finally {
        fs.rmSync (dir, { 'recursive': true, 'force': true });
    }
};
const body = (seed: string, write: string, extra = ''): string =>
    '    f (params = {}) {\n' +
    "        const ttl = this.safeInteger (params, 'ttl', 5);\n" +
    '        let deadline = ' + seed + ';\n' +
    '        if (ttl > 0) {\n' +
    '            deadline = ' + write + ';\n' +
    '        }\n' + extra +
    "        const r = { 'time': deadline };\n" +
    '        return r;\n' +
    '    }\n';
describe ('h27-g06: sum / min / max writes with an int64 base call operand keep the local int64', () => {
    test ('this.sum (this.milliseconds (), n) keeps the literal-seeded local int64 and prints native', () => {
        const out = print (body ('0', 'this.sum (this.milliseconds (), ttl)'));
        expect (out).toContain ('var deadline int64 = 0');
        expect (out).toContain ('deadline = this.Milliseconds() + *ttl');
        expect (out).not.toContain ('this.Sum(');
    });
    test ('Math.min with the int64 base call keeps the local int64', () => {
        const out = print (body ('0', 'Math.min (this.milliseconds (), ttl)'));
        expect (out).toContain ('var deadline int64 = 0');
        expect (out).toContain ('deadline = min(this.Milliseconds(), *ttl)');
    });
    test ('negative: a base call answering any keeps the box', () => {
        const out = print (body ('0', 'this.sum (this.note (1), ttl)'));
        expect (out).toContain ('var deadline any = 0');
    });
    test ('negative: a later nil write keeps the box', () => {
        const out = print (body ('0', 'this.sum (this.milliseconds (), ttl)', '        if (ttl > 9) {\n            deadline = undefined;\n        }\n'));
        expect (out).toContain ('var deadline any = 0');
    });
    test ('negative: a nil seed with a nil test keeps its form', () => {
        const out = print (body ('undefined', 'this.sum (this.milliseconds (), ttl)', '        if (deadline === undefined) {\n            return {};\n        }\n'));
        expect (out).not.toContain ('var deadline int64');
    });
});

import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

const HEAD = 'type Dict = { [key: string]: any };\ntype Int = number | undefined;\nclass BaseExchange {\n'
    + '    sum (...xs: any[]): any { return xs[0]; }\n    milliseconds (): number { return 1; }\n'
    + '    safeInteger (o: any, k: any, d: number): number;\n    safeInteger (o: any, k: any, d?: number): Int;\n    safeInteger (o: any, k: any, d: number = undefined): Int { return d; }\n'
    + '    note (h: any): any { return h; }\n}\nexport default BaseExchange;\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h29g03-'));
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
const body = (write: string, extra = ''): string =>
    '    f (params = {}) {\n' +
    "        const until = this.safeInteger (params, 'until');\n" +
    '        let end: Int = undefined;\n' +
    '        if (until !== undefined) {\n' +
    '            end = ' + write + ';\n' +
    '        }\n' + extra +
    '        const r = {};\n' +
    '        if (end !== undefined) {\n' +
    "            r['end'] = end;\n" +
    '        }\n' +
    '        return r;\n' +
    '    }\n';
describe ('h29-g03: sum writes of non-nil *int64 operands join a nil-seeded Int local as *int64', () => {
    test ('this.sum (until, 1) under a nil guard prints a native int64 temp', () => {
        const out = print (body ('this.sum (until, 1)'));
        expect (out).toContain ('var end *int64 = nil');
        expect (out).toContain ('endValue := *until + 1');
        expect (out).toContain ('end = &endValue');
        expect (out).not.toContain ('this.Sum(');
    });
    test ('Math.max (until, n) prints the native builtin', () => {
        const out = print (body ('Math.max (until, this.milliseconds ())'));
        expect (out).toContain ('var end *int64 = nil');
        expect (out).not.toContain ('mathMax(');
    });
    test ('nested int64 product operand (lighter endTs shape) prints native', () => {
        const out = print (body ('this.sum (until, this.milliseconds () * 3 * 1000)'.replace ('this.milliseconds () * 3', 'n * 3'))
            .replace ("        let end: Int", "        const n = this.milliseconds ();\n        let end: Int"));
        expect (out).toContain ('var end *int64 = nil');
        expect (out).toContain ('endValue := *until + (n*3)*1000');
        expect (out).not.toContain ('this.Sum(');
    });
    test ('nested product with a pointer leaf (lighter duration * limit) prints native', () => {
        const out = print (body ('this.sum (until, (n - 1) * until)').replace ("        let end: Int", "        const n = this.milliseconds ();\n        let end: Int"));
        expect (out).toContain ('var end *int64 = nil');
        expect (out).not.toContain ('this.Sum(');
    });
    test ('negative: a nested operand with a boxed leaf keeps the box', () => {
        const out = print (body ('this.sum (until, this.note (1) * 2)'));
        expect (out).not.toContain ('endValue :=');
        expect (out).toContain ('var end any = nil');
    });
    test ('negative: a nested operand with a nullable pointer leaf keeps the box', () => {
        const out = print (body ("this.sum (until, 2 * this.safeInteger (params, 'x'))"));
        expect (out).not.toContain ('endValue :=');
    });
    test ('negative: an operand not proven non-nil keeps the box', () => {
        const out = print (body ("this.sum (this.safeInteger (params, 'x'), 1)"));
        expect (out).not.toContain ('var end *int64');
        expect (out).not.toContain ('endValue :=');
    });
    test ('negative: a boxed (any) operand keeps the box', () => {
        const out = print (body ('this.sum (until, this.note (1))'));
        expect (out).not.toContain ('endValue :=');
    });
    test ('negative: a later write that is not an Int keeps the box', () => {
        const out = print (body ('this.sum (until, 1)', "        if (r === undefined) {\n            end = this.note ('x');\n        }\n"));
        expect (out).toContain ('var end any = nil');
    });
});

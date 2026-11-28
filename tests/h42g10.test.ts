import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a mutable number local whose initializer and every write print int64 is declared int64
describe ('h42g10: an int local whose every write prints int64 is declared int64', () => {
    const HEAD = 'type int = number;\ntype Int = number | undefined;\n'
        + 'class BaseExchange {\n    options: any;\n    sum = sum;\n    milliseconds (): int { return 1; }\n'
        + '    safeInteger (o: any, k: string, d?: int): Int { return 1; }\n    safeValue (o: any, k: string, d?: any): any { return d; }\n'
        + '    delay (t: any, f: any) { }\n}\nfunction sum (...xs: any[]): any { return 1; }\nfunction milliseconds (): number { return 1; }\nexport default BaseExchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h42g10-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'go', 'v4'), { 'recursive': true });
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\ntype int = number;\ntype Int = number | undefined;\nclass x extends Exchange {\n'
                + '    regainDelay (): int {\n        return this.safeInteger (this.options, \'d\', 0) * 1000;\n    }\n' + body + '}\n');
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const fn = (init: string, write: string) => '    f (): boolean {\n        const d = this.regainDelay ();\n'
        + '        const lost = this.safeInteger (this.options, \'t\', this.milliseconds ());\n'
        + '        let wait = ' + init + ';\n        if (wait <= 0) {\n            wait = ' + write + ';\n        }\n'
        + '        this.delay (wait, this.f);\n        return true;\n    }\n';
    test ('positive: sum minus milliseconds, int write', () => {
        const out = print (fn ('this.sum (lost, d) - this.milliseconds ()', 'd'));
        expect (out).toContain ('var wait int64 = ');
        expect (out).toContain ('if wait <= 0 {');
        expect (out).not.toContain ('wait.(int64)');
    });
    test ('negative: a write that is not int64 keeps the local untyped', () => {
        const out = print (fn ('this.sum (lost, d) - this.milliseconds ()', 'this.safeValue (this.options, \'w\')'));
        expect (out).not.toContain ('var wait int64');
    });
    test ('negative: a nil write keeps the local untyped', () => {
        const out = print (fn ('this.sum (lost, d) - this.milliseconds ()', 'undefined'));
        expect (out).not.toContain ('var wait int64');
    });
    test ('negative: a fractional write keeps the local untyped', () => {
        const out = print (fn ('this.sum (lost, d) - this.milliseconds ()', '0.5'));
        expect (out).not.toContain ('var wait int64');
    });
    test ('negative: a safeInteger default that is not the clock keeps the pointer boxed', () => {
        const out = print (fn ('this.sum (lost, d) - this.milliseconds ()', 'd').replace ('this.milliseconds ());', 'this.safeValue (this.options, \'z\'));'));
        expect (out).not.toContain ('var wait int64');
    });
    test ('negative: a Math.min ternary arm on a nilable limit is not given an int64 operand type', () => {
        const out = print ('    g (limit: Int = undefined): int {\n        const n: Int = (limit === undefined) ? 100 : Math.min (limit, 11000);\n        return n;\n    }\n');
        expect (out).toContain ('var n any');
        expect (out).not.toContain ('var n int64');
    });
});

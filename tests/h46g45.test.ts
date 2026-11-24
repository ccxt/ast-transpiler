import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a local initialised by parseOHLCV / parseWsOHLCV (declared `: OHLCV`, boxed to a `[]any` row by the build) prints `[]any`
describe ('h46g45: parseOHLCV result locals', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Num = number | undefined;\ntype OHLCV = [Num, Num, Num, Num, Num, Num];\nclass BaseExchange {\n'
        + '    parseOHLCV (ohlcv: any, market: any = undefined): OHLCV { return [ undefined, undefined, undefined, undefined, undefined, undefined ]; }\n'
        + '    parseWsOHLCV (ohlcv: any, market: any = undefined): OHLCV { return this.parseOHLCV (ohlcv, market); }\n'
        + '    keep (o: any): any { return o; }\n}\nexport default BaseExchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h46g45-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'go', 'v4'), { 'recursive': true });
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\nclass x extends Exchange {\n' + body + '}\n');
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    test ('parseOHLCV handed on: []any local (fails on the base printer)', () => {
        const out = print ('    f (message: any) {\n        const parsed = this.parseOHLCV (message);\n        this.keep (parsed);\n    }\n');
        expect (out).toContain ('var parsed []any = this.ParseOHLCV(message)');
    });
    test ('parseWsOHLCV with a market: []any local', () => {
        const out = print ('    f (message: any, market: any) {\n        const parsed = this.parseWsOHLCV (message, market);\n        this.keep (parsed);\n    }\n');
        expect (out).toContain ('var parsed []any = this.ParseWsOHLCV(message, market)');
    });
    test ('negative: a local read and written by index keeps the box', () => {
        const out = print ('    f (message: any) {\n        const parsed = this.parseOHLCV (message);\n        const t = parsed[0];\n        parsed[0] = t;\n        this.keep (parsed);\n    }\n');
        expect (out).not.toContain ('var parsed []any');
    });
    test ('negative: a nil-seeded local written later stays untyped', () => {
        const out = print ('    f (message: any) {\n        let parsed = undefined;\n        parsed = this.keep (message);\n        this.keep (parsed);\n    }\n');
        expect (out).not.toContain ('var parsed []any');
    });
    test ('negative: another callee keeps the box', () => {
        const out = print ('    f (message: any) {\n        const parsed = this.keep (message);\n        this.keep (parsed);\n    }\n');
        expect (out).toContain ('var parsed any = this.Keep(message)');
    });
});

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe('go native this.balance[k] stores', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n    balance: Dict = {};\n'
        + '    safeString (d: any, k: any, def: any = undefined): Str { return d; }\n'
        + '    safeValue (d: any, k: any, def: any = undefined): any { return d; }\n'
        + '    account (): Dict { return {}; }\n'
        + '    extend (a: any, b: any): Dict { return a; }\n'
        + '    safeBalance (d: Dict): Dict { return d; }\n';
    const TABLE = { 'balance': { 'type': 'map[string]any', 'freshMapCalls': [ 'extend' ], 'selfCalls': [ 'safeBalance' ],
        'plainCalls': [ 'extend', 'safeBalance' ], 'emptyDefaultCalls': [ 'safeDict' ] } };
    const print = (body: string, extra = ''): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'nativeStoreFields': TABLE, 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h27g20-'));
        try {
            const dir = path.join (tmp, 'ts', 'src', 'base');
            fs.mkdirSync (dir, { 'recursive': true });
            const file = path.join (dir, 'Exchange.ts');
            fs.writeFileSync (file, HEAD + extra + '    handle (response: any, k: string, sub: Dict) {\n' + body + '\n    }\n}\n');
            const out = t.transpileGoByPath (file).content;
            return out.slice (out.indexOf ('func (this *Exchange) Handle'));
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    const SEED = '        if (this.balance === undefined) {\n            const empty: Dict = {};\n            this.balance = empty;\n        }\n';
    test('positive: field seeded from a never-rebound {} local stores natively', () => {
        const out = print (SEED + '        this.balance["spot"] = this.safeBalance (sub);');
        expect (out).toContain ('this.Balance["spot"] = this.SafeBalance(sub)');
        expect (out).not.toContain ('AddElementToObject(this.Balance');
    });
    test('positive: multi-line extend value with a guarded *string key', () => {
        const out = print ('        const code = this.safeString (response, "c");\n        if (code !== undefined) {\n            this.balance[code] = this.extend (this.account (), {\n                "total": 1,\n            });\n        }');
        expect (out).toMatch (/this\.Balance\[\*code\] = this\.Extend\(this\.Account\(\), map\[string\]any\{\n/);
        expect (out).not.toContain ('AddElementToObject(this.Balance');
    });
    test('negative: a rebound seed local keeps the helper', () => {
        const out = print ('        let empty: Dict = {};\n        empty = this.safeValue (response, "x");\n        this.balance = empty;\n        this.balance[\"spot\"] = this.safeBalance (sub);');
        expect (out).toContain ('AddElementToObject(this.Balance, "spot", this.SafeBalance(sub))');
    });
    test('negative: an any value keeps the helper', () => {
        const out = print (SEED + '        this.balance[k] = this.safeValue (response, "x", undefined) as any;\n        this.balance[k] = response;');
        expect (out).toContain ('AddElementToObject(this.Balance, k, response)');
    });
    test('negative: a scalar pointer value keeps the helper', () => {
        const out = print (SEED + '        this.balance[k] = this.safeString (response, "x");');
        expect (out).not.toContain ('this.Balance[k] = this.SafeString');
    });
});

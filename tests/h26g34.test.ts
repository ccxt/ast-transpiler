import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe('go *string-key store of a ts-declared dict value into a non-nil map local', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n    options: Dict = {};\n'
        + '    safeString (d: any, k: any, def: any = undefined): Str { return d; }\n'
        + '    safeCurrencyCode (d: any, k: any = undefined): Str { return d; }\n'
        + '    safeDict (d: any, k: any, def: any = undefined): Dict { return d; }\n'
        + '    safeList (d: any, k: any, def: any = undefined): any[] { return d; }\n'
        + '    safeValue (d: any, k: any, def: any = undefined): any { return d; }\n'
        + '    account (): Dict { return {}; }\n'
        + '    safeBalance (d: Dict): Dict { return d; }\n'
        + '    async fetchLimits (id: Str): Promise<Dict> { return {}; }\n';
    const print = (body: string, isAsync = false): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h26g34-'));
        try {
            const dir = path.join (tmp, 'ts', 'src', 'base');
            fs.mkdirSync (dir, { 'recursive': true });
            const file = path.join (dir, 'Exchange.ts');
            fs.writeFileSync (file, HEAD + (isAsync ? '    async ' : '    ') + 'handle (response: any, params: Dict = {}) {\n' + body + '\n    }\n}\n');
            const out = t.transpileGoByPath (file).content;
            return out.slice (out.indexOf ('func (this *Exchange) Handle'));
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    const LOOP = "const result: Dict = { 'info': response };\nconst rows = this.safeList (response, 'data', []);\nfor (let j = 0; j < rows.length; j++) {\n    const b = this.safeDict (rows, j);\n    const code = this.safeCurrencyCode (this.safeString (b, 'currency'));\n";
    test('an enclosing-guarded *string key and a Dict value print the native store (fails on the base printer)', () => {
        const out = print (LOOP + "    let account = this.safeDict (result, code);\n    if (account === undefined) {\n        account = this.account ();\n    }\n    if (code !== undefined) {\n        result[code] = account;\n    }\n}\nreturn this.safeBalance (result);");
        expect (out).toContain ('result[*code] = account');
        expect (out).not.toContain ('AddElementToObject(result');
    });
    test('an exiting (continue) nil guard proves the key', () => {
        const out = print (LOOP + "    if (code === undefined) {\n        continue;\n    }\n    const account = this.safeDict (b, code);\n    if (account !== undefined) {\n        result[code] = account;\n    }\n}\nreturn this.safeBalance (result);");
        expect (out).toContain ('result[*code] = account');
        expect (out).not.toContain ('AddElementToObject(result');
    });
    test('an unguarded key keeps the helper nil-key no-op behind a nil test', () => {
        const out = print (LOOP + "    const account = this.safeDict (b, 'x');\n    result[code] = account;\n}\nreturn this.safeBalance (result);");
        expect (out).not.toContain ('AddElementToObject(result');
        expect (out).toMatch (/if code != nil \{\n\s*result\[\*code\] = account/);
    });
    test('negative: an any-typed value (safeValue) keeps the helper', () => {
        const out = print (LOOP + "    if (code !== undefined) {\n        result[code] = this.safeValue (b, 'x');\n    }\n}\nreturn this.safeBalance (result);");
        expect (out).toContain ('AddElementToObject(result, code,');
    });
    test('negative: a Str value (may be a nil *string) keeps the helper', () => {
        const out = print (LOOP + "    const v = this.safeString (b, 'v');\n    const r: Dict = {};\n    const p: any = v;\n    if (code !== undefined) {\n        r[code] = p;\n    }\n    result['x'] = r;\n}\nreturn this.safeBalance (result);");
        expect (out).toContain ('AddElementToObject(r, code, p)');
    });
    test('negative: a receiver that may be nil (safeDict without default) keeps the helper', () => {
        const out = print (LOOP + "    const target = this.safeDict (params, 'x');\n    const account = this.safeDict (b, 'y');\n    if (code !== undefined) {\n        target[code] = account;\n    }\n}\nreturn this.safeBalance (result);");
        expect (out).toContain ('AddElementToObject(target, code, account)');
    });
    test('negative: an awaited Dict value keeps the helper path (the receive and its error check)', () => {
        const out = print ("const symbols = this.safeList (response, 's', []);\nconst result: Dict = {};\nfor (let i = 0; i < symbols.length; i++) {\n    const symbol = this.safeString (symbols, i);\n    result[symbol] = await this.fetchLimits (symbol);\n}\nreturn result;", true);
        expect (out).toMatch (/\t(r\d+) := \(<-this\.FetchLimitsAsync\(symbol\)\)\n\t+PanicOnError\(\1\.Raw\)\n\t+if symbol != nil \{\n\t+result\[\*symbol\] = \1\.Value\n/);
        expect (out).not.toMatch (/result\[\*symbol\] = \(<-/);
    });
});

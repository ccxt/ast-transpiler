import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a safeDict on a const UrlsApiSections view local, or on this.balance with a `{}` default, prints the comma-ok
// assertion (plus a nil-fill for `{}`); a written-into local, a nil-tested 1-arg read or an options receiver keep the wrap.
describe ('h28a07: view / balance reads print the comma-ok assertion', () => {
    const HEAD = 'type Dict = { [key: string]: any };\nclass BaseExchange {\n'
        + '    urls: { api: Dict; [key: string]: any } = { api: {} };\n    fees: Dict = {};\n    balance: Dict = {};\n    options: Dict = {};\n'
        + '    safeDict (o: any, k: any, d: any = undefined): any { return d; }\n    safeString (o: any, k: any): any { return k; }\n'
        + '    note (h: any): any { return h; }\n}\nexport default BaseExchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h28a07-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\nclass x extends Exchange {\n' + body + '}\n');
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
            const t: any = new Transpiler (config);
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    test ('wsApiUrls view local', () => {
        const out = print ('    g (marketType: string) {\n        const wsApiUrls: Dict = this.safeDict (this.safeDict (this.urls, \'api\', {}), \'ws\', {});\n        const wsApiDict: Dict = this.safeDict (wsApiUrls, \'ws-api\', {});\n        return this.safeString (wsApiDict, marketType);\n    }\n');
        expect (out).toContain ('\tvar wsApiDict map[string]any\n\twsApiDict, _ = wsApiUrls["ws-api"].(map[string]any)');
        expect (out).not.toContain ('SafeMapTyped(wsApiUrls');
    });
    test ('balance read with a {} default is nil-filled', () => {
        const out = print ('    f (type: string) {\n        const balance = this.safeDict (this.balance, \'spot\', {});\n        return this.note (balance);\n    }\n');
        expect (out).toContain ('\tvar balance map[string]any\n\tbalance, _ = this.Balance["spot"].(map[string]any)\n\tif balance == nil {\n\t\tbalance = map[string]any{}\n\t}');
        expect (out).not.toContain ('SafeDictMap(this.Balance');
    });
    test ('negative: a balance local written into keeps SafeDictMap', () => {
        const out = print ('    f (type: string) {\n        const balance = this.safeDict (this.balance, type, {});\n        balance[\'a\'] = 1;\n        return balance;\n    }\n');
        expect (out).toContain ('this.SafeDictMap(this.Balance, typeVar, map[string]any{})');
    });
    test ('negative: a nil-tested balance read keeps the nil answer', () => {
        const out = print ('    f (type: string) {\n        const b = this.safeDict (this.balance, type);\n        if (b === undefined) {\n            return undefined;\n        }\n        return this.note (b);\n    }\n');
        expect (out).not.toContain ('this.Balance[typeVar].(map[string]any)');
    });
    test ('negative: an untyped key keeps the wrap', () => {
        const out = print ('    f (k) {\n        const b = this.safeDict (this.balance, k, {});\n        return this.note (b);\n    }\n');
        expect (out).not.toContain ('].(map[string]any)');
    });
});

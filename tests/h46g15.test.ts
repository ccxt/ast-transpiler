import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

const HEAD = 'type Dict = { [key: string]: any };\nclass BaseExchange {\n'
    + '    balance: Dict = {};\n    options: Dict = {};\n'
    + '    safeDict (o: any, k: any, d: any = undefined): any { return d; }\n    safeString (o: any, k: any, d: any = undefined): string | undefined { return k; }\n'
    + '    note (h: any): any { return h; }\n}\nexport default BaseExchange;\n';
const print = (body: string, hooks: boolean): string => {
    const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h46g15-'));
    try {
        fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
        const file = path.join (dir, 'ts', 'src', 'x.ts');
        fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
        fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\nclass x extends Exchange {\n' + body + '}\n');
        const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
        const t: any = new Transpiler (config);
        if (hooks) {
            installCcxtGoHooks (t.goTranspiler);
        }
        return t.transpileGoByPath (file).content;
    } finally {
        fs.rmSync (dir, { 'recursive': true, 'force': true });
    }
};

const PTR = '    f (m: Dict) {\n        const k = this.safeString (m, \'k\');\n';
describe ('h46g15: safeDict reads of this.balance / this.options with a nil-proven *string key', () => {
    test ('an enclosing nil test: {} default written into', () => {
        const out = print (PTR + '        if (k !== undefined) {\n            const b = this.safeDict (this.balance, k, {});\n            b[\'a\'] = 1;\n        }\n    }\n', true);
        expect (out).toContain ('\t\tvar b map[string]any\n\t\tb, _ = this.Balance[*k].(map[string]any)\n\t\tif b == nil {\n\t\t\tb = map[string]any{}\n\t\t}\n');
        expect (out).not.toContain ('SafeDictMap(this.Balance');
    });
    test ('an earlier exiting nil test', () => {
        const out = print (PTR + '        if (k === undefined) {\n            return;\n        }\n        const b = this.safeDict (this.balance, k, {});\n        b[\'a\'] = 1;\n    }\n', true);
        expect (out).toContain ('\tb, _ = this.Balance[*k].(map[string]any)\n');
    });
    test ('options receiver with a {} default', () => {
        const out = print (PTR + '        if (k !== undefined) {\n            const o = this.safeDict (this.options, k, {});\n            o[\'a\'] = 1;\n        }\n    }\n', true);
        expect (out).toContain ('\t\to, _ = this.Options[*k].(map[string]any)\n');
    });
    test ('negative: an unguarded *string key keeps the helper (nil key)', () => {
        const out = print (PTR + '        const b = this.safeDict (this.balance, k, {});\n        b[\'a\'] = 1;\n    }\n', true);
        expect (out).toContain ('this.SafeDictMap(this.Balance, k, map[string]any{})');
        expect (out).not.toContain ('[*k]');
    });
    test ('negative: a rebound guarded key keeps the helper', () => {
        const out = print (PTR + '        if (k !== undefined) {\n            const b = this.safeDict (this.balance, k, {});\n            b[\'a\'] = 1;\n        }\n        k = undefined;\n    }\n'.replace ('const k', 'let k'), true);
        expect (out).not.toContain ('this.Balance[*k]');
    });
    test ('negative: a non-empty default keeps the helper', () => {
        const out = print (PTR + '        if (k !== undefined) {\n            const b = this.safeDict (this.balance, k, { \'a\': 1 });\n            b[\'b\'] = 1;\n        }\n    }\n', true);
        expect (out).not.toContain ('this.Balance[*k]');
    });
    test ('negative: an any key keeps the helper', () => {
        const out = print ('    f (m: Dict, k) {\n        if (k !== undefined) {\n            const b = this.safeDict (this.balance, k, {});\n            b[\'a\'] = 1;\n        }\n    }\n', true);
        expect (out).not.toContain ('this.Balance[*k]');
        expect (out).not.toContain ('this.Balance[k]');
    });
    test ('negative: another receiver keeps the helper', () => {
        const out = print (PTR + '        if (k !== undefined) {\n            const b = this.safeDict (m, k, {});\n            b[\'a\'] = 1;\n        }\n    }\n', true);
        expect (out).not.toContain ('m[*k].(map[string]any)');
    });
});

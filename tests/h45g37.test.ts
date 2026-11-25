import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h45g37-'));
const root = path.join (tmp, 'ts', 'src');
const BASE = 'export type Dict = { [key: string]: any };\n' +
    'export class BaseExchange {\n' +
    '    options: Dict;\n' +
    '    balance: Dict = {};\n' +
    '    safeDict (o: any, k: any, d: any = undefined): any { return d; }\n' +
    '    safeString (o: any, k: any, d: any = undefined): string { return d; }\n' +
    '}\nexport class Exchange extends BaseExchange {}\nexport default Exchange;\n';
const print = (body: string): string => {
    fs.mkdirSync (path.join (root, 'base'), { recursive: true });
    fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
    fs.writeFileSync (path.join (root, 'ex.ts'), "import { Exchange, Dict } from './base/Exchange';\nexport default class ex extends Exchange {\n" +
        '    f (code: string, other: Dict, k: any): any {\n' + body + '    }\n}\n');
    const t = new Transpiler ({ verbose: false, go: {} });
    return t.transpileGoByPath (path.join (root, 'ex.ts')).content;
};

describe ('h45g37: safeDict reads of the typed balance map', () => {
    afterAll (() => fs.rmSync (tmp, { recursive: true, force: true }));
    test ('a {} default written into takes a fresh map where the read is nil', () => {
        const out = print ("        const b = this.safeDict (this.balance, 'spot', {});\n        b['a'] = 1;\n        return b;\n");
        expect (out).toContain ('\tvar b map[string]any\n\tb, _ = this.Balance["spot"].(map[string]any)\n\tif b == nil {\n\t\tb = map[string]any{}\n\t}\n');
        expect (out).not.toContain ('SafeDictMap(this.Balance');
    });
    test ('a declared string key written into', () => {
        const out = print ("        const c: string = 'x' + this.safeString (other, 'c', 'y');\n        const b = this.safeDict (this.balance, c, {});\n        b['a'] = 1;\n        return b;\n");
        expect (out).toContain ('\tb, _ = this.Balance[c].(map[string]any)\n');
    });
    test ('a non-empty default keeps the helper', () => {
        const out = print ("        const b = this.safeDict (this.balance, 'spot', { 'a': 1 });\n        b['b'] = 1;\n        return b;\n");
        expect (out).not.toContain ('this.Balance["spot"].(map[string]any)');
    });
    test ('an any key keeps the helper', () => {
        const out = print ("        const b = this.safeDict (this.balance, k, {});\n        b['b'] = 1;\n        return b;\n");
        expect (out).not.toContain ('this.Balance[k].(map[string]any)');
    });
    test ('another receiver keeps the helper', () => {
        const out = print ("        const b = this.safeDict (other, 'spot', {});\n        b['b'] = 1;\n        return b;\n");
        expect (out).not.toContain ('other["spot"].(map[string]any)');
    });
});

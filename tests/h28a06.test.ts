import fs from 'fs';
import path from 'path';
import { Transpiler } from '../src/transpiler';

const root = path.join (__dirname, 'files', 'tmp-h28a06', 'ts', 'src');
const BASE = 'export type Dict = { [key: string]: any };\n' +
    'export class BaseExchange {\n' +
    '    options: Dict;\n' +
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


describe ('h28a06: defaulted safeDict reads of the typed Options map that are written into', () => {
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h28a06'), { recursive: true, force: true }));
    test ('a {} default written into takes a fresh map where the read is nil', () => {
        const out = print ("        const o = this.safeDict (this.options, 'networks', {});\n        o['a'] = 1;\n        return o;\n");
        expect (out).toContain ('\tvar o map[string]any\n\to, _ = this.Options["networks"].(map[string]any)\n\tif o == nil {\n\t\to = map[string]any{}\n\t}\n');
        expect (out).not.toContain ('SafeDictMap(this.Options');
    });
    test ('a declared string key written into', () => {
        const out = print ("        const c: string = 'x' + this.safeString (other, 'c', 'y');\n        const o = this.safeDict (this.options, c, {});\n        o['a'] = 1;\n        return o;\n");
        expect (out).toContain ('\to, _ = this.Options[c].(map[string]any)\n');
    });
    test ('a non-empty default is not read with the assertion', () => {
        const out = print ("        const o = this.safeDict (this.options, 'networks', { 'a': 1 });\n        o['b'] = 1;\n        return o;\n");
        expect (out).not.toContain ('this.Options["networks"].(map[string]any)');
    });
    test ('an any key is not read with the assertion', () => {
        const out = print ("        const o = this.safeDict (this.options, k, {});\n        o['b'] = 1;\n        return o;\n");
        expect (out).not.toContain ('this.Options[k].(map[string]any)');
    });
    test ('another receiver written into is not read with the assertion', () => {
        const out = print ("        const o = this.safeDict (other, 'networks', {});\n        o['b'] = 1;\n        return o;\n");
        expect (out).not.toContain ('other["networks"].(map[string]any)');
        expect (out).not.toContain ('if o == nil {');
    });
});

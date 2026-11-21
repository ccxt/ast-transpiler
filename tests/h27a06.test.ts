import fs from 'fs';
import path from 'path';
import { Transpiler } from '../src/transpiler';

const root = path.join (__dirname, 'files', 'tmp-h27a06', 'ts', 'src');
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

describe ('h27a06: safeDict reads of the typed Options map', () => {
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h27a06'), { recursive: true, force: true }));
    test ('a literal key prints the comma-ok read of this.Options', () => {
        const out = print ("        const networks = this.safeDict (this.options, 'networks');\n        return this.safeString (networks, code);\n");
        expect (out).toContain ('\tvar networks, _ = this.Options["networks"].(map[string]any)\n');
        expect (out).not.toContain ('SafeMapTyped(this.Options');
    });
    test ('a declared string key prints the comma-ok read', () => {
        const out = print ("        const c: string = 'x' + this.safeString (other, 'c', 'y');\n        const o = this.safeDict (this.options, c);\n        return this.safeString (o, code);\n");
        expect (out).toContain ('\tvar o, _ = this.Options[c].(map[string]any)\n');
    });
    test ('a read-only {} default prints the comma-ok read', () => {
        const out = print ("        const o = this.safeDict (this.options, 'networks', {});\n        return this.safeString (o, code);\n");
        expect (out).toContain ('\tvar o, _ = this.Options["networks"].(map[string]any)\n');
    });
    test ('an any key keeps the wrap', () => {
        const out = print ('        const o = this.safeDict (this.options, k);\n        return this.safeString (o, code);\n');
        expect (out).not.toContain ('this.Options[k].(map[string]any)');
    });
    test ('another receiver keeps the wrap', () => {
        const out = print ("        const o = this.safeDict (other, 'networks');\n        return this.safeString (o, code);\n");
        expect (out).not.toContain ('].(map[string]any)');
    });
    test ('a defaulted read with a write keeps its accessor', () => {
        const out = print ("        const o = this.safeDict (this.options, 'networks', {});\n        o['a'] = 1;\n        return o;\n");
        expect (out).not.toContain ('this.Options["networks"].(map[string]any)');
    });
});

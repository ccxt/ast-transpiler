import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// `const x = this.networkAliases` read by Object.keys and string-keyed element reads prints a map local and a native key range
describe ('h27g28 map field local with element reads', () => {
    const BASE = [
        'type Dict = {[key: string]: any};',
        'type Str = string | undefined;',
        'export class Exchange {',
        '    networkAliases: {[key: string]: string} = { \'ETH\': \'ERC20\' };',
        '    keep (x: any) { return x; }',
        '}',
        '',
    ].join ('\n');
    const HEADER = 'import { Exchange } from \'../base/Exchange\';\n';
    const print = (body: string): string => {
        const tmp = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h27g28-'));
        try {
            const src = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (path.join (src, 'base'), { 'recursive': true });
            fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE);
            fs.writeFileSync (path.join (src, 'ex.ts'), HEADER + 'export class ex extends Exchange {\n' + body + '}\n');
            const t: any = new Transpiler ({ 'verbose': false, 'go': {} });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (path.join (src, 'ex.ts')).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    const loop = '        const keys = Object.keys (aliases);\n        for (let i = 0; i < keys.length; i++) {\n            const alias = keys[i];\n';
    test ('keys plus a string-keyed element read print a map local and a native range (fails on the base printer)', () => {
        const out = print ('    f (code: string): Str {\n        const aliases = this.networkAliases;\n' + loop
            + '            if (aliases[alias] === code) {\n                return alias;\n            }\n        }\n        return undefined;\n    }\n');
        expect (out).toContain ('var aliases map[string]any = this.NetworkAliases');
        expect (out).toContain ('for objectKey := range aliases {');
        expect (out).not.toContain ('ObjectKeys(aliases)');
        expect (out).not.toContain ('GetValue(aliases');
    });
    test ('negative: an element write keeps the box', () => {
        const out = print ('    g () {\n        const aliases = this.networkAliases;\n' + loop
            + '            aliases[alias] = \'x\';\n        }\n    }\n');
        expect (out).not.toContain ('var aliases map[string]any');
        expect (out).toContain ('ObjectKeys(aliases)');
    });
    test ('negative: a nil compare of the local keeps the box', () => {
        const out = print ('    h () {\n        const aliases = this.networkAliases;\n        if (aliases === undefined) {\n            return undefined;\n        }\n        return aliases[\'a\'];\n    }\n');
        expect (out).not.toContain ('var aliases map[string]any');
    });
    test ('negative: handing the local to an any slot keeps the box (typed nil)', () => {
        const out = print ('    k () {\n        const aliases = this.networkAliases;\n        const x = aliases[\'a\'];\n        return this.keep (aliases);\n    }\n');
        expect (out).not.toContain ('var aliases map[string]any');
    });
});

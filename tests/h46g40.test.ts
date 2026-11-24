import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a safeDict read of this.options with a `*string` key prints the comma-ok read of the typed map
describe ('h46g40: safeDict of this.options with a *string key', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass BaseExchange {\n'
        + '    options: Dict = {};\n'
        + '    safeDict (o: any, k: any, d: Dict = undefined): Dict { return d; }\n'
        + '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n}\nexport default BaseExchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h46g40-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'go', 'v4'), { 'recursive': true });
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\ntype Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass x extends Exchange {\n' + body + '}\n');
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const fn = (sig: string, pre: string, read: string) => '    f (' + sig + '): Str {\n' + pre
        + '        const o = ' + read + ';\n        return this.safeString (o, \'url\');\n    }\n';
    test ('unguarded *string key: nil-guarded comma-ok read (fails on the base printer)', () => {
        const out = print (fn ('type: Str = undefined', '', 'this.safeDict (this.options, type, {})'));
        expect (out).toContain ('\tvar o map[string]any\n\tif typeVar != nil {\n\t\to, _ = this.Options[*typeVar].(map[string]any)\n\t}\n');
        expect (out).not.toContain ('SafeMapTyped(this.Options');
    });
    test ('early-return guarded *string key: comma-ok read of the pointed string', () => {
        const out = print (fn ('type: Str = undefined', '        if (type === undefined) {\n            return undefined;\n        }\n', 'this.safeDict (this.options, type)'));
        expect (out).toContain ('o, _ = this.Options[*typeVar].(map[string]any)\n');
        expect (out).not.toContain ('SafeMapTyped(this.Options');
    });
    test ('an any key keeps the wrap', () => {
        const out = print (fn ('type: any', '', 'this.safeDict (this.options, type)'));
        expect (out).toContain ('SafeMapTyped(this.Options, typeVar)');
    });
    test ('a *string key on another receiver keeps the wrap', () => {
        const out = print (fn ('other: Dict, type: Str = undefined', '', 'this.safeDict (other, type)'));
        expect (out).not.toContain ('[*typeVar].(map[string]any)');
    });
});

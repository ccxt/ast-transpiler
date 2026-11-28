import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// `const x = this.safeDict (C, 'k', {})` on a typed base map local C prints the comma-ok read plus the `{}` fill
describe ('h55g64: defaulted safeDict of a typed base map local, comma-ok read', () => {
    const BASE = (body: string) => 'export type Str = string | undefined;\nexport type Dict = { [key: string]: any };\nexport class Exchange {\n'
        + '    safeDict (o: any, k: any, d: Dict = undefined): Dict { return d; }\n'
        + '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n'
        + '    extend (...args: any[]): Dict { return {}; }\n'
        + '    f (currency: Dict): Dict {\n' + body + '    }\n}\n';
    const POS = "        const limitsMain: Dict = this.safeDict (currency, 'limits', {});\n"
        + "        const depositMain: Dict = this.safeDict (limitsMain, 'deposit', {});\n"
        + "        const min = this.safeString (depositMain, 'min');\n"
        + "        currency['limits'] = this.extend (limitsMain, { 'deposit': this.extend (depositMain, { 'min': min }) });\n"
        + '        return currency;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h55g64-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            const file = path.join (dir, 'ts', 'src', 'base', 'Exchange.ts');
            fs.writeFileSync (file, BASE (body));
            const t: any = new Transpiler ({ 'verbose': false, 'go': {} });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    test ('the defaulted read of a typed map local is the comma-ok read with the {} fill', () => {
        const out = print (POS);
        expect (out).toMatch (/var depositMain, _ = limitsMain\["deposit"\]\.\(map\[string\]any\)\n\s*if depositMain == nil \{\n\s*depositMain = map\[string\]any\{\}\n\s*\}/);
        expect (out).not.toContain ('SafeDictMap(limitsMain');
    });
    test ('negative: a container written through keeps the wrap', () => {
        const out = print (POS.replace ('        return', "        limitsMain['x'] = 1;\n        return"));
        expect (out).not.toContain ('limitsMain["deposit"].(map[string]any)');
    });
    test ('negative: a non-empty default keeps the wrap', () => {
        const out = print (POS.replace ("'deposit', {}", "'deposit', { 'min': '1' }"));
        expect (out).not.toContain ('limitsMain["deposit"].(map[string]any)');
    });
    test ('negative: a nil-able string key keeps the wrap', () => {
        const out = print ("        const k = this.safeString (currency, 'k');\n" + POS.replace ("'deposit', {}", 'k, {}'));
        expect (out).not.toContain ('limitsMain[k].(map[string]any)');
        expect (out).not.toContain ('limitsMain[*k].(map[string]any)');
    });
});

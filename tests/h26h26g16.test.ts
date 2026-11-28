import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// safeDict / safeList locals in ts/src/base/Exchange.ts take the typed-local rules of a ws source
describe ('go base-tier safeDict / safeList locals', () => {
    const TYPES = 'export type Dict = { [key: string]: any };\nexport type List = any[];\nexport type Str = string | undefined;\n';
    const methods =
        '    safeDict (o: any, k: any, d: Dict = undefined): Dict {\n        return o;\n    }\n' +
        '    safeList (o: any, k: any, d: List = undefined): List {\n        return o;\n    }\n' +
        '    safeString (o: any, k: any, d: string = undefined): string {\n        return o;\n    }\n' +
        '    listPos (orderDict: Dict) {\n        const fees = this.safeList (orderDict, \'fees\', []);\n        let n = 0;\n        for (let j = 0; j < fees.length; j++) {\n            n = n + 1;\n        }\n        return n;\n    }\n' +
        '    dictPos (entry: Dict) {\n        const tradeFee = this.safeDict (entry, \'fee\', {});\n        tradeFee[\'cost\'] = this.safeString (tradeFee, \'cost\');\n        entry[\'fee\'] = tradeFee;\n        return entry;\n    }\n' +
        '    listNilTest (orderDict: Dict) {\n        const fees = this.safeList (orderDict, \'fees\');\n        if (fees === undefined) {\n            return 0;\n        }\n        return fees;\n    }\n' +
        '    dictNullableKey (c: Dict, k: Str) {\n        const d = this.safeDict (c, \'x\', {});\n        d[\'cost\'] = this.safeString (d, \'cost\');\n        if (!(k in d)) {\n            return undefined;\n        }\n        return d[k];\n    }\n' +
        '    listRebound (orderDict: Dict, other: any) {\n        let fees = this.safeList (orderDict, \'fees\', []);\n        fees = other;\n        return fees;\n    }\n';
    const BASE = "import { Dict, List, Str } from './types.js';\nexport class Exchange {\n" + methods + '}\n';
    const OTHER = "import { Dict, List, Str } from './types.js';\nexport class Other {\n" + methods + '}\n';
    const fnOf = (out: string, name: string) => {
        const start = out.search (new RegExp ('func \\(this \\*\\w+\\) ' + name.charAt (0).toUpperCase () + name.slice (1) + '\\('));
        const next = out.indexOf ('\nfunc ', start + 1);
        return out.slice (start, (next < 0) ? out.length : next);
    };
    let base = '';
    let other = '';
    beforeAll (() => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h26g16-'));
        try {
            const src = path.join (tmp, 'ts', 'src', 'base');
            fs.mkdirSync (src, { 'recursive': true });
            fs.writeFileSync (path.join (src, 'types.ts'), TYPES);
            fs.writeFileSync (path.join (src, 'Exchange.ts'), BASE);
            fs.writeFileSync (path.join (src, 'Other.ts'), OTHER);
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            installCcxtGoHooks (t.goTranspiler);
            base = t.transpileGoByPath (path.join (src, 'Exchange.ts')).content;
            other = t.transpileGoByPath (path.join (src, 'Other.ts')).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    });
    test ('pin: a []-defaulted safeList local in the base prints []any (already so at base)', () => {
        expect (fnOf (base, 'listPos')).toMatch (/var fees \[\]any = /);
    });
    test ('positive: a {}-defaulted safeDict local in the base prints a map', () => {
        expect (fnOf (base, 'dictPos')).toContain ('var tradeFee map[string]any = this.SafeDictMap(entry, "fee", map[string]any{})');
    });
    test ('negative: another base file keeps the box', () => {
        expect (fnOf (other, 'dictPos')).not.toContain ('SafeDictMap(');
        expect (fnOf (other, 'dictNullableKey')).not.toContain ('SafeDictMap(');
    });
    test ('negative: a local read with a nullable key keeps the box', () => {
        expect (fnOf (base, 'dictNullableKey')).not.toContain ('SafeDictMap(');
    });
    test ('negative: a rebinding to another value keeps the box', () => {
        expect (fnOf (base, 'listRebound')).toMatch (/var fees any = /);
    });
    test ('negative: a nil-tested no-default list prints as in any other file', () => {
        expect (fnOf (base, 'listNilTest').replace ('*Exchange', '*Other')).toBe (fnOf (other, 'listNilTest'));
    });
});

import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a venue method declared `Strings` whose every return is absent, a split or a safeStringList prints `[]string`
describe ('h48g02: declared Strings returns print []string', () => {
    const BASE = 'export type Dict = { [key: string]: any };\nexport type Str = string | undefined;\nexport type Strings = string[] | undefined;\nexport class Exchange {\n'
        + '    safeValue (a: any, k: any, d: any = undefined): any { return a; }\n    safeStringList (a: any, ks: any[]): Strings { return a; }\n'
        + '    safeString (a: any, k: any, d: Str = undefined): Str { return a; }\n}\n';
    const run = (members: string): string => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h48g02-'));
        try {
            const src = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (path.join (src, 'base'), { recursive: true });
            fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE);
            const file = path.join (src, 'ex.ts');
            fs.writeFileSync (file, 'import { Exchange, Dict, Str, Strings } from \'./base/Exchange\';\nexport default class ex extends Exchange {\n' + members + '}\n');
            const inst: any = new Transpiler ({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 } } });
            installCcxtGoHooks (inst.goTranspiler);
            return inst.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { recursive: true, force: true });
        }
    };
    const parse = (decl: string, other: string) => '    parseIds (ids: any)' + decl + ' {\n'
        + '        if ((ids !== undefined) && typeof ids === \'string\') {\n            return ids.split (\',\');\n        } else {\n'
        + '            return ' + other + ';\n        }\n    }\n';
    const caller = '    cancel (params: Dict) {\n        const out = [];\n        const ids = this.parseIds (this.safeValue (params, \'ids\'));\n'
        + '        if (ids !== undefined) {\n            for (let i = 0; i < ids.length; i++) {\n                out.push (this.safeString (ids, i));\n            }\n        }\n        return out;\n    }\n';
    test ('a split / safeStringList method prints []string and its caller tests nil natively', () => {
        const out = run (parse (': Strings', 'this.safeStringList ([ ids ], [ 0 ])') + caller);
        expect (out).toContain ('ParseIds(ids any) []string {');
        expect (out).toContain ('\tif ids != nil {\n\t\tfor i := 0; i < len(ids); i++ {');
    });
    test ('returning the untyped parameter keeps any', () => {
        const out = run (parse (': Strings', 'ids') + caller);
        expect (out).toContain ('ParseIds(ids any) any {');
    });
    test ('an undeclared return keeps any', () => {
        const out = run (parse ('', 'this.safeStringList ([ ids ], [ 0 ])') + caller);
        expect (out).toContain ('ParseIds(ids any) any {');
    });
    test ('an absent path keeps []string nil', () => {
        const out = run (parse (': Strings', 'undefined') + caller);
        expect (out).toContain ('ParseIds(ids any) []string {');
    });
});

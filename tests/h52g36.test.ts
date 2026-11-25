import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a `: Str` venue method with a nil path whose every caller binds a const local, tests it against undefined
// and then only uses it as a map key (`k in d`, `d[k]`): the key slot derefs, so the method may return *string
describe ('h52g36 Str return used as a map key', () => {
    const BASE = [
        'export class Exchange {',
        '    mystery (x: any): any { return x; }',
        '    safeString (o: any, k: any, d: any = undefined): string { return o; }',
        '    account (): Dict { return {}; }',
        '    safeString2 (o: any, k: any, k2: any, d: any = undefined): Str { return o; }',
        '    safeCurrencyCode (c: Str, cur: any = undefined): Str { return c; }',
        '    safeMarket (m: Str = undefined): Market { return undefined; }',
        '}',
        'type Dict = {[key: string]: any}; type Str = string | undefined; type Market = Dict;',
        '',
    ].join ('\n');
    const HEADER = 'import { Exchange } from \'./base/Exchange\';\ntype Dict = {[key: string]: any}; type Str = string | undefined; type Market = Dict;\n';
    const print = (body: string): string => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h52g36-'));
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
    const producer = '    rowCode (row: Dict): Str {\n'
        + '        const base = this.safeString (row, \'base\');\n'
        + '        if (base !== undefined) {\n            return base;\n        }\n'
        + '        const d = this.safeString (row, \'d\');\n'
        + '        if (d === undefined) {\n            return undefined;\n        }\n'
        + '        return this.safeString (row, \'x\');\n    }\n';
    const consumer = (use: string) => '    collect (rows: Dict[]): Dict {\n'
        + '        const result: Dict = {};\n'
        + '        for (let i = 0; i < rows.length; i++) {\n'
        + '            const code = this.rowCode (rows[i]);\n'
        + '            if ((code === undefined) || (code in result)) {\n                continue;\n            }\n'
        + use
        + '        }\n        return result;\n    }\n';
    test ('key-only uses type the return (fails on the base printer)', () => {
        const out = print (producer + consumer ('            const account = this.account ();\n            result[code] = account;\n'));
        expect (out).toMatch (/RowCode\(row \S+\) \*string {/);
        expect (out).not.toContain ('AddElementToObject(result, code, account)');
    });
    test ('a value use keeps the boxed return', () => {
        const out = print (producer + consumer ('            result[code] = { \'code\': code };\n'));
        expect (out).not.toMatch (/RowCode\(row \S+\) \*string {/);
    });
    test ('an unknown consumer keeps the boxed return', () => {
        const out = print (producer + consumer ('            this.mystery (code);\n            result[code] = true;\n'));
        expect (out).not.toMatch (/RowCode\(row \S+\) \*string {/);
    });
    test ('a same-named local in a sibling block does not hold the proof', () => {
        const out = print (producer + consumer ('            const account = this.account ();\n            result[code] = account;\n'
            + '        }\n        for (let j = 0; j < rows.length; j++) {\n            const code = this.safeString (rows[j], \'c\');\n            this.mystery (code);\n'));
        expect (out).toMatch (/RowCode\(row \S+\) \*string {/);
    });
    test ('a same-named local in a nested block still holds it back', () => {
        const out = print (producer + consumer ('            result[code] = true;\n            if (i > 0) {\n                const code = this.safeString (rows[i], \'c\');\n                this.mystery (code);\n            }\n'));
        expect (out).not.toMatch (/RowCode\(row \S+\) \*string {/);
    });
});

import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

// `const row = rows[i]` of a `Dict[]` slice held as an optional map: the element's map handle, `None` out of range / non-map
describe ('h42r17: an optional map row of a slice element prints the native element match', () => {
    const HEAD = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport default class Exchange {\n'
        + '    toArray (o: any): any[] { return o; }\n    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n    hold (x: any): any { return x; }\n}\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h42r17-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            const file = path.join (dir, 'ts', 'src', 'venue.ts');
            fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\nimport type { Dict } from \'./base/Exchange.js\';\nexport default class venue extends Exchange {\n' + body + '}\n');
            const t: any = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
            t.transpileRustByPath (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'));
            return t.transpileRustByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const fees = (row: string) => '    parseFees (response: any) {\n        const result: Dict = {};\n        const rows: Dict[] = this.toArray (response);\n'
        + '        for (let i = 0; i < rows.length; i++) {\n            ' + row + '\n            const code = this.safeString (fee, \'CurrencyCode\');\n'
        + '            if (code !== undefined) {\n                result[code] = { \'info\': fee };\n            }\n        }\n        return result;\n    }\n';
    test ('positive: the row is matched in place, no boxed copy converted', () => {
        const out = print (fees ('const fee = rows[i];'));
        expect (out).toContain ('Option<crate::value::Dict> = (match rows.get(i as usize) { Some(Value::Dict(__m)) => Some(std::sync::Arc::clone(__m)), _ => None });');
        expect (out).not.toContain ('.into_opt_dict()');
    });
    test ('negative: a string-key read is no slice element and keeps its own form', () => {
        const out = print (fees ('const fee = response[\'x\'];'));
        expect (out).not.toContain ('Some(Value::Dict(__m)) => Some(std::sync::Arc::clone(__m))');
    });
});

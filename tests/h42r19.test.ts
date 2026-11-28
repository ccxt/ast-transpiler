import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

// prediction venues share the base-tier plain-dict proof: an omit copy of a typed `Dict` parameter enumerates natively
describe ('h42r19: Object.keys of a proven plain local in a prediction venue reads the map in place', () => {
    const BASE = 'export interface Dict { [key: string]: any }\n'
        + 'const omit = (d: any, ...k: any[]): any => d;\n'
        + 'export default class Exchange {\n'
        + '    omit = omit;\n'
        + '    hold (x: any): any { return x; }\n'
        + '    extractParams (p: string): string[] { return []; }\n'
        + '}\n';
    const print = (rel: string, body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h42r19-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'prediction'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'pro'), { 'recursive': true });
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), BASE);
            const file = path.join (dir, 'ts', 'src', rel);
            fs.writeFileSync (file, 'import Exchange from \'../base/Exchange.js\';\nimport type { Dict } from \'../base/Exchange.js\';\n'
                + 'export default class venue extends Exchange {\n' + body + '}\n');
            const t: any = new Transpiler ({ 'verbose': false });
            return t.transpileRustByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const sign = (paramType: string) => '    sign (path: string, params' + paramType + ' = {}) {\n'
        + '        let query: Dict = {};\n'
        + '        if (path !== \'\') {\n'
        + '            query = this.omit (params, this.extractParams (path));\n'
        + '        }\n'
        + '        const queryKeys = Object.keys (query);\n'
        + '        return this.hold (queryKeys);\n'
        + '    }\n';
    test ('a typed Dict parameter copied by omit: native keys', () => {
        const out = print ('prediction/venue.ts', sign (': Dict'));
        expect (out).not.toContain ('object_keys(&query)');
        expect (out).toMatch (/query\.as_map\(\)\.map\(\|__m\| __m\.keys\(\)/);
        // the key is lent as &str, not cloned into the Value
        expect (out).toContain ('__m.keys().map(|__k| Value::from(__k.as_str())).collect()');
        expect (out).not.toContain ('__k.clone()');
    });
    test ('an untyped parameter keeps the helper', () => {
        const out = print ('prediction/venue.ts', sign (': any'));
        expect (out).toContain ('object_keys(&query)');
    });
    test ('a pro file keeps the helper (a ws handler parameter may carry tags)', () => {
        const out = print ('pro/venue.ts', sign (': Dict'));
        expect (out).toContain ('object_keys(&query)');
    });
});

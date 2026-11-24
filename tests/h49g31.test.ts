import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go getSupportedMapping key prints *string', () => {
    const root = path.join (__dirname, 'files', 'tmp-h49g31', 'ts', 'src');
    const BODY =
        '        if (key === undefined) {\n' +
        "            throw new Error (this.id + ' requires a key argument');\n" +
        '        }\n' +
        '        if (key in mapping) {\n' +
        '            return this.safeString (mapping, key, key);\n' +
        '        } else {\n' +
        '            const keys = Object.keys (mapping);\n' +
        "            throw new Error (this.id + ' ' + key + ' does not have a value in mapping' + ', must be one of ' + keys.join (', '));\n" +
        '        }\n' +
        '    }\n';
    const BASE =
        'export type Str = string | undefined;\n' +
        'export type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    id: string = "x";\n' +
        '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n' +
        '    getSupportedMapping (key: Str, mapping: Dict = {}): string {\n' + BODY +
        '    otherSupportedMapping (key: Str, mapping: Dict = {}): string {\n' + BODY +
        '    f (row: Dict): string {\n' +
        "        const t = this.safeString (row, 'type');\n" +
        "        return this.getSupportedMapping (t, { 'spot': 'a' });\n" +
        '    }\n' +
        '}\n';
    const print = (install = true): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        const t = new Transpiler ({ verbose: false, go: {} });
        if (install) { installCcxtGoHooks (t.goTranspiler); }
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h49g31'), { recursive: true, force: true }));

    test ('key is *string with a native nil test', () => {
        const out = print ();
        expect (out).toMatch (/GetSupportedMapping\(key \*string, /);
        expect (out).toContain ('if key == nil {');
        expect (out).not.toContain ('IsEqual(key, nil)');
        expect (out).toContain ('this.GetSupportedMapping(t, ');
        expect (out).not.toContain ('GetSupportedMapping(SafeStringPtr(');
    });
    test ('the untabled twin keeps any', () => {
        const out = print ();
        expect (out).toMatch (/OtherSupportedMapping\(key any, /);
    });
    test ('without the ccxt hooks the key stays any', () => {
        expect (print (false)).toMatch (/GetSupportedMapping\(key any, /);
    });
});

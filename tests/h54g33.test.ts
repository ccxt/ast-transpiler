import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go networkCodeToId networkCode prints *string', () => {
    const root = path.join (__dirname, 'files', 'tmp-h54g33', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    id: string = "x";\n' +
        '    options: Dict = {};\n' +
        '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n' +
        '    networkCodeToId (networkCode: Str, currencyCode: Str = undefined): Str {\n' +
        '        if (networkCode === undefined) {\n' +
        '            return undefined;\n' +
        '        }\n' +
        '        return this.safeString (this.options, networkCode, networkCode);\n' +
        '    }\n' +
        '    otherCodeToId (networkCode: Str): Str {\n' +
        '        if (networkCode === undefined) {\n' +
        '            return undefined;\n' +
        '        }\n' +
        '        return networkCode;\n' +
        '    }\n' +
        '    callers (params: Dict): Str {\n' +
        "        const networkCode = this.safeString (params, 'network');\n" +
        '        return this.networkCodeToId (networkCode);\n' +
        '    }\n' +
        '}\n';
    const print = (install = true): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        const t = new Transpiler ({ verbose: false, go: {} });
        if (install) { installCcxtGoHooks (t.goTranspiler); }
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h54g33'), { recursive: true, force: true }));

    test ('networkCode is *string with a native nil test', () => {
        const out = print ();
        expect (out).toMatch (/NetworkCodeToId\(networkCode \*string/);
        expect (out).toContain ('if networkCode == nil {');
        expect (out).not.toContain ('IsEqual(networkCode, nil)');
        expect (out).toContain ('this.NetworkCodeToId(networkCode)');
    });
    test ('the untabled twin keeps any', () => {
        expect (print ()).toMatch (/OtherCodeToId\(networkCode any\)/);
    });
    test ('without the ccxt hooks networkCode stays any', () => {
        expect (print (false)).toMatch (/NetworkCodeToId\(networkCode any/);
    });
});

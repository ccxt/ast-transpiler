import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go selectNetworkKeyFromNetworks takes a *string networkCode', () => {
    const root = path.join (__dirname, 'files', 'tmp-h15b04', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        "    id: string = 'x';\n" +
        '    selectNetworkKeyFromNetworks (currencyCode: string, networkCode: Str, entries: any): Str {\n' +
        '        if (networkCode !== undefined) {\n' +
        "            throw new Error (this.id + ' - ' + networkCode + ' network');\n" +
        '        }\n' +
        '        return undefined;\n' +
        '    }\n' +
        '    otherSelect (currencyCode: string, networkCode: Str, entries: any): Str {\n' +
        '        if (networkCode !== undefined) {\n' +
        "            throw new Error (this.id + ' - ' + networkCode + ' network');\n" +
        '        }\n' +
        '        return undefined;\n' +
        '    }\n' +
        '}\n';
    const print = (install = true): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        const t = new Transpiler ({ verbose: false, go: {} });
        if (install) { installCcxtGoHooks (t.goTranspiler); }
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h15b04'), { recursive: true, force: true }));

    test ('the tabled slot prints *string, a native nil compare and no Add', () => {
        const out = print ();
        expect (out).toMatch (/SelectNetworkKeyFromNetworks\(currencyCode any, networkCode \*string/);
        expect (out).toContain ('if networkCode != nil {');
        // the untabled sibling keeps the box
        expect (out).toMatch (/OtherSelect\(currencyCode any, networkCode any/);
        expect (out).toContain ('Add(Add(this.Id+" - ", networkCode), " network")');
        expect (print (false)).not.toMatch (/SelectNetworkKeyFromNetworks\([^)]*networkCode \*string/);
    });
});

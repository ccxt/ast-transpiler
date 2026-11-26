import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go padHexAddress address prints *string', () => {
    const root = path.join (__dirname, 'files', 'tmp-h53g33', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    id: string = "x";\n' +
        '    walletAddress!: string;\n' +
        '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n' +
        '    remove0xPrefix (s: any): string { return s; }\n' +
        '    padHexAddress (address: Str): string {\n' +
        '        if (address === undefined) {\n' +
        "            return '';\n" +
        '        }\n' +
        '        const stripped = this.remove0xPrefix (address);\n' +
        "        return '000000000000000000000000' + stripped;\n" +
        '    }\n' +
        '    otherPad (address: Str): string {\n' +
        '        if (address === undefined) {\n' +
        "            return '';\n" +
        '        }\n' +
        '        return this.remove0xPrefix (address);\n' +
        '    }\n' +
        '    callers (params: Dict): string {\n' +
        "        const spender = this.safeString (params, 'spender');\n" +
        '        const owner: string = this.walletAddress;\n' +
        "        return '0x' + this.padHexAddress (spender) + this.padHexAddress (owner);\n" +
        '    }\n' +
        '}\n';
    const print = (install = true): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        const t = new Transpiler ({ verbose: false, go: {} });
        if (install) { installCcxtGoHooks (t.goTranspiler); }
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h53g33'), { recursive: true, force: true }));

    test ('address is *string with a native nil test', () => {
        const out = print ();
        expect (out).toMatch (/PadHexAddress\(address \*string\)/);
        expect (out).toContain ('if address == nil {');
        expect (out).not.toContain ('IsEqual(address, nil)');
        expect (out).not.toContain ('SafeStringPtr(');
        expect (out).toContain ('this.PadHexAddress(&owner)');
    });
    test ('the untabled twin keeps any', () => {
        expect (print ()).toMatch (/OtherPad\(address any\)/);
    });
    test ('without the ccxt hooks address stays any', () => {
        expect (print (false)).toMatch (/PadHexAddress\(address any\)/);
    });
});

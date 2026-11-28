import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go checkAddress address prints *string', () => {
    const root = path.join (__dirname, 'files', 'tmp-h53g55', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    id: string = "x";\n' +
        '    minFundingAddressLength: number = 1;\n' +
        '    options: Dict = {};\n' +
        '    unique (x: any): any[] { return x; }\n' +
        '    inArray (x: any, l: any): boolean { return true; }\n' +
        '    safeList (o: any, k: any, d: any = undefined): any[] { return d; }\n' +
        '    stringToCharsArray (value: string): string[] {\n' +
        "        return value.split ('');\n" +
        '    }\n' +
        '    checkAddress (address: Str = undefined, code: Str = undefined, tag: Str = undefined): Str {\n' +
        '        if (address === undefined) {\n' +
        "            throw new Error (this.id + ' address is undefined');\n" +
        '        }\n' +
        '        const uniqChars = (this.unique (this.stringToCharsArray (address)));\n' +
        '        const length = uniqChars.length; // py transpiler trick\n' +
        "        if (length === 1 || address.length < this.minFundingAddressLength || address.indexOf (' ') > -1) {\n" +
        "            throw new Error (this.id + ' address is invalid or has less than ' + this.minFundingAddressLength.toString () + ' characters: \"' + address.toString () + '\"');\n" +
        '        }\n' +
        '        if (code !== undefined) {\n' +
        "            const tagRequiredCurrencies = this.safeList (this.options, 'withdrawTagRequiredCurrencies', []);\n" +
        '            if (this.inArray (code, tagRequiredCurrencies)) {\n' +
        '                if (tag === undefined) {\n' +
        "                    throw new Error (this.id + ' withdraw() requires params[\"tag\"] for ' + code);\n" +
        '                }\n' +
        '            }\n' +
        '        }\n' +
        '        return address;\n' +
        '    }\n' +
        '}\n';
    const print = (install = true, base = BASE): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), base);
        const t = new Transpiler ({ verbose: false, go: {} });
        if (install) { installCcxtGoHooks (t.goTranspiler); }
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h53g55'), { recursive: true, force: true }));

    test ('address binds *string and its reads print natively', () => {
        const out = print ();
        expect (out).toContain ('var address *string = GetArgStringPtr(optionalArgs, 0, nil)');
        expect (out).toContain ('CheckAddress(optionalArgs ...any) *string {');
        expect (out).toContain ('len(*address) < this.MinFundingAddressLength');
        expect (out).toContain ('characters: \\"" + *address + "\\""');
        expect (out).not.toContain ('ToString(address)');
        expect (out).not.toContain ('GetLength(address)');
    });
    test ('an unguarded length keeps the box', () => {
        const out = print (true, BASE.replace ('        if (address === undefined) {\n            throw new Error (this.id + \' address is undefined\');\n        }\n', ''));
        expect (out).not.toContain ('len(*address)');
    });
    test ('without the ccxt hooks address stays any', () => {
        expect (print (false)).toContain ('address := GetArg(optionalArgs, 0, nil)');
    });
});

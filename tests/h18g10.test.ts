import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go commonCurrencyCode takes and returns *string', () => {
    const root = path.join (__dirname, 'files', 'tmp-h18g10', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        '    substituteCommonCurrencyCodes: boolean = true;\n' +
        '    commonCurrencies: any = {};\n' +
        '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n' +
        '    commonCurrencyCode (code: string): string {\n' +
        '        if (!this.substituteCommonCurrencyCodes) {\n' +
        '            return code;\n' +
        '        }\n' +
        '        return this.safeString (this.commonCurrencies, code, code);\n' +
        '    }\n' +
        '    otherCurrencyCode (code: string): string {\n' +
        '        if (!this.substituteCommonCurrencyCodes) {\n' +
        '            return code;\n' +
        '        }\n' +
        '        return this.safeString (this.commonCurrencies, code, code);\n' +
        '    }\n' +
        '    feeCode (trade: any): any {\n' +
        "        const id = this.safeString (trade, 'fee_currency');\n" +
        '        const code = this.commonCurrencyCode (id);\n' +
        '        if (code === undefined) {\n' +
        '            return undefined;\n' +
        '        }\n' +
        '        return code;\n' +
        '    }\n' +
        '}\n';
    const print = (install = true): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        const t = new Transpiler ({ verbose: false, go: {} });
        if (install) { installCcxtGoHooks (t.goTranspiler); }
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h18g10'), { recursive: true, force: true }));

    test ('the base signature is *string in and out, the bare return needs no wrap', () => {
        const out = print ();
        expect (out).toMatch (/CommonCurrencyCode\(code \*string\) \*string \{/);
        expect (out).not.toContain ('SafeStringPtr(code)');
        expect (out).not.toMatch (/return SafeStringPtr\(/);
    });
    test ('an untabled sibling keeps the box', () => {
        expect (print ()).toMatch (/OtherCurrencyCode\(code any\) any/);
    });
    test ('a nil-tested caller passes the *string through and keeps the nil answer', () => {
        const out = print ();
        expect (out).toContain ('this.CommonCurrencyCode(id)');
        expect (out).not.toContain ('CommonCurrencyCode(SafeStringPtr(');
        expect (out).not.toContain ('CommonCurrencyCode(StringArg(');
    });
    test ('without the ccxt hooks the base printer keeps any', () => {
        expect (print (false)).not.toMatch (/CommonCurrencyCode\(code \*string\)/);
    });
});

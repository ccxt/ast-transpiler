import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go tabled base Str inputs print *string', () => {
    const root = path.join (__dirname, 'files', 'tmp-h26g18', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        '    id: string = "x";\n' +
        '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n' +
        '    parsePrecision (precision: Str): Str { return precision; }\n' +
        '    checkRequiredMarginArgument (methodName: string, symbol: Str, marginMode: string) {\n' +
        "        if ((marginMode === 'isolated') && (symbol === undefined)) {\n" +
        "            throw new Error (this.id + ' isolated');\n" +
        "        } else if ((marginMode === 'cross') && (symbol !== undefined)) {\n" +
        "            throw new Error (this.id + ' cross');\n" +
        '        }\n' +
        '    }\n' +
        '    integerPrecisionToAmount (precision: Str): Str {\n' +
        '        if (precision === undefined) {\n' +
        '            return undefined;\n' +
        '        }\n' +
        '        return this.parsePrecision (precision);\n' +
        '    }\n' +
        '    otherPrecisionToAmount (precision: Str): Str {\n' +
        '        if (precision === undefined) {\n' +
        '            return undefined;\n' +
        '        }\n' +
        '        return this.parsePrecision (precision);\n' +
        '    }\n' +
        '    caller (raw: any): Str {\n' +
        "        const cvtp = this.safeString (raw, 'p');\n" +
        '        return this.integerPrecisionToAmount (cvtp);\n' +
        '    }\n' +
        '}\n';
    const print = (install = true): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        const t = new Transpiler ({ verbose: false, go: {} });
        if (install) { installCcxtGoHooks (t.goTranspiler); }
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h26g18'), { recursive: true, force: true }));

    test ('checkRequiredMarginArgument symbol is *string with native nil tests', () => {
        const out = print ();
        expect (out).toMatch (/CheckRequiredMarginArgument\(methodName \w+, symbol \*string, /);
        expect (out).toContain ('(symbol == nil)');
        expect (out).toContain ('(symbol != nil)');
        expect (out).not.toContain ('IsEqual(symbol, nil)');
    });
    test ('integerPrecisionToAmount precision is *string and keeps its nil answer', () => {
        const out = print ();
        expect (out).toMatch (/IntegerPrecisionToAmount\(precision \*string\)/);
        expect (out).toMatch (/if precision == nil \{\s*return nil/);
    });
    test ('a nilable *string caller argument is passed through unwrapped', () => {
        const out = print ();
        expect (out).toContain ('this.IntegerPrecisionToAmount(cvtp)');
        expect (out).not.toContain ('IntegerPrecisionToAmount(StringArg(');
        expect (out).not.toContain ('IntegerPrecisionToAmount(SafeStringPtr(');
    });
    test ('an untabled sibling keeps the box', () => {
        expect (print ()).toMatch (/OtherPrecisionToAmount\(precision any\) any/);
    });
    test ('without the ccxt hooks the base printer keeps any', () => {
        const out = print (false);
        expect (out).not.toMatch (/IntegerPrecisionToAmount\(precision \*string\)/);
        expect (out).not.toMatch (/symbol \*string/);
    });
});

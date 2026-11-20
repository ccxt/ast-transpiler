import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go return Add chain in a safeCurrencyCode override binds the *string call, Add nil answer kept', () => {
    const root = path.join (__dirname, 'files', 'tmp-h22g11', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        "    id: string = 'x';\n" +
        '    safeString (o: any, k: any): Str {\n' +
        '        return o[k];\n' +
        '    }\n' +
        '    safeCurrencyCode (currencyId: Str, currency: any = undefined): Str {\n' +
        '        return currencyId;\n' +
        '    }\n' +
        '}\n';
    const VENUE =
        "import { Exchange } from './base/Exchange.js';\n" +
        "import type { Str } from './base/Exchange.js';\n" +
        'export default class v extends Exchange {\n' +
        '    safeCurrencyCode (currencyId: Str, currency: any = undefined): Str {\n' +
        '        if (currencyId === undefined) {\n' +
        '            return currencyId;\n' +
        '        }\n' +
        "        if (currencyId.indexOf ('.') > 0) {\n" +
        "            const parts = currencyId.split ('.');\n" +
        '            const firstPart = this.safeString (parts, 0);\n' +
        '            const secondPart = this.safeString (parts, 1);\n' +
        "            return super.safeCurrencyCode (firstPart, currency) + '.' + secondPart;\n" +
        '        }\n' +
        "        if (currencyId.indexOf ('-') > 0) {\n" +
        "            const o = currencyId.split ('-');\n" +
        "            return o[0] + this.safeString (o, 1);\n" +
        '        }\n' +
        '        return super.safeCurrencyCode (currencyId, currency);\n' +
        '    }\n' +
        '    other (o: any) {\n' +
        "        const p = this.safeString (o, 'p');\n" +
        "        return p + '.' + this.safeString (o, 'q');\n" +
        '    }\n' +
        '}\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'v.ts'), VENUE);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        out = t.transpileGoByPath (path.join (root, 'v.ts')).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h22g11'), { recursive: true, force: true }));

    test ('positive: call bound with the pointer, native concat, nil otherwise', () => {
        expect (out).toMatch (/if retPiece := base\.SafeCurrencyCode\(firstPart, currency\); retPiece != nil && secondPart != nil \{\n\s*return \*retPiece \+ "\." \+ \*secondPart\n\s*\}\n\s*return nil\n/);
    });

    test ('negative: an any leaf keeps Add', () => {
        expect (out).toMatch (/return Add\(GetValue\(o, 0\), /);
    });

    test ('negative: a method outside the *string accessor pair keeps Add', () => {
        expect (out).toMatch (/return Add\(Add\(p, "\."\), this\.SafeString\(o, "q"\)\)/);
    });
});

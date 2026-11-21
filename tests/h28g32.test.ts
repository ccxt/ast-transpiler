import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// The first step of a nested `m[k][j] = v` write on a declared map[string]any local reads natively when the key is a
// Go string or a guard-proven `*string`; an unguarded pointer key, a non-literal-keyed box or an `any` receiver keeps GetValue.
describe ('go nested map write chain first step', () => {
    const root = path.join (__dirname, 'files', 'tmp-h28g32', 'ts', 'src');
    const SRC =
        'type Dict = { [key: string]: any };\n' +
        'type Str = string | undefined;\n' +
        'class Exchange {\n' +
        '    safeString (o: any, k: any, d: any = undefined): Str { return o[k]; }\n' +
        '    safeNumber (o: any, k: any, d: any = undefined): number { return o[k]; }\n' +
        '    safeDict (o: any, k: any, d: any = undefined): Dict { return o[k]; }\n' +
        '    safeCurrencyCode (c: Str): Str { return c; }\n' +
        '}\n' +
        'class venue extends Exchange {\n' +
        '    fees (rows: any[]) {\n' +
        '        const withdrawFees: Dict = {};\n' +
        '        for (let i = 0; i < rows.length; i++) {\n' +
        '            const code = this.safeCurrencyCode (this.safeString (rows[i], \'coin\'));\n' +
        '            const networkCode = this.safeString (rows[i], \'net\');\n' +
        '            if (code !== undefined) {\n' +
        '                withdrawFees[code] = {};\n' +
        '            }\n' +
        '            if ((code !== undefined) && (networkCode !== undefined)) {\n' +
        '                withdrawFees[code][networkCode] = this.safeNumber (rows[i], \'fee\');\n' +
        '            }\n' +
        '        }\n' +
        '        return withdrawFees;\n' +
        '    }\n' +
        '    unguarded (rows: any[]) {\n' +
        '        const out: Dict = {};\n' +
        '        const code = this.safeCurrencyCode (this.safeString (rows[0], \'coin\'));\n' +
        '        out[code][\'x\'] = 1;\n' +
        '        return out;\n' +
        '    }\n' +
        '    fromSafe (orders: Dict, orderId: string, cost: string) {\n' +
        '        const previousOrder = this.safeDict (orders, orderId);\n' +
        '        if (previousOrder !== undefined) {\n' +
        '            previousOrder[\'fee\'][\'cost\'] = cost;\n' +
        '        }\n' +
        '        return previousOrder;\n' +
        '    }\n' +
        '    boxed (o: any) {\n' +
        '        o[\'a\'][\'b\'] = 1;\n' +
        '        return o;\n' +
        '    }\n' +
        '}\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (root, { recursive: true });
        const file = path.join (root, 'venue.ts');
        fs.writeFileSync (file, SRC);
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoLocalTypes (t.goTranspiler);
        out = t.transpileGoByPath (file).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h28g32'), { recursive: true, force: true }));
    test ('positive: a guarded *string key indexes the declared map natively', () => {
        expect (out).toMatch (/AddElementToObject\(withdrawFees\[\*code\], networkCode, /);
    });
    test ('kept: a string literal key on a safeDict map local', () => {
        expect (out).toMatch (/AddElementToObject\(previousOrder\["fee"\], "cost", cost\)/);
    });
    test ('negative: an unguarded *string key never dereferences', () => {
        expect (out).not.toMatch (/out\[\*code\]/);
    });
    test ('negative: an any receiver is never indexed', () => {
        expect (out).not.toMatch (/o\["a"\]/);
    });
});

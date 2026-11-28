import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go typed string-list readers joined natively', () => {
    const BASE =
        'export type Str = string | undefined;\n' +
        'export type Strings = string[] | undefined;\n' +
        'export class Exchange {\n' +
        "    id: string = 'x';\n" +
        '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n' +
        '    safeList (o: any, k: any, d: any = undefined): any { return o; }\n' +
        '    safeStringList (o: any, keys: any[]): Strings { return undefined; }\n' +
        '    currencyId (code: Str): Str { return code; }\n' +
        '    currencyIds (codes: string[]): string[];\n' +
        '    currencyIds (codes?: Strings): Strings;\n' +
        '    currencyIds (codes: Strings = undefined): Strings {\n' +
        '        if (codes === undefined) {\n' +
        '            return codes;\n' +
        '        }\n' +
        '        const result: string[] = [];\n' +
        '        for (let i = 0; i < codes.length; i++) {\n' +
        '            const id = this.currencyId (codes[i]);\n' +
        '            if (id !== undefined) {\n' +
        '                result.push (id);\n' +
        '            }\n' +
        '        }\n' +
        '        return result;\n' +
        '    }\n' +
        '    other (x: any) { return x; }\n' +
        '}\n' +
        'export default Exchange;\n';
    let seq = 0;
    const print = (body: string): string => {
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h57g04-'));
        const src = path.join (root, 'ts', 'src');
        fs.mkdirSync (path.join (src, 'base'), { recursive: true });
        fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE);
        const file = path.join (src, 'venue' + (seq++) + '.ts');
        fs.writeFileSync (file, "import Exchange from './base/Exchange.js';\n" +
            'export default class venue extends Exchange {\n    m (codes: string[], first: any): any {\n' + body + '\n    }\n}\n');
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGoByPath (file).content;
    };

    test ('positive: currencyIds read only by join is the []string the base returns', () => {
        const out = print ("        const request: any = {};\n        const ids = this.currencyIds (codes);\n        request['ccy'] = ids.join (',');\n        return request;");
        expect (out).toContain ('var ids []string = this.CurrencyIds(codes)');
        expect (out).toContain ('strings.Join(ids, ",")');
        expect (out).not.toMatch (/[^.]Join\(ids/);
    });

    test ('negative: missing key reader of another kind, a plain safeList read keeps the helper', () => {
        const out = print ("        const xs = this.safeList (first, 'message', []);\n        return xs.join (' ');");
        expect (out).not.toContain ('var xs []string');
        expect (out).not.toContain ('strings.Join(xs');
    });

    test ('negative: a currencyIds local reassigned from a boxed value stays out of the typed reader', () => {
        const out = print ("        let ids = this.currencyIds (codes);\n        ids = first;\n        return ids.join (',');");
        expect (out).not.toContain ('strings.Join(ids');
        expect (out).toMatch (/[^.]Join\(ids, ","\)/);
    });
});

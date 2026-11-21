import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go any declaration of a concat with *string identifier leaves', () => {
    const root = path.join (__dirname, 'files', 'tmp-h28g33', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        "    id: string = 'x';\n" +
        '    safeString (o: any, k: string): Str {\n' +
        '        return o[k];\n' +
        '    }\n' +
        '    safeValue (o: any, k: string): any {\n' +
        '        return o[k];\n' +
        '    }\n' +
        '}\n';
    const VENUE =
        "import { Exchange } from './base/Exchange.js';\n" +
        'export default class v extends Exchange {\n' +
        '    two (m: any) {\n' +
        "        const base = this.safeString (m, 'b');\n" +
        "        const quote = this.safeString (m, 'q');\n" +
        "        const symbol = base + '/' + quote;\n" +
        '        return symbol;\n' +
        '    }\n' +
        '    nilTested (m: any, channel: string) {\n' +
        "        const sym = this.safeString (m, 's');\n" +
        "        const hash = 'c:' + sym;\n" +
        '        if (hash === undefined) {\n' +
        '            return 0;\n' +
        '        }\n' +
        '        return hash;\n' +
        '    }\n' +
        '    anyLeaf (m: any) {\n' +
        "        const base = this.safeString (m, 'b');\n" +
        "        const raw = this.safeValue (m, 'r');\n" +
        "        const symbol = base + '/' + raw;\n" +
        '        return { symbol };\n' +
        '    }\n' +
        '    callLeaf (m: any) {\n' +
        "        const base = this.safeString (m, 'b');\n" +
        "        const symbol = base + '/' + this.safeString (m, 'q');\n" +
        '        return { symbol };\n' +
        '    }\n' +
        '}\n';
    let out = '';
    const body = (name) => {
        const start = out.indexOf (') ' + name.charAt (0).toUpperCase () + name.slice (1) + '(');
        const end = out.indexOf ('\nfunc ', start + 1);
        return out.substring (start, (end < 0) ? out.length : end);
    };
    beforeAll (() => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'v.ts'), VENUE);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        out = t.transpileGoByPath (path.join (root, 'v.ts')).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h28g33'), { recursive: true, force: true }));

    test ('positive: two pointer leaves, nil seed, one combined test, native concat', () => {
        const b = body ('two');
        expect (b).toMatch (/var symbol any = nil\n\s*if base != nil && quote != nil \{\n\s*symbol = \*base \+ "\/" \+ \*quote\n\s*\}/);
        expect (b).not.toMatch (/Add\(/);
    });
    test ('positive: a later nil test still sees an untyped nil (the local stays any)', () => {
        const b = body ('nilTested');
        expect (b).toMatch (/var hash any = nil\n\s*if sym != nil \{\n\s*hash = "c:" \+ \*sym\n\s*\}/);
        expect (b).not.toMatch (/var hash \*?string/);
    });
    test ('negative: an any leaf keeps the helper', () => {
        expect (body ('anyLeaf')).not.toMatch (/var symbol any = nil/);
    });
    test ('negative: a call leaf is not dereferenced by this rule', () => {
        expect (body ('callLeaf')).not.toMatch (/var symbol any = nil\n\s*if base != nil \{/);
    });
});

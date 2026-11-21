import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go map literal entry of a concat with *string identifier leaves', () => {
    const root = path.join (__dirname, 'files', 'tmp-h29g25', 'ts', 'src');
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
        '        return {\n' +
        "            'id': base,\n" +
        "            'symbol': base + '/' + quote,\n" +
        '        };\n' +
        '    }\n' +
        '    pushed (m: any) {\n' +
        '        const result = [];\n' +
        "        const base = this.safeString (m, 'b');\n" +
        "        result.push ({ 'symbol': base + '/x' });\n" +
        '        return result;\n' +
        '    }\n' +
        '    anyLeaf (m: any) {\n' +
        "        const base = this.safeString (m, 'b');\n" +
        "        const raw = this.safeValue (m, 'r');\n" +
        "        return { 'symbol': base + '/' + raw };\n" +
        '    }\n' +
        '    callLeaf (m: any) {\n' +
        "        const base = this.safeString (m, 'b');\n" +
        "        return { 'symbol': base + '/' + this.safeString (m, 'q') };\n" +
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
    test ('positive: returned literal binds it and stores under the nil test', () => {
        const b = body ('two');
        expect (b).toMatch (/var literal\d+ map\[string\]any = map\[string\]any\{/);
        expect (b).toMatch (/"symbol": +nil,/);
        expect (b).toMatch (/if base != nil && quote != nil \{\n\s*literal\d+\["symbol"\] = \*base \+ "\/" \+ \*quote\n\s*\}/);
        expect (b).not.toContain ('Add(');
    });
    test ('positive: pushed literal', () => {
        const b = body ('pushed');
        expect (b).toMatch (/if base != nil \{\n\s*literal\d+\["symbol"\] = \*base \+ "\/x"/);
        expect (b).not.toContain ('Add(');
    });
    test ('negative: an any leaf keeps Add and no hoist', () => {
        const b = body ('anyLeaf');
        expect (b).toContain ('Add(');
        expect (b).not.toMatch (/var literal\d+/);
    });
    test ('negative: a call leaf keeps Add', () => {
        const b = body ('callLeaf');
        expect (b).toContain ('Add(');
        expect (b).not.toMatch (/var literal\d+/);
    });
});

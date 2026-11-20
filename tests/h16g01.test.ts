import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go *string local keeps its type across a narrowed self-concat write', () => {
    const root = path.join (__dirname, 'files', 'tmp-h16g01', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        "    id: string = 'x';\n" +
        '    safeString (o: any, k: any, d: Str = undefined): Str { return d; }\n' +
        "    yymmdd (t: any, s: string = ''): string { return 'a'; }\n" +
        '    numberToString (x: any): Str { return undefined; }\n' +
        '    pos (market: any): any {\n' +
        "        const base = this.safeString (market, 'b');\n" +
        "        let symbol = this.safeString (market, 'n');\n" +
        '        if (base !== undefined) {\n' +
        "            symbol = base + '/x';\n" +
        "            symbol = symbol + '-' + this.yymmdd (market);\n" +
        '        }\n' +
        '        return symbol;\n' +
        '    }\n' +
        '    nilable (market: any): any {\n' +
        "        const base = this.safeString (market, 'b');\n" +
        "        let other = this.safeString (market, 'n');\n" +
        '        if (base !== undefined) {\n' +
        "            other = base + '/x';\n" +
        "            other = other + '-' + this.numberToString (market);\n" +
        '        }\n' +
        '        return other;\n' +
        '    }\n' +
        '    desc (parts: string[]): any {\n' +
        "        let d = '';\n" +
        '        if (parts.length === 5) {\n' +
        "            d = this.safeString (parts, 2, '') + '.' + this.yymmdd (parts);\n" +
        '        } else {\n' +
        "            d = this.safeString (parts, 2, '');\n" +
        '        }\n' +
        "        return 'book|' + d;\n" +
        '    }\n' +
        '    descNil (parts: string[]): any {\n' +
        "        let e = '';\n" +
        '        if (parts.length === 5) {\n' +
        "            e = this.safeString (parts, 2, '') + '.' + this.numberToString (parts);\n" +
        '        } else {\n' +
        "            e = this.safeString (parts, 2, '');\n" +
        '        }\n' +
        "        return 'book|' + e;\n" +
        '    }\n' +
        '    unguarded (market: any): any {\n' +
        "        let s = this.safeString (market, 'n');\n" +
        "        s = s + '-' + this.yymmdd (market);\n" +
        '        return s;\n' +
        '    }\n' +
        '}\n';
    const print = (install = true): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        const t = new Transpiler ({ verbose: false, go: {} });
        if (install) { installCcxtGoHooks (t.goTranspiler); }
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    const body = (out: string, name: string): string => {
        const at = out.indexOf (') ' + name + '(');
        return out.substring (at, out.indexOf ('\n}', at));
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h16g01'), { recursive: true, force: true }));

    test ('a narrowed self-concat of string leaves keeps the *string local and concatenates natively', () => {
        const pos = body (print (), 'Pos');
        expect (pos).toContain ('var symbol *string = this.SafeString(market, "n")');
        expect (pos).toContain ('symbolStr2 := *symbol+"-"+this.Yymmdd(market)');
        expect (pos).not.toContain ('Add(');
    });

    test ('a write with a nilable leaf keeps the box and Add', () => {
        const nilable = body (print (), 'Nilable');
        expect (nilable).toContain ('var other any = this.SafeString(market, "n")');
        expect (nilable).toContain ('Add(Add(other, "-"), this.NumberToString(market))');
    });

    test ('a literal-seeded local written by a defaulted safeString and a string concat is a Go string', () => {
        const desc = body (print (), 'Desc');
        expect (desc).toContain ('var d string = ""');
        expect (desc).toContain ('return "book|" + d');
        expect (desc).not.toContain ('Add(');
    });

    test ('a concat write with a nilable leaf keeps the box', () => {
        const descNil = body (print (), 'DescNil');
        expect (descNil).toContain ('var e any = ""');
        expect (descNil).toContain ('Add("book|", e)');
    });

    test ('a self leaf that can be nil keeps the box and Add (nil answer kept)', () => {
        const unguarded = body (print (), 'Unguarded');
        expect (unguarded).toContain ('var s any = this.SafeString(market, "n")');
        expect (unguarded).toContain ('Add(Add(s, "-"), this.Yymmdd(market))');
    });
});

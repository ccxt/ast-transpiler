import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go loop-bounded safeString reads of a []string list', () => {
    const root = path.join (__dirname, 'files', 'tmp-h19g06', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export type Strings = string[] | undefined;\n' +
        'export class Exchange {\n' +
        "    id: string = 'x';\n" +
        '    marketId (symbol: Str): Str {\n' +
        '        return symbol;\n' +
        '    }\n' +
        '    safeString (o: any, k: any, d: Str = undefined): Str {\n' +
        '        return d;\n' +
        '    }\n' +
        '    marketIds (symbols: string[]): string[];\n' +
        '    marketIds (symbols?: Strings): Strings;\n' +
        '    marketIds (symbols: Strings = undefined): Strings {\n' +
        '        if (symbols === undefined) {\n' +
        '            return symbols;\n' +
        '        }\n' +
        '        const result: string[] = [];\n' +
        '        for (let i = 0; i < symbols.length; i++) {\n' +
        '            const id = this.marketId (symbols[i]);\n' +
        '            if (id !== undefined) {\n' +
        '                result.push (id);\n' +
        '            }\n' +
        '        }\n' +
        '        return result;\n' +
        '    }\n' +
        '}\n';
    const VENUE =
        "import { Exchange } from './base/Exchange.js';\n" +
        'export default class v extends Exchange {\n' +
        '    topics (symbols: string[]) {\n' +
        '        const marketIds = this.marketIds (symbols);\n' +
        '        const topics: string[] = [];\n' +
        '        for (let i = 0; i < marketIds.length; i++) {\n' +
        "            const marketId = this.safeString (marketIds, i, '');\n" +
        "            topics.push ('t.' + marketId);\n" +
        '        }\n' +
        '        return topics;\n' +
        '    }\n' +
        '    otherBound (symbols: string[]) {\n' +
        '        const ids = this.marketIds (symbols);\n' +
        '        const out: string[] = [];\n' +
        '        for (let i = 0; i < symbols.length; i++) {\n' +
        "            out.push ('t.' + this.safeString (ids, i, ''));\n" +
        '        }\n' +
        '        return out;\n' +
        '    }\n' +
        '    boxed (list: any) {\n' +
        '        const out: string[] = [];\n' +
        '        for (let i = 0; i < list.length; i++) {\n' +
        "            out.push ('t.' + this.safeString (list, i, ''));\n" +
        '        }\n' +
        '        return out;\n' +
        '    }\n' +
        '    resized (symbols: string[]) {\n' +
        '        const ids = this.marketIds (symbols);\n' +
        '        const out: string[] = [];\n' +
        '        for (let i = 0; i < ids.length; i++) {\n' +
        "            out.push ('t.' + this.safeString (ids, i, ''));\n" +
        "            ids.pop ();\n" +
        '        }\n' +
        '        return out;\n' +
        '    }\n' +
        '    inline (symbols: string[]) {\n' +
        '        const ids = this.marketIds (symbols);\n' +
        '        const out: string[] = [];\n' +
        '        for (let i = 0; i < ids.length; i++) {\n' +
        "            out.push ('t.' + this.safeString (ids, i, ''));\n" +
        '        }\n' +
        '        return out;\n' +
        '    }\n' +
        '    noDefault (symbols: string[], r: any) {\n' +
        '        const ids = this.marketIds (symbols);\n' +
        '        for (let i = 0; i < ids.length; i++) {\n' +
        '            const id = this.safeString (ids, i);\n' +
        '            if (id === undefined) {\n' +
        '                continue;\n' +
        '            }\n' +
        '            r[id] = this.marketId (id);\n' +
        '        }\n' +
        '        return r;\n' +
        '    }\n' +
        '    joined (tickers: string[]) {\n' +
        '        const parts: string[] = [];\n' +
        '        for (let ti = 0; ti < tickers.length; ti++) {\n' +
        '            parts.push (tickers[ti]);\n' +
        '        }\n' +
        "        const s = parts.join (',');\n" +
        '        return s;\n' +
        '    }\n' +
        '    joinedBoxedPush (tickers: string[], x: any) {\n' +
        '        const bag: string[] = [];\n' +
        '        bag.push (x);\n' +
        "        const s = bag.join (',');\n" +
        '        return s;\n' +
        '    }\n' +
        '    joinedOptional (symbols: Strings) {\n' +
        "        let ids: Strings = ['ALL'];\n" +
        '        if (symbols !== undefined) {\n' +
        '            ids = this.marketIds (symbols);\n' +
        '        }\n' +
        "        return ids.join (',');\n" +
        '    }\n' +
        '}\n';
    const print = (file: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'v.ts'), VENUE);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, file)).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h19g06'), { recursive: true, force: true }));

    test ('a defaulted read of a loop-bounded []string local is the slice index', () => {
        const venue = print ('v.ts');
        expect (venue).toContain ('var marketId string = marketIds[i]');
        expect (venue).toContain ('out = append(out, "t."+ids[i])');
    });

    test ('negative: a loop bounded by another list keeps the reader', () => {
        expect (print ('v.ts')).toContain ('out = append(out, "t."+*this.SafeString(ids, i, ""))');
    });

    test ('negative: a boxed list (not declared string[]) keeps the reader', () => {
        expect (print ('v.ts')).toContain ('*this.SafeString(list, i, "")');
    });

    test ('negative: a list resized in the loop body keeps the reader', () => {
        expect (print ('v.ts')).toMatch (/for i := 0; i < len\(ids\); i\+\+ \{\n\t\tout = append\(out, "t."\+\*this\.SafeString\(ids, i, ""\)\)\n\t\tPop/);
    });

    test ('negative: a no-default read a consumer nil-tests keeps the pointer', () => {
        const venue = print ('v.ts');
        expect (venue).toContain ('var id *string = this.SafeString(ids, i)');
        expect (venue).toMatch (/if \(?id == nil\)? \{/);
    });

    test ('a string-pushed list read by join is []string and joins natively', () => {
        const venue = print ('v.ts');
        expect (venue).toContain ('var parts []string = []string{}');
        expect (venue).toContain ('var s string = strings.Join(parts, ",")');
    });

    test ('negative: a list that receives a non-string push keeps the box and the helper', () => {
        const venue = print ('v.ts');
        expect (venue).toContain ('var bag []any = []any{}');
        expect (venue).toContain ('Join(bag, ",")');
    });
});

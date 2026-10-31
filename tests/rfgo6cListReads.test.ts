import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// RF-go-6-C: Go native reads on proven list receivers (moved from ccxt build/hx10w2-G02.ts)
const SRC = 'type Trade = { id: string };\n'
    + 'class Exchange {\n'
    + '    parseTrades (trades: any[], market: any = undefined): Trade[] { return []; }\n'
    + '    parseThing (x: any): any { return x; }\n'
    + '    safeList (o: any, k: any, d: any = undefined): any[] { return d; }\n'
    + '    f (p: any): any {\n'
    + '        const trades = this.parseTrades (p);\n'
    + '        const n = trades.length;\n'
    + '        const thing = this.parseThing (p);\n'
    + '        const m = thing.length;\n'
    + '        return n + m;\n'
    + '    }\n'
    + '    g (p: any): any {\n'
    + '        const keys: string[] = Object.keys (p);\n'
    + '        let out = \'\';\n'
    + '        for (let i = 0; i < keys.length; i++) {\n'
    + '            out = keys[i];\n'
    + '        }\n'
    + '        return out;\n'
    + '    }\n'
    + '    h (p: any): any {\n'
    + '        const keys: string[] = Object.keys (p);\n'
    + '        let out = \'\';\n'
    + '        for (let i = 0; i < keys.length; i++) {\n'
    + '            i = i + 1;\n'
    + '            out = keys[i];\n'
    + '        }\n'
    + '        for (let j = 0; j < keys.length; j++) {\n'
    + '            keys.push (\'x\');\n'
    + '            out = keys[j];\n'
    + '        }\n'
    + '        for (let k = 0; k < 10; k++) {\n'
    + '            out = keys[k];\n'
    + '        }\n'
    + '        return out;\n'
    + '    }\n'
    + '    k (p: any): any {\n'
    + '        const syms = Object.keys (p) as string[];\n'
    + '        const n = syms.length;\n'
    + '        let out = \'\';\n'
    + '        for (let i = 0; i < n; i++) {\n'
    + '            out = syms[i];\n'
    + '        }\n'
    + '        return out;\n'
    + '    }\n'
    + '    m (p: any): any {\n'
    + '        let symbols: string[] = undefined;\n'
    + '        if (p !== undefined) {\n'
    + '            symbols = [ p ];\n'
    + '        }\n'
    + '        return this.parseThing (symbols);\n'
    + '    }\n'
    + '    n (p: any): any {\n'
    + '        let symbols: string[] = undefined;\n'
    + '        if (p !== undefined) {\n'
    + '            symbols = [ p ];\n'
    + '        }\n'
    + '        if (symbols === undefined) {\n'
    + '            return 0;\n'
    + '        }\n'
    + '        return this.parseThing (symbols);\n'
    + '    }\n'
    + '    q (p: any): any {\n'
    + '        let a: any[] = undefined;\n'
    + '        a = [ p ];\n'
    + '        if (a === undefined) {\n'
    + '            return 0;\n'
    + '        }\n'
    + '        const b = a;\n'
    + '        return b.length;\n'
    + '    }\n'
    + '}\n';

const print = (callees: string[]): string => new Transpiler ({ 'verbose': false, 'go': { 'generatedListCallees': callees, 'parser': { 'NUM_LINES_END_FILE': 0 } } }).transpileGo (SRC).content;
const fn = (out: string, name: string): string => out.split (/\nfunc /).find ((f) => f.indexOf (name + '(') >= 0) ?? '';

describe('RF-go-6-C list reads', () => {
    test('a tabled callee whose TS result is an array types its local []any and .length goes native (fails on the base printer)', () => {
        const withTable = fn (print ([ 'ParseTrades' ]), 'F');
        expect (withTable).toContain ('var trades []any = this.ParseTrades(');
        expect (withTable).toContain ('len(trades)');
        const base = fn (print ([]), 'F');
        expect (base).not.toContain ('var trades []any');
    });
    test('a tabled callee whose TS result is not an array type stays boxed', () => {
        const out = fn (print ([ 'ParseThing' ]), 'F');
        expect (out).not.toContain ('var thing []any');
    });
    test('a loop-bounded read of a []string local is the slice index (fails on the base printer)', () => {
        expect (fn (print ([]), 'G')).toContain ('out = keys[i]');
    });
    test('negatives: counter written, receiver mutated, unbounded counter keep the helper', () => {
        const h = fn (print ([]), 'H');
        expect (h).toContain ('GetValue(keys, i)');
        expect (h).toContain ('GetValue(keys, j)');
        expect (h).toContain ('GetValue(keys, k)');
        expect (h).not.toContain ('keys[i]');
    });
    test('a const length local and an `as string[]` cast keep the proof', () => {
        expect (fn (print ([]), 'K')).toContain ('out = syms[i]');
    });
    test('a nil-initialised local whose every write is a list prints []any; a nil compare keeps the box', () => {
        expect (fn (print ([]), 'M')).toContain ('var symbols []any = nil');
        expect (fn (print ([]), 'N')).not.toContain ('var symbols []any');
    });
    test('an alias of a nil-join list local carries its slice type', () => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        installCcxtGoLocalTypes (t.goTranspiler);
        const q = fn (t.transpileGo (SRC).content, 'Q');
        expect (q).toContain ('var a []any = nil');
        expect (q).toContain ('var b []any = a');
    });
});

import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// FOLD3 G05: the ws ohlcv book. `this.ohlcvs` is BaseExchange's Dictionary<Dictionary<ArrayCacheByTimestamp>> (Go: one
// map[string]map[string]any), so every helper call around a book is the native map operation behind the nil tests the helper applied.
const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\n'
    + 'class ArrayCacheByTimestamp { constructor (limit: any) {} append (x: any) {} }\n'
    + 'class BaseExchange {\n'
    + '    ohlcvs: { [key: string]: { [key: string]: ArrayCacheByTimestamp } } = {};\n'
    + '    options: Dict = {};\n'
    + '    safeString (d: any, k: any, def: any = undefined): Str { return d; }\n'
    + '    safeValue (d: any, k: any, def: any = undefined): any { return d; }\n'
    + '    safeDict (d: any, k: any, def: any = undefined): Dict { return d; }\n'
    + '    safeInteger (d: any, k: any, def: any = undefined): any { return d; }\n';
const print = (body: string, head = HEAD): string => {
    const t = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    installCcxtGoLocalTypes (t.goTranspiler);
    return t.transpileGo (head + '    handle (message: Dict) {\n' + body + '\n    }\n}\n').content;
};
// the book-local rule keys on the source tree (rf6aSourceKind: ts/src/pro), so it reads a real file
const printPro = (body: string): string => {
    const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'fold3-G05-'));
    try {
        const dir = path.join (tmp, 'ts', 'src', 'pro');
        fs.mkdirSync (dir, { recursive: true });
        const file = path.join (dir, 'venue.ts');
        fs.writeFileSync (file, HEAD + '    handle (message: Dict) {\n' + body + '\n    }\n}\n');
        const t = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        installCcxtGoLocalTypes (t.goTranspiler);
        return t.transpileGoByPath (file).content;
    } finally {
        fs.rmSync (tmp, { recursive: true, force: true });
    }
};
const HANDLER = [
    "const symbol = this.safeString (message, 's');",
    "const timeframe = this.safeString (message, 't');",
    'this.ohlcvs[symbol] = this.safeDict (this.ohlcvs, symbol, {});',
    'let stored = this.safeValue (this.safeDict (this.ohlcvs, symbol), timeframe);',
    'if (stored === undefined) {',
    '    stored = new ArrayCacheByTimestamp (10);',
    '    this.ohlcvs[symbol][timeframe] = stored;',
    '}',
].join ('\n');

describe('FOLD3 G05 ohlcv book', () => {
    test('ensure, entry read and entry write are native behind the nil tests (fail on the base printer)', () => {
        const out = print (HANDLER);  // plain `*string` keys, so every test is spelled out
        expect (out).toContain ('if symbol != nil && this.Ohlcvs[*symbol] == nil {\n\t\tthis.Ohlcvs[*symbol] = map[string]any{}\n\t}');
        expect (out).toContain ('var stored any\n\tif symbol != nil && timeframe != nil {\n\t\tstored = this.Ohlcvs[*symbol][*timeframe]\n\t}');
        expect (out).toContain ('if symbol != nil && timeframe != nil && this.Ohlcvs[*symbol] != nil {\n\t\t\tthis.Ohlcvs[*symbol][*timeframe] = stored\n\t\t}');
        expect (out).not.toContain ('AddElementToObject');
        expect (out).not.toContain ('GetValue(');
        expect (out).not.toContain ('SafeValue(this.SafeDict(this.Ohlcvs');
    });
    test('a key under an enclosing nil guard needs no extra test', () => {
        const out = print ("const symbol = this.safeString (message, 's'); if (symbol !== undefined) { this.ohlcvs[symbol] = this.safeDict (this.ohlcvs, symbol, {}); }");
        expect (out).toContain ('if this.Ohlcvs[*symbol] == nil {\n\t\t\tthis.Ohlcvs[*symbol] = map[string]any{}\n\t\t}');
    });
    test('an entry-level `in` is the comma-ok read', () => {
        const out = print ("const symbol = this.safeString (message, 's', ''); const timeframe = this.safeString (message, 't', ''); if (!(timeframe in this.ohlcvs[symbol])) { delete this.ohlcvs[symbol][timeframe]; }");
        expect (out).toContain ('_, ok := this.Ohlcvs[symbol][timeframe]; !ok');
        expect (out).not.toContain ('InOp(');
    });
    test('an `in` over a key that may be nil keeps the helper', () => {
        const out = print ("const symbol = this.safeString (message, 's', ''); const timeframe = this.safeString (message, 't'); if (timeframe in this.ohlcvs[symbol]) { delete this.ohlcvs[symbol][timeframe]; }");
        expect (out).toContain ('InOp(');
    });
    test('a book local is a map[string]any stored back, written into and read', () => {
        const out = printPro ([
            "const symbol = this.safeString (message, 's', '');",
            "const timeframe = this.safeString (message, 't');",
            'const book = this.safeDict (this.ohlcvs, symbol, {});',
            'this.ohlcvs[symbol] = book;',
            'let stored = this.safeValue (book, timeframe);',
            'if (stored === undefined) {',
            '    stored = new ArrayCacheByTimestamp (10);',
            '    book[timeframe] = stored;',
            '}',
        ].join ('\n'));
        expect (out).toContain ('var book map[string]any = this.SafeDictMap(this.Ohlcvs, symbol, map[string]any{})');
        expect (out).toContain ('this.Ohlcvs[symbol] = book');
        expect (out).toContain ('stored = book[*timeframe]');
        expect (out).toContain ('book[*timeframe] = stored');
        expect (out).not.toContain ('AddElementToObject');
    });
    test('a flat cache (no timeframe level) lives under the one timeframe key', () => {
        const out = print ([
            "const symbol = this.safeString (message, 's');",
            'let stored = this.safeValue (this.ohlcvs, symbol);',
            'if (stored === undefined) {',
            '    stored = new ArrayCacheByTimestamp (10);',
            '    this.ohlcvs[symbol] = stored;',
            '}',
        ].join ('\n'));
        expect (out).toContain ('stored = this.Ohlcvs[*symbol]["1m"]');
        expect (out).toContain ('this.Ohlcvs[*symbol]["1m"] = stored');
        expect (out).not.toContain ('AddElementToObject');
    });
    test('a value that is not a cache keeps the helper', () => {
        const out = print ("const symbol = this.safeString (message, 's'); const timeframe = this.safeString (message, 't'); this.ohlcvs[symbol][timeframe] = message['x'];");
        expect (out).toContain ('AddElementToObject(');
    });
    test('an any-typed key keeps the helper', () => {
        const out = print ("this.ohlcvs[message['s']][message['t']] = new ArrayCacheByTimestamp (10);");
        expect (out).toContain ('AddElementToObject(');
    });
    test('FOLD4: an any-typed cache key stores through the typed book slot, not GetValue of the field', () => {
        const out = print ([
            "const symbol = this.safeString (message, 's');",
            "const timeframe = this.safeString (message, 't', '');",
            "let cacheKey: Str = undefined;",
            "if (timeframe === 'x') { cacheKey = timeframe; } else { cacheKey = timeframe + ':y'; }",
            "this.ohlcvs[symbol as string] = this.safeDict (this.ohlcvs, symbol, {});",
            "let stored = this.safeValue (this.ohlcvs[symbol as string], cacheKey);",
            'if (stored === undefined) {',
            '    stored = new ArrayCacheByTimestamp (10);',
            '    this.ohlcvs[symbol as string][cacheKey as string] = stored;',
            '}',
        ].join ('\n'));
        expect (out).toContain ('AddElementToObject(this.Ohlcvs[*symbol], cacheKey, stored)');
        expect (out).not.toContain ('GetValue(');
    });
    test('FOLD4: a nil symbol key keeps the no-op behind a nil test', () => {
        const out = print ("const symbol = this.safeString (message, 's'); const key: any = message['k']; this.ohlcvs[symbol][key] = new ArrayCacheByTimestamp (10);");
        expect (out).toContain ('if symbol != nil {');
        expect (out).not.toContain ('GetValue(this.Ohlcvs');
    });
    test('FOLD4: delete of an entry whose key is asserted a string is the native delete', () => {
        const out = print ("const symbol = this.safeString (message, 's', ''); const timeframe = this.safeString (message, 't'); if (symbol in this.ohlcvs) { delete this.ohlcvs[symbol][(timeframe as string)]; }");
        expect (out).toContain ('delete(this.Ohlcvs[symbol], *timeframe)');
        expect (out).not.toContain ('Remove(');
    });
    test('FOLD4: delete of an entry whose key may be nil keeps the helper', () => {
        const out = print ("const symbol = this.safeString (message, 's', ''); const timeframe = this.safeString (message, 't'); delete this.ohlcvs[symbol][timeframe];");
        expect (out).toContain ('Remove(');
    });
    test('a `ohlcvs` field of another class is not the book', () => {
        const other = HEAD.replace ('class BaseExchange {', 'class Other {');
        const out = print ("const symbol = this.safeString (message, 's'); this.ohlcvs[symbol] = this.safeDict (this.ohlcvs, symbol, {});", other);
        expect (out).not.toContain ('this.Ohlcvs[*symbol] = map[string]any{}');
    });
});

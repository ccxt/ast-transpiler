import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// hx11 FOLD2 WT01 (folded from ccxt build/hx11w8-WT01.ts): `const tickers = await this.watchTickers ([ k ]); return tickers[k]`
// in an async method answering Promise<Ticker> reads one row of the typed `map[string]Ticker`, keyed on the checker
// (the awaited method is tabled as a ticker-map channel; no printed-text pass in ccxt).
const SRC = (body: string, params = 'symbol: string, params = {}') => [
    'interface Ticker { symbol: string }',
    'type Tickers = { [key: string]: Ticker };',
    'class Exchange {',
    '    safeSymbol (s: string): string { return s; }',
    '    async watchTickers (symbols: string[] = undefined, params = {}): Promise<Tickers> { return {}; }',
    '    async watchTicker (' + params + '): Promise<Ticker> {',
    body,
    '    }',
    '}',
    '',
].join ('\n');
const print = (body: string, tabled = true, params?: string, hooks = false) => {
    const t = new Transpiler ({ 'verbose': false, 'go': { 'asyncMethodSuffix': 'Async', 'unifiedStringParams': (params === undefined) ? { 'watchTicker': [ 0 ] } : {},
        'asyncTickerMapCallees': tabled ? [ 'WatchTickers' ] : [], 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    if (hooks) { installCcxtGoLocalTypes (t.goTranspiler); }
    return t.transpileGo (SRC (body, params)).content;
};
const STRING_KEY = '        const tickers = await this.watchTickers ([ symbol ], params);\n        return tickers[symbol];';

describe('hx11 FOLD2 WT01 typed ticker row', () => {
    test('a string key indexes the typed ticker map (fails without the table)', () => {
        const out = print (STRING_KEY);
        expect (out).toContain ('var tickers map[string]Ticker = PanicOnError(');
        expect (out).toContain ('ch <- TickerToMap(tickers[symbol])');
        expect (out).not.toContain ('GetValue(tickers');
        const base = print (STRING_KEY, false);
        expect (base).toContain ('GetValue(tickers, symbol)');
        expect (base).not.toContain ('map[string]Ticker');
    });
    test('a non-string key keeps GetValue', () => {
        const out = print ('        const tickers = await this.watchTickers ([ symbol ], params);\n        return tickers[symbol];', true, 'symbol: any, params = {}');
        expect (out).not.toContain ('map[string]Ticker');
    });
    test('a map read twice or rebound keeps GetValue', () => {
        const twice = print ('        const tickers = await this.watchTickers ([ symbol ], params);\n        const other = tickers[symbol];\n        return tickers[symbol];');
        expect (twice).not.toContain ('map[string]Ticker');
        const rebound = print ('        let key = symbol;\n        const tickers = await this.watchTickers ([ key ], params);\n        key = \'x\';\n        return tickers[key];');
        expect (rebound).not.toContain ('map[string]Ticker');
    });
    test('another awaited method keeps GetValue', () => {
        expect (print (STRING_KEY.replace ('watchTickers', 'watchOther'))).not.toContain ('map[string]Ticker');
    });
    test('a *string key is guarded (a nil key reads the zero Ticker)', () => {
        const body = '        const key = this.safeSymbol (symbol);\n        const tickers = await this.watchTickers ([ key ], params);\n        return tickers[key];';
        const out = print (body, true, undefined, true);
        if (out.includes ('var key *string')) {
            expect (out).toContain ('var tickerRow Ticker\n\tif key != nil {\n\t\ttickerRow = tickers[*key]\n\t}');
            expect (out).toContain ('ch <- TickerToMap(tickerRow)');
        } else {
            expect (out).not.toContain ('tickers[key]');
        }
        expect (print (body, false, undefined, true)).not.toContain ('map[string]Ticker');
    });
});

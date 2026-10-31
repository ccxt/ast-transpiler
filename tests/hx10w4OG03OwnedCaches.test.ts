import { Transpiler } from '../src/transpiler';

// hx10w4 OG03: ws caches of BaseExchange owned by the dispatch loop. Keyed on the checker declaration
// (BaseExchange property), the method kind (async watch/load/subscribe vs handlers) and the access shape.
const owned = {
    'declaredIn': 'BaseExchange', 'maps': { 'tickers': 'Tickers', 'bidsasks': 'Bidsasks' }, 'objects': { 'positions': 'Positions' },
    'mapLiteral': 'TickerCache{}', 'asyncUserPath': '^(?:watch|load|subscribe)', 'syncUserPath': '^(?:setPositionsCache|cleanWsData)$',
    'ops': { 'set': 'WsCacheSet', 'get': 'WsCacheGet', 'has': 'WsCacheHas', 'delete': 'WsCacheDelete', 'keys': 'WsCacheKeys', 'reset': 'WsCacheReset',
        'snapshot': 'WsCacheSnapshot', 'objGet': 'WsCacheObjGet', 'objSet': 'WsCacheObjSet' },
};
const HEAD = 'type Dictionary<T> = { [key: string]: T };\ntype Ticker = { symbol: string };\ntype Tickers = Dictionary<Ticker>;\n' +
    'class BaseExchange {\n    tickers: Dictionary<Ticker> = {};\n    bidsasks: Dictionary<Ticker> = {};\n    positions: any = undefined;\n' +
    '    createSafeDictionary (a: boolean = false): any { return {}; }\n    safeValue (d: any, k: any): any { return d[k]; }\n' +
    '    filterByArray (d: any, k: string, v: any): any { return d; }\n}\n';
const run = (body: string, config: any = owned, head = HEAD) => new Transpiler({ 'verbose': false, 'go': { ...((config === null) ? {} : { 'ownedCaches': config }), 'parser': { 'NUM_LINES_END_FILE': 0 } } })
    .transpileGo(head + 'class Ex extends BaseExchange {\n' + body + '}\n').content;

describe('hx10w4 OG03: ws caches owned by the dispatch loop', () => {
    test('an async watch body hands every map operation to the owner', () => {
        const out = run("    async watchTicker (symbol: string, t: Ticker): Promise<any> {\n        this.tickers[symbol] = t;\n        const a = this.tickers[symbol];\n" +
            "        const b = this.safeValue (this.bidsasks, symbol);\n        if (symbol in this.tickers) {\n            delete this.tickers[symbol];\n        }\n" +
            "        const ks = Object.keys (this.bidsasks);\n        return this.filterByArray (this.tickers, 'symbol', [ a, b, ks ]);\n    }\n");
        expect(out).toContain('this.WsCacheSet("Tickers", symbol, t)');
        expect(out).toContain('this.WsCacheGet("Tickers", symbol)');
        expect(out).toContain('this.WsCacheGet("Bidsasks", symbol)');
        expect(out).toContain('this.WsCacheHas("Tickers", symbol)');
        expect(out).toContain('this.WsCacheDelete("Tickers", symbol)');
        expect(out).toContain('this.WsCacheKeys("Bidsasks")');
        expect(out).toContain('this.FilterByArray(this.WsCacheSnapshot("Tickers"), "symbol"');
        expect(out).not.toContain('this.Tickers');
    });
    test('a watch body returning Tickers sends the snapshot boxed', () => {
        const out = run("    async watchTickers (): Promise<Tickers> {\n        return this.tickers;\n    }\n");
        expect(out).toContain('any(this.WsCacheSnapshot("Tickers"))');
    });
    test('the positions object goes through objGet / objSet', () => {
        const out = run("    async loadPositionsSnapshot (): Promise<any> {\n        if (this.positions === undefined) {\n            this.positions = {};\n        }\n        return this.positions;\n    }\n");
        expect(out).toContain('this.WsCacheObjSet("Positions", map[string]any{})');
        expect(out).toContain('this.WsCacheObjGet("Positions")');
        expect(out).not.toContain('this.Positions');
    });
    test('a listed sync method resets the map through the owner', () => {
        const out = run("    cleanWsData () {\n        this.tickers = this.createSafeDictionary (true);\n        this.positions = undefined;\n    }\n");
        expect(out).toContain('this.WsCacheReset("Tickers")');
        expect(out).toContain('this.WsCacheObjSet("Positions", nil)');
    });
    test('handlers and unlisted sync methods keep the field', () => {
        const out = run("    handleTicker (symbol: string, t: Ticker): any {\n        this.tickers[symbol] = t;\n        delete this.tickers[symbol];\n        return this.positions;\n    }\n" +
            "    other (symbol: string): any {\n        return this.tickers[symbol];\n    }\n");
        expect(out).toContain('this.Positions');
        expect(out).toContain('Remove(this.Tickers, symbol)');
        expect(out).not.toContain('WsCache');
    });
    test('the literal assigned on a handler path names the type through its package', () => {
        const out = run("    handleTicker (): any {\n        this.tickers = this.createSafeDictionary (true);\n    }\n");
        expect(out).toContain('this.Tickers = ccxt.TickerCache{}');
    });
    test('a same-named field of another class is not the cache', () => {
        const head = 'class Other {\n    tickers: any = {};\n    positions: any = undefined;\n}\n';
        const out = new Transpiler({ 'verbose': false, 'go': { 'ownedCaches': owned, 'parser': { 'NUM_LINES_END_FILE': 0 } } })
            .transpileGo(head + 'class BaseExchange {}\nclass Ex extends Other {\n    async watchX (s: string): Promise<any> {\n        this.tickers[s] = 1;\n        return this.positions;\n    }\n}\n').content;
        expect(out).not.toContain('WsCache');
    });
    test('no ownedCaches config = unchanged output', () => {
        const out = run("    async watchTicker (symbol: string, t: Ticker): Promise<any> {\n        this.tickers[symbol] = t;\n        return this.positions;\n    }\n", null);
        expect(out).not.toContain('WsCache');
    });
});

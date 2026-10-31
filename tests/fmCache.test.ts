import { Transpiler, installCcxtGoHooks } from '../src/transpiler';
import * as nodefs from 'fs';
import * as nodepath from 'path';

// FM-CACHE: the ws list caches. A BaseExchange field declared `ArrayCache` is the Go WsArrayCache field and
// `Dictionary<ArrayCache>` the TradesCache; locals, closures and parameters that provably hold them are typed
// WsArrayCache, `.append` on such a receiver is the plain interface method (the Appender assertion otherwise),
// and the cache's own Get / Has / Store and nil compares print instead of the dictionary helpers.
const BASE_FIXTURE = [
    'export class ArrayCache { append (x: any) {} }',
    'export class ArrayCacheBySymbolById extends ArrayCache {}',
    'export class ArrayCacheByTimestamp { append (x: any) {} }',
    'export class Exchange {',
    '    orders: ArrayCache | undefined = undefined;',
    '    triggerOrders!: ArrayCache;',
    '    liquidations: ArrayCache | undefined = undefined;',
    '    myLiquidations: ArrayCache | undefined = undefined;',
    '    myTrades: ArrayCache | undefined;',
    '    positions: any;',
    '    trades: Dictionary<ArrayCache>;',
    '    ohlcvs: Dictionary<Dictionary<ArrayCacheByTimestamp>>;',
    '    safeValue (a, b, c?) { return undefined; }',
    '    getValue (a, b) { return undefined; }',
    '    safeInteger (a, b, c) { return 1; }',
    '    safeString (a, b, c?) { return \'\'; }',
    '    safeSymbol (a) { return \'\'; }',
    '    createSafeDictionary () { return {}; }',
    '    parseTrade (a) { return {}; }',
    '    toArray (a) { return []; }',
    '    options: Dict = {};',
    '    handleMessage (client, message) {}',
    '}',
    '',
].join ('\n');
const HEADER = [
    'import { Exchange, ArrayCache, ArrayCacheBySymbolById, ArrayCacheByTimestamp } from \'../base/Exchange\';',
    'type Dict = {[key: string]: any};',
    'type Dictionary<T> = {[key: string]: T};',
    '',
].join ('\n');

function print (name: string, pro: string): string {
    const src = nodepath.join (__dirname, 'files', name, 'ts', 'src');
    nodefs.mkdirSync (nodepath.join (src, 'base'), { recursive: true });
    nodefs.mkdirSync (nodepath.join (src, 'pro'), { recursive: true });
    nodefs.writeFileSync (nodepath.join (src, 'base', 'Exchange.ts'), BASE_FIXTURE);
    nodefs.writeFileSync (nodepath.join (src, 'pro', 'ex.ts'), HEADER + pro);
    const t = new Transpiler ({ verbose: false, go: {} });
    installCcxtGoHooks (t.goTranspiler);
    return t.transpileGoByPath (nodepath.join (src, 'pro', 'ex.ts')).content;
}

afterAll (() => {
    const dir = nodepath.join (__dirname, 'files');
    for (const entry of nodefs.readdirSync (dir)) {
        if (entry.startsWith ('tmp-fmcache-')) {
            nodefs.rmSync (nodepath.join (dir, entry), { recursive: true, force: true });
        }
    }
});

const TRADES_AND_ORDERS = [
    "export class ex extends Exchange {",
    "    handleTrades (client: any, message: any) {",
    "        const symbol = this.safeSymbol (this.safeString (message, 'S'));",
    "        let stored = this.safeValue (this.trades, symbol);",
    "        if (stored === undefined) {",
    "            const limit = this.safeInteger (this.options, 'tradesLimit', 1000);",
    "            stored = new ArrayCache (limit);",
    "            this.trades[symbol] = stored;",
    "        }",
    "        const parsed = this.parseTrade (message);",
    "        stored.append (parsed);",
    "        client.resolve (stored, 'x');",
    "    }",
    "    handleTrades2 (client: any, message: any, symbol: string) {",
    "        if (!(symbol in this.trades)) {",
    "            const cache = new ArrayCache (10);",
    "            this.trades[symbol] = cache;",
    "        }",
    "        let trades;",
    "        if (symbol !== undefined) {",
    "            trades = this.trades[symbol];",
    "        }",
    "        trades.append (message);",
    "        const t2 = this.trades[symbol];",
    "        t2.append (message);",
    "        const k = new ArrayCacheBySymbolById (5);",
    "        k.append (message);",
    "        const z = this.safeValue (this.trades, symbol);",
    "        if (z === undefined) {",
    "            this.trades[symbol] = new ArrayCache (3);",
    "        }",
    "        delete this.trades[symbol];",
    "        return this.safeValue (this.trades, symbol);",
    "    }",
    "    initT () {",
    "        if (this.trades === undefined) {",
    "            this.trades = {};",
    "        }",
    "        this.trades = this.createSafeDictionary ();",
    "        if (this.safeValue (this.trades, 'a') === undefined) {",
    "            this.trades['a'] = new ArrayCache (3);",
    "        }",
    "    }",
    "    handleOrder (client: any, order: any, isTrigger: boolean) {",
    "        if (this.orders === undefined) {",
    "            this.orders = new ArrayCacheBySymbolById (10);",
    "        }",
    "        const orders = this.orders;",
    "        orders.append (order);",
    "        this.orders.append (order);",
    "        let myTrades = this.myTrades;",
    "        if (myTrades === undefined) {",
    "            myTrades = new ArrayCacheBySymbolById (10);",
    "        }",
    "        myTrades.append (order);",
    "        this.myTrades.append (order);",
    "        const stored = isTrigger ? this.triggerOrders : this.orders;",
    "        stored.append (order);",
    "        const liq = this.liquidations;",
    "        if (liq === undefined) {",
    "            return;",
    "        }",
    "        this.liquidations.append (order);",
    "        this.positions.append (order);",
    "        const cache: ArrayCache = this.positions;",
    "        cache.append (order);",
    "        const ohlcv = this.safeValue (this.ohlcvs, 'x');",
    "        ohlcv.append (order);",
    "        const ob = new ArrayCacheByTimestamp (3);",
    "        ob.append (order);",
    "        this.myLiquidations = undefined;",
    "    }",
    "    pruneCachedBySymbols (newCache: ArrayCacheBySymbolById, cache: ArrayCache, symbols: string[]): ArrayCache {",
    "        const entries = this.toArray (cache);",
    "        newCache.append (entries[0]);",
    "        return newCache;",
    "    }",
    "}",
].join("\n");

const PRUNE_AND_NILS = [
    "export class ex extends Exchange {",
    "    cleanIt (topic: string, symbols: string[]) {",
    "        if (topic === 'orders' && this.orders !== undefined) {",
    "            const freshOrdersCache = new ArrayCacheBySymbolById (10);",
    "            this.orders = this.pruneCachedBySymbols (freshOrdersCache, this.orders, symbols);",
    "        } else if (topic === 'myTrades' && this.myTrades !== undefined) {",
    "            const freshTradesCache = new ArrayCacheBySymbolById (10);",
    "            this.myTrades = this.pruneCachedBySymbols (freshTradesCache, this.myTrades, symbols);",
    "        }",
    "    }",
    "    pruneCachedBySymbols (newCache: ArrayCacheBySymbolById, cache: ArrayCache, symbols: string[]): ArrayCache {",
    "        const entries = this.toArray (cache);",
    "        for (let i = 0; i < entries.length; i++) {",
    "            const entry = entries[i];",
    "            newCache.append (entry);",
    "        }",
    "        return newCache;",
    "    }",
    "    handleTradesNilOnly (message: any, symbol: string) {",
    "        let trades;",
    "        if (symbol !== undefined) {",
    "            trades = this.trades[symbol];",
    "        }",
    "        trades.append (message);",
    "        let other;",
    "        other = message;",
    "        other = this.trades[symbol];",
    "        other.append (message);",
    "        const asMap = this.trades;",
    "        asMap[symbol] = other;",
    "    }",
    "    handleRef (message: any, symbol: string) {",
    "        let weird;",
    "        weird = this.trades[symbol];",
    "        weird = message;",
    "        weird.append (message);",
    "    }",
    "}",
].join("\n");

const NIL_ARM_TERNARY = [
    "export class ex extends Exchange {",
    "    handleP (client: any, message: any) {",
    "        const symbol = this.safeSymbol (this.safeString (message, 'S'));",
    "        let tradesArray = (symbol === undefined) ? undefined : this.safeValue (this.trades, symbol);",
    "        if (tradesArray === undefined) {",
    "            const tradesLimit = this.safeInteger (this.options, 'tradesLimit', 1000);",
    "            tradesArray = new ArrayCache (tradesLimit);",
    "            if (symbol !== undefined) {",
    "                this.trades[symbol] = tradesArray;",
    "            }",
    "        }",
    "        tradesArray.append (message);",
    "        client.resolve (tradesArray, 'x');",
    "    }",
    "}",
].join("\n");

const CAST_AND_FIELD_NIL = [
    "export class ex extends Exchange {",
    "    handleU (messageHash: string, isSnapshot: boolean) {",
    "        const cache = this.orders as Dict;",
    "        if (this.orders !== undefined) {",
    "            const keys = Object.keys (cache);",
    "            delete cache[keys[0]];",
    "        }",
    "        if (isSnapshot || (this.myLiquidations === undefined)) {",
    "            this.myLiquidations = new ArrayCache (5);",
    "        }",
    "    }",
    "}",
].join ("\n");

describe ('go ws list caches (FM-CACHE)', () => {
    const out = print ('tmp-fmcache-a', TRADES_AND_ORDERS);
    const pruned = print ('tmp-fmcache-b', PRUNE_AND_NILS);
    test ('base cache fields type their locals and nil compares are plain', () => {
        for (const want of [
            'var orders WsArrayCache = this.Orders', 'var myTrades WsArrayCache = this.MyTrades', 'if myTrades == nil {',
            'var liq WsArrayCache = this.Liquidations', 'if liq == nil {',
            'var stored WsArrayCache = func() WsArrayCache {',
        ]) {
            expect (out).toContain (want);
        }
        expect (out).not.toContain ('IsEqual(liq, nil)');
        expect (out).not.toContain ('IsEqual(myTrades, nil)');
    });
    test ('append is the plain method on a cache, the assertion elsewhere', () => {
        for (const want of [ '\torders.Append(order)', '\tthis.Orders.Append(order)', '\tthis.Liquidations.Append(order)', '\tk.Append(message)', '\tstored.Append(parsed)' ]) {
            expect (out).toContain (want);
        }
        for (const want of [ 'this.Positions.(Appender).Append(order)', 'cache.(Appender).Append(order)', 'ohlcv.(Appender).Append(order)' ]) {
            expect (out).toContain (want);
        }
    });
    test ('the trades cache prints its own Get / Has / Store and the typed locals', () => {
        for (const want of [
            'var stored WsArrayCache = this.Trades.Get(symbol)', 'this.Trades.Store(symbol, stored)', 'if !(this.Trades.Has(symbol)) {',
            'var trades WsArrayCache\n', 'trades = this.Trades.Get(symbol)', 'var t2 WsArrayCache = this.Trades.Get(symbol)',
            'if z == nil {', 'this.Trades = TradesCache{}', 'if this.Trades == nil {', 'if this.Trades.Get("a") == nil {',
        ]) {
            expect (out).toContain (want);
        }
        expect (out).not.toContain ('GetValue(this.Trades');
        expect (out).not.toContain ('InOp(this.Trades');
        expect (out).not.toContain ('AddElementToObject(this.Trades');
        expect (out).not.toContain ('map[string]any{}');
    });
    test ('a method returning only caches takes and answers WsArrayCache', () => {
        expect (pruned).toContain ('PruneCachedBySymbols(newCache WsArrayCache, cache WsArrayCache, symbols []string) WsArrayCache {');
        expect (pruned).toContain ('\tnewCache.Append(entry)');
    });
    test ('a local that is rebound to a foreign value keeps the box and the assertion', () => {
        expect (pruned).toContain ('var weird any = nil');
        expect (pruned).toContain ('weird.(Appender).Append(message)');
        expect (pruned).toContain ('var other any = nil');
        expect (pruned).toContain ('other.(Appender).Append(message)');
        expect (pruned).toContain ('var asMap any = this.Trades');
    });
    test ('a nil arm joins a cache arm of a ternary', () => {
        const nil = print ('tmp-fmcache-c', NIL_ARM_TERNARY);
        expect (nil).toContain ('var tradesArray WsArrayCache = func() WsArrayCache {');
        expect (nil).toContain ('\ttradesArray.Append(message)');
        expect (nil).toContain ('this.Trades.Store(symbol, tradesArray)');
    });
    test ('a cast of a cache field keeps the cache type and a field nil test is plain', () => {
        const cast = print ('tmp-fmcache-d', CAST_AND_FIELD_NIL);
        expect (cast).toContain ('var cache WsArrayCache = this.Orders');
        expect (cast).toContain ('(this.MyLiquidations == nil)');
        expect (cast).not.toContain ('IsEqual(this.MyLiquidations, nil)');
    });
});

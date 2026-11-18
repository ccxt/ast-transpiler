import { Exchange, ArrayCache, ArrayCacheBySymbolById, ArrayCacheByTimestamp } from '../base/Exchange';
type Dict = {[key: string]: any};
type Dictionary<T> = {[key: string]: T};
export class ex extends Exchange {
    handleTrades (client: any, message: any) {
        const symbol = this.safeSymbol (this.safeString (message, 'S'));
        let stored = this.safeValue (this.trades, symbol);
        if (stored === undefined) {
            const limit = this.safeInteger (this.options, 'tradesLimit', 1000);
            stored = new ArrayCache (limit);
            this.trades[symbol] = stored;
        }
        const parsed = this.parseTrade (message);
        stored.append (parsed);
        client.resolve (stored, 'x');
    }
    handleTrades2 (client: any, message: any, symbol: string) {
        if (!(symbol in this.trades)) {
            const cache = new ArrayCache (10);
            this.trades[symbol] = cache;
        }
        let trades;
        if (symbol !== undefined) {
            trades = this.trades[symbol];
        }
        trades.append (message);
        const t2 = this.trades[symbol];
        t2.append (message);
        const k = new ArrayCacheBySymbolById (5);
        k.append (message);
        const z = this.safeValue (this.trades, symbol);
        if (z === undefined) {
            this.trades[symbol] = new ArrayCache (3);
        }
        delete this.trades[symbol];
        return this.safeValue (this.trades, symbol);
    }
    initT () {
        if (this.trades === undefined) {
            this.trades = {};
        }
        this.trades = this.createSafeDictionary ();
        if (this.safeValue (this.trades, 'a') === undefined) {
            this.trades['a'] = new ArrayCache (3);
        }
    }
    handleOrder (client: any, order: any, isTrigger: boolean) {
        if (this.orders === undefined) {
            this.orders = new ArrayCacheBySymbolById (10);
        }
        const orders = this.orders;
        orders.append (order);
        this.orders.append (order);
        let myTrades = this.myTrades;
        if (myTrades === undefined) {
            myTrades = new ArrayCacheBySymbolById (10);
        }
        myTrades.append (order);
        this.myTrades.append (order);
        const stored = isTrigger ? this.triggerOrders : this.orders;
        stored.append (order);
        const liq = this.liquidations;
        if (liq === undefined) {
            return;
        }
        this.liquidations.append (order);
        this.positions.append (order);
        const cache: ArrayCache = this.positions;
        cache.append (order);
        const ohlcv = this.safeValue (this.ohlcvs, 'x');
        ohlcv.append (order);
        const ob = new ArrayCacheByTimestamp (3);
        ob.append (order);
        this.myLiquidations = undefined;
    }
    pruneCachedBySymbols (newCache: ArrayCacheBySymbolById, cache: ArrayCache, symbols: string[]): ArrayCache {
        const entries = this.toArray (cache);
        newCache.append (entries[0]);
        return newCache;
    }
}
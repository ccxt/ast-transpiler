import { Exchange, ArrayCache, ArrayCacheBySymbolById, ArrayCacheByTimestamp } from '../base/Exchange';
type Dict = {[key: string]: any};
type Dictionary<T> = {[key: string]: T};
export class ex extends Exchange {
    cleanIt (topic: string, symbols: string[]) {
        if (topic === 'orders' && this.orders !== undefined) {
            const freshOrdersCache = new ArrayCacheBySymbolById (10);
            this.orders = this.pruneCachedBySymbols (freshOrdersCache, this.orders, symbols);
        } else if (topic === 'myTrades' && this.myTrades !== undefined) {
            const freshTradesCache = new ArrayCacheBySymbolById (10);
            this.myTrades = this.pruneCachedBySymbols (freshTradesCache, this.myTrades, symbols);
        }
    }
    pruneCachedBySymbols (newCache: ArrayCacheBySymbolById, cache: ArrayCache, symbols: string[]): ArrayCache {
        const entries = this.toArray (cache);
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            newCache.append (entry);
        }
        return newCache;
    }
    handleTradesNilOnly (message: any, symbol: string) {
        let trades;
        if (symbol !== undefined) {
            trades = this.trades[symbol];
        }
        trades.append (message);
        let other;
        other = message;
        other = this.trades[symbol];
        other.append (message);
        const asMap = this.trades;
        asMap[symbol] = other;
    }
    handleRef (message: any, symbol: string) {
        let weird;
        weird = this.trades[symbol];
        weird = message;
        weird.append (message);
    }
}
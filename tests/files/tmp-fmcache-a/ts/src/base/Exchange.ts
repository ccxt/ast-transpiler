export class ArrayCache { append (x: any) {} }
export class ArrayCacheBySymbolById extends ArrayCache {}
export class ArrayCacheByTimestamp { append (x: any) {} }
export class Exchange {
    orders: ArrayCache | undefined = undefined;
    triggerOrders!: ArrayCache;
    liquidations: ArrayCache | undefined = undefined;
    myLiquidations: ArrayCache | undefined = undefined;
    myTrades: ArrayCache | undefined;
    positions: any;
    trades: Dictionary<ArrayCache>;
    ohlcvs: Dictionary<Dictionary<ArrayCacheByTimestamp>>;
    safeValue (a, b, c?) { return undefined; }
    getValue (a, b) { return undefined; }
    safeInteger (a, b, c) { return 1; }
    safeString (a, b, c?) { return ''; }
    safeSymbol (a) { return ''; }
    createSafeDictionary () { return {}; }
    parseTrade (a) { return {}; }
    toArray (a) { return []; }
    options: Dict = {};
    handleMessage (client, message) {}
}

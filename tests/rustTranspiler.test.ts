import { Transpiler } from '../src/transpiler';
import { isElementAccessExpression, isIdentifier } from "typescript/unstable/ast/is";
import { RUST_DECLARED_DICT_LOCALS } from '../src/rustTranspiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// fixture trees used above are written to a temp dir so the suite carries no fixture files
const rustInlineFixtures: Record<string, Record<string, string>> = {
 "bool-params": {
  "ts/src/base/Exchange.ts": "export interface Dict { [key: string]: any }\nexport default class Exchange {\n    options: Dict = {};\n    setSandboxMode (enabled: boolean) {\n        if (enabled) {\n            this.options['sandbox'] = true;\n        }\n    }\n    isPostOnly (isMarketOrder: boolean, params: Dict = {}): boolean {\n        return isMarketOrder;\n    }\n    hold (f: any): any {\n        return f;\n    }\n}\n",
  "ts/src/venue.ts": "import Exchange from './base/Exchange.js';\nexport default class venue extends Exchange {\n    // required `boolean` read only in condition slots -> native `bool`\n    settlementData (isBuy: boolean, amount: any) {\n        if (isBuy) {\n            return -amount;\n        }\n        return amount;\n    }\n    // optional `boolean`: bound with the truthiness the use sites applied\n    starkAmount (amount: any, roundUp: boolean = false) {\n        if (roundUp) {\n            return amount + 1;\n        }\n        return amount;\n    }\n    // a bool parameter forwarded into a native-`bool` slot\n    forwarded (on: boolean) {\n        return this.settlementData (on, 1);\n    }\n    // a `Value` argument coerces at the call site\n    fromValue (raw: any) {\n        return this.settlementData (raw, 2);\n    }\n    // a bool parameter read outside a bool sink keeps the box\n    boxed (flag: boolean) {\n        const held = flag;\n        return held;\n    }\n    // an override keeps the base `Value` signature\n    override setSandboxMode (enabled: boolean) {\n        if (enabled) {\n            this.options['demo'] = true;\n        }\n    }\n    // a method reference handed to another call keeps the `Value` signature\n    channelB (flag: boolean) {\n        if (flag) {\n            return 1;\n        }\n        return 2;\n    }\n    holdRef () {\n        return this.hold (this.channelB);\n    }\n}\n"
 },
 "free-fn-defaults": {"ts/src/test/Exchange/test.helper.ts": "async function helperTest (exchange: any, symbol: string, params = {}) {\n    return [ exchange, symbol, params ];\n}\nasync function noAwait (exchange: any) {\n    return exchange;\n}\nasync function testHelper (exchange: any, symbol: string) {\n    const a = await helperTest (exchange, symbol);\n    const b = helperTest (exchange, symbol, { 'x': 1 });\n    const c = await noAwait (exchange);\n    return [ a, b, c ];\n}\nexport default testHelper;\n"},
 "bool-locals": {
  "ts/src/base/Exchange.ts": "export interface Dict { [key: string]: any }\nexport default class Exchange {\n    options: Dict = {};\n    isPostOnly (isMarketOrder: boolean, params: Dict = {}): boolean {\n        return isMarketOrder;\n    }\n}\n",
  "ts/src/venue.ts": "import Exchange from './base/Exchange.js';\nexport default class venue extends Exchange {\n    // required bool parameter: the native-`bool` slot a local may flow into\n    settle (isMarket: boolean, amount: any) {\n        if (isMarket) {\n            return -amount;\n        }\n        return amount;\n    }\n    // a bool local from a comparison, read in condition slots AND a native-`bool` slot\n    localIntoBoolSlot (type: string) {\n        const isMarket = (type === 'market');\n        if (!isMarket) {\n            return 0;\n        }\n        if (isMarket && (type === 'x')) {\n            return 1;\n        }\n        return this.settle (isMarket, 2);\n    }\n    // a comparison local read only in conditions stays typed (no regression)\n    localConditionsOnly (type: string) {\n        const isSpot = (type === 'spot');\n        if (isSpot) {\n            return 1;\n        }\n        return 0;\n    }\n    // negative: a Value slot keeps the box\n    localIntoValueSlot (type: string) {\n        const isWide = (type === 'spot');\n        const held = [ isWide ];\n        return held;\n    }\n    // negative: a `Value` read into the bool slot still coerces\n    valueIntoBoolSlot (raw: any) {\n        return this.settle (raw, 3);\n    }\n}\n"
 },
 "typed-unified": {
  "ts/src/base/Exchange.ts": "export interface Dict { [key: string]: any }\nexport type Int = number | undefined;\nexport type int = number;\nexport type Strings = string[] | undefined;\nexport type Str = string | undefined;\nexport type Num = number | undefined;\nexport type OrderType = string;\nexport type OrderSide = string;\nexport interface Order { id: string }\nexport interface Ticker { symbol: string }\nexport type Tickers = Dict;\nexport interface Position { symbol: string }\nexport interface OrderRequest { symbol: string }\nexport default class Exchange {\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n    async fetchTickers (symbols: Strings = undefined, params: Dict = {}): Promise<Tickers> {\n        return {};\n    }\n    async fetchPositions (symbols: Strings = undefined, params: Dict = {}): Promise<Position[]> {\n        return [];\n    }\n}\n",
  "ts/src/venue.ts": "import Exchange from './base/Exchange.js';\nimport type { Dict, Int, int, Num, Order, OrderRequest, OrderSide, OrderType, Str, Ticker } from './base/Exchange.js';\nexport default class venue extends Exchange {\n    async fetchTicker (symbol: string, params: Dict = {}): Promise<Ticker> {\n        const tickers = await this.fetchTickers ([ symbol ], params);\n        return tickers[symbol];\n    }\n    async fetchTrades (symbol: string, since: Int = undefined, limit: Int = undefined, params: Dict = {}): Promise<any[]> {\n        return [];\n    }\n    async createOrder (symbol: string, type: OrderType, side: OrderSide, amount: number, price: Num = undefined, params: Dict = {}): Promise<Order> {\n        return {} as any;\n    }\n    async cancelOrder (id: string, symbol: Str = undefined, params: Dict = {}): Promise<Order> {\n        return {} as any;\n    }\n    async cancelOrders (ids: string[], symbol: Str = undefined, params: Dict = {}): Promise<Order[]> {\n        return [];\n    }\n    async createOrders (orders: OrderRequest[], params: Dict = {}): Promise<Order[]> {\n        return [];\n    }\n    async createOne (order: Dict, params: Dict = {}) {\n        return await this.createOrders ([ order as OrderRequest ], params);\n    }\n    async createMarketBuyOrder (symbol: string, cost: number, params: Dict = {}) {\n        return await this.createOrder (symbol, 'market', 'buy', cost, undefined, params);\n    }\n    async fetchOHLCV (symbol: string, timeframe = '1m', since: Int = undefined, limit: Int = undefined, params: Dict = {}): Promise<any[]> {\n        return [];\n    }\n    async fetchOrder (id: string, symbol: Str = undefined, params: Dict = {}): Promise<any> {\n        return {};\n    }\n    async fetchCandles (symbol: string, tf: string, params: Dict = {}): Promise<any[]> {\n        return await this.fetchOHLCV (symbol, tf, undefined, undefined, params);\n    }\n    async fetchBoth (symbol: string, params: Dict = {}): Promise<any[]> {\n        const [ a, b ] = await Promise.all ([ this.fetchOrder ('1', symbol, params), this.fetchOrder ('2', symbol, params) ]);\n        return [ a, b ];\n    }\n    async loadSnapshot () {\n        const all = await Promise.all ([ this.fetchPositions () ]);\n        const again = await this.fetchPositions (undefined);\n        return all;\n    }\n    async watchOrders (symbol: Str = undefined, since: Int = undefined, limit: Int = undefined, params: Dict = {}): Promise<any[]> {\n        return [];\n    }\n    async watchMyOrders (symbol: Str = undefined, params: Dict = {}) {\n        return await this.watchOrders (symbol, undefined, undefined, params);\n    }\n    async watchTrades (symbol: Str, since: Int = undefined, limit: Int = undefined, params: Dict = {}): Promise<any[]> {\n        return [];\n    }\n    async withdraw (code: string, amount: number, address: string, params: Dict = {}): Promise<any> {\n        return {};\n    }\n    async transfer (code: string, amount: number, fromAccount: string, toAccount: string, params: Dict = {}): Promise<any> {\n        return {};\n    }\n    async fetchLedger (code: Str = undefined, since: Int = undefined, limit: Int = undefined, params: Dict = {}): Promise<any[]> {\n        return [];\n    }\n    async fetchTradingFees (params: Dict = {}): Promise<any> {\n        return {};\n    }\n    async sweep (code: string, params: Dict = {}) {\n        await this.transfer (code, 1, 'spot', 'swap', params);\n        return await this.fetchLedger (code, undefined, 10);\n    }\n    async setLeverage (leverage: int, symbol: Str = undefined, params: Dict = {}) {\n        return {};\n    }\n    async setLeverageTwice (symbol: Str = undefined, params: Dict = {}) {\n        return await this.setLeverage (2, symbol, params);\n    }\n    async fetchTime (params: Dict = {}): Promise<Int> {\n        return 1;\n    }\n    async watchOHLCVForSymbols (symbolsAndTimeframes: string[][], since: Int = undefined, limit: Int = undefined, params: Dict = {}): Promise<any> {\n        return {};\n    }\n    async unWatchTicker (symbol: string, params: Dict = {}): Promise<any> {\n        return true;\n    }\n    async fetchEvents (params: fetchEventsParams = {}): Promise<any[]> {\n        return [];\n    }\n}\ninterface fetchEventsParams { query?: string; [key: string]: any; }\n"
 },
 "typed-unified-setup": {
  "ts/src/base/Exchange.ts": "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport interface Market { symbol: string }\nexport interface Dictionary<T> { [key: string]: T }\nexport default class Exchange {\n    markets: Dict = {};\n    options: Dict = {};\n    async loadMarkets (reload: boolean = false, params: object = {}): Promise<Dictionary<Market>> {\n        return this.markets;\n    }\n    market (symbol: Str): Market {\n        return this.markets[symbol];\n    }\n    setSandboxMode (enabled: boolean) {\n        this.options['sandboxMode'] = enabled;\n    }\n}\n",
  "ts/src/venue.ts": "import Exchange from './base/Exchange.js';\nimport type { Dict, Market, Str } from './base/Exchange.js';\nexport default class venue extends Exchange {\n    override async loadMarkets (reload = false, params: Dict = {}) {\n        const markets = await super.loadMarkets (reload, params);\n        return markets;\n    }\n    override market (symbol: Str): Market {\n        return this.markets[symbol];\n    }\n    override setSandboxMode (enable: boolean) {\n        this.options['sandboxMode'] = enable;\n    }\n    async fetchSomething (symbol: string, params = {}) {\n        await this.loadMarkets ();\n        await this.loadMarkets (true);\n        const market = this.market (symbol);\n        this.setSandboxMode (true);\n        return market;\n    }\n}\n"
 },
 "typed-market-local": {
  "ts/src/base/Exchange.ts": "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport interface Market { id: Str; symbol: string; spot: boolean; swap: boolean; stock?: boolean; linear: boolean | undefined; info: any }\nexport default class Exchange {\n    markets: Dict = {};\n    market (symbol: Str): Market {\n        return this.markets[symbol];\n    }\n    safeString (d: any, k: any): Str {\n        return d[k];\n    }\n    hold (m: any): any {\n        return m;\n    }\n}\n",
  "ts/src/venue.ts": "import Exchange from './base/Exchange.js';\nimport type { Dict, Str } from './base/Exchange.js';\nexport default class venue extends Exchange {\n    fetchOne (symbol: string, params: Dict = {}) {\n        const market = this.market (symbol);\n        const request: Dict = { 'pair': market['id'] };\n        if (market['swap'] || market['linear']) {\n            request['info'] = market['info'];\n        }\n        request['s'] = this.safeString (market, 'symbol');\n        return this.hold (market);\n    }\n    fetchTwo (symbol: string) {\n        let market = this.market (symbol);\n        market = this.market ('x');\n        return market['id'];\n    }\n    fetchThree (symbol: string) {\n        const market = this.market (symbol);\n        const isStock = market['stock'];\n        const isStockSpot = isStock && (market['spot'] === true);\n        if (isStockSpot || (market['spot'] !== true)) {\n            return market['id'];\n        }\n        return market['symbol'];\n    }\n}\n"
 },
 "derived-scalar-returns": {
  "ts/src/base/Exchange.ts": "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport type int = number;\nexport default class Exchange {\n    findTimeframe (timeframe: any, timeframes: Dict = undefined): Str {\n        return undefined;\n    }\n    incrementingNonce (): int {\n        return 1;\n    }\n    hold (x: any): any {\n        return x;\n    }\n}\n",
  "ts/src/venue.ts": "import Exchange from './base/Exchange.js';\nimport type { Dict } from './base/Exchange.js';\nexport default class venue extends Exchange {\n    parseEntry (entry: Dict, keys: string[]) {\n        const timeframe = this.findTimeframe (entry['i']);\n        if (timeframe === undefined) {\n            return undefined;\n        }\n        const nonce = this.incrementingNonce ();\n        if (nonce === 0) {\n            return undefined;\n        }\n        const key = keys[0];\n        const parts = 'a-b'.split ('-');\n        const first = parts[0];\n        if (first === 'a') {\n            return this.hold (key);\n        }\n        const boxedOnly = this.findTimeframe (entry['j']);\n        return { 'tf': timeframe, 'n': nonce, 'f': first, 'b': boxedOnly };\n    }\n}\n"
 },
 "typed-call-results": {
  "ts/src/base/Exchange.ts": "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport interface Market { id: Str; symbol: string; type: string; settle: Str; linear: boolean | undefined; info: any }\nexport interface Order { id: string; info: any }\nexport default class Exchange {\n    markets: Dict = {};\n    market (symbol: Str): Market {\n        return this.markets[symbol];\n    }\n    async loadMarkets (reload = false, params: Dict = {}): Promise<Dict> {\n        return this.markets;\n    }\n    async fetchOrders (symbol: Str = undefined, params: Dict = {}): Promise<Order[]> {\n        return [];\n    }\n    hold (m: any, n: any = undefined): any {\n        return m;\n    }\n}\n",
  "ts/src/venue.ts": "import Exchange from './base/Exchange.js';\nimport type { Dict, Str } from './base/Exchange.js';\nexport default class venue extends Exchange {\n    async fetchA (symbol: Str = undefined, params: Dict = {}) {\n        await this.loadMarkets ();\n        let market = undefined;\n        if (symbol !== undefined) {\n            market = this.market (symbol);\n        }\n        return this.hold (params, market);\n    }\n    async fetchB (symbol: string, params: Dict = {}) {\n        let market = this.market (symbol);\n        if (market['type'] === 'swap') {\n            market = this.market ('x');\n        }\n        return this.hold ({ 'k': market['settle'], 'l': market['linear'], 'b': market['baseId'] }, market);\n    }\n    async fetchC (symbol: string, params: Dict = {}) {\n        const orders = await this.fetchOrders (symbol, params);\n        return this.hold (orders);\n    }\n}\n"
 },
 "venue-scalar-returns": {
  "ts/src/base/Exchange.ts": "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport type int = number;\nexport default class Exchange {\n    options: Dict = {};\n    sum (a: any, b: any): any { return a + b; }\n    safeInteger (o: any, k: any, d: any = undefined): any { return o; }\n    hold (x: any): any { return x; }\n}\n",
  "ts/src/venue.ts": "import Exchange from './base/Exchange.js';\nimport type { Dict, Str, int } from './base/Exchange.js';\nexport default class venue extends Exchange {\n    requestId (): int {\n        const requestId = this.sum (this.safeInteger (this.options, 'requestId', 0), 1);\n        this.options['requestId'] = requestId;\n        return requestId;\n    }\n    topicName (symbol: Str): Str {\n        if (symbol === undefined) {\n            return undefined;\n        }\n        return 'topic:' + symbol;\n    }\n    mixedId (): int {\n        return 1;\n    }\n    subscribe (symbol: Str) {\n        const requestId = this.requestId ();\n        const request: Dict = { 'id': requestId.toString () };\n        const topic = this.topicName (symbol);\n        if (topic === undefined) {\n            return request;\n        }\n        const other = this.mixedId ();\n        return this.hold ([ request, other.toString () ]);\n    }\n}\n",
  "ts/src/other.ts": "import Exchange from './base/Exchange.js';\nexport default class other extends Exchange {\n    mixedId (): string {\n        return 'a';\n    }\n}\n"
 },
 "base-scalar-returns": {
  "ts/src/base/Exchange.ts": "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport interface Currency { code: Str }\nexport default class Exchange {\n    currencies: Dict = {};\n    safeCurrency (currencyId: Str, currency: Currency = undefined): Currency {\n        return this.currencies[currencyId];\n    }\n    safeCurrencyCode (currencyId: Str, currency: Currency = undefined): Str {\n        const c: Currency = this.safeCurrency (currencyId, currency);\n        return c['code'];\n    }\n    milliseconds (): number {\n        return 0;\n    }\n    hold (x: any): any {\n        return x;\n    }\n}\n",
  "ts/src/venue.ts": "import Exchange from './base/Exchange.js';\nimport type { Dict } from './base/Exchange.js';\nexport default class venue extends Exchange {\n    parseEntry (entry: Dict) {\n        const code = this.safeCurrencyCode (entry['c']);\n        if (code === undefined) {\n            return undefined;\n        }\n        const now = this.milliseconds ();\n        const kept = this.safeCurrencyCode (entry['d']);\n        kept['x'] = 1;\n        return { 'code': code, 'ts': now, 'k': kept };\n    }\n}\n"
 },
 "scalar-locals": {
  "ts/src/base/Exchange.ts": "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport type Int = number | undefined;\nexport type Num = number | undefined;\nexport default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n    safeString2 (o: any, k1: any, k2: any, d: Str = undefined): Str { return o; }\n    safeInteger (o: any, k: any, d: Int = undefined): Int { return o; }\n    safeTimestamp (o: any, k: any, d: Int = undefined): Int { return o; }\n    safeNumber (o: any, k: any, d: Num = undefined): Num { return o; }\n    safeBool (o: any, k: any, d: boolean): boolean { return o; }\n    parseNumber (x: any, d: any = undefined): any { return x; }\n    milliseconds (): number { return 1; }\n}\n",
  "ts/src/venue.ts": "import Exchange from './base/Exchange.js';\nimport type { Dict } from './base/Exchange.js';\nexport default class venue extends Exchange {\n    parseThing (resp: Dict, other: Dict) {\n        const id = this.safeString (resp, 'id');\n        const ts = this.safeInteger (resp, 'ts');\n        const lim = this.safeInteger (resp, 'limit', 100);\n        const price = this.safeNumber (resp, 'price');\n        const flag = this.safeBool (resp, 'flag', false);\n        const side = this.safeString (resp, 'side', 'buy');\n        let spot = true;\n        let name = 'abc';\n        let page = 1;\n        const fee = 0.25;\n        const req: Dict = {};\n        if (id === undefined) {\n            return undefined;\n        }\n        if (flag) {\n            req['f'] = 1;\n        }\n        if (name === 'x') {\n            name = 'y';\n            page = 2;\n            spot = false;\n        }\n        req['id'] = id;\n        req['ts'] = ts;\n        req['lim'] = lim;\n        req['p'] = price;\n        req['spot'] = spot;\n        req['side'] = side;\n        req['page'] = page;\n        req['fee'] = fee;\n        const kept = this.safeString (resp, 'kept');\n        const len = kept.length;\n        const other2 = kept.split ('-');\n        return [ req, name, len, other2 ];\n    }\n}\n"
 },
 "scalar-order": {
  "ts/src/base/Exchange.ts": "export interface Dict { [key: string]: any }\nexport type Int = number | undefined;\nexport type Str = string | undefined;\nexport default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n    safeInteger (o: any, k: any, d: Int = undefined): Int { return o; }\n}\n",
  "ts/src/venue.ts": "import Exchange from './base/Exchange.js';\nimport type { Dict } from './base/Exchange.js';\nexport default class venue extends Exchange {\n    isStale (o: Dict) {\n        const now = this.safeInteger (o, 'now', 0);\n        const last = this.safeInteger (o, 'last');\n        const stale = now > last;\n        if (stale) {\n            return last;\n        }\n        return { 's': stale, 'l': last };\n    }\n    pick (o: Dict) {\n        let a = this.safeString (o, 'a');\n        const b = this.safeString (o, 'b');\n        if (a === undefined) {\n            a = b;\n        }\n        return a === 'x';\n    }\n    keep (o: Dict) {\n        const t = this.safeInteger (o, 't', 0);\n        const once = t * 2;\n        return { 'o': once };\n    }\n}\n"
 },
 "expression-locals": {
  "ts/src/base/Exchange.ts": "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport type Int = number | undefined;\nexport default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n    safeInteger (o: any, k: any, d: Int = undefined): Int { return o; }\n}\n",
  "ts/src/base/Precise.ts": "export default class Precise {\n    static stringAdd (a: string, b: string): string { return a; }\n}\n",
  "ts/src/venue.ts": "import Exchange from './base/Exchange.js';\nimport type { Dict } from './base/Exchange.js';\nimport Precise from './base/Precise.js';\nexport default class venue extends Exchange {\n    parseThing (resp: Dict, other: Dict, inverse: boolean) {\n        const req: Dict = {};\n        const id = this.safeString (resp, 'id');\n        const side = this.safeString (resp, 'side', 'buy');\n        const lim = this.safeInteger (resp, 'limit', 100);\n        const alias = id;\n        const kind = inverse ? 'base' : 'quote';\n        const idx = inverse ? 7 : 5;\n        const sideLen = side.length;\n        const lower = side.toLowerCase ();\n        const isBuy = side.startsWith ('b');\n        const hasDash = side.indexOf ('-') >= 0;\n        const doubled = lim * 2;\n        const ratio = lim / 1000;\n        const big = lim > sideLen;\n        const total = Precise.stringAdd (id, '1');\n        let suffix = 'x';\n        suffix += '-y';\n        req['k'] = kind;\n        req['a'] = alias;\n        req['i'] = idx;\n        req['l'] = sideLen;\n        req['lw'] = lower;\n        req['b'] = isBuy;\n        req['d'] = hasDash;\n        req['x2'] = doubled;\n        req['r'] = ratio;\n        req['g'] = big;\n        req['t'] = total;\n        req['s'] = suffix;\n        if (alias === 'a' || kind === 'b' || idx > 6 || lower === 'c' || doubled > 3 || big || total === '2' || ratio > 1) {\n            req['z'] = true;\n        }\n        return req;\n    }\n}\n"
 },
 "typed-unified-r4": {
  "ts/src/base/Exchange.ts": "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport interface Order { id: string }\nexport interface CancellationRequest { id: string; symbol: string }\nexport default class Exchange {\n}\n",
  "ts/src/venue.ts": "import Exchange from './base/Exchange.js';\nimport type { CancellationRequest, Dict, Order, Str } from './base/Exchange.js';\nexport default class venue extends Exchange {\n    async cancelOrdersForSymbols (orders: CancellationRequest[], params: Dict = {}): Promise<Order[]> {\n        return [];\n    }\n    async cancelUnifiedOrder (order: Order, params: Dict = {}): Promise<Order> {\n        const orders = await this.cancelOrdersForSymbols ([ order ], params);\n        return orders[0];\n    }\n    async fetchOrderStatus (id: string, symbol: Str = undefined, params: Dict = {}): Promise<Str> {\n        return 'open';\n    }\n}\n"
 },
 "lent-params": {
  "ts/src/base/Exchange.ts": "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nconst omit = (x: Dict | undefined, ...args: any) => x;\nconst extend = (...args: any[]) => Object.assign ({}, ...args);\nexport default class Exchange {\n    omit = omit;\n    extend = extend;\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n    handleParamString (params: Dict, paramName: string, defaultValue: Str = undefined): [Str, Dict] {\n        const value = this.safeString (params, paramName, defaultValue);\n        const paramsOmitted = (value !== undefined) ? this.omit (params, paramName) : params;\n        return [ value, paramsOmitted ];\n    }\n    handleUntilOption (key: string, request: Dict, params: Dict, multiplier: number = 1): [Dict, Dict] {\n        const until = this.safeString (params, 'until');\n        if (until !== undefined) {\n            request[key] = until;\n        }\n        const paramsOmitted = (until !== undefined) ? this.omit (params, 'until') : params;\n        return [ request, paramsOmitted ];\n    }\n    handleWrittenParams (params: Dict): [Str, Dict] {\n        params['seen'] = true;\n        return [ undefined, params ];\n    }\n    handleOverriddenParams (params: Dict): [Str, Dict] {\n        return [ this.safeString (params, 'x'), params ];\n    }\n}\n",
  "ts/src/venue.ts": "import Exchange from './base/Exchange.js';\nimport type { Dict } from './base/Exchange.js';\nexport default class venue extends Exchange {\n    fetchThing (params: Dict = {}) {\n        const [ tag, paramsTag ] = this.handleParamString (params, 'tag');\n        const [ requestUntil, paramsUntil ] = this.handleUntilOption ('end', { 'tag': tag }, paramsTag);\n        return this.extend (requestUntil, paramsUntil);\n    }\n    handleOverriddenParams (params: Dict): [Str, Dict] {\n        return [ undefined, params ];\n    }\n}\ntype Str = string | undefined;\n"
 },
 "handed-dict": {
  "ts/src/base/Exchange.ts": "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nconst omit = (x: Dict | undefined, ...args: any) => x;\nconst extend = (...args: any[]) => Object.assign ({}, ...args);\nexport default class Exchange {\n    omit = omit;\n    extend = extend;\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n    handleMarketTypeAndParams (m: string, market: any = undefined, params: Dict = {}): [string, Dict] { return [ m, params ]; }\n    hold (x: any): any { return x; }\n}\n",
  "ts/src/venue.ts": "import Exchange from './base/Exchange.js';\nimport type { Dict } from './base/Exchange.js';\nexport default class venue extends Exchange {\n    fetchThing (params: Dict = {}) {\n        const [ marketType, query ] = this.handleMarketTypeAndParams ('fetchThing', undefined, params);\n        const rest = this.omit (query, 'x');\n        const s = this.safeString (query, 's');\n        const request: Dict = { 'type': marketType, 's': s };\n        return this.hold (this.extend (request, rest));\n    }\n    fetchKept (params: Dict = {}) {\n        const kept = this.omit (params, 'x');\n        return this.hold (kept);\n    }\n}\n"
 },
 "literal-handoff": {
  "ts/src/base/Exchange.ts": "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n    parseFee (o: any): Dict { return o; }\n    hold (o: any): any { return o; }\n    extend (...args: any[]): any { return args[0]; }\n}\n",
  "ts/src/venue.ts": "import Exchange from './base/Exchange.js';\nimport type { Dict } from './base/Exchange.js';\nexport default class venue extends Exchange {\n    feesBySymbol (fees: any[]) {\n        const result: Dict = {};\n        for (let i = 0; i < fees.length; i++) {\n            const fee = this.parseFee (fees[i]);\n            const symbol = this.safeString (fee, 'symbol');\n            if (symbol !== undefined) {\n                result[symbol] = fee;\n            }\n        }\n        return result;\n    }\n    seenOnce (ids: string[]) {\n        const seen: Dict = {};\n        for (let i = 0; i < ids.length; i++) {\n            const id = ids[i];\n            if (!(id in seen)) {\n                seen[id] = true;\n            }\n        }\n        return seen as any;\n    }\n    tiersList (info: any[]) {\n        const tiers = [];\n        for (let i = 0; i < info.length; i++) {\n            tiers.push ({ 'tier': i });\n        }\n        return tiers as any[];\n    }\n    branchRequests (a: boolean, params: Dict) {\n        if (a) {\n            const request: Dict = { 'x': 1 };\n            request['y'] = 2;\n            return this.hold (this.extend (request, params));\n        } else {\n            const request: Dict = { 'z': 1 };\n            return this.hold (this.extend (request, params));\n        }\n    }\n    sharedList (a: boolean) {\n        const out = [];\n        out.push (1);\n        this.hold (out);\n        return out as any[];\n    }\n}\n"
 },
 "borrowed-dict": {
  "ts/src/base/Exchange.ts": "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport type Int = number | undefined;\nexport default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n    safeInteger (o: any, k: any, d: Int = undefined): Int { return o; }\n    safeDict (o: any, k: any, d: Dict = undefined): Dict { return o; }\n    extend (...args: any[]): any { return args[0]; }\n    hold (x: any): any { return x; }\n}\n",
  "ts/src/venue.ts": "import Exchange from './base/Exchange.js';\nimport type { Dict } from './base/Exchange.js';\nexport default class venue extends Exchange {\n    parseThing (resp: Dict, params: Dict) {\n        const data = this.safeDict (resp, 'data');\n        const id = this.safeString (data, 'id');\n        const n = this.safeInteger (data, 'n', 1);\n        const merged = this.extend (resp, params);\n        const s = this.safeString (merged, 's');\n        const kept = this.safeDict (resp, 'kept');\n        const k = this.safeString (kept, 'k');\n        return this.hold ([ id, n, s, k, kept ]);\n    }\n}\n"
 },
 "optional-containers": {"ts/src/base/Exchange.ts": "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n    safeValue (o: any, k: any, d: any = undefined): any { return o; }\n    safeDict (o: any, k: any, d: Dict = undefined): Dict { return o; }\n    safeList (o: any, k: any, d: any[] = undefined): any[] { return o; }\n    hold (x: any): any { return x; }\n}\n", "ts/src/venue.ts": "import Exchange from './base/Exchange.js';\nimport type { Dict } from './base/Exchange.js';\nexport default class venue extends Exchange {\n    parseThing (resp: Dict, key: string) {\n        const fees = this.safeDict (resp, 'fees');\n        let feeId = undefined;\n        if (fees !== undefined) {\n            feeId = this.safeString (fees, 'id');\n        }\n        let rows = undefined;\n        if (key === 'a') {\n            rows = this.safeList (resp, 'a');\n        } else {\n            rows = this.safeList (resp, 'b', []);\n        }\n        if (key === 'z') {\n            rows = undefined;\n        }\n        let first = undefined;\n        if (rows !== undefined) {\n            first = this.safeValue (rows, 0);\n        }\n        let info = undefined;\n        info = this.safeDict (resp, 'info');\n        const note = this.safeString (info, key);\n        const filled = this.safeDict (resp, 'filled', { 'x': 1 });\n        const fx = (filled === undefined) ? undefined : this.safeString (filled, 'x');\n        let lost = undefined;\n        lost = this.safeDict (resp, 'lost');\n        const kept = this.safeDict (resp, 'kept');\n        if (kept === undefined) {\n            return this.hold (kept);\n        }\n        return this.hold ([ feeId, first, note, fx, this.safeString (lost, 'k'), lost ]);\n    }\n}\n"},
 "borrowed-any-key": {
    "ts/src/base/Exchange.ts": "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport type Int = number | undefined;\nexport default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n    safeInteger (o: any, k: any, d: Int = undefined): Int { return o; }\n    safeValue (o: any, k: any, d: any = undefined): any { return o; }\n    safeString2 (o: any, k1: any, k2: any, d: Str = undefined): Str { return o; }\n    safeDict (o: any, k: any, d: Dict = undefined): Dict { return o; }\n    safeList (o: any, k: any, d: any[] = undefined): any[] { return o; }\n    hold (x: any): any { return x; }\n}\n",
    "ts/src/venue.ts": "import Exchange from './base/Exchange.js';\nimport type { Dict } from './base/Exchange.js';\nexport default class venue extends Exchange {\n    parseThing (resp: Dict, key: string) {\n        const data = this.safeDict (resp, 'data');\n        const id = this.safeString (data, key);\n        const n = this.safeInteger (data, 'n', 1);\n        const rows = this.safeList (resp, 'rows');\n        const r0 = this.safeString (rows, key);\n        const lst = this.safeList (resp, 'lst');\n        const l0 = this.safeValue (lst, 0);\n        const l1 = this.safeString2 (lst, 1, 2);\n        const vs = this.safeList (resp, 'vs', []);\n        const v0 = this.safeString (vs, key);\n        const v1 = vs[1];\n        const out = [];\n        for (let i = 0; i < rows.length; i++) {\n            out.push (this.safeString (rows, i));\n        }\n        const first = this.safeValue (rows, 0);\n        const kept = this.safeList (resp, 'kept');\n        const k = this.safeDict (kept, 0);\n        return this.hold ([ id, n, out, first, k, kept, v0, v1, r0, l0, l1 ]);\n    }\n}\n"
  },
 "lent-string-list": {
  "ts/src/base/Exchange.ts": "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport type Strings = string[] | undefined;\nexport default class Exchange {\n    marketSymbols (symbols: Strings, type: Str | undefined, allowEmpty: false, sameTypeOnly?: boolean, sameSubTypeOnly?: boolean): string[];\n    marketSymbols (symbols?: Strings, type?: Str, allowEmpty?: boolean, sameTypeOnly?: boolean, sameSubTypeOnly?: boolean): Strings;\n    marketSymbols (symbols: Strings = undefined, type: Str = undefined, allowEmpty = true, sameTypeOnly = false, sameSubTypeOnly = false): Strings {\n        return symbols;\n    }\n    marketIds (symbols: string[]): string[];\n    marketIds (symbols?: Strings): Strings;\n    marketIds (symbols: Strings = undefined): Strings {\n        return symbols;\n    }\n    market (symbol: string): Dict {\n        return {};\n    }\n    safeString (d: any, k: any, dflt: Str = undefined): Str {\n        return d[k];\n    }\n    filterByArray (objects: any, key: string, values: any = undefined, indexed = true) {\n        return objects;\n    }\n}\n",
  "ts/src/venue.ts": "import Exchange from './base/Exchange.js';\nimport type { Dict, Strings } from './base/Exchange.js';\nexport default class venue extends Exchange {\n    pick (symbols: Strings, rows: any) {\n        const normalized = this.marketSymbols (symbols, undefined, false);\n        const market = this.market (normalized[0]);\n        const ids = this.marketIds (normalized);\n        const n = ids.length;\n        const out = this.filterByArray (rows, 'symbol', normalized, false);\n        return [ market, n, out ];\n    }\n    keysOf (d: Dict) {\n        const keys = Object.keys (d);\n        let found = false;\n        for (let i = 0; i < keys.length; i++) {\n            if (Array.isArray (d[keys[i]])) {\n                found = true;\n            }\n        }\n        return found;\n    }\n    wide (symbols: Strings) {\n        const listed: Strings = this.marketSymbols (symbols, undefined, false, true);\n        for (let i = 0; i < (listed as string[]).length; i++) {\n            this.market (this.safeString (listed, i));\n        }\n        return (listed as string[])[0];\n    }\n    keep (symbols: Strings) {\n        const maybe = this.marketSymbols (symbols);\n        return this.filterByArray ([], 'symbol', maybe);\n    }\n}\n"
 },
 "a15dstrvec": {
  "ts/src/base/Exchange.ts": "export interface Dict { [key: string]: any }\nexport type Bool = boolean | undefined;\nconst omit = (x: Dict | undefined, ...args: any) => x;\nconst extend = (...args: any[]) => Object.assign ({}, ...args);\nexport default class Exchange {\n    options: Dict = {};\n    omit = omit;\n    extend = extend;\n    safeValue (d: any, k: any, dflt: any = undefined): any {\n        return d === undefined ? dflt : d[k];\n    }\n    safeDict (d: any, k: any, dflt: Dict = undefined): Dict {\n        const v = this.safeValue (d, k);\n        return (typeof v === 'object') ? v : dflt;\n    }\n    safeBool (d: any, k: any, dflt: Bool = undefined): Bool {\n        const v = this.safeValue (d, k);\n        return (typeof v === 'boolean') ? v : dflt;\n    }\n    checkOptionBool (methodName: string, optionName: string, value: any): Bool {\n        if (value === undefined) {\n            return undefined;\n        }\n        return value === true;\n    }\n    handleOptionBoolAndParams (params: Dict, methodName: string, optionName: string, defaultValue: Bool = undefined): [Bool, Dict] {\n        const value = this.safeValue (params, optionName, defaultValue);\n        return [ this.checkOptionBool (methodName, optionName, value), params ];\n    }\n    handleTriggerAndParams (params: any): any[] {\n        const isTrigger = this.safeBool (params, 'trigger');\n        return [ isTrigger, params ];\n    }\n    handleOptionAndParams (params: Dict, methodName: string, optionName: string, defaultValue: any = undefined): [any, Dict] {\n        return [ this.safeValue (params, optionName, defaultValue), params ];\n    }\n}\n",
  "ts/src/venue.ts": "import Exchange from './base/Exchange.js';\nimport type { Dict } from './base/Exchange.js';\nexport default class venue extends Exchange {\n    async fetchByIds (ids: string[], symbol: string = undefined, params: Dict = {}) {\n        const request: Dict = { 'txid': ids.join (',') };\n        return request;\n    }\n    async fetchOne (id: string, params: Dict = {}) {\n        return await this.fetchByIds ([ id ], undefined, params);\n    }\n    async fetchIndexed (ids: string[], params: Dict = {}) {\n        const first = ids[0];\n        return ids.join (',') + first;\n    }\n    async fetchOneIndexed (id: string, params: Dict = {}) {\n        return await this.fetchIndexed ([ id ], params);\n    }\n    async fetchComputed (ids: string[], params: Dict = {}) {\n        return ids.join (',');\n    }\n    async fetchComputedCaller (params: Dict = {}) {\n        return await this.fetchComputed (params['ids'], params);\n    }\n    async fetchNoCaller (ids: string[], symbol: string = undefined, params: Dict = {}) {\n        const request: Dict = { 'txid': ids.join (',') };\n        return request;\n    }\n    async fetchChunked (hashes: string[], params: Dict = {}) {\n        const rows = [];\n        const chunk = this.arraySlice (hashes, 0, 2);\n        rows.push (await this.fetchByIds (chunk, undefined, params));\n        return rows;\n    }\n}\n"
 }
};
const rustFixtureRoot = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-rs-'));
for (const [dir, files] of Object.entries (rustInlineFixtures)) {
    for (const [rel, text] of Object.entries (files)) {
        const out = path.join (rustFixtureRoot, dir, rel);
        fs.mkdirSync (path.dirname (out), { recursive: true });
        fs.writeFileSync (out, text);
    }
}
afterAll (() => fs.rmSync (rustFixtureRoot, { recursive: true, force: true }));

jest.mock('module',()=>({
    __esModule: true,
    default: jest.fn()
}));

let transpiler: Transpiler;

beforeAll(() => {
    const config = {
        'verbose': false,
        'rust': {
            'parser': {
                'NUM_LINES_END_FILE': 0,
            }
        }
    }
    transpiler = new Transpiler(config);
})

// the native dict insert the printer emits for a literal key
const insert = (receiver: string, key: string, value: string) =>
    `if let Value::Dict(__d) = &mut ${receiver} { std::sync::Arc::make_mut(__d).insert("${key}".into(), ${value}); }`;

// `body` as the method `f(params)` of a class that also declares `parseX`, transpiled to Rust
const rustInParseXClass = (body: string, params = 'v: any') =>
    transpiler.transpileRust(`class T {\n    parseX (x) { return x; }\n    f (${params}) {\n${body}\n    }\n}`).content;

describe('rust transpiling tests', () => {
    test('basic variable declaration', () => {
        const ts = "const x = 1;"
        const rust = "let mut x: Value = Value::Int(1);"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });

    test('string variable declaration', () => {
        const ts = 'const s = "hello";'
        const rust = 'let mut s: Value = Value::Str("hello".into());'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });

    test('boolean variable declaration', () => {
        // An unused bool literal is a native `bool` local (see the
        // native-typed-locals tests at the end of this file).
        const ts = "const b = false;"
        const rust = "let mut b: bool = false;"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });

    test('basic while loop', () => {
        const ts =
        "while (true) {\n" +
        "    const x = 1;\n" +
        "    break;\n" +
        "}"
        const rust =
        "while (true) {\n" +
        "    let mut x: Value = Value::Int(1);\n" +
        "    break;\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });

    test('basic class declaration', () => {
        const ts =
        "class Test {\n" +
        "    main() {\n" +
        "        return 1\n" +
        "    }\n" +
        "}";
        const rust = transpiler.transpileRust(ts).content;
        expect(rust).toContain('pub struct Test');
        expect(rust).toContain('pub fn new()');
        expect(rust).toContain('pub fn main(');
        expect(rust).toContain('return Value::Int(1)');
    });

    test('falsy values', () => {
        const ts =
        'const a = "hi";\n' +
        "const b = false;\n" +
        "const c = a && b;\n" +
        "if (a) {\n" +
        "    const f = 1;\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_true(&a)');
        expect(output).toContain('is_true(&b)');
        expect(output).toContain('if is_true(&a)');
    });

    test('equality comparison', () => {
        const ts = "const r = (x == y);"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_equal(&x, &y)');
    });

    test('not equal comparison', () => {
        const ts = "const r = (x !== y);"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('!is_equal(&x, &y)');
    });

    test('addition wrapping', () => {
        const ts = "const c = a + b;"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add(&a, &b)');
    });

    test('should convert concat', () => {
        const ts = "y.concat(z)";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('concat(');
        expect(output).toContain('y');
        expect(output).toContain('z');
    });

    test('array literal', () => {
        const ts = "const x = [1,2,3];"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::from(vec![');
        expect(output).not.toContain('Value::List(');
        expect(output).toContain('Value::Int(1)');
        expect(output).toContain('Value::Int(2)');
        expect(output).toContain('Value::Int(3)');
    });

    test('empty array literal', () => {
        const ts = "const x = [];"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::from(vec![])');
        expect(output).not.toContain('Value::List(');
    });

    test('nested array literal', () => {
        const ts = "const x = [[1],[]];"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::from(vec![Value::from(vec![Value::Int(1)]), Value::from(vec![])])');
        expect(output).not.toContain('Value::List(');
    });

    test('array literal as a call argument', () => {
        const ts = "const x = this.foo([1,2]);"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('self.foo(Value::from(vec![Value::Int(1), Value::Int(2)]))');
        expect(output).not.toContain('Value::List(');
    });

    test('array length', () => {
        const ts = "const n = arr.length;"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_array_length(&arr)');
    });

    test('element access', () => {
        const ts = "const x = arr[0];"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value(&arr, &Value::Int(0))');
    });

    test('console.log', () => {
        const ts = 'console.log(x);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('println_val(&x)');
    });

    test('new expression', () => {
        const ts = "const obj = new MyClass();"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('MyClass::new()');
    });

    test('null/undefined', () => {
        const ts = "const x = undefined;"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::Null');
    });

    test('object literal', () => {
        const ts = 'const d = {"a": 1};'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::Map(');
        expect(output).toContain('HashMap::new()');
        expect(output).toContain('"a".to_string()');
    });

    test('for loop converts to while', () => {
        const ts =
        "for (let i = 0; i < 10; i++) {\n" +
        "    const x = 1;\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('while');
        // Both operands are checker-typed numbers — native f64 comparison.
        expect(output).toContain('i.as_f64().unwrap_or(f64::NAN) < Value::Int(10).as_f64().unwrap_or(f64::NAN)');
    });

    // Numeric comparisons: numbers go native, everything else keeps the helper
    test('less than on typed numbers compares natively', () => {
        const ts =
        "let a = 1;\n" +
        "let b = 2;\n" +
        "if (a < b) {\n" +
        "    const x = 1;\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('a.as_f64().unwrap_or(f64::NAN) < b.as_f64().unwrap_or(f64::NAN)');
        expect(output).not.toContain('is_less_than(');
    });

    test('less than or equal on typed numbers compares natively', () => {
        const ts =
        "let a = 1;\n" +
        "let b = 2;\n" +
        "if (a <= b) {\n" +
        "    const x = 1;\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('a.as_f64().unwrap_or(f64::NAN) <= b.as_f64().unwrap_or(f64::NAN)');
        expect(output).not.toContain('is_less_than_or_equal(');
    });

    test('greater than on typed numbers compares natively', () => {
        const ts =
        "let a = 1;\n" +
        "let b = 2;\n" +
        "if (a > b) {\n" +
        "    const x = 1;\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('a.as_f64().unwrap_or(f64::NAN) > b.as_f64().unwrap_or(f64::NAN)');
        expect(output).not.toContain('is_greater_than(');
    });

    test('greater than or equal on typed numbers compares natively', () => {
        const ts =
        "let a = 1;\n" +
        "let b = 2;\n" +
        "if (a >= b) {\n" +
        "    const x = 1;\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('a.as_f64().unwrap_or(f64::NAN) >= b.as_f64().unwrap_or(f64::NAN)');
        expect(output).not.toContain('is_greater_than_or_equal(');
    });

    test('number literal operand compares natively', () => {
        const ts =
        "let a = 1;\n" +
        "if (a > 0) {\n" +
        "    const x = 1;\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('a.as_f64().unwrap_or(f64::NAN) > Value::Int(0).as_f64().unwrap_or(f64::NAN)');
    });

    test('native comparison in a value position is boxed in Value::Bool', () => {
        const ts =
        "let a = 1;\n" +
        "let b = 2;\n" +
        "const r = a >= b;";
        const output = transpiler.transpileRust(ts).content;
        // d8 types the local natively when the checker proves boolean and every
        // use is a condition sink (`r` is unused), so no `Value::Bool` box is
        // emitted; the comparison itself stays the native f64 operator.
        expect(output).toContain('let mut r: bool = a.as_f64().unwrap_or(f64::NAN) >= b.as_f64().unwrap_or(f64::NAN);');
    });

    test('native comparison as a ternary condition stays a bare bool', () => {
        const ts =
        "let a = 1;\n" +
        "let b = 2;\n" +
        "const r = a > b ? 1 : 2;";
        const output = transpiler.transpileRust(ts).content;
        // d7 prints the ternary natively, so the condition must stay a bare
        // bool inside the `if` (never `Value::Bool(<compare>)`).
        expect(output).toContain('(if a.as_f64().unwrap_or(f64::NAN) > b.as_f64().unwrap_or(f64::NAN) { Value::Int(1) } else { Value::Int(2) })');
        expect(output).not.toContain('Value::Bool(a.as_f64()');
    });

    test('native comparison as a logical operand stays a bare bool', () => {
        const ts =
        "let a = 1;\n" +
        "let b = 2;\n" +
        "const c = false;\n" +
        "if (a > b || c) {\n" +
        "    const x = 1;\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('a.as_f64().unwrap_or(f64::NAN) > b.as_f64().unwrap_or(f64::NAN) || is_true(&c)');
    });

    test('parenthesized native comparison under ! stays a bare bool', () => {
        const ts =
        "let a = 1;\n" +
        "let b = 2;\n" +
        "if (!(a < b)) {\n" +
        "    const x = 1;\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('a.as_f64().unwrap_or(f64::NAN) < b.as_f64().unwrap_or(f64::NAN)');
        expect(output).not.toContain('Value::Bool(a.as_f64()');
    });

    test('string comparison replicates the helper natively', () => {
        const ts =
        "let a = 'x';\n" +
        "let b = 'y';\n" +
        "if (a < b) {\n" +
        "    const x = 1;\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(match (a.as_str(), b.as_str()) { (Some(__x), Some(__y)) => (match (__x.parse::<f64>(), __y.parse::<f64>()) { (Ok(__p), Ok(__q)) => __p < __q, _ => __x < __y }), _ => false })');
    });

    test('any-typed comparison keeps the helper', () => {
        const ts =
        "let a: any = 1;\n" +
        "let b: any = 2;\n" +
        "if (a < b) {\n" +
        "    const x = 1;\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(match (&(a), &(b)) { (__a, __b) =>'); // inline helper dispatch
    });

    // One number at runtime already pins `<`/`>` to the helper's f64 compare
    // (its lexical branch needs two strings), so an `any` other side folds too.
    test('less than with a single typed number operand is native', () => {
        const ts =
        "function f(x: any, y: number) {\n" +
        "    if (x < y) {\n" +
        "        const z = 1;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if x.as_f64().unwrap_or(f64::NAN) < y.as_f64().unwrap_or(f64::NAN) {');
        expect(output).not.toContain('is_less_than(');
    });

    test('greater than with a single typed number operand is native', () => {
        const ts =
        "function f(x: any, y: number) {\n" +
        "    if (x > y) {\n" +
        "        const z = 1;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if x.as_f64().unwrap_or(f64::NAN) > y.as_f64().unwrap_or(f64::NAN) {');
        expect(output).not.toContain('is_greater_than(');
    });

    // `>=`/`<=` also OR `is_equal` in, which is TRUE for two Nulls — an `any`
    // operand can be Null, so a nullable number is not enough for them.
    test('greater or equal with a single typed number operand keeps the helper', () => {
        const ts =
        "function f(x: any, y: number) {\n" +
        "    if (x >= y) {\n" +
        "        const z = 1;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(match (&(x), &(y)) { (__a, __b) =>'); // inline math/comparison dispatch
    });

    test('less or equal with a single typed number operand keeps the helper', () => {
        const ts =
        "function f(x: any, y: number) {\n" +
        "    if (x <= y) {\n" +
        "        const z = 1;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(match (&(x), &(y)) { (__a, __b) =>'); // inline math/comparison dispatch
    });

    // A numeric literal / `.length` / `indexOf` is Int or Float at runtime,
    // never Null, so it satisfies even the is_equal-folding operators.
    test('greater or equal against a numeric literal is native', () => {
        const ts =
        "function f(x: any) {\n" +
        "    if (x >= 0) {\n" +
        "        const z = 1;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if x.as_f64().unwrap_or(f64::NAN) >= Value::Int(0).as_f64().unwrap_or(f64::NAN) {');
        expect(output).not.toContain('is_greater_than_or_equal(');
    });

    test('less or equal with the literal on the left is native', () => {
        const ts =
        "function f(x: any) {\n" +
        "    if (0 <= x) {\n" +
        "        const z = 1;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if Value::Int(0).as_f64().unwrap_or(f64::NAN) <= x.as_f64().unwrap_or(f64::NAN) {');
        expect(output).not.toContain('is_less_than_or_equal(');
    });

    test('less or equal on two lengths is native', () => {
        const ts =
        "function f(xs: any, ys: any) {\n" +
        "    if (xs.length <= ys.length) {\n" +
        "        const z = 1;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_array_length(&xs).as_f64().unwrap_or(f64::NAN) <= get_array_length(&ys).as_f64().unwrap_or(f64::NAN)');
        expect(output).not.toContain('is_less_than_or_equal(');
    });

    test('greater or equal on an indexOf result is native', () => {
        const ts =
        "function f(s: any, n: any) {\n" +
        "    if (s.indexOf('a') >= n) {\n" +
        "        const z = 1;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('_ => Value::Int(-1) }).as_f64().unwrap_or(f64::NAN) >= n.as_f64().unwrap_or(f64::NAN)');
        expect(output).not.toContain('is_greater_than_or_equal(');
    });

    // `x as T` prints as `x`, so the assertion must not hide the operand's shape.
    test('as-asserted number operand compares natively', () => {
        const ts =
        "function f(x: any, y: number) {\n" +
        "    if ((x as number) > y) {\n" +
        "        const z = 1;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if x.as_f64().unwrap_or(f64::NAN) > y.as_f64().unwrap_or(f64::NAN) {');
        expect(output).not.toContain('is_greater_than(');
    });

    // Two strings are the helper's lexical branch — a numeric-string literal
    // goes through the same path, so it must keep the helper.
    test('string against a numeric-string literal keeps the f64 parse', () => {
        const ts =
        "function f(hex: string) {\n" +
        "    if (hex >= '80') {\n" +
        "        const z = 1;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(match (hex.as_str(), Some("80")) { (Some(__x), Some(__y)) => (match (__x.parse::<f64>(), __y.parse::<f64>()) { (Ok(__p), Ok(__q)) => __p > __q, _ => __x > __y }) || __x == __y, (None, None) => true, _ => false })');
    });

    test('object keys', () => {
        const ts = "const k = Object.keys(d);"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('object_keys(&d)');
    });

    test('reverse call reassigns', () => {
        const ts = "arr.reverse();"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('arr = reverse(arr.clone())');
    });

    test('replace all', () => {
        const ts = 'const s = base.replaceAll("a", "");'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('replace_all_str(&base,');
    });

    test('delete expression', () => {
        const ts = 'delete dict["key"];'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('remove(&mut dict,');
    });

    // Numeric literals
    test('float numeric literal', () => {
        const ts = 'const x = 3.14;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::Float(3.14)');
    });

    test('true boolean literal', () => {
        const ts = 'const x = true;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut x: bool = true;');
    });

    // String escape sequences
    test('string with double quote escape', () => {
        const ts = 'const s = "say \\"hi\\"";'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('\\"hi\\"');
    });

    test('string with backslash escape', () => {
        const ts = 'const s = "a\\\\b";'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('\\\\');
    });

    // Arithmetic binary ops
    test('subtraction wrapping', () => {
        const ts = 'const c = a - b;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(match (&(a), &(b)) { (Value::Int(__x), Value::Int(__y)) => Value::Int(__x - __y),'); // inline math/comparison dispatch
    });

    test('multiplication wrapping', () => {
        const ts = 'const c = a * b;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(match (&(a), &(b)) { (Value::Int(__x), Value::Int(__y)) => Value::Int(__x * __y),'); // inline math/comparison dispatch
    });

    test('division wrapping', () => {
        const ts = 'const c = a / b;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(Some(__x), Some(__y)) if __y != 0.0 => Value::Float(__x / __y)'); // inline math/comparison dispatch
    });

    test('modulo wrapping', () => {
        const ts = 'const c = a % b;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('mod_val(&a, &b)');
    });

    // Comparison operators
    test('less than wrapping', () => {
        const ts = 'const r = a < b;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(match (&(a), &(b)) { (__a, __b) =>'); // inline helper dispatch
    });

    test('less than or equal wrapping', () => {
        const ts = 'const r = a <= b;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('__x < __y'); // inline math/comparison dispatch
        expect(output).toContain('(Value::Null, Value::Null) => true');
    });

    test('greater than wrapping', () => {
        const ts = 'const r = a > b;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('__x > __y'); // inline math/comparison dispatch
    });

    test('greater than or equal wrapping', () => {
        const ts = 'const r = a >= b;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('__x > __y'); // inline math/comparison dispatch
    });

    // Compound assignment
    test('+= assignment', () => {
        const ts = 'x += 1;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('x = add(&x, &Value::Int(1))');
    });

    test('-= assignment', () => {
        const ts = 'x -= 1;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('x = (match (&(x), &(Value::Int(1))) { (Value::Int(__x), Value::Int(__y)) => Value::Int(__x - __y),'); // inline math/comparison dispatch
    });

    // Postfix unary
    test('i++ converts to add', () => {
        const ts = 'i++;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('i = add(&i, &Value::Int(1))');
    });

    test('i-- converts to subtract', () => {
        const ts = 'i--;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('i = subtract(&i, &Value::Int(1))');
    });

    // Prefix unary
    test('negation prefix', () => {
        const ts = 'const x = -n;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('negate(&n)');
    });

    test('logical not prefix', () => {
        const ts = 'if (!x) { const y = 1; }'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('!is_true(&x)');
    });

    // typeof comparisons
    test('typeof string check', () => {
        const ts = 'const r = typeof x === "string";'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_string(&x)');
    });

    test('typeof number check', () => {
        const ts = 'const r = typeof x === "number";'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_number(&x)');
    });

    test('typeof boolean check', () => {
        const ts = 'const r = typeof x === "boolean";'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_bool(&x)');
    });

    test('typeof negated check', () => {
        const ts = 'const r = typeof x !== "string";'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('!is_string(&x)');
    });

    // in operator
    test('in operator', () => {
        const ts = 'const r = "key" in obj;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('in_op(&obj,');
    });

    // Element access assignment
    test('element access assignment', () => {
        const ts = 'arr[0] = 5;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut arr, &Value::Int(0), Value::Int(5))');
    });

    test('nested element access', () => {
        const ts = 'const x = a[b][c];'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value(&get_value(&a, &b), &c)');
    });

    // Variable declaration edge cases
    test('variable without initializer', () => {
        const ts = 'let x: number;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut x: Value = Value::Null');
    });

    test('array destructuring', () => {
        const ts = 'const [a, b] = arr;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut abVariable');
        expect(output).toContain('let mut a: Value = get_value(&abVariable, &Value::Int(0))');
        expect(output).toContain('let mut b: Value = get_value(&abVariable, &Value::Int(1))');
    });

    // If / else if / else
    test('if/else statement', () => {
        const ts =
        "if (x) {\n" +
        "    const a = 1;\n" +
        "} else {\n" +
        "    const b = 2;\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if is_true(&x)');
        expect(output).toContain('else {');
    });

    test('else if chain', () => {
        const ts =
        "if (a) {\n" +
        "    const x = 1;\n" +
        "} else if (b) {\n" +
        "    const y = 2;\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if is_true(&a)');
        expect(output).toContain('else if is_true(&b)');
    });

    test('comparison in if does not double-wrap', () => {
        const ts = "if (a === b) { const x = 1; }";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if is_equal(&a, &b)');
        expect(output).not.toContain('is_true(&is_equal');
    });

    // Ternary
    test('ternary expression', () => {
        const ts = 'const x = a ? b : c;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(if is_true(&a) { b.clone() } else { c.clone() })');
        expect(output).not.toContain('ternary(');
    });

    test('ternary bool arm is boxed as Value', () => {
        const ts = 'const x = c ? (a || b) : false;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(if is_true(&c) { Value::Bool((is_true(&a) || is_true(&b))) } else { Value::Bool(false) })');
    });

    test('ternary with value arms', () => {
        const ts = "const x = flag ? 'a' : 'b';"
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(if is_true(&flag) { Value::Str("a".into()) } else { Value::Str("b".into()) })');
    });

    // Checker-proven helper removal: array/string .length → native Value::len()
    test('array length native for typed array', () => {
        const ts = 'const arr = [1, 2, 3];\nconst n = arr.length;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::Int(arr.len() as i64)');
        expect(output).not.toContain('get_array_length(&arr)');
    });

    test('string length native for typed string', () => {
        const ts = 'const s = "test";\nconst n = s.length;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::Int(s.len() as i64)');
        expect(output).not.toContain('get_array_length(&s)');
    });

    test('object length keeps the helper', () => {
        const ts = 'const o: { [key: string]: any } = {};\nconst n = o.length;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_array_length(&o)');
    });

    // Checker-proven helper removal: key in dict → native contains_key
    test('in operator native for typed object', () => {
        const ts = 'const o: { [key: string]: any } = {};\nconst r = "key" in o;'
        const output = transpiler.transpileRust(ts).content;
        // d8 declares the proven-bool local natively, so the `matches!` result
        // is not wrapped in `Value::Bool(...)`.
        expect(output).toContain('let mut r: bool = matches!(&o, Value::Dict(__d) if __d.contains_key("key"));');
        expect(output).not.toContain('in_op(');
    });

    test('in operator keeps the helper for typed array', () => {
        const ts = 'const a: any[] = [];\nconst r = "key" in a;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('in_op(&a,');
    });

    // A `Dict` alias / generic dictionary is a Reference to its index-signature
    // interface — still a plain Value::Dict at runtime, so the key test is native.
    test('in operator native for a dictionary alias receiver', () => {
        const ts = 'interface Dictionary<T> { [key: string]: T }\ntype Dict = Dictionary<any>;\nconst o: Dict = {};\nconst r = "key" in o;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('matches!(&o, Value::Dict(__d) if __d.contains_key("key"))');
        expect(output).not.toContain('in_op(');
    });

    test('in operator native for a generic dictionary receiver', () => {
        const ts = 'interface Dictionary<T> { [key: string]: T }\nconst o: Dictionary<any> = {};\nconst r = "key" in o;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('matches!(&o, Value::Dict(__d) if __d.contains_key("key"))');
        expect(output).not.toContain('in_op(');
    });

    test('in operator native for a dictionary parameter', () => {
        const ts = 'interface Dictionary<T> { [key: string]: T }\nfunction f (params: Dictionary<any>) {\n    return "key" in params;\n}'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('matches!(&params, Value::Dict(__d) if __d.contains_key("key"))');
        expect(output).not.toContain('in_op(');
    });

    // A class instance is not a Dict at runtime: the helper stays.
    test('in operator keeps the helper for a class instance receiver', () => {
        const ts = 'class OrderBook { bids = 1; }\nconst b = new OrderBook();\nconst r = "key" in b;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('in_op(&b,');
    });

    // Lib-declared types (Map, …) are not backed by a plain Value map.
    test('in operator keeps the helper for a lib-declared receiver', () => {
        const ts = 'const m = new Map<string, any>();\nconst r = "key" in m;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('in_op(&m,');
    });

    // `any` proves nothing: an array element search stays the helper's job.
    test('in operator keeps the helper for an any-typed receiver', () => {
        const ts = 'function f (params: any) {\n    return "key" in params;\n}'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('in_op(&params,');
    });

    // Checker-proven helper removal: negate of a numeric literal folds
    test('negate literal folds to a literal', () => {
        const intOutput = transpiler.transpileRust('const x = -1;').content;
        expect(intOutput).toContain('Value::Int(-1)');
        expect(intOutput).not.toContain('negate(');
        const floatOutput = transpiler.transpileRust('const x = -0.5;').content;
        expect(floatOutput).toContain('Value::Float(-0.5)');
        expect(floatOutput).not.toContain('negate(');
    });

    // instanceof
    test('instanceof expression', () => {
        const ts = 'const r = x instanceof MyClass;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_instance(&x, &MyClass)');
    });

    // Throw statement
    test('throw statement', () => {
        const ts = 'throw new Error("oops");'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('panic!(');
    });

    // Return / break / continue
    test('return statement with value', () => {
        const ts = "function f() { return 42; }";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('return Value::Int(42);');
    });

    test('break statement', () => {
        const ts = "while (true) { break; }";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('break;');
    });

    test('continue statement', () => {
        const ts = "while (true) { continue; }";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('continue;');
    });

    // Empty object literal
    test('empty object literal', () => {
        const ts = 'const d = {};'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::Map(');
        expect(output).toContain('HashMap::new()');
    });

    // console.log with multiple args
    test('console.log with multiple args', () => {
        const ts = 'console.log(a, b);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('println_val(&a, &b)');
    });

    // Built-in method calls
    test('Array.isArray call', () => {
        const ts = 'const r = Array.isArray(x);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_array(&x)'); // an undeclared x keeps the helper
    });

    test('Object.values call', () => {
        const ts = 'const v = Object.values(d);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('object_values(&d)');
    });

    test('JSON.parse call', () => {
        const ts = 'const x = JSON.parse(s);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('json_parse(&s)');
    });

    test('JSON.stringify call', () => {
        const ts = 'const x = JSON.stringify(s);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('json_stringify(&s)');
    });

    test('Math.floor call', () => {
        const ts = 'const x = Math.floor(n);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('math_floor(&n)');
    });

    test('Math.ceil call', () => {
        const ts = 'const x = Math.ceil(n);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('math_ceil(&n)');
    });

    test('Math.round call', () => {
        const ts = 'const x = Math.round(n);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('math_round(&n)');
    });

    test('Number.isInteger call', () => {
        const ts = 'const r = Number.isInteger(n);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_integer(&n)');
    });

    test('array push call', () => {
        const ts = 'arr.push(x);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('append_to_array(&mut arr, x)');
    });

    test('array includes call', () => {
        const ts = 'const r = arr.includes(x);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('contains(&arr, &x)');
    });

    test('indexOf call', () => {
        const ts = 'const i = arr.indexOf(x);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(match (&(arr), &(x))');
    });

    test('startsWith call', () => {
        const ts = 'const r = s.startsWith("a");'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('starts_with(&s,');
    });

    test('endsWith call', () => {
        const ts = 'const r = s.endsWith("a");'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('ends_with(&s,');
    });

    test('trim call', () => {
        const ts = 'const r = s.trim();'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('trim(&s)');
    });

    test('join call', () => {
        const ts = 'const r = arr.join(",");'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('join(&arr,');
    });

    test('split call', () => {
        const ts = 'const r = s.split(",");'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('split(&s,');
    });

    test('toFixed call', () => {
        const ts = 'const r = n.toFixed(2);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('to_fixed(&n,');
    });

    test('toString call', () => {
        const ts = 'const r = n.toString();'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('to_string_val(&n)');
    });

    test('toUpperCase call', () => {
        const ts = 'const r = s.toUpperCase();'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(if let Some(__s) = (s).as_str() { Value::Str(__s.to_uppercase().into()) } else { Value::Null })');
    });

    test('toLowerCase call', () => {
        const ts = 'const r = s.toLowerCase();'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(if let Some(__s) = (s).as_str() { Value::Str(__s.to_lowercase().into()) } else { Value::Null })');
    });

    test('shift call', () => {
        const ts = 'const x = arr.shift();'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('shift(arr.clone())');
    });

    test('pop call', () => {
        const ts = 'const x = arr.pop();'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('pop(arr.clone())');
    });

    test('slice call', () => {
        const ts = 'const r = arr.slice(1, 3);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(match (&(arr), ');
    });

    test('replace call', () => {
        const ts = 'const r = s.replace("a", "b");'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('replace_str(&s,');
    });

    // Class with property initializers
    test('class with property initializers generates struct fields', () => {
        const ts =
        "class Foo {\n" +
        "    count = 0;\n" +
        "    name = \"bar\";\n" +
        "    run() { return this.count; }\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('pub count: Value,');
        expect(output).toContain('pub name: Value,');
        expect(output).toContain('count: Value::Int(0),');
        expect(output).toContain('name: Value::Str("bar".into()),');
    });

    // Class with optional method parameters
    test('class method with optional parameters uses optional_args slice', () => {
        const ts =
        "class MyClass {\n" +
        "    greet(name, greeting = \"hello\") {\n" +
        "        return greeting;\n" +
        "    }\n" +
        "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('optional_args: &[Value]');
        expect(output).toContain('get_arg(optional_args, 0,');
    });

    // this keyword
    test('this keyword becomes self', () => {
        const ts = "class A { x: any; run() { return this.x; } }";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('self.x');
    });

    test('a chained return this returns Value::Null', () => {
        const output = transpiler.transpileRust("class A { run() { return this; } }").content;
        expect(output).toContain('return Value::Null;');
        expect(output).not.toContain('return self;');
    });

    test('proxy-callback calls, setProperty (this, ..) and binaryConcat () print their runtime shapes', () => {
        const ts = "class A { proxyUrlCallback: any; run (url) { this.setProperty (this, 'rateLimit', 10); const b = this.binaryConcat (); return this.proxyUrlCallback (url); } setProperty (o, k, v = undefined) {} binaryConcat (...a) { return a; } }";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('self.proxy_url_callback_fn(');
        expect(output).toContain('self.setProperty(Value::Str("rateLimit".into()), &[Value::Int(10)])');
        expect(output).toContain('self.binary_concat(Value::Null, &[])');
    });

    // Reserved keyword renaming
    test('reserved keyword type is renamed', () => {
        const ts = 'const type = 1;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('type_var');
    });


    // ── native-typed locals ──────────────────────────────────────────────────
    // A local whose initializer is already a bool in Rust is declared `bool`
    // when every use is a condition sink (`is_true` is generic over IsTruthy).

    test('bool local: comparison initializer', () => {
        const ts = 'const ok = a === 1; if (ok) { x(); }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut ok: bool = is_equal(&a, &Value::Int(1));');
    });

    test('bool local: redundant source parens are dropped', () => {
        const ts = 'const ok = (a === 1); if (ok) { x(); }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut ok: bool = is_equal(&a, &Value::Int(1));');
    });

    test('bool local: Value::Bool box is peeled at the init site', () => {
        const ts = 'const ok = Array.isArray(v); if (ok) { x(); }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut ok: bool = is_array(&v);');
    });

    test('bool local: in operator initializer', () => {
        const ts = 'const ok = k in obj; if (ok) { x(); }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut ok: bool = in_op(&obj, &k);');
    });

    test('bool local: boolean literal initializer', () => {
        const ts = 'const ok = true; if (ok) { x(); }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut ok: bool = true;');
    });

    test('bool local: parenthesized condition operand still allows bool', () => {
        const ts = 'const ok = a === 1; if ((ok)) { x(); }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut ok: bool = is_equal(&a, &Value::Int(1));');
        expect(output).toContain('is_true(&(ok))');
    });

    test('bool local: && operands of a typed condition', () => {
        const ts =
            'class T {\n' +
            '    m(a: boolean, b: boolean) {\n' +
            '        const ok = a && b;\n' +
            '        if (ok) { return 1; }\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut ok: bool = is_true(&a) && is_true(&b);');
    });

    test('bool local: string helper results stay bool', () => {
        const ts =
            'class T {\n' +
            '    m(s: string) {\n' +
            '        const ok = s.startsWith("x");\n' +
            '        if (ok) { return 1; }\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut ok: bool = s.as_str().unwrap_or("").starts_with("x");');
    });

    // Rejected shapes: any sink that takes `&Value` keeps the local boxed.

    test('bool local: value sink keeps Value', () => {
        const ts = 'const ok = a === 1; m.insert("k", ok);';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut ok: Value = is_equal(&a, &Value::Int(1));');
    });

    test('bool local: comparison sink keeps Value', () => {
        const ts = 'const ok = a === 1; if (ok === true) { x(); }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut ok: Value = is_equal(&a, &Value::Int(1));');
    });

    test('bool local: return sink keeps Value', () => {
        const ts = 'const ok = a === 1; return ok;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut ok: Value = is_equal(&a, &Value::Int(1));');
    });

    test('bool local: reassignment keeps Value', () => {
        const ts = 'let ok = a === 1; ok = b === 2; if (ok) { x(); }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut ok: Value = is_equal(&a, &Value::Int(1));');
    });

    test('bool local: a second binding of the name keeps Value', () => {
        const ts = 'const ok = a === 1; items.filter((ok) => x(ok));';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut ok: Value = is_equal(&a, &Value::Int(1));');
    });

    test('bool local: non-bool initializer keeps Value', () => {
        const ts = 'const ok = v; if (ok) { x(); }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut ok: Value = v;');
    });

    test('reserved keyword match is renamed', () => {
        const ts = 'const match = 1;'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('match_val');
    });

    // ── typed string locals ──────────────────────────────────────────────────
    // A local holding a `safeString*` result is declared `Option<String>` when
    // the checker proves the string and every use is a native sink (null test,
    // string-literal compare); the helper call stays as its producer.

    describe('nil-declared locals', () => {
        const cls = (body: string) => `class Precise { static stringAdd(a: string, b: string): string { return a; } }
class A {
    safeString(o: any, k: any, d: string = undefined): string { return undefined as any; }
    safeInteger(o: any, k: any, d: number = undefined): number { return undefined as any; }
    hold(x: any): any { return x; }
    run(o: any, kind: string) {
${body}
    }
}`;

        test('string writes join to Option<String> with exact unwraps', () => {
            const out = transpiler.transpileRust(cls(`        let side: string = undefined;
        if (kind === 'a') { side = 'buy'; } else if (kind === 'b') { side = this.safeString(o, 'side'); } else { side = Precise.stringAdd('1', '2'); }
        if (side === 'buy') { return 1; }
        return this.hold(side);`)).content;
            expect(out).toContain('let mut side: Option<String> = None;');
            expect(out).toContain('side = Some("buy".to_string());');
            expect(out).toContain('side = self.safeString(o, Value::Str("side".into()), &[]).as_str().map(str::to_owned);');
            expect(out).toContain('side.as_deref() == Some("buy")');
            expect(out).toContain('self.hold(side.clone().map(Value::from).unwrap_or(Value::Null))');
            expect(out).not.toContain('side: Value');
        });

        test('bool and int writes join to Option<bool> / Option<i64>', () => {
            const out = transpiler.transpileRust(cls(`        let flag: boolean = undefined;
        if (kind === 'x') { flag = true; } else { flag = (kind === 'y'); }
        let n = undefined;
        if (flag) { n = this.safeInteger(o, 'n'); }
        if (n === undefined) { return 0; }
        return { 'n': n, 'flag': flag };`)).content;
            expect(out).toContain('let mut flag: Option<bool> = None;');
            expect(out).toContain('flag = Some(true);');
            expect(out).toContain('if (flag == Some(true)) {');
            expect(out).toContain('let mut n: Option<i64> = None;');
            expect(out).toContain('n = self.safeInteger(o, Value::Str("n".into()), &[]).as_i64();');
            expect(out).toContain('if (n.is_none()) {');
            expect(out).toContain('m.insert("n".to_string(), Value::from(n));');
            expect(out).toContain('m.insert("flag".to_string(), flag.map(Value::from).unwrap_or(Value::Null));');
        });

        test('mixed or unproven writes keep the Value box', () => {
            const out = transpiler.transpileRust(cls(`        let a = undefined;
        if (kind === 'x') { a = 'str'; } else { a = 1; }
        let b = undefined;
        b = this.hold(o);
        let c = undefined;
        c = this.safeInteger(o, 'c', 1.5);
        return [ a, b, c ];`)).content;
            expect(out).toContain('let mut a: Value = Value::Null;');
            expect(out).toContain('let mut b: Value = Value::Null;');
            expect(out).toContain('let mut c: Value = Value::Null;');
        });

        test('ternary and typed-local writes join the optional scalar kinds', () => {
            const out = transpiler.transpileRust(cls(`        let side = undefined;
        if (kind === 'a') { side = 'buy'; } else { side = (kind === 'b') ? 'sell' : 'buy'; }
        if (side === 'buy') { return 1; }
        let n = undefined;
        if (kind === 'c') { n = (kind === 'd') ? 1 : 2; }
        if (n === undefined) { return 0; }
        return this.hold(side);`)).content;
            expect(out).toContain('let mut side: Option<String> = None;');
            expect(out).toContain('side = (if (kind.as_str() == Some("b")) { Some("sell".to_string()) } else { Some("buy".to_string()) });');
            expect(out).toContain('side.as_deref() == Some("buy")');
            expect(out).toContain('let mut n: Option<i64> = None;');
            expect(out).toContain('n = (if (kind.as_str() == Some(\"d\")) { Some(1) } else { Some(2) });');
            expect(out).toContain('if (n.is_none()) {');
        });

        test('a nil-declared string used as a concat operand stays Value', () => {
            const out = transpiler.transpileRust(cls(`        let body = undefined;
        if (kind === 'a') { body = 'x'; } else { body = 'y'; }
        let auth = 'k' + kind;
        if (body !== undefined) { auth = auth + body; }
        return auth;`)).content;
            expect(out).toContain('let mut body: Value = Value::Null;');
            expect(out).not.toContain('add(&auth');
        });

        test('a tuple-slot write of a string joins Option<String>', () => {
            const out = transpiler.transpileRust(`class A {
    handleMarketTypeAndParams(m: string, x: any, p: any): [ string, any ] { return [ m, p ]; }
    run(params: any) {
        let marketType: string = undefined;
        let rest = undefined;
        [ marketType, rest ] = this.handleMarketTypeAndParams('f', undefined, params);
        if (marketType === 'spot') { return 1; }
        return rest;
    }
}`).content;
            expect(out).toContain('let mut marketType: Option<String> = None;');
            expect(out).toContain('marketType = __destr_tmp.get(0).cloned().unwrap_or(Value::Null).as_str().map(str::to_owned);');
            expect(out).toContain('marketType.as_deref() == Some("spot")');
        });

        test('a single write boxed straight back keeps the Value box', () => {
            const out = transpiler.transpileRust(cls(`        let p = undefined;
        p = (kind === 'a') ? 'x' : 'y';
        return this.hold(p);`)).content;
            expect(out).toContain('let mut p: Value = Value::Null;');
            const decoded = transpiler.transpileRust(cls(`        let q = undefined;
        if (kind === 'a') { q = this.safeString(o, 'a'); } else { q = this.safeString(o, 'b'); }
        let r = undefined;
        r = q;
        return this.hold(r);`)).content;
            expect(decoded).toContain('let mut q: Value = Value::Null;');
        });

        test('a read outside the proven sinks keeps the Value box', () => {
            const out = transpiler.transpileRust(cls(`        let s = undefined;
        s = 'x';
        const t = s + 'y';
        return t;`)).content;
            expect(out).toContain('let mut s: Value = Value::Null;');
        });
    });

    describe('typed string locals', () => {
        const withHelper = (helper: string, body: string) =>
            `class A {\n    ${helper}(o: any, k: any): string { return undefined as any; }\n    run(o: any) {\n${body}\n    }\n}`;

        test('string-literal compare retypes the local and compares as_deref', () => {
            const ts = withHelper('safeString',
                "        const side = this.safeString(o, 'side');\n        if (side === 'buy') { return 1; }\n        return 2;");
            const output = transpiler.transpileRust(ts).content;
            expect(output).toContain('let mut side: Option<String> = self.safeString(o, Value::Str("side".into())).as_str().map(str::to_owned);');
            expect(output).toContain('if (side.as_deref() == Some("buy")) {');
            expect(output).not.toContain('side: Value');
        });

        test('null test retypes the local and prints is_none', () => {
            const ts = withHelper('safeString',
                "        const s = this.safeString(o, 's');\n        if (s === null) { return 1; }\n        return 2;");
            const output = transpiler.transpileRust(ts).content;
            expect(output).toContain('let mut s: Option<String> = self.safeString(o, Value::Str("s".into())).as_str().map(str::to_owned);');
            expect(output).toContain('if (s.is_none()) {');
            expect(output).not.toContain('s == Value::Null');
        });

        test('undefined test retypes the local and prints is_some', () => {
            const ts = withHelper('safeString',
                "        const s = this.safeString(o, 's');\n        if (s !== undefined) { return 1; }\n        return 2;");
            const output = transpiler.transpileRust(ts).content;
            expect(output).toContain('let mut s: Option<String> = self.safeString(o, Value::Str("s".into())).as_str().map(str::to_owned);');
            expect(output).toContain('if (s.is_some()) {');
            expect(output).not.toContain('s != Value::Null');
        });

        test('mixed native sinks stay typed together', () => {
            const ts = withHelper('safeString',
                "        const s = this.safeString(o, 's');\n        if (s === undefined) { return 0; }\n        return s === 'x';");
            const output = transpiler.transpileRust(ts).content;
            expect(output).toContain('let mut s: Option<String> = self.safeString(o, Value::Str("s".into())).as_str().map(str::to_owned);');
            expect(output).toContain('if (s.is_none()) {');
            expect(output).toContain('s.as_deref() == Some("x")');
        });

        test('safeStringLower / safeString2 results are typed too', () => {
            const lower = transpiler.transpileRust(withHelper('safeStringLower',
                "        const side = this.safeStringLower(o, 'side');\n        return side === 'buy';")).content;
            expect(lower).toContain('let mut side: Option<String> = self.safeStringLower(o, Value::Str("side".into())).as_str().map(str::to_owned);');
            expect(lower).toContain('side.as_deref() == Some("buy")');
            const two = transpiler.transpileRust(withHelper('safeString2',
                "        const id = this.safeString2(o, 'a', 'b');\n        return id !== undefined;")).content;
            expect(two).toContain('let mut id: Option<String> = self.safeString2(o, Value::Str("a".into()), Value::Str("b".into())).as_str().map(str::to_owned);');
            expect(two).toContain('id.is_some()');
        });

        test('a property name equal to the local does not block the retype', () => {
            const ts = withHelper('safeString',
                "        const status = this.safeString(o, 'status');\n        return status === 'ok' && o.status === 1;");
            const output = transpiler.transpileRust(ts).content;
            expect(output).toContain('let mut status: Option<String> = self.safeString(o, Value::Str("status".into())).as_str().map(str::to_owned);');
            expect(output).toContain('status.as_deref() == Some("ok")');
        });

        // Rejected shapes: any `&Value` sink keeps the local boxed.

        test('a Value sink keeps Value', () => {
            const ts = withHelper('safeString',
                "        const s = this.safeString(o, 's');\n        m.insert('k', s);");
            const output = transpiler.transpileRust(ts).content;
            expect(output).toContain('let mut s: Value = self.safeString(o, Value::Str("s".into()));');
            expect(output).not.toContain('Option<String>');
        });

        test('truthiness keeps Value (is_true has no Option impl)', () => {
            const ts = withHelper('safeString',
                "        const s = this.safeString(o, 's');\n        if (s) { return 1; }\n        return 2;");
            const output = transpiler.transpileRust(ts).content;
            expect(output).toContain('let mut s: Value = self.safeString(o, Value::Str("s".into()));');
            expect(output).toContain('if is_true(&s) {');
        });

        test('reassignment keeps Value', () => {
            const ts = withHelper('safeString',
                "        let s = this.safeString(o, 's');\n        s = this.safeString(o, 't');\n        return s === 'x';");
            const output = transpiler.transpileRust(ts).content;
            expect(output).toContain('let mut s: Value = self.safeString(o, Value::Str("s".into()));');
            expect(output).not.toContain('Option<String>');
        });

        test('a second binding of the name keeps Value', () => {
            const ts = withHelper('safeString',
                "        const s = this.safeString(o, 's');\n        const f = (s) => s === 'x';\n        return f(s);");
            const output = transpiler.transpileRust(ts).content;
            expect(output).toContain('let mut s: Value = self.safeString(o, Value::Str("s".into()));');
            expect(output).not.toContain('Option<String>');
        });

        test('no native use keeps Value', () => {
            const ts = withHelper('safeString',
                "        const s = this.safeString(o, 's');\n        return 1;");
            const output = transpiler.transpileRust(ts).content;
            expect(output).toContain('let mut s: Value = self.safeString(o, Value::Str("s".into()));');
        });

        test('string concat and other payload compares keep Value', () => {
            const concat = transpiler.transpileRust(withHelper('safeString',
                "        const s = this.safeString(o, 's');\n        return s + 'x';")).content;
            expect(concat).toContain('let mut s: Value = self.safeString(o, Value::Str("s".into()));');
            const againstLocal = transpiler.transpileRust(withHelper('safeString',
                "        const s = this.safeString(o, 's');\n        return s === o.other;")).content;
            expect(againstLocal).toContain('let mut s: Value = self.safeString(o, Value::Str("s".into()));');
        });

        test('a non-string helper result keeps Value', () => {
            const ts = withHelper('safeString',
                "        const s = this.safeString(o, 's');\n        return s === 'x';")
                .replace('safeString(o: any, k: any): string', 'safeString(o: any, k: any): any');
            const output = transpiler.transpileRust(ts).content;
            expect(output).toContain('let mut s: Value = self.safeString(o, Value::Str("s".into()));');
        });
    });

    // Native equality on unwrapped payloads (is_equal removal) — typed operands
    describe('native equality', () => {
        const typed = (body: string) => `class A {\n    run(a: string, b: string, n: number, m: number, flag: boolean, other: boolean, anything: any) {\n${body}\n    }\n}`;

        test('null literal compares natively for any operand type', () => {
            const output = transpiler.transpileRust(typed('        if (a === undefined) {\n            return b;\n        }\n        return a;')).content;
            expect(output).toContain('if (a == Value::Null) {');
            expect(output).not.toContain('is_equal(&a, &Value::Null)');
        });

        test('string literal compares the unwrapped &str', () => {
            const output = transpiler.transpileRust(typed("        return a === 'swap';")).content;
            expect(output).toContain('return Value::Bool(a.as_str() == Some("swap"));');
            expect(output).not.toContain('is_equal(');
        });

        test('number literal compares the unwrapped f64', () => {
            const output = transpiler.transpileRust(typed('        return n === 1;')).content;
            expect(output).toContain('return Value::Bool(n.as_f64() == Some(1.0));');
        });

        test('boolean literal compares the unwrapped bool', () => {
            const output = transpiler.transpileRust(typed('        return flag === true;')).content;
            expect(output).toContain('return Value::Bool(flag.as_bool() == Some(true));');
        });

        test('two string operands compare their payloads', () => {
            const output = transpiler.transpileRust(typed('        return a !== b;')).content;
            expect(output).toContain('return Value::Bool(a.as_str() != b.as_str());');
        });

        test('two number operands compare their payloads', () => {
            const output = transpiler.transpileRust(typed('        return n === m;')).content;
            expect(output).toContain('return Value::Bool(n.as_f64() == m.as_f64());');
        });

        test('two boolean operands compare their payloads', () => {
            const output = transpiler.transpileRust(typed('        return flag == other;')).content;
            expect(output).toContain('return Value::Bool(flag.as_bool() == other.as_bool());');
        });

        test('boolean string literal stays on the helper without a string proof', () => {
            const output = transpiler.transpileRust(typed("        return anything === '1';")).content;
            expect(output).toContain('is_equal(&anything, &Value::Str("1".into()))');
        });

        test('a bool-valued comparison operand stays on the helper', () => {
            const output = transpiler.transpileRust(typed("        return (a === b) === flag;")).content;
            expect(output).toContain('is_equal(&(Value::Bool(a.as_str() == b.as_str())), &flag)');
        });

        test('a class instance operand stays on the helper', () => {
            const ts =
                'class B {}\n' +
                'class A {\n' +
                '    run(u: any) {\n' +
                '        const created = new B();\n' +
                '        return created === undefined;\n' +
                '    }\n' +
                '}';
            const output = transpiler.transpileRust(ts).content;
            expect(output).toContain('is_equal(&created, &Value::Null)');
        });

        test('a logical expression with native compares is boxed for Value positions', () => {
            const output = transpiler.transpileRust(typed("        return a === 'x' || n === 1;")).content;
            expect(output).toContain('return Value::Bool((a.as_str() == Some("x")) || (n.as_f64() == Some(1.0)));');
        });

        test('a logical expression keeps bare compares in a condition', () => {
            const output = transpiler.transpileRust(typed("        if (a === 'x' || n === 1) {\n            return b;\n        }\n        return a;")).content;
            expect(output).toContain('if (a.as_str() == Some("x")) || (n.as_f64() == Some(1.0)) {');
            expect(output).not.toContain('Value::Bool((a.as_str()');
        });
    });
});

describe('rust checker-typed native container access', () => {
    const MAP_NATIVE = 'market.as_map().and_then(|__m| __m.get("id")).cloned().unwrap_or(Value::Null)';

    test('string-literal element access on a typed map emits a native read', () => {
        const ts =
            "interface Market { id: string; }\n" +
            "function f(market: Market) {\n" +
            "    return market['id'];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(MAP_NATIVE);
        expect(output).not.toContain('get_value(&market');
    });

    test('nested string-literal element accesses chain native reads', () => {
        const ts =
            "interface Info { symbol: string; }\n" +
            "interface Market { info: Info; }\n" +
            "function f(market: Market) {\n" +
            "    return market['info']['symbol'];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(
            'market.as_map().and_then(|__m| __m.get("info")).cloned().unwrap_or(Value::Null)' +
            '.as_map().and_then(|__m| __m.get("symbol")).cloned().unwrap_or(Value::Null)');
        expect(output).not.toContain('get_value(&market');
    });

    test('numeric-literal element access on a typed array emits a native read', () => {
        const ts =
            "function f(rows: number[][]) {\n" +
            "    return rows[0];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('rows.as_array().and_then(|__arr| __arr.get(0)).cloned().unwrap_or(Value::Null)');
        expect(output).not.toContain('get_value(&rows');
    });

    test('property access on a typed map local emits a native read', () => {
        const ts =
            "interface Cfg { defaultType: string; }\n" +
            "function f(cfg: Cfg) {\n" +
            "    return cfg.defaultType;\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('cfg.as_map().and_then(|__m| __m.get("defaultType")).cloned().unwrap_or(Value::Null)');
    });

    test('array binding pattern over a tuple return emits native reads', () => {
        const ts =
            "function g(): [string, number] { return ['a', 1]; }\n" +
            "function h() {\n" +
            "    const [p, q] = g();\n" +
            "    return p;\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let pqVariable: Vec<Value> = g().as_array().cloned().unwrap_or_default();');
        expect(output).toContain('let mut p: Value = pqVariable.get(0).cloned().unwrap_or(Value::Null)');
        expect(output).toContain('let mut q: Value = pqVariable.get(1).cloned().unwrap_or(Value::Null)');
        expect(output).not.toContain('Value::Int(0)');
    });

    test('array destructuring reassignment over a tuple emits native reads', () => {
        const ts =
            "function g(): [string, number] { return ['a', 1]; }\n" +
            "function h() {\n" +
            "    let p: any = undefined;\n" +
            "    let q: any = undefined;\n" +
            "    [p, q] = g();\n" +
            "    return p;\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('{ let __destr_tmp: Vec<Value> = g().as_array().cloned().unwrap_or_default(); p = __destr_tmp.get(0).cloned().unwrap_or(Value::Null)');
        expect(output).not.toContain('get_value(&__destr_tmp');
    });

    // keep the helper unless the checker proves a plain map/list receiver

    test('any-typed receiver keeps the get_value helper', () => {
        const ts =
            "function f(o: any) {\n" +
            "    return o['k'];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        // A literal key on an unproven receiver keeps the helper — d6's
        // `&str`-key form, which is the same lookup without the `Value::Str`.
        expect(output).toContain('crate::value::get_value_k(&o, "k")');
    });

    test('class-typed receiver keeps the get_value helper', () => {
        const ts =
            "class Book { url: string = 'x'; }\n" +
            "function f(book: Book) {\n" +
            "    return book['url'];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value(&book, &Value::Str("url".into()))');
    });

    test('lib-declared receiver keeps the get_value helper', () => {
        const ts =
            "function f(d: Date) {\n" +
            "    return d['x'];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('crate::value::get_value_k(&d, "x")');
    });

    test('string receiver keeps the get_value helper', () => {
        const ts =
            "function f(s: string) {\n" +
            "    return s[0];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value(&s, &Value::Int(0))');
    });

    test('non-literal key keeps the get_value helper', () => {
        const ts =
            "function f(rows: string[], i: number) {\n" +
            "    return rows[i];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value(&rows, &i)');
    });

    test('method call target of an element access keeps the helper', () => {
        const ts =
            "type Dict = { [key: string]: any };\n" +
            "function f(d: Dict, v: any) {\n" +
            "    d['a'].push(v);\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('append_to_array(&mut get_value(&d, &Value::Str("a".into())), v)');
    });

    test('same-place write then read keeps the helper', () => {
        const ts =
            "type Dict = { [key: string]: any };\n" +
            "function f(result: Dict, v: any) {\n" +
            "    result['k'] = result['k'] + v;\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        // The read keeps the `&str`-key helper form; the ccxt borrow-split pass
        // hoists it on `&result` (not on the helper text), so the E0502 shape
        // is fixed downstream either way.
        expect(output).toContain('add(&crate::value::get_value_k(&result, "k"), &v)');
    });

    test('read in a &mut self method argument keeps the helper', () => {
        const ts =
            "type Dict = { [key: string]: any };\n" +
            "class A {\n" +
            "    options: Dict = {};\n" +
            "    watch(a: any, b: any) { return b; }\n" +
            "    run() {\n" +
            "        return this.watch('x', this.options['id']);\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        // d6's ccxt companion hunk extends the `&mut self` argument hoist to the
        // `get_value_k` text, so the read inside the `&mut self` call is hoisted
        // exactly like the allocating form was.
        expect(output).toContain('crate::value::get_value_k(&self.options, "id")');
    });

    // native arithmetic: two checker-typed strings → format! concat
    test('string + string emits native concat', () => {
        const ts =
        'const a: string = "x";\n' +
        'const b: string = "y";\n' +
        'const c = a + b;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut c: Value = Value::Str(format!("{}{}", a, b).into());');
        expect(output).not.toContain('add(');
    });

    // native arithmetic: two checker-typed numbers → Int/Float match
    test('number + number emits native arithmetic', () => {
        const ts =
        'const a: number = 1;\n' +
        'const b: number = 2;\n' +
        'const c = a + b;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(match (&(a), &(b)) {');
        expect(output).toContain('(Value::Int(x), Value::Int(y)) => Value::Int(x + y)');
        expect(output).toContain('(Value::Float(x), Value::Float(y)) => Value::Float(x + y)');
        expect(output).not.toContain('add(');
    });

    test('number - number, number * number and number / number emit native arithmetic', () => {
        const ts =
        'const a: number = 1;\n' +
        'const b: number = 2;\n' +
        'const c = a - b;\n' +
        'const d = a * b;\n' +
        'const e = a / b;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::Int(x - y)');
        expect(output).toContain('Value::Int(x * y)');
        expect(output).toContain('(match ((a).as_f64(), (b).as_f64()) { (Some(x), Some(y)) if y != 0.0 => Value::Float(x / y), _ => Value::Null })');
        expect(output).not.toContain('subtract(');
        expect(output).not.toContain('multiply(');
        expect(output).not.toContain('divide(');
    });

    // unproven operands keep the runtime helper
    test('untyped operands keep the add helper', () => {
        const ts = "const a: any = 1;\nconst b: any = 2;\nconst c = a + b;";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add(&a, &b)');
    });

    // a non-null string side puts `add` on its string branch (stringify_simple == Display).
    test('number + string emits native concat', () => {
        const ts =
        'const a: number = 1;\n' +
        'const s: string = "q";\n' +
        'const c = a + s;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut c: Value = Value::Str(format!("{}{}", a, s).into());');
        expect(output).not.toContain('add(&a, &s)');
    });

    // A `Str` (`string | undefined`) operand holds only a
    // string or the `Value::Null` the helper stringifies as "null" — the same
    // text `Display` produces — so it concatenates natively against an operand
    // the checker proves is ALWAYS a string.
    test('string | undefined operand + proven string emits native concat', () => {
        const ts =
        'type Str = string | undefined;\n' +
        'function g(): Str { return "x"; }\n' +
        'const a = g();\n' +
        'const b: string = "y";\n' +
        'const c = a + b;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut c: Value = Value::Str(format!("{}{}", a, b).into());');
        expect(output).not.toContain('add(');
    });

    test('optional string parameter + proven string emits native concat', () => {
        const ts =
        'function f(x?: string) {\n' +
        '    const s: string = "y";\n' +
        '    return x + s;\n' +
        '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('return Value::Str(format!("{}{}", x, s).into());');
        expect(output).not.toContain('add(');
    });

    test('string | undefined operand + string literal emits native concat', () => {
        const ts =
        'type Str = string | undefined;\n' +
        'function g(): Str { return "x"; }\n' +
        'const a = g();\n' +
        'const c = a + "y";';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::Str(format!("{}{}", a, Value::Str("y".into())).into())');
        expect(output).not.toContain('add(');
    });

    test('string | undefined += string literal emits native concat', () => {
        const ts =
        'type Str = string | undefined;\n' +
        'function g(): Str { return "x"; }\n' +
        'let s = g();\n' +
        's += "b";';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('s = Value::Str(format!("{}{}", s, Value::Str("b".into())).into());');
        expect(output).not.toContain('add(');
    });

    test('string | undefined on both sides keeps the add helper', () => {
        // No side is always a string: the helper's Null+Null case returns
        // Value::Null, where format! would build "nullnull".
        const ts =
        'type Str = string | undefined;\n' +
        'function g(): Str { return "x"; }\n' +
        'const a = g();\n' +
        'const b = g();\n' +
        'const c = a + b;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add(&a, &b)');
    });

    test('string | undefined + number keeps the add helper', () => {
        // Null + number is Value::Null through the helper, "null5" through format!.
        const ts =
        'type Str = string | undefined;\n' +
        'function g(): Str { return "x"; }\n' +
        'function n(): number { return 5; }\n' +
        'const a = g();\n' +
        'const b = n();\n' +
        'const c = a + b;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add(&a, &b)');
    });

    test('always-Str local + any concatenates natively', () => {
        const ts =
        'function h(): any { return 2; }\n' +
        'const a: string = "x";\n' +
        'const b = h();\n' +
        'const c = a + b;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::Str(format!("{}{}", a, b).into())');
    });

    test('x++ / x-- on a number emit native increment', () => {
        const ts = 'let i: number = 0;\ni++;\ni--;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('i = (match (&(i), &(Value::Int(1))) {');
        expect(output).toContain('Value::Int(x + y)');
        expect(output).toContain('Value::Int(x - y)');
        expect(output).not.toContain('add(&i');
        expect(output).not.toContain('subtract(&i');
    });

    test('number += number and number -= number emit native arithmetic', () => {
        const ts = 'let j: number = 5;\nj += 2;\nlet k: number = 5;\nk -= 2;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('j = (match (&(j), &(Value::Int(2))) {');
        expect(output).toContain('k = (match (&(k), &(Value::Int(2))) {');
        expect(output).not.toContain('add(&j');
        expect(output).not.toContain('subtract(&k');
    });

    test('string += string emits native concat', () => {
        const ts = 'let s: string = "a";\ns += "b";';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('s = Value::Str(format!("{}{}", s, Value::Str("b".into())).into());');
        expect(output).not.toContain('add(');
    });

    test('string property + string literal emits native concat', () => {
        const ts =
        'class A {\n' +
        '    id: string = "a";\n' +
        '    run(): string { return this.id + "x"; }\n' +
        '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::Str(format!("{}{}", self.id, Value::Str("x".into())).into())');
    });

    // Dictionary reads with a string-literal key skip the `Value::Str`
    // allocation through `get_value_k`, the `&str` lookup in value.rs.
    test('literal element access key uses get_value_k', () => {
        const ts = "const id = market['id'];"
        const rust = 'let mut id: Value = crate::value::get_value_k(&market, "id");'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });

    test('computed element access key keeps get_value', () => {
        const ts = 'const id = market[key];'
        const rust = 'let mut id: Value = get_value(&market, &key);'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });

    test('live client keys keep get_value', () => {
        const ts = "const subs = client['subscriptions'];"
        const rust = 'let mut subs: Value = get_value(&client, &Value::Str("subscriptions".into()));'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });

    test('numeric-string keys keep get_value', () => {
        const ts = "const v = cache['0'];"
        const rust = 'let mut v: Value = get_value(&cache, &Value::Str("0".into()));'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });

    test('nested literal element access chains get_value_k', () => {
        const ts = "const a = obj['x']['y'];"
        const rust = 'let mut a: Value = crate::value::get_value_k(&crate::value::get_value_k(&obj, "x"), "y");'
        const output = transpiler.transpileRust(ts).content;
        expect(output).toBe(rust);
    });
});

describe('rust error constructor message arguments', () => {
    test('a literal message prints as a bare str', () => {
        const ts = "function f() {\n    throw new NotSupported('demo trading is not supported');\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('crate::exchange_errors::not_supported("demo trading is not supported")');
        expect(output).not.toContain('Value::Str("demo trading is not supported"');
    });

    test('escapes in a literal message are preserved', () => {
        const ts = "function f() {\n    throw new NotSupported('it\\'s \"quoted\"');\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('crate::exchange_errors::not_supported("it\'s \\"quoted\\"")');
    });

    test('a string concat message drops its Value::Str box', () => {
        const ts = "function f(id: string) {\n    throw new NotSupported(id + ' handleDelta not supported yet');\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('crate::exchange_errors::not_supported(format!("{}{}", id, Value::Str(" handleDelta not supported yet".into())))');
        expect(output).not.toContain('not_supported(Value::Str(');
    });

    test('a parenthesised concat message drops its Value::Str box', () => {
        const ts = "function f(id: string) {\n    throw new NotSupported((id + ' msg'));\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('crate::exchange_errors::not_supported(format!("{}{}", id, Value::Str(" msg".into())))');
    });

    test('every ccxt error class constructs through its runtime fn with an unboxed message', () => {
        const ts = "function f(id: string) {\n    throw new BadRequest (id + ' msg');\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('crate::exchange_errors::bad_request(format!("{}{}", id, Value::Str(" msg".into())))');
        expect(output).not.toContain('BadRequest::new(');
    });

    test('imported hash, error-class and precision names used as values print natively', () => {
        const ts = "import { sha256 } from './hashes.js';\nimport { BadRequest } from './errors.js';\nimport { TICK_SIZE } from './number.js';\n"
            + "function f(sign: any) {\n    const table = { '1': BadRequest };\n    const mode = TICK_SIZE;\n    return sign ('x', sha256);\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::Str("BadRequest".into())');
        expect(output).toContain('Value::Int(crate::runtime::TICK_SIZE)');
        expect(output).toContain('Value::Str("sha256".into())');
    });

    test('Math / Precise calls take their args by reference and Precise trims to its runtime arity', () => {
        const ts = "class Precise {\n    static stringDiv (a: any, b: any, p: any = 18): any { return a; }\n    static stringAdd (a: any, b: any): any { return a; }\n}\n"
            + "function f(a: any, b: any) {\n    const x = Precise.stringDiv (a, b, 8);\n    const y = Precise.stringDiv (a, b);\n    return Math.min (x, y);\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('crate::precise::Precise::stringDivPrec(&a, &b, &Value::Int(8))');
        expect(output).toContain('crate::precise::Precise::stringDiv(&a, &b)');
        expect(output).toContain('crate::runtime::Math::min(&x, &y)');
    });

    test('a class picked at runtime constructs by name through create_error', () => {
        const ts = "function f(table: any, k: any, msg: any) {\n    const e = new table[k] (msg);\n    throw new table[k] (msg);\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('panic!("{}", crate::exchange_errors::create_error(&crate::runtime::stringify_param(&(get_value(&table, &k))), &crate::runtime::stringify_param(&(msg))));');
        expect(output).toContain('Value::from(crate::exchange_errors::create_error(');
        expect(output).not.toContain('::new(');
    });

    test('jwt / rsa calls are printed at the runtime signers\' fixed arity', () => {
        const ts = "function jwt (r: any, s: any, h: any, isRsa = false, o: any = {}): any { return r; }\nfunction rsa (r: any, s: any, h: any, p = 'pkcs1'): any { return r; }\n"
            + "function f(a: any, b: any, h: any) {\n    const t = jwt (a, b, h);\n    return rsa (a, b, h, 'pss');\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('jwt(a, b, h, Value::Bool(false), Value::Null)');
        expect(output).toContain('rsa(a, b, h)');
    });

    test('an unproven message keeps its box', () => {
        const ts = "function f(msg: any) {\n    throw new NotSupported(msg);\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('crate::exchange_errors::not_supported(msg)');
    });

    test('a non-error class constructor is untouched', () => {
        const ts = "function f(id: string) {\n    const p = new Precise (id + ' msg');\n    return p;\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Precise::new(Value::Str(format!(');
    });
});

// The runtime `Value::Str` payload is a `Cow<'static, str>`: a string
// literal borrows its `&'static str` (`Value::Str("lit".into())`, zero
// allocation) instead of allocating a `String`, so `.clone()` on a literal
// box is a pointer copy.
describe('rust borrowed string literals (Cow payload)', () => {
    test('a literal in a Value position borrows instead of allocating', () => {
        const ts = "function f(): Value {\n    let s: Value = 'lit';\n    return s;\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::Str("lit".into())');
        expect(output).not.toContain('Value::Str("lit".to_string())');
    });

    test('a class string field borrows', () => {
        const ts = 'class A {\n    id: string = "a";\n}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('id: Value::Str("a".into()),');
    });

    test('a native string slice maps the borrowed payload', () => {
        const ts = "function f(s: string): string {\n    return s.slice(1, 3);\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('.map(Value::from).unwrap_or(Value::Null)');
        expect(output).not.toContain('.map(Value::Str)');
    });

    test('an error-ctor concat message drops the Cow conversion', () => {
        const ts = "function f(id: string) {\n    throw new NotSupported(id + ' msg');\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('not_supported(format!("{}{}", id, Value::Str(" msg".into())))');
        expect(output).not.toContain('Value::Str(" msg".into())).into())');
    });
});

describe('rust native dict inserts', () => {
    const dynamic = (receiver: string, key: string, value: string) =>
        `if let Value::Dict(__d) = &mut ${receiver} { std::sync::Arc::make_mut(__d).insert(crate::runtime::stringify_param(&${key}), ${value}); }`;

    test('string-literal write on a typed dict local inserts natively', () => {
        const ts = 'const result: { [key: string]: any } = {};\nresult["k"] = 1;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(insert('result', 'k', 'Value::Int(1)'));
        expect(output).not.toContain('add_element_to_object(&mut result');
    });

    test('a Dictionary-typed receiver counts as a dict', () => {
        const ts = 'interface Dictionary<T> { [key: string]: T; }\nconst account: Dictionary<any> = {};\naccount["free"] = 1;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(insert('account', 'free', 'Value::Int(1)'));
    });

    test('a bare identifier value is cloned like the helper call would', () => {
        const ts = 'const result: { [key: string]: any } = {};\nconst v = 1;\nresult["k"] = v;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(insert('result', 'k', 'v.clone()'));
    });

    test('a value operand reading the receiver is hoisted into a temp', () => {
        const ts = 'const result: { [key: string]: any } = {};\nresult["k"] = result["j"];';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('{ let __be_tmp = ');
        expect(output).toContain('&mut result { std::sync::Arc::make_mut(__d).insert("k".into(), __be_tmp); }');
        expect(output).not.toContain('add_element_to_object(&mut result');
    });

    test('a call passing the receiver as an arg is hoisted too', () => {
        const ts = 'const params: { [key: string]: any } = {};\nparams["auth"] = this.createAuth(params);';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('{ let __be_tmp = self.createAuth(params); if let Value::Dict(__d) = &mut params { std::sync::Arc::make_mut(__d).insert("auth".into(), __be_tmp); } }');
    });

    test('a bool-typed value operand is boxed in Value::Bool', () => {
        const ts = 'const result: { [key: string]: any } = {};\nconst a: any = 1;\nresult["k"] = (a === 1);';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('insert("k".into(), Value::Bool(');
    });

    test('this.<field> receivers insert natively', () => {
        const ts = 'class A { options: { [key: string]: any } = {};\n    f() { this.options["k"] = 1; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(insert('self.options', 'k', 'Value::Int(1)'));
        expect(output).not.toContain('add_element_to_object(&mut self.options');
    });

    test('array-typed receivers keep the helper', () => {
        const ts = 'const result: any[] = [];\nresult["k"] = 1;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut result');
    });

    test('order-book meta fields print set_book_meta', () => {
        const ts = 'class OrderBook { timestamp: number; datetime: string; }\nfunction f(orderbook: OrderBook, ts: number) { orderbook["timestamp"] = ts; orderbook["datetime"] = "x"; }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('orderbook.set_book_meta("timestamp", ts.clone())');
        expect(output).toContain('orderbook.set_book_meta("datetime", ');
        expect(output).not.toContain('add_element_to_object(&mut orderbook');
    });

    test('safeValue(this.orderbooks, k) local prints set_book_meta', () => {
        const ts = 'class A { orderbooks: any = {}; safeValue(a: any, b: any): any { return a[b]; }\n    f(symbol: string, ts: number) { let orderbook = this.safeValue(this.orderbooks, symbol); orderbook["timestamp"] = ts; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('orderbook.set_book_meta(\"timestamp\", ts.clone())');
        expect(output).not.toContain('add_element_to_object(&mut orderbook');
    });

    test('order-book non-meta keys keep the helper', () => {
        const ts = 'class OrderBook { foo: number; }\nfunction f(orderbook: OrderBook) { orderbook["foo"] = 1; }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut orderbook');
    });

    test('class-typed receivers keep the helper', () => {
        const ts = 'class Book { bids: any[] = []; }\nfunction f(book: Book) { book["k"] = 1; }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut book');
    });

    test('receivers bound from an element read keep the helper', () => {
        const ts = 'const rows: any[] = [];\nconst result = rows[0];\nresult["k"] = 1;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut result');
    });

    test('book-meta keys insert natively on a constructed dict', () => {
        const ts = 'const result: { [key: string]: any } = {};\nresult["timestamp"] = 1;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(insert('result', 'timestamp', 'Value::Int(1)'));
        expect(output).not.toContain('add_element_to_object(&mut result');
    });

    test('book-meta keys keep the helper on a declared-Dict local', () => {
        const ts = 'function f(response) {\n    const data = this.safeDict(response, "data", {});\n    data["timestamp"] = 1;\n}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut data, &Value::Str("timestamp"');
    });

    test('book-meta keys keep the helper on a whitelisted name without a construction proof', () => {
        const ts = 'let result = undefined;\nresult = {};\nresult["timestamp"] = 1;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut result, &Value::Str("timestamp"');
    });

    test('computed keys insert natively through stringify_param', () => {
        const ts = 'const result: { [key: string]: any } = {};\nconst k = "x";\nresult[k] = 1;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(dynamic('result', 'k', 'Value::Int(1)'));
        expect(output).not.toContain('add_element_to_object(&mut result');
    });

    test('computed keys on a base dict field insert natively', () => {
        const ts = 'class A {\n' +
            '    balance: any = {};\n' +
            '    f(account) {\n' +
            '        this.balance[account] = 1;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(dynamic('self.balance', 'account', 'Value::Int(1)'));
        expect(output).not.toContain('add_element_to_object(&mut self.balance');
    });

    test('a computed key reading the receiver keeps the helper', () => {
        const ts = 'const result: { [key: string]: any } = {};\nresult[result["k"]] = 1;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut result');
    });

    test('a computed key that is not a plain place keeps the helper', () => {
        const ts = 'const result: { [key: string]: any } = {};\nconst o: any = {};\nresult[o.k] = 1;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut result');
    });

    test('a later write of another shape keeps the helper', () => {
        const ts = 'let result: { [key: string]: any } = {};\nresult = [] as any;\nresult["k"] = 1;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut result');
    });

    test('a fresh-map request local inserts natively', () => {
        const ts = 'const request: { [key: string]: any } = {};\nrequest["k"] = 1;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(insert('request', 'k', 'Value::Int(1)'));
    });

    test('a fresh-map local inserts natively whatever its name', () => {
        const ts = 'const headers: { [key: string]: any } = { "a": 1 };\nheaders["k"] = 1;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(insert('headers', 'k', 'Value::Int(1)'));
        expect(output).not.toContain('add_element_to_object(&mut headers');
    });

    test('a handler-tuple reassigned local stays a plain dict', () => {
        const ts = 'class A {\n' +
            '    f(params) {\n' +
            '        let request: { [key: string]: any } = { "a": 1 };\n' +
            '        [ request, params ] = this.handleUntilOption("endTime", request, params);\n' +
            '        request["k"] = 1;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(insert('request', 'k', 'Value::Int(1)'));
        expect(output).not.toContain('add_element_to_object(&mut request');
    });

    test('a tuple reassigned from a non-handler call keeps the helper', () => {
        const ts = 'class A {\n' +
            '    f(params) {\n' +
            '        const rows: any[] = [];\n' +
            '        let request: { [key: string]: any } = { "a": 1 };\n' +
            '        [ request, params ] = rows[0];\n' +
            '        request["k"] = 1;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut request');
    });

    test('an object literal carrying a runtime tag key keeps the helper', () => {
        const ts = 'const request: { [key: string]: any } = { "__book_id": 1 };\nrequest["k"] = 1;';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut request');
    });

    test('a local reassigned from a call keeps the helper', () => {
        const ts = 'class A {\n' +
            '    f() {\n' +
            '        let request: { [key: string]: any } = { "a": 1 };\n' +
            '        request = this.extend(request, { "b": 2 });\n' +
            '        request["k"] = 1;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut request');
    });

    test('a hand-written base dict field inserts natively', () => {
        const ts = 'class A {\n' +
            '    balance: any = {};\n' +
            '    f() {\n' +
            '        this.balance["swap"] = 1;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(insert('self.balance', 'swap', 'Value::Int(1)'));
        expect(output).not.toContain('add_element_to_object(&mut self.balance');
    });

    test('a tagged handle field keeps the helper', () => {
        const ts = 'class A {\n' +
            '    subscriptions: any = {};\n' +
            '    f() {\n' +
            '        this.subscriptions["k"] = 1;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut self.subscriptions');
    });

    test('a declared-Dict local (safeDict with an object default) inserts natively', () => {
        const ts = 'function f(response) {\n' +
            '    const data = this.safeDict(response, "data", {});\n' +
            '    data["ts"] = 1;\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(insert('data', 'ts', 'Value::Int(1)'));
        expect(output).not.toContain('add_element_to_object(&mut data');
    });

    test('a declared-Dict local with a computed key inserts natively', () => {
        const ts = 'function f(response, code) {\n' +
            '    const data = this.safeDict(response, "data", {});\n' +
            '    data[code] = 1;\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(dynamic('data', 'code', 'Value::Int(1)'));
    });

    test('a Dict-typed parameter inserts natively for literal and computed keys', () => {
        const decl = 'interface Dictionary<T> { [key: string]: T; }\ntype Dict = Dictionary<any>;\ntype Str = string | undefined;\n';
        const literal = transpiler.transpileRust(decl + 'function f (balance: Dict) {\n    balance["k"] = 1;\n}').content;
        expect(literal).toContain(insert('balance', 'k', 'Value::Int(1)'));
        expect(literal).not.toContain('add_element_to_object(&mut balance');
        const computed = transpiler.transpileRust(decl + 'function f (balance: Dict, code: Str) {\n    balance[code] = 1;\n}').content;
        expect(computed).toContain(dynamic('balance', 'code', 'Value::Int(1)'));
    });

    test('a parameter with a default value keeps the pre-unit tuple proof', () => {
        const decl = 'interface Dictionary<T> { [key: string]: T; }\ntype Dict = Dictionary<any>;\n';
        const ts = decl + 'class A {\n' +
            '    f(params: Dict = {}) {\n' +
            '        let uta: any = undefined;\n' +
            '        [ uta, params ] = this.getInstType("m", params);\n' +
            '        params["uta"] = true;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(insert('params', 'uta', 'Value::Bool(true)'));
        expect(output).not.toContain('add_element_to_object(&mut params');
    });

    test('a parameter reassigned from a call keeps the helper', () => {
        const decl = 'interface Dictionary<T> { [key: string]: T; }\ntype Dict = Dictionary<any>;\n';
        const ts = decl + 'class A {\n' +
            '    f(params: Dict = {}) {\n' +
            '        params = this.omit(params, "margin");\n' +
            '        params["k"] = 1;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut params');
    });

    test('any-typed receivers keep the helper', () => {
        const ts = 'function f(params: any) {\n    params["k"] = 1;\n}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(&mut params');
    });
});

describe('rust truthiness sinks take the bare bool', () => {
    // `is_true` is the one sink whose signature takes a native `bool`
    // (`impl IsTruthy for bool`, and `IsTruthy for Value` unboxes a
    // `Value::Bool(b)` back to `b`), so the printer's box around a bool in a
    // truthiness position is a round-trip and prints as the bare expression.

    test('a boxed condition loses the Value::Bool box', () => {
        const ts = 'class A { f(x) { if (Array.isArray (x)) { return 1; } return 2; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if (matches!(&x, Value::Arr(_))) {');
        expect(output).not.toContain('Value::Bool(matches!(&x, Value::Arr(_)))');
    });

    test('a negated boxed condition prints the bare bool', () => {
        const ts = 'class A { f(x) { if (!Array.isArray (x)) { return 1; } return 2; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if !(matches!(&x, Value::Arr(_))) {');
    });

    test('every &&/|| operand is unboxed on its own', () => {
        const ts = 'class A { f(x, y) { if (Array.isArray (x) || y) { return 1; } return 2; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if (matches!(&x, Value::Arr(_))) || is_true(&y) {');
    });

    test('a boxed `in` condition loses the box', () => {
        const ts = 'class A { f(x) { if ("k" in x) { return 1; } return 2; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if is_true(&(in_op(&x, &Value::Str("k".into())))) {');
    });

    test('assert() takes the bare bool as well', () => {
        const ts = 'class A { f(x) { assert (Array.isArray (x), "msg"); } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('assert((matches!(&x, Value::Arr(_))), Value::Str("msg".into()));');
    });

    // negatives — every other sink takes a `Value` and keeps its box.
    test('a Value-argument box is untouched', () => {
        const ts = 'class A { f(x) { return g (Array.isArray (x)); } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('return g(Value::Bool(matches!(&x, Value::Arr(_))));');
    });

    test('a Value-local initializer box is untouched', () => {
        const ts = 'class A { f(x) { const y = Array.isArray (x); return y; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut y: Value = Value::Bool(matches!(&x, Value::Arr(_)));');
    });

    test('is_equal keeps its &Value operand box', () => {
        const ts = 'class A { f(x) { if (x === true) { return 1; } return 2; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if is_equal(&x, &Value::Bool(true)) {');
    });
});

// The condition printer's last resort wraps an operand no earlier branch
// claimed. A parenthesised comparison the checker proved native (or the
// `Value::Bool(…)` the printer boxes it in for a `Value` slot) is already a Rust
// `bool`, so `is_true(&(…))` — the identity over `IsTruthy for bool` — is dropped.
describe('rust is_true over an already-native bool expression', () => {
    test('a parenthesised null compare prints bare', () => {
        const ts = 'class A { f(a) { if ((a !== undefined)) { return 1; } return 2; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if (a != Value::Null) {');
        expect(output).not.toContain('is_true(&(a != Value::Null))');
    });

    test('a parenthesised string compare prints bare', () => {
        const ts = 'class A { f(a: string) { if ((a === "lit")) { return 1; } return 2; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if (a.as_str() == Some("lit")) {');
        expect(output).not.toContain('is_true(&(a.as_str() == Some("lit")))');
    });

    test('a parenthesised bool compare prints bare', () => {
        const ts = 'class A { f(a: boolean) { if ((a === true)) { return 1; } return 2; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if (a.as_bool() == Some(true)) {');
        expect(output).not.toContain('is_true(&(a.as_bool() == Some(true)))');
    });

    test('a parenthesised ordered compare prints bare', () => {
        const ts = 'class A { f(a: number, b: number) { if ((a < b)) { return 1; } return 2; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if (a.as_f64().unwrap_or(f64::NAN) < b.as_f64().unwrap_or(f64::NAN)) {');
    });

    test('a parenthesised numeric literal compare prints bare', () => {
        const ts = 'class A { f(a: number) { if ((a === 1)) { return 1; } return 2; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if (a.as_f64() == Some(1.0)) {');
    });

    test('a ternary condition prints bare', () => {
        const ts = 'class A { f(a: boolean) { const r: any = (a === true) ? 1 : 2; return r; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(if (a.as_bool() == Some(true)) {');
    });

    test('a while condition prints bare', () => {
        const ts = 'class A { f(a) { while ((a !== undefined)) { return 1; } } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('while (a != Value::Null) {');
    });

    test('every logical operand prints bare on its own', () => {
        const ts = 'class A { f(a: number, b: string) { if ((a !== undefined) && (b !== "x")) { return 1; } return 2; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if (a != Value::Null) && (b.as_str() != Some("x")) {');
    });

    test('a negated native compare prints bare', () => {
        const ts = 'class A { f(a) { if (!(a !== undefined)) { return 1; } return 2; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if !(a != Value::Null) {');
    });

    // negatives — a helper-led text keeps the is_true marker the post-passes key on.
    test('a helper-led comparison keeps the wrapper', () => {
        const ts = 'class A { f(a, b) { if ((a === b)) { return 1; } return 2; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if is_true(&(is_equal(&a, &b))) {');
    });

    test('a boxed Value-slot logical prints its native operands bare', () => {
        const ts = 'class A { f(a, b) { const r = (a === null) && b; return r; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut r: Value = Value::Bool((a == Value::Null) && is_true(&b));');
    });

    test('a helper-led Value-slot logical keeps the is_true markers', () => {
        const ts = 'class A { f(a, b, c) { const r = (a === b) && c; return r; } }';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut r: Value = is_true(&(is_equal(&a, &b))) && is_true(&c);');
    });
});

describe('rust numeric literals', () => {
    test('an exponent literal is a float, negated or not', () => {
        const input = "class A { f(x) { const a = x.g(1e-7); const b = x.g(-1e-7); const c = -5; return [a, b, c]; } }";
        const output = transpiler.transpileRust(input).content;
        expect(output).toContain('x.g(Value::Float(1e-7))');
        expect(output).toContain('x.g(Value::Float(-1e-7))');
        expect(output).toContain('let mut c: i64 = -5;');
        expect(output).not.toContain('Value::Int(1e-7)');
    });
});

// `is_true(&<call>)` is the identity when the callee's Rust signature is
// `-> bool`; those callees are listed in RUST_BOOL_RESULT_CALLEES and proven
// boolean by the checker, so the printer emits the call bare.
describe('rust hand-written bool-returning calls', () => {
    const typed = (body: string) =>
        'function tickerExceptionNeedsOhlcv(ex: any, exchange: any, ticker: any): boolean {\n' +
        '    return true;\n' +
        '}\n' +
        'function isTemporaryFailure(e: any): boolean {\n' +
        '    return false;\n' +
        '}\n' +
        'class A {\n' +
        '    run(ex: any, exchange: any, ticker: any) {\n' +
        body + '\n' +
        '    }\n' +
        '}';

    test('condition over a `-> bool` callee prints bare', () => {
        const output = transpiler.transpileRust(typed(
            '        if (tickerExceptionNeedsOhlcv(ex, exchange, ticker)) {\n' +
            '            return 1;\n' +
            '        }\n' +
            '        return 0;',
        )).content;
        expect(output).toContain('if tickerExceptionNeedsOhlcv(ex, exchange, ticker) {');
        expect(output).not.toContain('is_true(&tickerExceptionNeedsOhlcv');
    });

    test('logical operand over a `-> bool` callee prints bare', () => {
        const output = transpiler.transpileRust(typed(
            '        if ((ticker !== undefined) && tickerExceptionNeedsOhlcv(ex, exchange, ticker)) {\n' +
            '            return 1;\n' +
            '        }\n' +
            '        return 0;',
        )).content;
        expect(output).toContain('&& tickerExceptionNeedsOhlcv(ex, exchange, ticker) {');
        expect(output).not.toContain('is_true(&tickerExceptionNeedsOhlcv');
    });

    test('negated `-> bool` callee prints bare', () => {
        const output = transpiler.transpileRust(typed(
            '        if (!tickerExceptionNeedsOhlcv(ex, exchange, ticker)) {\n' +
            '            return 1;\n' +
            '        }\n' +
            '        return 0;',
        )).content;
        expect(output).toContain('if !tickerExceptionNeedsOhlcv(ex, exchange, ticker) {');
    });

    test('a boolean-typed callee outside the table keeps is_true', () => {
        const output = transpiler.transpileRust(typed(
            '        if (isTemporaryFailure(ex)) {\n' +
            '            return 1;\n' +
            '        }\n' +
            '        return 0;',
        )).content;
        expect(output).toContain('if is_true(&isTemporaryFailure(ex)) {');
    });
});

// ── is_true over a checker-proved boolean Value ─────────────────────────────
// `safeBool(...)` and element accesses whose checker type is boolean|undefined
// can only be `Value::Bool(..)` or `Value::Null` at runtime, where the truthy
// helper is exactly `matches!(.., Value::Bool(true))`.
describe('rust is_true over a proven boolean Value', () => {
    const boolClass = (body: string) =>
        'class A {\n' +
        '    safeBool(obj: any, key: any, defaultValue?: boolean): boolean | undefined { return undefined; }\n' +
        '    safeBool2(obj: any, k1: any, k2: any, defaultValue?: boolean): boolean | undefined { return undefined; }\n' +
        '    isLinear(market: any): boolean { return true; }\n' +
        '    run() {\n' + body + '\n    }\n' +
        '}';

    test('safeBool in a condition emits the native matches!', () => {
        const ts = boolClass("        if (this.safeBool(this.options, 'foo', false)) { return 1; }");
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if matches!(self.safeBool(self.options, Value::Str("foo".into()), &[Value::Bool(false)]), Value::Bool(true))');
        expect(output).not.toContain('is_true(&self.safeBool');
    });

    test('negated safeBool keeps the negation around the matches!', () => {
        const ts = boolClass("        if (!this.safeBool(this.options, 'foo')) { return 1; }");
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if !matches!(self.safeBool(self.options, Value::Str("foo".into()), &[]), Value::Bool(true))');
        expect(output).not.toContain('is_true(&self.safeBool');
    });

    test('safeBool2 and a ternary condition emit the native matches!', () => {
        const ts = boolClass("        return this.safeBool2(this.options, 'a', 'b', false) ? 1 : 2;");
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(if matches!(self.safeBool2(self.options, Value::Str("a".into()), Value::Str("b".into()), &[Value::Bool(false)]), Value::Bool(true))');
        expect(output).not.toContain('is_true(&self.safeBool2');
    });

    test('a method returning only bool literals tests as_bool natively', () => {
        const ts = boolClass('        if (this.isLinear(this.options)) { return 1; }');
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if self.isLinear(self.options).as_bool() == Some(true) {');
        expect(output).not.toContain('is_true(&self.isLinear');
    });

    test('a logical stored in a Value local keeps the helper', () => {
        const ts = boolClass("        const x = this.safeBool(this.options, 'a') || this.safeBool(this.options, 'b');\n        return x;");
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_true(&self.safeBool(self.options, Value::Str("a".into()), &[])) || is_true(&self.safeBool');
        expect(output).not.toContain('matches!(self.safeBool');
    });

    test('a logical inside a condition emits the native matches! operand', () => {
        const ts = boolClass("        if (this.safeBool(this.options, 'a') && this.safeBool(this.options, 'b')) { return 1; }");
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if matches!(self.safeBool(self.options, Value::Str("a".into()), &[]), Value::Bool(true)) && matches!(self.safeBool');
    });

    test('a boolean-typed element access emits the native matches!', () => {
        const ts =
            'class B {\n' +
            '    run(options: { foo?: boolean }) {\n' +
            "        if (options['foo']) { return 1; }\n" +
            '        return 2;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if matches!(options.get("foo").cloned().unwrap_or(Value::Null), Value::Bool(true))');
        expect(output).not.toContain('is_true(&options');
    });

    test('a non-boolean element access keeps the helper', () => {
        const ts =
            'class C {\n' +
            '    run(options: { foo?: string }, i: number) {\n' +
            "        if (options['foo']) { return 1; }\n" +
            '        if (options[i]) { return 2; }\n' +
            '        return 3;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_true(&options.as_map().and_then(|__m| __m.get("foo")).cloned().unwrap_or(Value::Null))');
        expect(output).toContain('is_true(&get_value(&options, &i))');
        expect(output).not.toContain('matches!(options');
    });

    test('a boolean-typed parameter emits the native matches!', () => {
        const ts =
            'class D {\n' +
            '    subscribe(name: string, isPrivate: boolean) {\n' +
            '        if (isPrivate) { return 1; }\n' +
            '        if (!isPrivate) { return 2; }\n' +
            '        return 3;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        // the transpiler prints a call-site-proven `boolean` parameter as a native `bool`, so the condition
        // is the bare name (the identifier arm applies only while the parameter stays boxed)
        expect(output).toContain('if isPrivate {');
        expect(output).toContain('if !isPrivate {');
        expect(output).not.toContain('is_true(&isPrivate)');
    });

    test('a boolean-typed local reassigned from a tuple emits the native matches!', () => {
        const ts =
            'class E {\n' +
            '    handleOptionBoolAndParams(params: any, methodName: string, optionName: string, defaultValue?: boolean): [boolean, any] { return [true, params]; }\n' +
            '    run(params: any) {\n' +
            '        let uta: boolean = true;\n' +
            "        [uta, params] = this.handleOptionBoolAndParams(params, 'fetchDepositAddress', 'uta', uta);\n" +
            '        if (uta) { return 1; }\n' +
            '        return 2;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut uta: Value = Value::Bool(true);');
        expect(output).toContain('if uta.as_bool() == Some(true) {');
        expect(output).not.toContain('is_true(&uta)');
    });

    test('a local the printer declares native bool keeps the helper', () => {
        const ts =
            'class F {\n' +
            '    safeBool(obj: any, key: any): boolean | undefined { return undefined; }\n' +
            '    run() {\n' +
            "        const flag = this.safeBool(this.options, 'a') === true;\n" +
            '        if (flag) { return 1; }\n' +
            '        return 2;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut flag: bool =');
        expect(output).not.toContain('matches!(flag');
    });

    test('a non-boolean identifier keeps the helper', () => {
        const ts =
            'class G {\n' +
            '    run(name: string, params: any) {\n' +
            '        if (name) { return 1; }\n' +
            '        if (params) { return 2; }\n' +
            '        return 3;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_true(&name)');
        expect(output).toContain('is_true(&params)');
        expect(output).not.toContain('matches!(name');
        expect(output).not.toContain('matches!(params');
    });
});

describe('rust declared-Dict locals', () => {
    const NATIVE = (name: string, key: string) =>
        `${name}.as_map().and_then(|__m| __m.get("${key}")).cloned().unwrap_or(Value::Null)`;

    // A default-valued bag param is lowered to `let x = get_arg(optionalArgs,
    // k, Value::Map({...}))` — a fresh dict whenever the caller passes none,
    // and any caller dict otherwise: a literal-key read needs no helper.
    test('default-valued bag param reads natively', () => {
        const ts =
            "function f(optionalArgs: any = [], config: any = {}) {\n" +
            "    return config['noCoin'];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(NATIVE('config', 'noCoin'));
        expect(output).not.toContain('get_value_k(&config');
    });

    test('default-valued bag param reads a property natively', () => {
        const ts =
            "function f(optionalArgs: any = [], config: any = {}) {\n" +
            "    return config.noSymbol;\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(NATIVE('config', 'noSymbol'));
        expect(output).not.toContain('get_value(&config, &Value::Str("noSymbol"');
    });

    test('extend onto an object literal reads natively', () => {
        const ts =
            "class A {\n" +
            "    extend(a: any, b: any): any { return a; }\n" +
            "    f(market: any) {\n" +
            "        const cleanStructure = { 'spot': undefined, 'swap': undefined };\n" +
            "        const result = this.extend(cleanStructure, market);\n" +
            "        return result['spot'];\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(NATIVE('result', 'spot'));
        expect(output).not.toContain('get_value_k(&result');
    });

    test('element of a Dictionary container reads natively', () => {
        const ts =
            "type Str = string | undefined;\n" +
            "interface Market { id: string; }\n" +
            "interface Markets { [key: string]: Market; }\n" +
            "class A {\n" +
            "    markets: Markets = {};\n" +
            "    f(symbol: Str) {\n" +
            "        const market = this.markets[symbol];\n" +
            "        return market['id'];\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        // the element local is a bare IndexMap, so the read is a map
        // lookup (`market.as_map()` box would only add the `|__m|` closure).
        expect(output).toContain('market.get("id").cloned().unwrap_or(Value::Null)');
        expect(output).toContain('let mut market: indexmap::IndexMap<String, Value> = (if let (Some(__m), Some(__k)) = (self.markets.as_map(), symbol.as_str())');
        expect(output).not.toContain('get_value_k(&market');
        expect(output).not.toContain(NATIVE('market', 'id'));
    });

    // D2: any later write may replace the dict, so the proof is dropped.
    test('reassigned local keeps the helper', () => {
        const ts =
            "function f(other: any = {}, config: any = {}) {\n" +
            "    config = other;\n" +
            "    return config['noCoin'];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('crate::value::get_value_k(&config, "noCoin")');
    });

    // D5: these keys are served from the book store / a live snapshot by the
    // runtime helper, which a plain map read cannot see.
    test('runtime-routed keys keep the helper', () => {
        const ts =
            "function f(config: any = {}) {\n" +
            "    const a = config['symbol'];\n" +
            "    const b = config['cache'];\n" +
            "    return [a, b];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('crate::value::get_value_k(&config, "symbol")');
        expect(output).toContain('crate::value::get_value_k(&config, "cache")');
    });

    test('param without a dict default keeps the helper', () => {
        const ts =
            "function f(config: any) {\n" +
            "    return config['noCoin'];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('crate::value::get_value_k(&config, "noCoin")');
    });
});

describe('rust native string search and slicing', () => {
    const stringMethod = (body: string, params = 'a: string') =>
        `class A {\n    run(${params}) {\n${body}\n    }\n}`;

    test('indexOf with a literal needle on a proven string is native', () => {
        const output = transpiler.transpileRust(stringMethod("        return a.indexOf('/');")).content;
        expect(output).toContain('return Value::Int(a.as_str().and_then(|__s| __s.find("/")).map(|__i| __i as i64).unwrap_or(-1));');
        expect(output).not.toContain('get_index_of');
    });

    test('a nullable string receiver keeps the -1 branch through as_str', () => {
        const output = transpiler.transpileRust(stringMethod("        return a.indexOf(':');", 'a: string | undefined')).content;
        expect(output).toContain('Value::Int(a.as_str().and_then(|__s| __s.find(":")).map(|__i| __i as i64).unwrap_or(-1))');
        expect(output).not.toContain('get_index_of');
    });

    test('an unproven receiver keeps the helper', () => {
        const output = transpiler.transpileRust(stringMethod("        return a.indexOf('/');", 'a: any')).content;
        expect(output).toContain('(match (&(a), &(Value::Str("/".into())))');
    });

    test('an array receiver keeps the helper (the helper scans it)', () => {
        const output = transpiler.transpileRust(stringMethod("        return a.indexOf('/');", 'a: string[]')).content;
        expect(output).toContain('(match (&(a), &(Value::Str("/".into())))');
    });

    test('a non-literal needle keeps the helper', () => {
        const output = transpiler.transpileRust(stringMethod('        return a.indexOf(b);', 'a: string, b: any')).content;
        expect(output).toContain('(match (&(a), &(b))');
    });

    test('an escaped literal needle keeps its escapes', () => {
        const output = transpiler.transpileRust(stringMethod('        return a.indexOf("\\n");')).content;
        expect(output).toContain('__s.find("\\n")');
    });

    test('slice with a single negative literal bound is native', () => {
        const output = transpiler.transpileRust(stringMethod('        return a.slice(-64);', 'a: string')).content;
        expect(output).toContain('let __i = (__l - 64).max(0); let __j = __l;');
        expect(output).not.toContain('slice(&');
    });

    test('slice with two literal bounds clamps both ends', () => {
        const output = transpiler.transpileRust(stringMethod('        return a.slice(2, 4);')).content;
        expect(output).toContain('let __i = __l.min(2); let __j = __l.min(4);');
        expect(output).not.toContain('slice(&');
    });

    test('slice with a negative end counts from the end', () => {
        const output = transpiler.transpileRust(stringMethod('        return a.slice(2, -1);')).content;
        expect(output).toContain('let __i = __l.min(2); let __j = (__l - 1).max(0);');
    });

    test('slice keeps the helper for an expression bound', () => {
        const output = transpiler.transpileRust(stringMethod('        return a.slice(0, b);', 'a: string, b: number')).content;
        expect(output).toContain('(match (&(a), 0i64,');
    });

    test('slice keeps the helper for an unproven receiver', () => {
        const output = transpiler.transpileRust(stringMethod('        return a.slice(0, 2);', 'a: any')).content;
        expect(output).toContain('(match (&(a), 0i64,');
    });

    test('length on a nullable array or string is native', () => {
        const arrayOutput = transpiler.transpileRust(stringMethod('        return a.length;', 'a: string[] | undefined')).content;
        expect(arrayOutput).toContain('return Value::Int(a.len() as i64);');
        const stringOutput = transpiler.transpileRust(stringMethod('        return a.length;', 'a: string | undefined')).content;
        expect(stringOutput).toContain('return Value::Int(a.len() as i64);');
    });

    test('length on an unproven receiver keeps the helper', () => {
        const output = transpiler.transpileRust(stringMethod('        return a.length;', 'a: any')).content;
        expect(output).toContain('get_array_length(&a)');
    });
});

// Native equality for plain reads whose checker type is a class instance
// (struct field / local / param — all printed `Value`) and for operands the
// checker confines to Bool/Null/non-numeric strings.
describe('rust native equality on declared reads', () => {
    const CACHE_FIELD = 'class Cache {}\nclass A {\n    orders: Cache | undefined = undefined;\n';

    test('a class-typed field compares to null natively', () => {
        const ts = CACHE_FIELD +
            '    run(u: any) {\n' +
            '        if (this.orders === undefined) {\n' +
            '            return u;\n' +
            '        }\n' +
            '        return this.orders;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if (self.orders == Value::Null) {');
        expect(output).not.toContain('is_equal(&self.orders');
    });

    test('a class-typed parameter compares to null natively', () => {
        const ts = 'class Cache {}\nclass A {\n' +
            '    run(orders: Cache | undefined, u: any) {\n' +
            '        if (orders === undefined) {\n' +
            '            return u;\n' +
            '        }\n' +
            '        return orders;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if (orders == Value::Null) {');
        expect(output).not.toContain('is_equal(&orders');
    });

    test('a local initialised from a field compares to null natively', () => {
        const ts = CACHE_FIELD +
            '    run(u: any) {\n' +
            '        const cached = this.orders;\n' +
            '        if (cached === undefined) {\n' +
            '            return u;\n' +
            '        }\n' +
            '        return cached;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if (cached == Value::Null) {');
        expect(output).not.toContain('is_equal(&cached');
    });

    test('a local holding a constructed struct stays on the helper', () => {
        const ts = 'class B {}\nclass A {\n' +
            '    run(u: any) {\n' +
            '        const created = new B();\n' +
            '        return created === undefined;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_equal(&created, &Value::Null)');
    });

    const HAS_UNION = 'class A {\n    has!: { [key: string]: boolean | \'emulated\' | undefined };\n';

    test('a bool-literal union compares the unwrapped bool', () => {
        const output = transpiler.transpileRust(HAS_UNION +
            '    run() {\n' +
            '        return this.has[\'fetchOrders\'] === true;\n' +
            '    }\n' +
            '}').content;
        expect(output).toContain('.unwrap_or(Value::Null).as_bool() == Some(true)');
        expect(output).not.toContain('is_equal(');
    });

    test('a negated bool-literal union compares the unwrapped bool', () => {
        const output = transpiler.transpileRust(HAS_UNION +
            '    run() {\n' +
            '        if (this.has[\'fetchOrders\'] !== false) {\n' +
            '            return 1;\n' +
            '        }\n' +
            '        return 2;\n' +
            '    }\n' +
            '}').content;
        expect(output).toContain('.unwrap_or(Value::Null).as_bool() != Some(false)');
        expect(output).not.toContain('is_equal(');
    });

    test('a numeric string member keeps the helper', () => {
        const output = transpiler.transpileRust(
            'class A {\n    has!: { [key: string]: boolean | \'1\' | undefined };\n' +
            '    run() {\n' +
            '        return this.has[\'fetchOrders\'] === true;\n' +
            '    }\n' +
            '}').content;
        expect(output).toContain('is_equal(&self.has');
    });

    test('a number member keeps the helper', () => {
        const output = transpiler.transpileRust(
            'class A {\n    has!: { [key: string]: boolean | number | undefined };\n' +
            '    run() {\n' +
            '        return this.has[\'fetchOrders\'] === true;\n' +
            '    }\n' +
            '}').content;
        expect(output).toContain('is_equal(&self.has');
    });

    test('a plain string member keeps the helper', () => {
        const output = transpiler.transpileRust(
            'class A {\n    has!: { [key: string]: string };\n' +
            '    run() {\n' +
            '        return this.has[\'fetchOrders\'] === true;\n' +
            '    }\n' +
            '}').content;
        expect(output).toContain('is_equal(&self.has');
    });
});

describe('rust declared-Dict locals: table and census', () => {
    // The declared-Dict table answers `rustDeclaredLocalTypeResolver(node)` for a
    // local the printer itself can prove holds a `Value::Dict` at every use: the
    // initialiser is a `safe_dict*` call whose default is itself Dict-proven, or
    // a `Value::Map(..)` object literal, and no later write changes the kind.
    // The declaration stays `Value`; consumers (get_value / in_op /
    // add_element_to_object families) read the hook.

    const rustPrinter = () => (transpiler as any).rustTranspiler;

    const identifierUses = (name: string) => {
        const sourceFile = rustPrinter().getSrc();
        const found: any[] = [];
        const walk = (node: any) => {
            if (isIdentifier(node) && node.text === name) found.push(node);
            node.forEachChild(walk);
        };
        walk(sourceFile);
        return found;
    };

    const resolveNamed = (snippet: string, name: string, predicate: (node: any) => boolean = () => true) => {
        transpiler.transpileRust(snippet);
        const rust = rustPrinter();
        const node = identifierUses(name).find(predicate);
        expect(node).toBeDefined();
        return { rust, answer: rust.rustDeclaredLocalTypeResolver(node), node };
    };

    const isElementReceiver = (node: any) => node.parent !== undefined && isElementAccessExpression(node.parent) && node.parent.expression === node;

    test('safe_dict with an object default is proven Dict', () => {
        const snippet =
            'class T {\n' +
            '    m(response) {\n' +
            "        const data = this.safeDict(response, 'data', {});\n" +
            "        data['a'] = 1;\n" +
            "        return data['b'];\n" +
            '    }\n' +
            '}';
        const { answer } = resolveNamed(snippet, 'data', isElementReceiver);
        expect(answer).toBe('dict');
    });

    test('the declaration stays Value (no native HashMap retype)', () => {
        // a read-only dict local is a bare IndexMap; a written one stays boxed.
        const snippet =
            'class T {\n' +
            '    m(response) {\n' +
            "        const data = this.safeDict(response, 'data', {});\n" +
            "        return data['b'];\n" +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(snippet).content;
        expect(output).toContain('let mut data: indexmap::IndexMap<String, Value> = self.safeDict(response, Value::Str("data".into()), Value::Map({');
        const written =
            'class T {\n' +
            '    m(response) {\n' +
            "        const data = this.safeDict(response, 'data', {});\n" +
            "        data['a'] = 1;\n" +
            "        return data['b'];\n" +
            '    }\n' +
            '}';
        expect(transpiler.transpileRust(written).content).toContain('let mut data: Value = self.safeDict(response, Value::Str("data".into()), Value::Map({');
    });

    test('safe_dict without a default may be Value::Null, so no proof', () => {
        const snippet =
            'class T {\n' +
            '    m(response) {\n' +
            "        const data = this.safeDict(response, 'data');\n" +
            "        return data['b'];\n" +
            '    }\n' +
            '}';
        const { answer } = resolveNamed(snippet, 'data', isElementReceiver);
        expect(answer).toBeUndefined();
    });

    test('an object literal initialiser is proven Dict', () => {
        const snippet =
            'class T {\n' +
            '    m(params) {\n' +
            '        const request = { symbol: params, type: 1 };\n' +
            "        request['limit'] = 10;\n" +
            "        return request['symbol'];\n" +
            '    }\n' +
            '}';
        const { answer } = resolveNamed(snippet, 'request', isElementReceiver);
        expect(answer).toBe('dict');
    });

    test('a safe_dict2 default proves Dict too', () => {
        const snippet =
            'class T {\n' +
            '    m(response) {\n' +
            "        const row = this.safeDict2(response, 'a', 'b', {});\n" +
            "        return row['x'];\n" +
            '    }\n' +
            '}';
        const { answer } = resolveNamed(snippet, 'row', isElementReceiver);
        expect(answer).toBe('dict');
    });

    test('a default that is itself a proven local proves Dict', () => {
        const snippet =
            'class T {\n' +
            '    m(response) {\n' +
            "        const fallback = this.safeDict(response, 'fallback', {});\n" +
            "        const row = this.safeDict(response, 'row', fallback);\n" +
            "        return row['x'];\n" +
            '    }\n' +
            '}';
        const { answer } = resolveNamed(snippet, 'row', isElementReceiver);
        expect(answer).toBe('dict');
    });

    test('reassignment of a non-proven value drops the proof (D2)', () => {
        const snippet =
            'class T {\n' +
            '    m(response, other) {\n' +
            "        let data = this.safeDict(response, 'data', {});\n" +
            '        data = other;\n' +
            "        return data['b'];\n" +
            '    }\n' +
            '}';
        const { answer } = resolveNamed(snippet, 'data', isElementReceiver);
        expect(answer).toBeUndefined();
    });

    test('reassignment of another proven Dict keeps the proof (D2)', () => {
        const snippet =
            'class T {\n' +
            '    m(response) {\n' +
            "        let data = this.safeDict(response, 'data', {});\n" +
            "        data = this.safeDict(response, 'other', {});\n" +
            "        return data['b'];\n" +
            '    }\n' +
            '}';
        const { answer } = resolveNamed(snippet, 'data', isElementReceiver);
        expect(answer).toBe('dict');
    });

    test('a destructuring write drops the proof (D2)', () => {
        const snippet =
            'class T {\n' +
            '    m(response, params) {\n' +
            "        let data = this.safeDict(response, 'data', {});\n" +
            "        [ data, params ] = this.handleUntilOption('endTime', data, params);\n" +
            "        return data['b'];\n" +
            '    }\n' +
            '}';
        const { answer } = resolveNamed(snippet, 'data', isElementReceiver);
        expect(answer).toBeUndefined();
    });

    test('a for-of rebind of the local drops the proof (D2)', () => {
        const snippet =
            'class T {\n' +
            '    m(response, list) {\n' +
            "        let data = this.safeDict(response, 'data', {});\n" +
            '        for (data of list) {}\n' +
            "        return data['b'];\n" +
            '    }\n' +
            '}';
        const { answer } = resolveNamed(snippet, 'data', isElementReceiver);
        expect(answer).toBeUndefined();
    });

    test('an element write into the local stays kind-preserving', () => {
        const snippet =
            'class T {\n' +
            '    m(response) {\n' +
            "        const data = this.safeDict(response, 'data', {});\n" +
            "        data['a'] = data['b'];\n" +
            "        return data['c'];\n" +
            '    }\n' +
            '}';
        const { rust, answer, node } = resolveNamed(snippet, 'data', isElementReceiver);
        expect(answer).toBe('dict');
        expect(rust.rustDeclaredLocalEntry(node).uses.elementAccess).toBe(3);
    });

    test('a different binding of the name in a nested block does not invalidate', () => {
        const snippet =
            'class T {\n' +
            '    m(response) {\n' +
            "        const data = this.safeDict(response, 'data', {});\n" +
            '        { const data = 1; m.insert("k", data); }\n' +
            "        return data['b'];\n" +
            '    }\n' +
            '}';
        const { answer } = resolveNamed(snippet, 'data', (node) => isElementReceiver(node) && node.getStart() > snippet.indexOf('return'));
        expect(answer).toBe('dict');
    });

    test('a use of a shadowing binding is not answered for the outer local', () => {
        const snippet =
            'class T {\n' +
            '    m(response) {\n' +
            "        const data = this.safeDict(response, 'data', {});\n" +
            '        { const other = 1; m.insert("k", other); }\n' +
            "        return data['b'];\n" +
            '    }\n' +
            '}';
        const { answer } = resolveNamed(snippet, 'data', isElementReceiver);
        expect(answer).toBe('dict');
    });

    test('an unrelated Value local is not in the table', () => {
        const snippet =
            'class T {\n' +
            '    m(response) {\n' +
            "        const value = this.safeValue(response, 'data');\n" +
            "        return value['b'];\n" +
            '    }\n' +
            '}';
        const { answer } = resolveNamed(snippet, 'value', isElementReceiver);
        expect(answer).toBeUndefined();
    });

    test('the census counts proven and unproven declarators', () => {
        const snippet =
            'class T {\n' +
            '    m(response, other) {\n' +
            "        const proven = this.safeDict(response, 'a', {});\n" +
            "        const mayBeNull = this.safeDict(response, 'b');\n" +
            "        let reassigned = this.safeDict(response, 'c', {});\n" +
            '        reassigned = other;\n' +
            "        return [ proven['x'], mayBeNull['y'], reassigned['z'] ];\n" +
            '    }\n' +
            '}';
        transpiler.transpileRust(snippet);
        const census = rustPrinter().rustDeclaredDictLocalCensus();
        expect(census).toEqual({ declarators: 3, dict: 1, alwaysDict: 2, kindUnstable: 1, retypeEligible: 1 });
    });

    test('the table is keyed by local name and skips non-dict initialisers', () => {
        const snippet =
            'class T {\n' +
            '    m(response) {\n' +
            "        const data = this.safeDict(response, 'data', {});\n" +
            "        const list = this.safeList(response, 'data');\n" +
            '        return data;\n' +
            '    }\n' +
            '}';
        transpiler.transpileRust(snippet);
        const table = rustPrinter().rustDeclaredDictLocals();
        expect(Array.from(table.keys())).toEqual(['data']);
    });

    test('RUST_DECLARED_DICT_LOCALS exposes the vocabulary and callee table', () => {
        expect(RUST_DECLARED_DICT_LOCALS.DICT).toBe('dict');
        expect(RUST_DECLARED_DICT_LOCALS.SAFE_CALLEES['safe_dict_k']).toBe(2);
        expect(RUST_DECLARED_DICT_LOCALS.SAFE_CALLEES['safe_dict2']).toBe(3);
        expect(RUST_DECLARED_DICT_LOCALS.KIND_PRESERVING_MUTATORS.has('add_element_to_object')).toBe(true);
    });
});

// `parseInt`/`parseFloat` print the runtime helpers; a checker-proven string
// argument needs no Value-kind dispatch, so the helper's own match with native
// `str::parse` is emitted (every helper branch kept).
describe('rust native parseInt/parseFloat', () => {
    const nativeInt = '(match &x { Value::Str(__parse_s) => __parse_s.trim().parse::<i64>().map(Value::Int).unwrap_or(Value::Null), Value::Int(__parse_n) => Value::Int(*__parse_n), Value::Float(__parse_f) => Value::Int(*__parse_f as i64), _ => Value::Null })';
    const nativeFloat = '(match &x { Value::Str(__parse_s) => __parse_s.trim().parse::<f64>().map(Value::Float).unwrap_or(Value::Null), Value::Float(__parse_f) => Value::Float(*__parse_f), Value::Int(__parse_n) => Value::Float(*__parse_n as f64), _ => Value::Null })';

    test('parseInt on a string param goes native', () => {
        const input = "class A {\n    f (x: string) {\n        const n = parseInt (x);\n        return n;\n    }\n}";
        const output = transpiler.transpileRust(input).content;
        expect(output).toContain(`let mut n: Value = ${nativeInt};`);
        expect(output).not.toContain('parseInt(');
    });

    test('parseFloat on a string local goes native', () => {
        const input = "class A {\n    f (x: string) {\n        const n = parseFloat (x);\n        return n;\n    }\n}";
        const output = transpiler.transpileRust(input).content;
        expect(output).toContain(`let mut n: Value = ${nativeFloat};`);
        expect(output).not.toContain('parseFloat(');
    });

    test('a cast-to-string argument is a proven string', () => {
        const input = "class A {\n    f (x: string | undefined) {\n        const n = parseInt (x as string);\n        return n;\n    }\n}";
        const output = transpiler.transpileRust(input).content;
        expect(output).toContain(`let mut n: Value = ${nativeInt};`);
        expect(output).not.toContain('parseInt(');
    });

    test('an any-typed argument keeps the helper', () => {
        const input = "class A {\n    f (x: any) {\n        const n = parseInt (x);\n        return n;\n    }\n}";
        const output = transpiler.transpileRust(input).content;
        expect(output).toContain('let mut n: Value = parseInt(x);');
    });

    test('a numeric argument keeps the helper', () => {
        const input = "class A {\n    f (x: number) {\n        const n = parseFloat (x);\n        return n;\n    }\n}";
        const output = transpiler.transpileRust(input).content;
        expect(output).toContain('let mut n: Value = parseFloat(x);');
    });

    test('the radix form keeps the helper', () => {
        const input = "class A {\n    f (x: string) {\n        const n = parseInt (x, 10);\n        return n;\n    }\n}";
        const output = transpiler.transpileRust(input).content;
        expect(output).toContain('let mut n: Value = parseInt(x, Value::Int(10));');
    });

    test('an integer string literal folds to Value::Int', () => {
        const input = "class A {\n    f () {\n        const n = parseInt ('4');\n        return n;\n    }\n}";
        const output = transpiler.transpileRust(input).content;
        expect(output).toContain('let mut n: Value = Value::Int(4);');
    });

    test('a decimal string literal folds to Value::Float', () => {
        const input = "class A {\n    f () {\n        const n = parseFloat ('1.5');\n        return n;\n    }\n}";
        const output = transpiler.transpileRust(input).content;
        expect(output).toContain('let mut n: Value = Value::Float(1.5);');
    });

    test('a literal rust cannot parse keeps the native match', () => {
        const input = "class A {\n    f () {\n        const n = parseInt ('x9');\n        return n;\n    }\n}";
        const output = transpiler.transpileRust(input).content;
        expect(output).toContain('.trim().parse::<i64>()');
        expect(output).not.toContain('parseInt(');
    });

    test('a native parse stays native in an argument position', () => {
        const input = "class A {\n    f (x: string) {\n        return this.g (parseInt (x), 2);\n    }\n}";
        const output = transpiler.transpileRust(input).content;
        expect(output).toContain(`return self.g(${nativeInt}, Value::Int(2));`);
    });
});

describe('rust native value predicates and json', () => {
    // `Array.isArray` / `typeof … === '…'` over a declared `Value` place inline
    // the runtime helper's own `matches!`; other operands keep the helper.
    test('Array.isArray on a declared local emits the native match', () => {
        const ts = "function f(response: any) {\n    if (Array.isArray(response)) {\n        return response;\n    }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if (matches!(&response, Value::Arr(_))) {');
        expect(output).not.toContain('is_array(');
    });

    test('Array.isArray on a declared field emits the native match', () => {
        const ts = "class A {\n    x: any;\n    f() {\n        if (Array.isArray(this.x)) {\n            return 1;\n        }\n    }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if (matches!(&self.x, Value::Arr(_))) {');
        expect(output).not.toContain('is_array(');
    });

    test('Array.isArray on a call result keeps the helper', () => {
        const ts = "function g(): any { return []; }\nfunction f() {\n    if (Array.isArray(g())) {\n        return 1;\n    }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_array(&g())');
        expect(output).not.toContain('matches!(&g()');
    });

    test('typeof string in a condition emits the native match', () => {
        const ts = "function f(code: any) {\n    if (typeof code === 'string') {\n        return code;\n    }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if matches!(&code, Value::Str(_))');
        expect(output).not.toContain('is_string(');
    });

    test('negated typeof string emits the negated native match', () => {
        const ts = "function f(value: any) {\n    if (typeof value !== 'string') {\n        return 1;\n    }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('if !matches!(&value, Value::Str(_))');
        expect(output).not.toContain('is_string(');
    });

    test('typeof boolean / number / object emit their native matches', () => {
        const ts = "function f(value: any) {\n    if (typeof value === 'boolean') { return 1; }\n    if (typeof value === 'number') { return 2; }\n    if (typeof value === 'object') { return 3; }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('matches!(&value, Value::Bool(_))');
        expect(output).toContain('matches!(&value, Value::Int(_) | Value::Float(_))');
        expect(output).toContain('matches!(&value, Value::Dict(_))');
        expect(output).not.toContain('is_bool(');
        expect(output).not.toContain('is_number(');
        expect(output).not.toContain('is_object(');
    });

    test('typeof string in a Value position boxes the native match', () => {
        const ts = "function f(code: any) {\n    let flag = typeof code === 'string';\n    return flag;\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut flag: Value = Value::Bool(matches!(&code, Value::Str(_)));');
    });

    test('typeof string on a call result keeps the helper', () => {
        const ts = "function g(): any { return 1; }\nfunction f() {\n    if (typeof g() === 'string') {\n        return 1;\n    }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('is_string(&g())');
        expect(output).not.toContain('matches!(&g()');
    });

    test('this.json on a local calls the free json_stringify', () => {
        const ts = "class A {\n    id: any;\n    f(params: any) {\n        return this.json(params);\n    }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('return json_stringify(&params);');
        expect(output).not.toContain('self.json(');
    });

    test('this.json drops the argument clone the method signature forced', () => {
        const ts = "class A {\n    id: any;\n    f(query: any) {\n        let body = this.json(query.clone());\n        return body;\n    }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut body: Value = json_stringify(&query);');
        expect(output).not.toContain('query.clone()');
    });

    test('this.json on a self field keeps the method call', () => {
        const ts = "class A {\n    id: any;\n    params: any;\n    f() {\n        return this.json(this.params);\n    }\n}\n";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('self.json(self.params');
        expect(output).not.toContain('json_stringify');
    });
});

describe('rust typed-parameter dict reads', () => {
    const DICT_DECL =
        "interface Dictionary<T> { [key: string]: T; }\n" +
        "type Dict = Dictionary<any>;\n";

    test('dynamic string key on a Dict parameter emits a native read', () => {
        const ts = DICT_DECL +
            "function f (balance: Dict, code: string) {\n" +
            "    return balance[code];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(
            '(if let (Some(__m), Some(__k)) = (balance.as_map(), code.as_str()) { __m.get(__k).cloned().unwrap_or(Value::Null) } else { Value::Null })');
        expect(output).not.toContain('get_value(&balance');
    });

    test('dynamic Str key (string | undefined) is still a proven string key', () => {
        const ts = DICT_DECL +
            "type Str = string | undefined;\n" +
            "function f (balance: Dict, code: Str) {\n" +
            "    return balance[code];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(if let (Some(__m), Some(__k)) = (balance.as_map(), code.as_str())');
        expect(output).not.toContain('get_value(&balance');
    });

    test('numeric key on a Dict parameter keeps the helper', () => {
        const ts = DICT_DECL +
            "function f (balance: Dict, i: number) {\n" +
            "    return balance[i];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value(&balance');
    });

    test('any-typed receiver keeps the dynamic read helper', () => {
        const ts =
            "function f (balance: any, code: string) {\n" +
            "    return balance[code];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value(&balance');
    });

    test('a reassigned Dict parameter keeps the helper (D2)', () => {
        const ts = DICT_DECL +
            "function g (): any { return []; }\n" +
            "function f (balance: Dict, code: string) {\n" +
            "    balance = g ();\n" +
            "    return balance[code];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value(&balance');
    });

    test('a union alias with undefined proves the dict for a literal key', () => {
        const ts =
            "interface MarketInterface { id: string; }\n" +
            "type Market = MarketInterface | undefined;\n" +
            "function f (market: Market) {\n" +
            "    return market['id'];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('market.as_map().and_then(|__m| __m.get("id"))');
        expect(output).not.toContain('get_value(&market');
    });

    test('a union with a non-dict member keeps the helper', () => {
        const ts =
            "interface MarketInterface { id: string; }\n" +
            "type Market = MarketInterface | undefined | number;\n" +
            "function f (market: Market) {\n" +
            "    return market['id'];\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value_k(&market, \"id\")');
        expect(output).not.toContain('.as_map()');
    });
});

describe('rust native container reads on typed receivers', () => {
    // A dynamic (non-literal) index into a checker-proven list reads natively,
    // a declared Dict local produced by `this.client(url)` reads its `url`
    // field natively, and a read the ccxt write passes have to see keeps the
    // helper.

    const DYNAMIC = '.as_array().and_then(|__arr| match &i { Value::Int(__n) => __arr.get(*__n as usize), Value::Str(__s) => __s.parse::<usize>().ok().and_then(|__n| __arr.get(__n)), _ => None }).cloned().unwrap_or(Value::Null)';
    // A list parameter that is shadowed reads its slice directly.
    // (an i64 loop counter indexes it as usize)
    const SHADOW_DYNAMIC = '.get(i as usize).cloned().unwrap_or(Value::Null)';

    test('a dynamic index into a proven list reads natively', () => {
        const ts =
            'class T {\n' +
            '    m(symbols: string[]) {\n' +
            '        for (let i = 0; i < symbols.length; i++) {\n' +
            '            const symbol = symbols[i];\n' +
            '            return symbol;\n' +
            '        }\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(`let mut symbol: Value = symbols${SHADOW_DYNAMIC};`);
        expect(output).not.toContain(DYNAMIC);
        expect(output).not.toContain('get_value(&symbols, &i)');
    });

    test('a dynamic index into an unproven receiver keeps the helper', () => {
        const ts =
            'class T {\n' +
            '    m(symbols) {\n' +
            '        for (let i = 0; i < symbols.length; i++) {\n' +
            '            const symbol = symbols[i];\n' +
            '            return symbol;\n' +
            '        }\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut symbol: Value = get_value(&symbols, &i);');
        expect(output).not.toContain(DYNAMIC);
    });

    test('an index whose local is not a numeric-literal declaration keeps the helper', () => {
        const ts =
            'class T {\n' +
            '    m(symbols: string[], start: number) {\n' +
            '        let i = start;\n' +
            '        while (i < 2) {\n' +
            '            const symbol = symbols[i];\n' +
            '            i = i + 1;\n' +
            '        }\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value(&symbols, &i)');
        expect(output).not.toContain(DYNAMIC);
    });

    test('a string key on a proven list keeps the helper', () => {
        const ts =
            'class T {\n' +
            '    m(symbols: string[], key: string) {\n' +
            '        return symbols[key];\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value(&symbols, &key)');
    });

    test('a declared Dict local from this.client(url) reads its url natively', () => {
        const ts =
            'class T {\n' +
            '    m(url) {\n' +
            "        const client = this.client(url);\n" +
            '        return client.url;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('client.as_map().and_then(|__m| __m.get("url")).cloned().unwrap_or(Value::Null)');
        expect(output).not.toContain('get_value(&client');
    });

    test('live client fields (subscriptions / futures) keep the helper', () => {
        const ts =
            'class T {\n' +
            '    m(url) {\n' +
            "        const client = this.client(url);\n" +
            "        return client['subscriptions'];\n" +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value(&client, &Value::Str("subscriptions".into()))');
        expect(output).not.toContain('__m.get("subscriptions")');
    });

    test('a property write on a client handle keeps the helper (the ccxt pass rewrites it)', () => {
        const ts =
            'class T {\n' +
            '    m(url) {\n' +
            "        const client = this.client(url);\n" +
            '        client.lastPong = 1;\n' +
            '        return client.url;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('client.lastPong = Value::Int(1);');
        expect(output).not.toContain('__m.get("lastPong")).cloned().unwrap_or(Value::Null) =');
    });

    test('an element write through a client field keeps the helper for the base', () => {
        const ts =
            'class T {\n' +
            '    m(url) {\n' +
            "        const client = this.client(url);\n" +
            "        client['subscriptions']['hash'] = 1;\n" +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('add_element_to_object(get_value_mut(&mut client, &Value::Str("subscriptions".into())), &Value::Str("hash".into()), Value::Int(1));');
        expect(output).not.toContain('get_value(&client.as_map()');
    });

    test('a Client-typed class outside the ws client path is not a handle', () => {
        const ts =
            'class Client {\n' +
            '    url: any;\n' +
            '}\n' +
            'class T {\n' +
            '    m(client: Client) {\n' +
            '        return client.url;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('client.url');
        expect(output).not.toContain('__m.get("url")');
    });

    test('a Client-typed parameter of the ws Client class is a handle', () => {
        // The fixture lives under a `ws/Client.ts` path, the shape the predicate
        // keys on (the class is the ws client; the port holds it as a Dict).
        const output = transpiler.transpileRustByPath('./tests/files/input/ws/Client.ts').content;
        expect(output).toContain('client.url()');
        expect(output).not.toContain('__m.get("url")');
        expect(output).not.toContain('get_value(&client, &Value::Str("url"');
        expect(output).toContain('let mut s: Value = client.subscriptions;');
    });

    test('a bind the next statement mutates is the closure-free read the write-back pass recognises', () => {
        const ts =
            'class T {\n' +
            '    m(data: any[]) {\n' +
            '        for (let i = 0; i < data.length; i++) {\n' +
            '            const entry = data[i];\n' +
            "            entry['page'] = 1;\n" +
            '            return entry;\n' +
            '        }\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut entry: Value = get_value(&data, &i);');
        expect(output).not.toContain(DYNAMIC);
    });

    test('a bind whose next statement does not mutate reads natively', () => {
        const ts =
            'class T {\n' +
            '    m(data: any[]) {\n' +
            '        for (let i = 0; i < data.length; i++) {\n' +
            '            const entry = data[i];\n' +
            '            const other = data[i];\n' +
            '            return entry;\n' +
            '        }\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(`let mut entry: Value = data${SHADOW_DYNAMIC};`);
        expect(output).not.toContain('let mut entry: Value = get_value(&data, &i);');
    });

});

describe('rust destructure over an array-returning callee', () => {
    // The `handle*AndParams` family (and its exchange overrides) declares
    // `any`, so the checker cannot prove the `[T, Dict]` tuple the body always
    // builds; the resolved callee's returns are the proof instead.
    const ANY_TUPLE_CALLEE =
        "class E {\n" +
        "    handleWithdrawTagAndParams (tag: any, params: any): any {\n" +
        "        return [ tag, params ];\n" +
        "    }\n" +
        "    withdraw (tag: any, params: any) {\n" +
        "        [ tag, params ] = this.handleWithdrawTagAndParams (tag, params);\n" +
        "        return tag;\n" +
        "    }\n" +
        "}";

    test('reassignment destructure over an any-typed tuple callee emits native reads', () => {
        const output = transpiler.transpileRust(ANY_TUPLE_CALLEE).content;
        expect(output).toContain('{ let __destr_tmp: Vec<Value> = self.handleWithdrawTagAndParams(tag, params).as_array().cloned().unwrap_or_default(); tag = __destr_tmp.get(0).cloned().unwrap_or(Value::Null)');
        expect(output).not.toContain('get_value(&__destr_tmp');
    });

    test('declaration destructure over an any-typed tuple callee emits native reads', () => {
        const ts =
            "class E {\n" +
            "    prepare (code: any, params: any): any { return [ code, params ]; }\n" +
            "    f (code: any, params: any) {\n" +
            "        const [ request, extraParams ] = this.prepare (code, params);\n" +
            "        return request;\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut request: Value = requestextraParamsVariable.get(0).cloned().unwrap_or(Value::Null)');
        expect(output).not.toContain('get_value(&requestextraParamsVariable');
    });

    test('a callee delegating to another array-returning method emits native reads', () => {
        const ts =
            "class E {\n" +
            "    inner (a: any, b: any): any { return [ a, b ]; }\n" +
            "    handleX (a: any, b: any): any { return this.inner (a, b); }\n" +
            "    f (a: any, b: any) {\n" +
            "        [ a, b ] = this.handleX (a, b);\n" +
            "        return a;\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('a = __destr_tmp.get(0).cloned().unwrap_or(Value::Null)');
        expect(output).not.toContain('get_value(&__destr_tmp');
    });

    test('a super-call override emits native reads', () => {
        const ts =
            "class A {\n" +
            "    handleX (a: any, b: any): any { if (a) { return [ a, b ]; } return [ a, b ]; }\n" +
            "}\n" +
            "class B extends A {\n" +
            "    handleX (a: any, b: any): any { return super.handleX (a, b); }\n" +
            "    f (a: any, b: any) {\n" +
            "        [ a, b ] = this.handleX (a, b);\n" +
            "        return a;\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('a = __destr_tmp.get(0).cloned().unwrap_or(Value::Null)');
        expect(output).not.toContain('get_value(&__destr_tmp');
    });

    test('string split destructure emits native reads (runtime split always yields an array)', () => {
        const ts =
            "function f (addressString: any) {\n" +
            "    let address: any = undefined;\n" +
            "    let rawTag: any = undefined;\n" +
            "    [ address, rawTag ] = addressString.split ('?');\n" +
            "    return address;\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('{ let __destr_tmp: Vec<Value> = split(&addressString');
        expect(output).not.toContain('get_value(&__destr_tmp');
    });

    test('a callee returning a non-array keeps the helper', () => {
        const ts =
            "class E {\n" +
            "    handleX (a: any, b: any): any { return a; }\n" +
            "    f (a: any, b: any) {\n" +
            "        [ a, b ] = this.handleX (a, b);\n" +
            "        return a;\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('a = get_value(&__destr_tmp, &Value::Int(0))');
    });

    test('an unresolved callee keeps the helper', () => {
        const ts = "function f (g: any, a: any, b: any) {\n    [ a, b ] = g ();\n    return a;\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('a = get_value(&__destr_tmp, &Value::Int(0))');
    });

    test('a callee that never returns a value keeps the helper', () => {
        const ts =
            "class E {\n" +
            "    handleX (a: any, b: any): any { throw new Error ('x'); }\n" +
            "    f (a: any, b: any) {\n" +
            "        [ a, b ] = this.handleX (a, b);\n" +
            "        return a;\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('a = get_value(&__destr_tmp, &Value::Int(0))');
    });
});

describe('rust parameter shadows', () => {
    const DICT_DECL =
        "interface Dictionary<T> { [key: string]: T; }\n" +
        "type Dict = Dictionary<any>;\n";

    test('a Dict parameter read but never written is shadowed at fn entry', () => {
        const ts = DICT_DECL +
            "class C {\n" +
            "    f (data: Dict): any {\n" +
            "        return data['id'];\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let __data_empty = indexmap::IndexMap::new();');
        expect(output).toContain('let data = data.as_map().unwrap_or(&__data_empty);');
        expect(output).toContain('return data.get("id").cloned().unwrap_or(Value::Null);');
        expect(output).not.toContain('get_value(&data');
    });

    test('a dynamic string key reads through the shadow', () => {
        const ts = DICT_DECL +
            "class C {\n" +
            "    f (data: Dict, code: string): any {\n" +
            "        return data[code];\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let data = data.as_map().unwrap_or(&__data_empty);');
        expect(output).toContain('(if let Some(__k) = code.as_str() { data.get(__k).cloned().unwrap_or(Value::Null) } else { Value::Null })');
    });

    test('a `this.safeString` read inlines the coercion over the shadow', () => {
        const ts = DICT_DECL +
            "class C {\n" +
            "    f (data: Dict): any {\n" +
            "        const id = this.safeString (data, 'id');\n" +
            "        return id;\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let data = data.as_map().unwrap_or(&__data_empty);');
        expect(output).toContain('match data.get("id") { Some(Value::Str(__s)) if !__s.is_empty() => Value::Str(__s.clone()), Some(Value::Int(__n)) => Value::Str(__n.to_string().into()), Some(Value::Float(__f)) => Value::Str(__f.to_string().into()), _ => Value::Null }');
        expect(output).not.toContain('self.safeString(data');
    });

    test('a `this.safeBool` read keeps its default argument', () => {
        const ts = DICT_DECL +
            "class C {\n" +
            "    f (data: Dict): any {\n" +
            "        const ok = this.safeBool (data, 'ok', false);\n" +
            "        return ok;\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('match data.get("ok") { Some(Value::Bool(__b)) => Value::Bool(*__b), _ => Value::Bool(false) }');
    });

    test('the `in` operator reads the shadow', () => {
        const ts = DICT_DECL +
            "class C {\n" +
            "    f (data: Dict): any {\n" +
            "        return 'id' in data;\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Value::Bool(data.contains_key("id"))');
    });

    test('a List parameter reads length and literal indices natively', () => {
        const ts =
            "class C {\n" +
            "    f (rows: Array<any>): any {\n" +
            "        const n = rows.length;\n" +
            "        return rows[0];\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let __rows_empty = Vec::new();');
        expect(output).toContain('let rows = rows.as_array().unwrap_or(&__rows_empty);');
        expect(output).toContain('let mut n: Value = Value::Int(rows.len() as i64);');
        expect(output).toContain('return rows.get(0).cloned().unwrap_or(Value::Null);');
    });

    test('a typed i64 counter indexes a List parameter shadow directly', () => {
        const ts =
            "class C {\n" +
            "    f (ids: string[]): any {\n" +
            "        const out = [];\n" +
            "        for (let i = 0; i < ids.length; i++) {\n" +
            "            out.push (this.g (ids[i]));\n" +
            "        }\n" +
            "        return out;\n" +
            "    }\n" +
            "    g (x: any): any { return x; }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut i: i64 = 0;');
        expect(output).toContain('ids.get(i as usize).cloned().unwrap_or(Value::Null)');
        expect(output).not.toContain('as_i64().unwrap_or(-1) as usize');
    });

    test('returning the parameter keeps the box (D2/census)', () => {
        const ts = DICT_DECL +
            "class C {\n" +
            "    f (data: Dict): any {\n" +
            "        const id = data['id'];\n" +
            "        return data;\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).not.toContain('__data_empty');
        expect(output).toContain('data.as_map().and_then(|__m| __m.get("id")).cloned().unwrap_or(Value::Null)');
    });

    test('a written key keeps the box', () => {
        const ts = DICT_DECL +
            "class C {\n" +
            "    f (data: Dict): any {\n" +
            "        data['id'] = 1;\n" +
            "        return data['id'];\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).not.toContain('__data_empty');
        // the boxed write is the native insert on the (unshadowed) Value
        expect(output).toContain('if let Value::Dict(__d) = &mut data { std::sync::Arc::make_mut(__d).insert("id".into(), Value::Int(1)); };');
    });

    test('passing the parameter to another method keeps the box', () => {
        const ts = DICT_DECL +
            "class C {\n" +
            "    f (data: Dict): any {\n" +
            "        const id = data['id'];\n" +
            "        return this.other (data);\n" +
            "    }\n" +
            "    other (d: Dict): any { return d; }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).not.toContain('__data_empty');
    });

    test('a marker-route key name keeps the box', () => {
        const ts = DICT_DECL +
            "class C {\n" +
            "    f (data: Dict): any {\n" +
            "        return data['subscriptions'];\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).not.toContain('__data_empty');
        expect(output).toContain('data.as_map().and_then(|__m| __m.get("subscriptions"))');
    });
});

describe('rust native Option<String> returns for `: Str` methods', () => {
    // An internal, non-override, non-async method declared `: Str` returns a
    // native `Option<String>` when every `return` in its own body converts
    // (`X.as_str().map(str::to_owned)`, or `None` for a nullish literal); a
    // call site that still needs a `Value` boxes the result back with the exact
    // inverse, and a local whose uses are all native sinks binds the
    // `Option<String>` directly.
    const HEAD = "type Str = string | undefined;\n";

    test('a proven `: Str` method returns Option<String> with the conversion', () => {
        const ts = HEAD + "class E {\n    parseStatus (status: any): Str {\n        return 'open';\n    }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('pub fn parseStatus(&self, status: Value) -> Option<String>');
        expect(output).toContain('return Value::Str("open".into()).as_str().map(str::to_owned);');
    });

    test('a nullish return becomes the None arm', () => {
        const ts = HEAD +
            "class E {\n    parseStatus (status: any): Str {\n" +
            "        if (status === undefined) { return undefined; }\n" +
            "        return 'open';\n    }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('pub fn parseStatus(&self, status: Value) -> Option<String>');
        expect(output).toContain('return None;');
    });

    test('a body whose last statement is not a return keeps -> Value', () => {
        const ts = HEAD +
            "class E {\n    parseStatus (status: any): Str {\n" +
            "        if (status === undefined) { return undefined; }\n    }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('pub fn parseStatus(&self, status: Value) -> Value');
        expect(output).not.toContain('Option<String>');
    });

    test('a return the checker cannot prove is a string keeps -> Value', () => {
        const ts = HEAD +
            "class E {\n    parseStatus (status: any): Str {\n" +
            "        return this.safeValue (status);\n    }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('pub fn parseStatus(&self, status: Value) -> Value');
        expect(output).not.toContain('Option<String>');
    });

    test('an override keeps the boxed signature', () => {
        const ts = HEAD +
            "class A {\n    parseStatus (status: any): Str { return 'x'; }\n}\n" +
            "class E extends A {\n    override parseStatus (status: any): Str { return 'y'; }\n}";
        const output = transpiler.transpileRust(ts).content;
        const overridden = output.split('class E')[1] ?? output;
        expect(output).toContain('pub fn parseStatus(&self, status: Value) -> Option<String>');
        expect(output.match(/pub fn parseStatus\(&self, status: Value\) -> Value \{/g)?.length).toBe(1);
        expect(overridden.length).toBeGreaterThan(0);
    });

    test('a Value-position call site boxes the native return back', () => {
        const ts = HEAD +
            "class E {\n    parseStatus (status: any): Str { return 'open'; }\n" +
            "    f (status: any) {\n        const m: any = {};\n" +
            "        m['status'] = this.parseStatus (status);\n        return m;\n    }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('.insert("status".into(), self.parseStatus(status).map(Value::from).unwrap_or(Value::Null));');
    });

    test('an assignment of a native return boxes', () => {
        const ts = HEAD +
            "class E {\n    parseStatus (status: any): Str { return 'open'; }\n" +
            "    f (status: any) {\n        let x: any = undefined;\n" +
            "        x = this.parseStatus (status);\n        return x;\n    }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('x = self.parseStatus(status).map(Value::from).unwrap_or(Value::Null);');
    });

    test('a declaration whose uses are not all native sinks stays a Value box', () => {
        const ts = HEAD +
            "class E {\n    parseStatus (status: any): Str { return 'open'; }\n" +
            "    f (status: any) {\n        const x = this.parseStatus (status);\n" +
            "        const m: any = {};\n        m['status'] = x;\n        return m;\n    }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut x: Value = self.parseStatus(status).map(Value::from).unwrap_or(Value::Null);');
    });

    test('a caller whose uses are all native sinks binds Option<String>', () => {
        const ts = HEAD +
            "class E {\n    parseStatus (status: any): Str { return 'open'; }\n" +
            "    f (status: any) {\n        const x = this.parseStatus (status);\n" +
            "        if (x === undefined) { return 'a'; }\n" +
            "        if (x === 'open') { return 'b'; }\n        return 'c';\n    }\n}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut x: Option<String> = self.parseStatus(status);');
        expect(output).not.toContain('let mut x: Value = self.parseStatus(status)');
    });
});

describe('rust typed-receiver native reads', () => {
    // A dynamic-key read on a checker-proven map local (not only on an
    // annotated parameter) reads natively, and a local/parameter read stays
    // native inside the args of a `&mut self` call while a `this`-field read
    // there keeps the helper the ccxt hoist pass needs.

    const PLAIN = 'interface Plain { [key: string]: any; }\n';

    test('a dynamic-key read on a checker-proven map local reads natively', () => {
        const ts =
            PLAIN +
            'class T {\n' +
            '    m(code: string) {\n' +
            '        const currencies: Plain = {};\n' +
            '        return currencies[code];\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('currencies.get(code.as_str().unwrap_or("")).cloned().unwrap_or(Value::Null)');
        expect(output).not.toContain('get_value(&currencies, &code)');
    });

    test('an any-typed local keeps the helper', () => {
        const ts =
            'class T {\n' +
            '    g(): any { return []; }\n' +
            '    m(code: string) {\n' +
            '        const currencies: any = this.g ();\n' +
            '        return currencies[code];\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value(&currencies, &code)');
        expect(output).not.toContain('currencies.as_map()');
    });

    test('a re-assigned local keeps the helper (D2)', () => {
        const ts =
            PLAIN +
            'class T {\n' +
            '    g(): any { return []; }\n' +
            '    m(code: string) {\n' +
            '        let currencies: Plain = {};\n' +
            '        currencies = this.g ();\n' +
            '        return currencies[code];\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value(&currencies, &code)');
    });

    test('a bind the next statement mutates is the closure-free read the write-back pass recognises', () => {
        const ts =
            PLAIN +
            'class T {\n' +
            '    m(key: string, vs: number[]) {\n' +
            '        const result: Plain = {};\n' +
            '        result[key] = [];\n' +
            '        for (let i = 0; i < vs.length; i++) {\n' +
            '            const row = result[key];\n' +
            '            row.push(vs[i]);\n' +
            '        }\n' +
            '        return result;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        // the ccxt write-back pass matches the printer's closure-free bind of the same container/key
        expect(output).toContain('let mut row: Value = (if let (Some(__m), Some(__k)) = (result.as_map(), key.as_str()) { __m.get(__k).cloned().unwrap_or(Value::Null) } else { Value::Null });');
        expect(output).not.toContain('row.as_map()');
    });

    test('a local read inside a &mut self call reads natively', () => {
        const ts =
            PLAIN +
            'class T {\n' +
            '    m(key: string, items: string[]) {\n' +
            '        const dict: Plain = {};\n' +
            '        return this.extend(dict, { "a": dict[key], "b": items[0] });\n' +
            '    }\n' +
            '    extend(a: any, b: any) { return a; }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        // the local is a typed bearer now, so the read is a plain map
        // lookup and the earlier `this.` argument boxes a clone (no `as_map` chain).
        expect(output).toContain('dict.get(key.as_str().unwrap_or("")).cloned().unwrap_or(Value::Null)');
        expect(output).toContain('return self.extend(Value::Map(dict.clone()), Value::Map({');
        expect(output).not.toContain('dict.as_map().and_then(|__m| key.as_str()');
        // the List parameter is shadowed, so the index reads on the borrowed slice
        expect(output).toContain('items.get(0).cloned().unwrap_or(Value::Null)');
        expect(output).not.toContain('get_value(&dict, &key)');
    });

    test('a self-field read inside a &mut self call keeps the helper', () => {
        const ts =
            PLAIN +
            'class T {\n' +
            '    dict: Plain;\n' +
            '    m(key: string) {\n' +
            '        return this.extend(this.dict, { "a": this.dict[key] });\n' +
            '    }\n' +
            '    extend(a: any, b: any) { return a; }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value(&self.dict, &key)');
        expect(output).not.toContain('self.dict.as_map()');
    });
});

describe('rust pro-tier handler message shadow', () => {
    // `Client` is a class in the pro tier (base/ws/Client.ts); the shadow is
    // scoped to the `handle_x (client: Client, message: Dict)` shape.
    // A parameter whose every use is a read gets the borrowed parameter shadow instead;
    // the handler view fires when the message is also passed on (a move the parameter
    // census rejects), so these fixtures forward the frame to the client.
    const DECLS =
        "interface Dictionary<T> { [key: string]: T; }\n" +
        "type Dict = Dictionary<any>;\n" +
        "class Client { resolve (v: any): void {} }\n";
    const SHADOW = 'let __pro_message: &indexmap::IndexMap<String, Value> = &__pro_message_arc;';

    test('a safeString read on the handler message param prints as a native .get match', () => {
        const ts = DECLS +
            "class T {\n" +
            "    handleTicker (client: Client, message: Dict): void {\n" +
            "        const channel = this.safeString (message, 'channel');\n" +
            "        client.resolve (channel);\n" +
            "        client.resolve (message);\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(SHADOW);
        expect(output).toContain('(match __pro_message.get("channel").cloned() { Some(Value::Str(__s)) if !__s.is_empty() => Value::Str(__s),');
        expect(output).not.toContain('self.safeString(message, Value::Str("channel"');
    });

    test('value/dict/list/bool reads print the helper value kinds natively', () => {
        const ts = DECLS +
            "class T {\n" +
            "    handleTicker (client: Client, message: Dict): void {\n" +
            "        const v = this.safeValue (message, 'any');\n" +
            "        const d = this.safeDict (message, 'payload');\n" +
            "        const l = this.safeList (message, 'data', []);\n" +
            "        const b = this.safeBool (message, 'ok', false);\n" +
            "        client.resolve (v); client.resolve (d); client.resolve (l); client.resolve (b);\n" +
            "        client.resolve (message);\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(match __pro_message.get("any").cloned() { Some(Value::Str(__s)) if __s.is_empty() => Value::Null, Some(__v) => __v, None => Value::Null })');
        expect(output).toContain('(match __pro_message.get("payload").cloned() { Some(__v) if matches!(__v, Value::Dict(_)) => __v, _ => Value::Null })');
        expect(output).toContain('(match __pro_message.get("data").cloned() { Some(__v) if matches!(__v, Value::Arr(_)) => __v, _ => Value::from(vec![]) })');
        expect(output).toContain('(match __pro_message.get("ok").cloned() { Some(__v) if matches!(__v, Value::Bool(_)) => __v, _ => Value::Bool(false) })');
    });

    test('the integer and float coercions mirror the runtime helper', () => {
        const ts = DECLS +
            "class T {\n" +
            "    handleTicker (client: Client, message: Dict): void {\n" +
            "        const n = this.safeInteger (message, 'count');\n" +
            "        const f = this.safeNumber (message, 'px');\n" +
            "        client.resolve (n); client.resolve (f);\n" +
            "        client.resolve (message);\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('Some(Value::Int(__n)) => Value::Int(__n), Some(Value::Float(__f)) => Value::Int(__f as i64), Some(Value::Str(__s)) if !__s.is_empty() => match __s.parse::<i64>()');
        expect(output).toContain('Some(Value::Float(__f)) => Value::Float(__f), Some(Value::Int(__n)) => Value::Float(__n as f64), Some(Value::Str(__s)) if !__s.is_empty() => match __s.parse::<f64>()');
    });

    test('a book-store key keeps the helper (marker routes cannot be proven away)', () => {
        const ts = DECLS +
            "class T {\n" +
            "    handleTicker (client: Client, message: Dict): void {\n" +
            "        const symbol = this.safeString (message, 'symbol');\n" +
            "        client.resolve (symbol);\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('self.safeString(message, Value::Str("symbol"');
        expect(output).not.toContain('__pro_message');
    });

    test('a non-handler method with a Dict param keeps the helper (scope is the pro tier)', () => {
        const ts = DECLS +
            "class T {\n" +
            "    parseWsTicker (message: Dict): void {\n" +
            "        const channel = this.safeString (message, 'channel');\n" +
            "        console.log (channel);\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        // read-only Dict param: the parameter shadow prints the read, never the handler view
        expect(output).toContain('let message = message.as_map().unwrap_or(&__message_empty);');
        expect(output).not.toContain('__pro_message');
    });

    test('a written message param keeps the helper (D2)', () => {
        const ts = DECLS +
            "class T {\n" +
            "    handleTrade (client: Client, message: Dict): void {\n" +
            "        message['k'] = 1;\n" +
            "        const channel = this.safeString (message, 'channel');\n" +
            "        client.resolve (channel);\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('self.safeString(message, Value::Str("channel"');
        expect(output).not.toContain('__pro_message');
    });

    test('a merge onto the message param keeps the helper (D2)', () => {
        const ts = DECLS +
            "class T {\n" +
            "    handleTrade (client: Client, message: Dict): void {\n" +
            "        const merged = this.deepExtend (message, { 'a': 1 });\n" +
            "        const channel = this.safeString (message, 'channel');\n" +
            "        client.resolve (merged); client.resolve (channel);\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).not.toContain('__pro_message');
    });

    test('other uses of the param print unchanged next to the shadow', () => {
        const ts = DECLS +
            "class T {\n" +
            "    parseWsTrade (m: Dict, market: any): void { console.log (m, market); }\n" +
            "    handleTicker (client: Client, message: Dict): void {\n" +
            "        const channel = this.safeString (message, 'channel');\n" +
            "        this.parseWsTrade (message, undefined);\n" +
            "        client.resolve (channel);\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain(SHADOW);
        expect(output).toContain('self.parseWsTrade(message, Value::Null);');
    });

    test('an unproven (any) message param keeps everything boxed', () => {
        const ts =
            "class Client { resolve (v: any): void {} }\n" +
            "class T {\n" +
            "    handleTicker (client: Client, message: any): void {\n" +
            "        const channel = this.safeString (message, 'channel');\n" +
            "        client.resolve (channel);\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).not.toContain('__pro_message');
    });

    test('no nativizable read emits no shadow (no dead binding)', () => {
        const ts = DECLS +
            "class T {\n" +
            "    handleSmall (client: Client, message: Dict): void {\n" +
            "        client.resolve (message);\n" +
            "    }\n" +
            "}";
        const output = transpiler.transpileRust(ts).content;
        expect(output).not.toContain('__pro_message');
    });
});

describe('rust order book sides keep the runtime helpers', () => {
    // A live WS book keeps bids/asks as side markers whose levels sit in the
    // side store; the checker's array type must not switch them to native
    // `.len()` / `.as_array()` reads, which only see the marker dict.
    test('bids of an OrderBook read through get_array_length and get_value', () => {
        const ts =
            'interface OrderBook { bids: [number, number][]; asks: [number, number][]; }\n' +
            'class T {\n' +
            '    m(orderbook: OrderBook) {\n' +
            '        const bids = orderbook[\'bids\'];\n' +
            '        const bidsLength = bids.length;\n' +
            '        const first = bids[0];\n' +
            '        for (let i = 0; i < bidsLength; i++) {\n' +
            '            const row = bids[i];\n' +
            '        }\n' +
            '        return first;\n' +
            '    }\n' +
            '}';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_array_length(&bids)');
        expect(output).toContain('get_value(&bids, &Value::Int(0))');
        expect(output).toContain('get_value(&bids, &i)');
        expect(output).not.toContain('bids.len()');
        expect(output).not.toContain('bids.as_array()');
    });
});

describe('native element writes on plain-dict locals', () => {
    let output = '';
    beforeAll(() => {
        output = transpiler.transpileRustByPath('./tests/files/input/hx4r01/ts/src/venue.ts').content;
    });

    test('a base-tier account () builder local inserts natively (sibling-block bindings)', () => {
        expect(output).toContain(insert('account', 'free', 'Value::Str("1".into())'));
        expect(output).toContain(insert('account', 'used', 'Value::Str("0".into())'));
        expect(output).not.toContain('add_element_to_object(&mut account');
    });

    test('an undefined-initialised local reassigned only to literals inserts natively', () => {
        expect(output).toContain(insert('headers', 'Content-Type', 'Value::Str("application/json".into())'));
    });

    test('element 0 of handleUntilOption on a plain request inserts natively', () => {
        expect(output).toContain(insert('requestUntil', 'interval', 'Value::Str("1m".into())'));
    });

    test('a parse* result, a non-plain reassignment and a closure write keep the helper', () => {
        expect(output).toContain('add_element_to_object(&mut order, &Value::Str("status".into())');
        expect(output).toContain('add_element_to_object(&mut mixed, &Value::Str("k".into())');
        expect(output).toContain('add_element_to_object(&mut captured, &Value::Str("free".into())');
    });

    test('omit of itself / extend of plain dicts keep the local plain', () => {
        expect(output).toContain(insert('request', 'b', 'Value::Int(2)'));
        expect(output).toContain(insert('merged', 'd', 'Value::Int(4)'));
    });

    test('a local aliased into a let-bound literal keeps the helper', () => {
        expect(output).toContain('add_element_to_object(&mut aliased, &Value::Str("Content-Type".into())');
    });

    test('element 0 of a same-file tuple method returning a fresh literal inserts natively', () => {
        expect(output).toContain(insert('request', 'settle', 'Value::Str("usdt".into())'));
        expect(output).toContain('add_element_to_object(&mut echoed, &Value::Str("x".into())');
    });

    test('omit / extend of a foreign dict keep the helper', () => {
        expect(output).toContain('add_element_to_object(&mut foreign, &Value::Str("e".into())');
        expect(output).toContain('add_element_to_object(&mut extended, &Value::Str("f".into())');
    });
});

describe('rust this-field dynamic dict reads', () => {
    const DECL = 'interface Dictionary<T> { [key: string]: T; }\ntype Dict = Dictionary<any>;\nclass C { x: number; }\n';

    test('a dynamic string key on a Dict-declared field reads natively', () => {
        const ts = DECL + 'class A {\n    balance: Dict = {};\n    f (code: string) {\n        const a = this.balance[code];\n        return a;\n    }\n}\n';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('let mut a: Value = (if let (Some(__m), Some(__k)) = (self.balance.as_map(), code.as_str()) { __m.get(__k).cloned().unwrap_or(Value::Null) } else { Value::Null });');
        expect(output).not.toContain('get_value(&self.balance');
    });

    test('a nested read on a Dictionary<Dictionary<T>> field reads natively at both levels', () => {
        const ts = DECL + 'class A {\n    ohlcvs: Dictionary<Dictionary<C>>;\n    f (symbol: string, tf: string) {\n        const a = this.ohlcvs[symbol][tf];\n        return a;\n    }\n}\n';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('(if let (Some(__m), Some(__k)) = (self.ohlcvs.as_map(), symbol.as_str()) { __m.get(__k).cloned().unwrap_or(Value::Null) } else { Value::Null }).as_map().and_then(|__m| tf.as_str().and_then(|__k| __m.get(__k))).cloned().unwrap_or(Value::Null)');
        expect(output).not.toContain('get_value(');
    });

    test('an any-declared field keeps the helper', () => {
        const ts = DECL + 'class A {\n    positions: any;\n    f (code: string) {\n        return this.positions[code];\n    }\n}\n';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value(&self.positions, &code)');
    });

    test('a numeric key and write targets keep the helper', () => {
        const ts = DECL + 'class A {\n    balance: Dict = {};\n    f (code: string, n: number) {\n        this.balance[code] = this.g (this.balance[code]);\n        delete this.balance[code];\n        return this.balance[n];\n    }\n    g (x) { return x; }\n}\n';
        const output = transpiler.transpileRust(ts).content;
        expect(output).toContain('get_value(&self.balance, &n)');
        expect(output).toContain('self.g(get_value(&self.balance, &code))');
        expect(output).not.toContain('self.balance.as_map()');
    });
});

describe('native Vec push on typed array locals', () => {
    const wrap = (body: string) => `class T {\n    parseX (x) { return x; }\n    filterBy (a, b) { return a; }\n    f (items: any[]) {\n${body}\n    }\n}`;
    test('push-only local returned is a Vec<Value> with native push', () => {
        const out = transpiler.transpileRust(wrap('        const result = [];\n        result.push (items[0]);\n        result.push (this.parseX (1));\n        return result;')).content;
        expect(out).toContain('let mut result: Vec<Value> = Vec::new();');
        expect(out).toContain('result.push(self.parseX(Value::Int(1)));');
        expect(out).toContain('return Value::from(result);');
        expect(out).not.toContain('append_to_array');
    });
    test('length read and this-call argument in a return box once', () => {
        const out = transpiler.transpileRust(wrap('        const result = [];\n        const item = items[0];\n        result.push (item);\n        const n = result.length;\n        return this.filterBy (result, n);')).content;
        expect(out).toContain('result.push(item.clone());');
        expect(out).toContain('Value::Int(result.len() as i64)');
        expect(out).toContain('return self.filterBy(Value::from(result), n);');
    });
    test('final-use argument / object value outside a loop box once', () => {
        const out = transpiler.transpileRust(wrap('        const args = [];\n        args.push (items[0]);\n        const request = { \'args\': args };\n        return this.parseX (request);')).content;
        expect(out).toContain('let mut args: Vec<Value> = Vec::new();');
        expect(out).toContain('Value::from(args)');
        const out2 = transpiler.transpileRust(wrap('        const hashes = [];\n        hashes.push (1);\n        const r = this.filterBy (hashes, 1);\n        return r;')).content;
        expect(out2).toContain('self.filterBy(Value::from(hashes), Value::Int(1))');
    });
    test('a non-empty literal seed types as a Vec with the native literal', () => {
        const out = transpiler.transpileRust(wrap('        const out = [ 1 ];\n        out.push (2);\n        return out;')).content;
        expect(out).toContain('let mut out: Vec<Value> = vec![Value::Int(1)];');
        expect(out).toContain('out.push(Value::Int(2));');
        expect(out).toContain('return Value::from(out);');
        expect(out).not.toContain('append_to_array');
    });
    test('negative: alias, non-return argument or element read keep the box', () => {
        for (const body of [
            '        const out = [];\n        out.push (1);\n        const other = out;\n        return other;',
            '        const out = [];\n        for (let i = 0; i < 2; i++) {\n            out.push (i);\n            this.parseX (out);\n        }\n        return 1;',
            '        const out = [];\n        out.push (1);\n        return this.filterBy (out, out);',
            '        const out = [];\n        out.push (out.length);\n        return out;',
            '        let out = [];\n        out.push (1);\n        out = [];\n        return out;',
        ]) {
            const out = transpiler.transpileRust(wrap(body)).content;
            // the box stays (the Arr push may be spelled natively)
            expect(out).toMatch(/append_to_array\(&mut out|if let Value::Arr\(__a\) = &mut out \{/);
            expect(out).not.toContain('Vec<Value>');
        }
    });
});

describe('native IndexMap ops on proven dict receivers', () => {
    let rest = '';
    let ws = '';
    beforeAll(() => {
        rest = transpiler.transpileRustByPath('./tests/files/input/hx4r05/ts/src/venue.ts').content;
        ws = transpiler.transpileRustByPath('./tests/files/input/hx4r05/ts/src/pro/venue.ts').content;
    });

    test('k in this.<dict field> reads contains_key', () => {
        expect(rest).toContain('matches!((&self.balance, &code), (Value::Dict(__d), Value::Str(__k)) if __d.contains_key(__k.as_ref()))');
        expect(ws).toContain('matches!((&self.orderbooks, &symbol), (Value::Dict(__d), Value::Str(__k)) if __d.contains_key(__k.as_ref()))');
    });

    test('delete on a dict field / literal-built local is shift_remove', () => {
        expect(rest).toContain('if let (Value::Dict(__d), Value::Str(__k)) = (&mut self.balance, &code) { std::sync::Arc::make_mut(__d).shift_remove(__k.as_ref()); }');
        expect(rest).toContain('if let Value::Dict(__d) = &mut request { std::sync::Arc::make_mut(__d).shift_remove("a"); }');
        expect(ws).toContain('if let Value::Dict(__d) = &mut plain { std::sync::Arc::make_mut(__d).shift_remove("k"); }');
    });

    test('Object.keys / Object.values on REST dicts and untagged fields are native', () => {
        expect(rest).toContain('Value::Array(query.as_map().map(|__m| __m.keys().map(|__k| Value::Str(__k.clone().into())).collect()).unwrap_or_default())');
        expect(rest).toContain('Value::Array(self.tickers.as_map().map(|__m| __m.values().cloned().collect()).unwrap_or_default())');
        expect(ws).toContain('Value::Array(self.orderbooks.as_map().map(|__m| __m.keys()');
    });

    test('any receivers, ws subscriptions and non-dict operands keep the helpers', () => {
        expect(rest).toContain('remove(&mut response, &Value::Str("x".into()))');
        expect(rest).toContain('in_op(&response, &code)');
        expect(rest).toContain('object_keys(&flag)');
        expect(ws).toContain('in_op(&client.subscriptions, &messageHash)');
        expect(ws).toContain('remove(&mut client.subscriptions, &messageHash)');
        expect(ws).toContain('remove(&mut subs, &messageHash)');
        expect(ws).toContain('remove(&mut subscription, &symbol)');
    });
});

describe('native string methods on proven strings', () => {
    const m = (body: string, params = 'a: string') => `class A {\n    run(${params}) {\n${body}\n    }\n}`;
    const out = (body: string, params?: string) => transpiler.transpileRust(m(body, params)).content;

    test('toUpperCase / toLowerCase', () => {
        const o = out("        const u = a.toUpperCase();\n        const l = a.toLowerCase();\n        return [u, l];");
        expect(o).toContain('let mut u: Value = (if let Some(__s) = a.as_str() { Value::Str(__s.to_uppercase().into()) } else { Value::Null });');
        expect(o).toContain('let mut l: Value = (if let Some(__s) = a.as_str() { Value::Str(__s.to_lowercase().into()) } else { Value::Null });');
        expect(o).not.toContain('to_upper(&');
    });
    test('split with a literal separator', () => {
        expect(out("        return a.split('-');")).toContain('return Value::Array(if let Some(__s) = a.as_str() { __s.split("-").map(Value::from).collect() } else { Vec::new() });');
    });
    test('replace keeps the receiver for a non-string box', () => {
        expect(out("        return a.replace('x', 'y');")).toContain('return a.as_str().map(|__s| Value::Str(__s.replace("x", "y").into())).unwrap_or_else(|| a.clone());');
    });
    test('padStart with a one-char pad', () => {
        expect(out("        return a.padStart(64, '0');")).toContain('return a.as_str().map(|__s| Value::Str(format!("{:0>64}", __s).into())).unwrap_or(Value::Null);');
        expect(out("        return a.padStart(8, '00');")).toContain('pad_start(&a,');
    });
    test('startsWith / endsWith in a condition', () => {
        const o = out("        if (a.startsWith('0x') || a.endsWith('%')) {\n            return 1;\n        }\n        return 0;");
        expect(o).toContain('a.as_str().unwrap_or("").starts_with("0x")');
        expect(o).toContain('a.as_str().unwrap_or("").ends_with("%")');
        expect(o).not.toContain('starts_with(&a');
    });
    test('indexOf with a proven-string identifier needle', () => {
        expect(out('        return a.indexOf(b);', 'a: string, b: string')).toContain('Value::Int(a.as_str().zip(b.as_str()).and_then(|(__s, __n)| __s.find(__n)).map(|__i| __i as i64).unwrap_or(-1))');
    });
    test('join on a string[]', () => {
        expect(out("        return xs.join(',');", 'xs: string[]')).toContain('Value::Str(xs.join(",").into())');
    });
    test('unproven receivers keep the helpers', () => {
        const o = out("        const u = a.toUpperCase();\n        const p = a.split(',');\n        const j = xs.join(',');\n        const r = a.replace('x', 'y');\n        return [u, p, j, r, a.startsWith('x')];", 'a: any, xs: any[]');
        expect(o).toContain('(if let Some(__s) = (a).as_str() { Value::Str(__s.to_uppercase().into()) } else { Value::Null })');
        expect(o).toContain('split(&a, &Value::Str(",".into()))');
        expect(o).toContain('join(&xs, &Value::Str(",".into()))');
        expect(o).toContain('replace_str(&a,');
        expect(o).toContain('starts_with(&a,');
    });
    test('non-literal operands keep the helpers', () => {
        const o = out("        return [a.split(s), a.startsWith(s), a.replace(s, 'y')];", 'a: string, s: string');
        // a string-variable split delimiter / replace pattern goes native
        expect(o).toContain('a.as_str().zip(s.as_str()).map(|(__s, __d)| __s.split(__d)');
        // a string-variable affix goes native too
        expect(o).toContain('a.as_str().zip(s.as_str()).is_some_and(|(__s, __p)| __s.starts_with(__p))');
        expect(o).toContain('a.as_str().zip(s.as_str()).map(|(__s, __p)| Value::Str(__s.replace(__p, \"y\").into()))');
    });
});

describe('padEnd / toFixed native arms on proven operands', () => {
    const m = (body: string, params = 'a: string') => `class A {\n    run(${params}) {\n${body}\n    }\n}`;
    const out = (body: string, params?: string) => transpiler.transpileRust(m(body, params)).content;

    test('padEnd with a one-char pad and a literal width', () => {
        expect(out("        return a.padEnd(8, '0');")).toContain('return a.as_str().map(|__s| Value::Str(format!("{:0<8}", __s).into())).unwrap_or(Value::Null);');
        expect(out("        return a.padEnd(5, ' ');")).toContain('format!("{: <5}", __s)');
    });
    test('padEnd keeps the helper for a multi-char pad, a dynamic width or an unproven receiver', () => {
        expect(out("        return a.padEnd(8, '00');")).toContain('pad_end(&a,');
        expect(out("        return a.padEnd(w, '0');", 'a: string, w: number')).toContain('pad_end(&a,');
        expect(out("        return a.padEnd(8, '0');", 'a: any')).toContain('pad_end(&a,');
    });
    test('toFixed on a proven number with a literal digit count', () => {
        expect(out('        return a.toFixed(10);', 'a: number')).toContain('return Value::str(format!("{:.*}", 10, a.as_f64().unwrap_or(0.0)));');
    });
    test('toFixed keeps the helper for a string payload, a dynamic count or an any receiver', () => {
        expect(out('        return a.toFixed(2);', 'a: string')).toContain('to_fixed(&a,');
        expect(out('        return a.toFixed(d);', 'a: number, d: number')).toContain('to_fixed(&a,');
        expect(out('        return a.toFixed(2);', 'a: any')).toContain('to_fixed(&a,');
    });
});

// numeric/string helpers go native on checker-proven operands
describe('rust native numeric/string helpers', () => {
    const rust = (ts: string) => transpiler.transpileRust(ts).content;
    test('number toString prints Display format', () => {
        const out = rust('function f(n: number) { const r = n.toString(); return r; }');
        expect(out).toContain('Value::Str(format!("{}", n).into())');
        expect(out).not.toContain('to_string_val(');
    });
    test('string toString prints Display format', () => {
        const out = rust('function f(s: string) { const r = s.toString(); return r; }');
        expect(out).toContain('Value::Str(format!("{}", s).into())');
    });
    test('any toString keeps the helper', () => {
        expect(rust('function f(n: any) { const r = n.toString(); return r; }')).toContain('to_string_val(&n)');
    });
    test('Math.floor/round/ceil of a number go native', () => {
        const out = rust('function f(n: number) { const a = Math.floor(n); const b = Math.round(n); const c = Math.ceil(n); return [a, b, c]; }');
        expect(out).toContain('(n).as_f64().map(|__x| Value::Float(__x.floor())).unwrap_or(Value::Null)');
        expect(out).toContain('__x.round()');
        expect(out).toContain('__x.ceil()');
        expect(out).not.toMatch(/math_(floor|round|ceil)\(/);
    });
    test('Math.floor of any keeps the helper', () => {
        expect(rust('function f(n: any) { return Math.floor(n); }')).toContain('math_floor(&n)');
    });
    test('negate of a number goes native', () => {
        const out = rust('function f(n: number) { const x = -n; return x; }');
        expect(out).toContain('(match &(n) { Value::Int(x) => Value::Int(-x), Value::Float(x) => Value::Float(-x), _ => Value::Null })');
        expect(out).not.toContain('negate(');
    });
    test('negate of any keeps the helper', () => {
        expect(rust('function f(n: any) { return -n; }')).toContain('negate(&n)');
    });
    test('number % number goes native with zero guards', () => {
        const out = rust('function f(a: number, b: number) { return a % b; }');
        expect(out).toContain('(Value::Int(x), Value::Int(y)) if *y != 0 => Value::Int(x % y)');
        expect(out).not.toContain('mod_val(');
    });
    test('any % number keeps the helper', () => {
        expect(rust('function f(a: any, b: number) { return a % b; }')).toContain('mod_val(&a, &b)');
    });
});

describe('rust typed-operand is_equal/add/subtract', () => {
    const nativeIntResult = (code: string) => transpiler.transpileRust(code).content;

    test('string + number and Str + number', () => {
        const out = nativeIntResult('function f (n: number, s: string, t: string | undefined) {\n    const a = s + n;\n    const b = t + n;\n    return [ a, b ];\n}\n');
        expect(out).toContain('let mut a: String = format!("{}{}", s, n);');
        expect(out).toContain('add(&t, &n)');
    });

    test('number + any keeps the helper', () => {
        const out = nativeIntResult('function f (n: number, s: string, x: any) {\n    const a = s + x;\n    const b = x + n;\n    return [ a, b ];\n}\n');
        expect(out).toContain('add(&s, &x)');
        expect(out).toContain('add(&x, &n)');
    });

    test('.length on an any receiver minus/plus a number goes native', () => {
        const out = nativeIntResult('function f (x: any, n: number) {\n    const a = x.length - 1;\n    const b = x.length + n;\n    return [ a, b ];\n}\n');
        expect(out).not.toContain('subtract(');
        expect(out).not.toContain('add(');
        expect(out).toContain('(match (&(get_array_length(&x)), &(Value::Int(1))) { (Value::Int(x), Value::Int(y)) => Value::Int(x - y)');
    });

    test('const length local of an any receiver compares natively', () => {
        const out = nativeIntResult('function f (x: any, y: any) {\n    const length = x.length;\n    const other = y.length;\n    if (length === 0) {\n        return 1;\n    }\n    if (length === other) {\n        return 2;\n    }\n    return 3;\n}\n');
        expect(out).toContain('if (length.as_f64() == Some(0.0))');
        expect(out).toContain('if (length.as_f64() == other.as_f64())');
        expect(out).not.toContain('is_equal(');
    });

    test('let length local, and any vs const length, keep the helpers', () => {
        const out = nativeIntResult('function f (x: any, y: any) {\n    let length = x.length;\n    length = y;\n    const l2 = x.length;\n    if (length === 0) {\n        return 1;\n    }\n    if (l2 === y) {\n        return 2;\n    }\n    return l2 - y;\n}\n');
        expect(out).toContain('is_equal(&length, &Value::Int(0))');
        expect(out).toContain('is_equal(&l2, &y)');
        expect(out).toContain('(match (&(l2), &(y)) {'); // inline math/comparison dispatch
    });
});

describe('native reads on plain-dict locals and Dict parameters', () => {
    const dyn = (receiver: string, key: string) =>
        `(if let (Some(__m), Some(__k)) = (${receiver}.as_map(), ${key}.as_str()) { __m.get(__k).cloned().unwrap_or(Value::Null) } else { Value::Null })`;
    let output = '';
    beforeAll(() => {
        output = transpiler.transpileRustByPath('./tests/files/input/hx4r10/ts/src/venue.ts').content;
    });

    test('a Dict parameter read with an any-typed key reads natively', () => {
        expect(output).toContain(`let mut value: Value = ${dyn('params', 'key')};`);
        expect(output).not.toContain('get_value(&params, &key);\n            out');
    });

    test('a literal-built local and an account () local read an untyped key natively', () => {
        expect(output).toContain(`let mut viaCode: Value = ${dyn('result', 'code')};`);
        expect(output).toContain(dyn('account', 'code'));
    });

    test('a reassigned param, a parse* local and a numeric key keep the helper', () => {
        expect(output).toContain('return get_value(&params, &key);');
        expect(output).toContain('return get_value(&order, &key);');
        expect(output).toContain('return get_value(&params, &n);');
    });
});

describe('relaxed Vec locals and native list length', () => {
    const wrap = (body: string, params = 'items: any[]') => `class T {\n    parseX (x) { return x; }\n    filterBy (a, b) { return a; }\n    f (${params}) {\n${body}\n    }\n}`;
    const rs = (body: string, params?: string) => transpiler.transpileRust(wrap(body, params)).content;
    test('a non-final this-call argument clones into its box', () => {
        const out = rs('        const out = [];\n        out.push (1);\n        this.parseX (out);\n        return out;');
        expect(out).toContain('let mut out: Vec<Value> = Vec::new();');
        expect(out).toContain('self.parseX(Value::from(out.clone()));');
        expect(out).toContain('return Value::from(out);');
        expect(out).not.toContain('append_to_array');
    });
    test('index reads on a Vec local use Vec::get', () => {
        const out = rs('        const out = [];\n        out.push (1);\n        for (let i = 0; i < out.length; i++) {\n            const v = out[i];\n            this.parseX (v);\n        }\n        return out[0];');
        expect(out).toContain('let mut out: Vec<Value> = Vec::new();');
        expect(out).toContain('let mut v: Value = out.get((i).as_i64().unwrap_or(-1) as usize).cloned().unwrap_or(Value::Null);');
        expect(out).toContain('return out.get(0).cloned().unwrap_or(Value::Null);');
    });
    test('negative: in-loop this-call arg, element write, chained read, &mut self callee keep the box', () => {
        for (const body of [
            '        const out = [];\n        for (let i = 0; i < 2; i++) {\n            out.push (i);\n            this.parseX (out);\n        }\n        return 1;',
            '        const out = [];\n        out.push (1);\n        out[0] = 2;\n        return out;',
            '        const out = [];\n        out.push (items);\n        return out[0][1];',
            '        const out = [];\n        out.push (1);\n        this.extend (out);\n        return out;',
            '        const out = [];\n        out.push (1);\n        const k = \'a\';\n        return out[k];',
        ]) {
            const out = rs(body);
            // the box stays (the Arr push may be spelled natively)
            expect(out).toMatch(/append_to_array\(&mut out|if let Value::Arr\(__a\) = &mut out \{/);
            expect(out).not.toContain('Vec<Value>');
        }
    });
    test('length of a split / array-literal-returning call local is native', () => {
        const out = rs('        const parts = s.split (\'-\');\n        const n = parts.length;\n        return n;', 's');
        expect(out).toContain('let mut parts: Vec<Value> = split(&s, &Value::Str("-".into())).as_array().cloned().unwrap_or_default()');
        expect(out).toContain('Value::Int(parts.len() as i64)');
        expect(out).not.toContain('get_array_length');
    });
    test('negative: any-typed and reassigned locals keep get_array_length', () => {
        expect(rs('        const n = items2.length;\n        return n;', 'items2')).toContain('get_array_length(&items2)');
        expect(rs('        let parts = s.split (\'-\');\n        parts = s;\n        return parts.length;', 's')).toContain('get_array_length(&parts)');
    });
});

describe('safeDict / builder plain dicts and bool-value truthiness', () => {
    let output = '';
    beforeAll(() => {
        output = transpiler.transpileRustByPath('./tests/files/input/hx4r12/ts/src/venue.ts').content;
    });

    test('a base safeDict read of caller data with no default inserts natively', () => {
        expect(output).toContain(insert('bare', 'a', 'Value::Int(1)'));
    });

    test('a same-file sync builder returning literals / extend of them inserts natively', () => {
        expect(output).toContain(insert('request', 'clientOid', 'Value::Str("1".into())'));
    });

    test('a non-plain default and a pass-through method keep the helper', () => {
        expect(output).toContain('add_element_to_object(&mut nonPlainDefault, &Value::Str("b".into())');
        expect(output).toContain('add_element_to_object(&mut parsed, &Value::Str("x".into())');
    });

    test('bool tuple elements compare natively against true', () => {
        expect(output).toContain('(enableUnifiedMargin.as_bool() == Some(true)) || (enableUnifiedAccount.as_bool() == Some(true))');
    });

    test('bool tuple elements and bool-returning methods test truthiness natively', () => {
        // a boolean tuple slot read only in conditions is declared `bool`
        expect(output).toContain('let mut paginate: bool = ');
        expect(output).toContain('if paginate {');
        expect(output).toContain('if isTrigger.as_bool() == Some(true) {');
        expect(output).toContain('if !(self.isConditionalOrder(&[params]).as_bool() == Some(true)) {');
    });

    test('an any-valued method / tuple element keeps is_true', () => {
        expect(output).toContain('if is_true(&self.looseFlag(&[params])) {');
        expect(output).toContain('if is_true(&loose) {');
    });
});

describe('proven-Str safeString locals: native equality / replace / split / toString / case', () => {
    let replaceOut = '';
    let eqOut = '';
    beforeAll(() => {
        replaceOut = transpiler.transpileRust("class X {\n    safeString (o: any, k: any, d: any = undefined): string | undefined { return undefined; }\n    f (o: any, timeframe: string) {\n        const subscription = this.safeString (o, 'n', '');\n        const prefix = timeframe + '_';\n        const marketId = subscription.replace (prefix, '');\n        const net = this.safeString (o, 'network');\n        let code: string = this.safeString (o, 'code', '');\n        code = code.replace (net, '');\n        const id = this.safeString (o, 'id');\n        const parts = (code as string).split (id as string);\n        const s = (id as string).toString ();\n        const h = code.replace ('.' + o['x'], '');\n        return [ marketId, code, parts, s, h ];\n    }\n}\n").content;
        eqOut = transpiler.transpileRust("class X {\n    safeString (o: any, k: any, d: any = undefined): string | undefined { return undefined; }\n    safeString2 (o: any, k: any, k2: any, d: any = undefined): string | undefined { return undefined; }\n    safeValue (o: any, k: any, d: any = undefined): any { return undefined; }\n    f (o: any, net: any) {\n        const a: any = this.safeString (o, 'a');\n        const b: any = this.safeString2 (o, 'b', 'c');\n        if (a === b) { return 1; }\n        const c: any = this.safeString (o, 'c', net);\n        if (a === c) { return 2; }\n        let d: any = this.safeString (o, 'd');\n        d = this.safeValue (o, 'x');\n        if (a !== d) { return 3; }\n        let e: any = this.safeString (o, 'e');\n        [ e ] = o;\n        if (a === e) { return 4; }\n        const g: any = this.safeString (o, 'g', 'z');\n        const u = g.toUpperCase ();\n        const t = a.toString ();\n        const v = d.toString ();\n        return [ u, t, v ];\n    }\n}\n").content;
    });

    test('replace / split with a string-variable operand print native str ops', () => {
        expect(replaceOut).toContain('let mut marketId: Value = subscription.as_str().zip(prefix.as_str()).map(|(__s, __p)| Value::Str(__s.replace(__p, "").into())).unwrap_or_else(|| subscription.clone());');
        expect(replaceOut).toContain('code = code.as_str().zip(net.as_str()).map(|(__s, __p)| Value::Str(__s.replace(__p, "").into())).unwrap_or_else(|| code.clone());');
        expect(replaceOut).toContain('let mut parts: Value = Value::Array(code.as_str().zip(id.as_str()).map(|(__s, __d)| __s.split(__d).map(Value::from).collect()).unwrap_or_default());');
        expect(replaceOut).toContain('.as_str().zip((Value::Str(format!("{}{}", Value::Str(".".into()), crate::value::get_value_k(&o, "x")).into())).as_str())');
        expect(replaceOut).toContain('let mut s: Value = Value::Str(format!("{}", id).into());');
        expect(replaceOut).not.toContain('replace_str(');
    });

    test('two proven-Str `any` locals compare with PartialEq', () => {
        expect(eqOut).toContain('if (a == b) {');
        expect(eqOut).toContain('if (a == c) {');
        expect(eqOut).toContain('let mut u: Value = (if let Some(__s) = g.as_str() { Value::Str(__s.to_uppercase().into()) } else { Value::Null });');
        expect(eqOut).toContain('let mut t: Value = Value::Str(format!("{}", a).into());');
    });

    test('a non-string write or destructuring write keeps the helpers', () => {
        expect(eqOut).toContain('if !is_equal(&a, &d) {');
        expect(eqOut).toContain('if is_equal(&a, &e) {');
        expect(eqOut).toContain('let mut v: Value = to_string_val(&d);');
    });
});

describe('overloaded base safeDict/safeList/safeBool feed the plain-dict and list proofs', () => {
    let output = '';
    beforeAll(() => {
        output = transpiler.transpileRustByPath('./tests/files/input/hx4r14/ts/src/venue.ts').content;
    });

    test('a dynamic-key read on an overloaded safeDict local with a {} default is native', () => {
        expect(output).toContain('let mut found: Value = (if let (Some(__m), Some(__k)) = (byAlt.as_map(), id.as_str()) { __m.get(__k).cloned().unwrap_or(Value::Null) } else { Value::Null });');
    });

    test('a non-plain default and a write-back bind keep get_value', () => {
        expect(output).toContain('return get_value(&loose, &id);');
        expect(output).toContain('let mut value: Value = get_value(&ledger, &key);');
    });

    test('an overloaded safeBool with a bool default tests truthiness natively', () => {
        expect(output).toContain('let mut flag: bool = ');
        expect(output).toContain('if flag {');
    });

    test('list reads at counter/length arithmetic indices are native; an any-typed operand keeps get_value', () => {
        expect(output).toContain('last = trades.as_array().and_then(|__arr| match &((match (&(numTrades), &(Value::Int(1)))');
        expect(output).toContain('let mut prev: Value = trades.as_array().and_then(|__arr| match &((match (&(i), &(Value::Int(1)))');
        expect(output).toContain('Value::Int(__n) if *__n >= 0 => __arr.get(*__n as usize), _ => None }).cloned().unwrap_or(Value::Null)');
        expect(output).toContain('get_value(&trades, &(match (&(k), &(Value::Int(1))) {'); // inline math/comparison dispatch
    });
});

describe('Vec<Value> object-literal / join uses and negated bool tuple locals', () => {
    let output = '';
    beforeAll(() => {
        output = transpiler.transpileRustByPath('./tests/files/input/hx4r15/ts/src/venue.ts').content;
    });

    test('a string[] local joined with a literal is a Vec with a native join', () => {
        expect(output).toContain('let mut out: Vec<Value> = Vec::new();');
        expect(output).toContain('Value::Str(out.iter().map(|__v| __v.to_string()).collect::<Vec<String>>().join(",").into())');
    });

    test('object-literal values are boxed clones, the last one a move', () => {
        expect(output).toContain('m.insert("ids".to_string(), Value::from(out.clone()));');
        expect(output).toContain('m.insert("more".to_string(), Value::from(out));');
    });

    test('a value pushed after the literal, an any[] join and an in-loop literal keep the helper', () => {
        expect(output).toContain('append_to_array(&mut late, Value::Str("x".into()));');
        expect(output).toContain('return join(&loose, &Value::Str(",".into()));');
        expect(output).toContain('append_to_array(&mut looped, Value::Str("a".into()));');
    });

    test('a negated bool tuple local tests as_bool natively', () => {
        expect(output).toContain('else if !(stock.as_bool() == Some(true)) {');
    });
});

describe('rust math/comparison on structurally numeric operands', () => {
    const r16 = (code: string) => transpiler.transpileRust(code).content;
    const src = 'class X {\n' +
        '    sum (...xs: any[]): any { return xs[0]; }\n' +
        '    readU (s: string, n: number): any { let result = 0; result = this.sum (result, n * 2); return result; }\n' +
        '    f (ids: string[], chunkSize: number, bits0: string, limit: number | undefined, a: any, bid: number | undefined) {\n' +
        '        const idsLength = ids.length;\n' +
        '        const c = this.sum (idsLength, chunkSize - 1) / chunkSize;\n' +
        '        const m = this.sum (bid, 1) / 2;\n' +
        '        let bits = this.readU (bits0, 1);\n' +
        '        const bit = bits % 2;\n' +
        '        bits = (bits - bit) / 2;\n' +
        '        const neg = -(this.readU (bits0, 2));\n' +
        '        let errors = 0;\n' +
        '        while (errors <= limit) { errors += 1; }\n' +
        '        const q = -1 * ids.length;\n' +
        '        const anyCmp = a <= bid;\n' +
        '        const anySub = a - 1;\n' +
        '        const anySum = this.sum (a, 1) / 2;\n' +
        '        const nullCmp = bid <= limit;\n' +
        '        return [ c, m, bit, neg, q, anyCmp, anySub, anySum, nullCmp, bits ];\n' +
        '    }\n' +
        '}\n';
    let out = '';
    beforeAll(() => { out = r16(src); });

    test('this.sum of numbers, numeric method returns and inductive locals go native', () => {
        expect(out).toContain('let mut bit: Value = (match (&(bits), &(Value::Int(2))) { (Value::Int(x), Value::Int(y)) if *y != 0 => Value::Int(x % y)');
        expect(out).toContain('bits = (match ((((match (&(bits), &(bit)) { (Value::Int(x), Value::Int(y)) => Value::Int(x - y)');
        expect(out).toContain('let mut neg: Value = (match &((self.readU(bits0, Value::Int(2)))) { Value::Int(x) => Value::Int(-x)');
        expect(out).toContain('let mut q: Value = (match (&(Value::Int(-1)), &(Value::Int(ids.len() as i64))) {');
        expect(out).not.toContain('divide(&self.sum(&[idsLength');
        expect(out).not.toContain('mod_val(&bits');
        expect(out).not.toContain('negate(');
    });

    test('<= with a literal-initialised numeric local against a nullable number is native', () => {
        expect(out).toContain('while errors.as_f64().unwrap_or(f64::NAN) <= limit.as_f64().unwrap_or(f64::NAN) {');
    });

    test('any operands and two nullable sides of <= keep the helpers', () => {
        expect(out).toContain('(match (&(a), &(bid)) { (__a, __b) =>'); // inline math/comparison dispatch
        expect(out).toContain('(match (&(a), &(Value::Int(1))) {'); // inline math/comparison dispatch
        expect(out).toContain('(match (&(self.sum(a, Value::Int(1))), &(Value::Int(2))) { (__a, __b) =>'); // inline math/comparison dispatch
        expect(out).toContain('let mut m: Value = (match ((self.sum(bid, Value::Int(1))).as_f64(), (Value::Int(2)).as_f64())');
        expect(out).toContain('(match (&(bid), &(limit)) { (__a, __b) =>'); // inline math/comparison dispatch
    });
});

describe('string helpers and anchored concat', () => {
    const src = "type Str = string | undefined;\nclass Precise { constructor (s: string) {} }\nclass A {\n    id: string = 'a';\n    safeString (o: any, k: any, d: any = undefined): Str { return undefined; }\n    run (x: any, code: string, s: Str, n: number) {\n        const h = this.safeString (x, 'h', '');\n        let qs = '';\n        qs = qs.replaceAll ('%2C', ',');\n        const r = code.replace (s, h);\n        const p = new Precise ('1');\n        return [ h.trim (), code.startsWith (s), code.endsWith (h), qs, r, this.id + ' x ' + x, 'n' + n, 'p' + p, x + 'y', x.trim (), x.replaceAll ('a', 'b'), x.startsWith (s) ];\n    }\n}\n";
    let o = '';
    beforeAll(() => { o = transpiler.transpileRust(src).content; });
    test('trim / startsWith / endsWith / replaceAll / replace on proven strings go native', () => {
        expect(o).toContain('h.as_str().map(|__s| Value::Str(__s.trim().to_string().into())).unwrap_or(Value::Null)');
        expect(o).toContain('code.as_str().zip(s.as_str()).is_some_and(|(__s, __p)| __s.starts_with(__p))');
        expect(o).toContain('code.as_str().zip(h.as_str()).is_some_and(|(__s, __p)| __s.ends_with(__p))');
        expect(o).toContain('qs = qs.as_str().map(|__s| Value::Str(__s.replace("%2C", ",").into())).unwrap_or_else(|| qs.clone());');
        expect(o).toContain('match (code.as_str(), s.as_str(), h.as_str()) { (Some(__s), Some(__p), Some(__r)) => Value::Str(__s.replace(__p, __r).into()), _ => code.clone() }');
    });
    test('concat anchored on an always-Str side goes native for any non-Precise box', () => {
        expect(o).toContain('Value::Str(format!("{}{}", Value::Str(format!("{}{}", self.id, Value::Str(" x ".into())).into()), x).into())');
        expect(o).toContain('Value::Str(format!("{}{}", Value::Str("n".into()), n).into())');
        expect(o).toContain('Value::Str(format!("{}{}", x, Value::Str("y".into())).into())');
    });
    test('Precise operands and any receivers keep the helpers', () => {
        expect(o).toContain('add(&Value::Str("p".into()), &p)');
        expect(o).toContain('trim(&x)');
        expect(o).toContain('replace_all_str(&x,');
        expect(o).toContain('starts_with(&x, &s)');
    });
});

describe('collection helpers on proven plain-dict / Arr-only locals', () => {
    let rest = '';
    let prediction = '';
    beforeAll(() => {
        rest = transpiler.transpileRustByPath('./tests/files/input/hx4r18/ts/src/venue.ts').content;
        prediction = transpiler.transpileRustByPath('./tests/files/input/hx4r18/ts/src/prediction/venue.ts').content;
    });

    test('push on a [] local / length on a toArray local are native', () => {
        expect(rest).toContain('if let Value::Arr(__a) = &mut out { std::sync::Arc::make_mut(__a).push(rows.get(');
        expect(rest).toContain('return Value::from(vec![out, count, Value::Int(parsed.len() as i64)]);');
    });

    test('literal-key in on a plain-dict local is contains_key', () => {
        expect(rest).toContain('if (matches!(&account, Value::Dict(__d) if __d.contains_key("free"))) {');
        expect(rest).toContain('in_op(&response, &Value::Str("code".into()))');
    });

    test('rebound, nullable-push, dict-aliased and closure-captured locals keep the helpers', () => {
        expect(rest).toContain('append_to_array(&mut list, Value::Int(2));');
        expect(rest).toContain('return get_array_length(&list);');
        expect(rest).toContain('append_to_array(&mut maybe, Value::Int(3));');
        expect(rest).toContain('append_to_array(&mut ids, args);');
        expect(rest).toContain('append_to_array(&mut items, Value::Int(4));');
        expect(rest).toContain('append_to_array(&mut seq, Value::Int(seq.len() as i64));');
    });

    test('Object.keys / Object.values on a prediction plain local are native; any keeps the helper', () => {
        expect(prediction).toContain('let mut queryKeys: Value = Value::Array(query.as_map().map(|__m| __m.keys().map(|__k| Value::Str(__k.clone().into())).collect()).unwrap_or_default());');
        expect(prediction).toContain('let mut queryValues: Value = Value::Array(query.as_map().map(|__m| __m.values().cloned().collect()).unwrap_or_default());');
        expect(prediction).toContain('let mut loose: Value = object_keys(&response);');
    });
});

describe('bool-call equality and numeric add', () => {
    const src = "class A {\n    sbeReadUint (h: string, o: number, l: number): number { return o + l; }\n    sum (...a: any[]): any { return a[0]; }\n    run (requestPath: any, frameHex: string, frameLength: number, x: any, flag: any) {\n        const blockLength = this.sbeReadUint (frameHex, 0, 2);\n        const position = this.sum (blockLength, 8);\n        if (requestPath.endsWith ('login') === true) { return 1; }\n        if (position + 4 > frameLength) { return 0; }\n        const k = x + 1;\n        return [ x.startsWith ('z') !== true, k, flag === true ];\n    }\n}\n";
    let o = '';
    beforeAll(() => { o = transpiler.transpileRust(src).content; });
    test('startsWith/endsWith compared to a bool literal is the bare bool', () => {
        expect(o).toContain('if (ends_with(&requestPath, &Value::Str("login".into()))) {');
        expect(o).toContain('Value::Bool(!starts_with(&x, &Value::Str("z".into())))');
    });
    test('+ on numeric-kind operands is the native match', () => {
        expect(o).toContain('if (match (&(position), &(Value::Int(4))) { (Value::Int(x), Value::Int(y)) => Value::Int(x + y),');
    });
    test('any operands keep the helpers', () => {
        expect(o).toContain('add(&x, &Value::Int(1))');
        expect(o).toContain('is_equal(&flag, &Value::Bool(true))');
    });
});

describe('base-tier enumeration, Arr-only sources and string-method receivers', () => {
    let base = '';
    let rest = '';
    beforeAll(() => {
        base = transpiler.transpileRustByPath('./tests/files/input/hx4r21/ts/src/base/Exchange.ts').content;
        rest = transpiler.transpileRustByPath('./tests/files/input/hx4r21/ts/src/venue.ts').content;
    });

    // `built` is a literal-built local, so it is a typed bearer now and
    // enumerates through the map's own iterators (no `as_map` box, no `object_keys`).
    test('Object.keys / Object.values on a base-tier plain local are native; any keeps the helper', () => {
        expect(base).toContain('let mut keys: Value = Value::Array(built.keys().map(|__k| Value::Str(__k.clone().into())).collect());');
        expect(base).toContain('let mut values: Value = Value::Array(built.values().cloned().collect());');
        expect(base).toContain('object_keys(&response)');
    });

    test('push on a local re-sorted by sortBy / built by arrayConcat is native; an any alias keeps the helper', () => {
        expect(base).toContain('if let Value::Arr(__a) = &mut out { std::sync::Arc::make_mut(__a).push(Value::Int(1)); }');
        expect(base).toContain('if let Value::Arr(__a) = &mut joined { std::sync::Arc::make_mut(__a).push(Value::Int(2)); }');
        expect(base).toContain('append_to_array(&mut loose, Value::Int(3));');
    });

    test('a string-typed map read receiving toUpperCase reads natively; an any read keeps get_value', () => {
        expect(rest).toContain('(currency.get("id").cloned().unwrap_or(Value::Null)).as_str()');
        expect(rest).toMatch(/get_value\(&raw, &Value::Str\("id"\.into\(\)\)\)|get_value_k\(&raw, "id"\)/);
    });
});

describe('self-referential numeric writes, always-Str locals, Str ordering', () => {
    const src = "type Str = string | undefined;\nclass A {\n    sum (...a: any[]): any { return a[0]; }\n    safeString (o: any, k: any, d: any = undefined): Str { return undefined; }\n    json (x: any): string { return ''; }\n    run (blockLength: number, raw: any, snap: any, method: string, path: string, params: any, x: any) {\n        let position = this.sum (blockLength, 8);\n        position = position + 4;\n        let earliest: Str = undefined;\n        const gameTime = this.safeString (raw, 'gameTime');\n        if ((gameTime !== undefined) && ((earliest === undefined) || (gameTime < earliest))) {\n            earliest = gameTime;\n        }\n        const version = this.safeString (snap, 'v', '');\n        const held = this.safeString (snap, 'h', '');\n        const newer = (held !== '') && (version <= held);\n        let body: any = undefined;\n        if (method === 'POST') { body = this.json (params); }\n        let auth = '/' + path;\n        if (body !== undefined) { auth = auth + body; }\n        let maybe = this.safeString (x, 'k');\n        const bad = maybe + body;\n        const loose = x < raw;\n        const anyLe = x <= 'b';\n        return [ position, earliest, newer, auth, bad, loose, anyLe ];\n    }\n}\n";
    let o = '';
    beforeAll(() => { o = transpiler.transpileRust(src).content; });
    test('a numeric local re-read in its own write goes native', () => {
        expect(o).toContain('position = (match (&(position), &(Value::Int(4))) {');
        expect(o).not.toContain('add(&position');
    });
    test('Str|Null ordering replicates the helper natively', () => {
        expect(o).toContain('(match (gameTime.as_str(), earliest.as_str()) { (Some(__x), Some(__y)) => (match (__x.parse::<f64>(), __y.parse::<f64>()) { (Ok(__p), Ok(__q)) => __p < __q, _ => __x < __y }), _ => false })');
        expect(o).toContain('(held.as_str() != Some("")) && ((match (version.as_str(), held.as_str()) { (Some(__x), Some(__y)) => (match (__x.parse::<f64>(), __y.parse::<f64>()) { (Ok(__p), Ok(__q)) => __p < __q, _ => __x < __y }) || __x == __y, (None, None) => true, _ => false })));');
    });
    test('a local whose every write is always-Str anchors a native concat', () => {
        expect(o).toContain('auth = format!("{}{}", auth, body);');
    });
    test('unproven operands keep the helpers', () => {
        expect(o).toContain('add(&maybe, &body)');
        expect(o).toContain('(match (&(x), &(raw)) { (__a, __b) =>'); // inline math/comparison dispatch
        expect(o).toContain('(match (&(x), &(Value::Str("b".into()))) { (__a, __b) =>'); // inline math/comparison dispatch
    });
});

describe('plain-dict sources in the base tier and pro files', () => {
    let base = '';
    let pro = '';
    beforeAll(() => {
        base = transpiler.transpileRustByPath('./tests/files/input/hx4r23/ts/src/base/Exchange.ts').content;
        pro = transpiler.transpileRustByPath('./tests/files/input/hx4r23/ts/src/pro/venue.ts').content;
    });

    test('base extend copies of locals / typed Dict params insert natively', () => {
        expect(base).toContain('if let Value::Dict(__d) = &mut itemWithKey { std::sync::Arc::make_mut(__d).insert(crate::runtime::stringify_param(&keyName), key.clone()); }');
        // `extend` of a literal + a Dict-typed place declares the bearer.
        expect(base).toContain('result.insert("swap".into(), Value::Bool(false));');
    });

    test('base safeDict(this.options, k, {}) local reads natively', () => {
        // the safeDict local is a bearer, so the read is one map lookup.
        expect(base).toContain('accountsByType.get(account.as_str().unwrap_or("")).cloned().unwrap_or(Value::Null)');
    });

    test('base extend of an any parameter keeps the helper', () => {
        expect(base).toContain('add_element_to_object(&mut r, &Value::Str("x".into()), Value::Int(1));');
    });

    test('pro extend of a proven local inserts natively; extend of a handler parameter keeps the helper', () => {
        expect(pro).toContain('if let Value::Dict(__d) = &mut request { std::sync::Arc::make_mut(__d).insert("id".into(), Value::Int(1)); }');
        expect(pro).toContain('add_element_to_object(&mut loose, &Value::Str("id".into()), Value::Int(2));');
    });

    test('pro safeDict(this.options, k, {}) local reads natively', () => {
        // bearer read and write, no helper and no cow_guard.
        expect(pro).toContain('subs.insert("a".into(), Value::Int(1));');
        expect(pro).toContain('subs.get("a").cloned().unwrap_or(Value::Null)');
    });
});

describe('inline math/comparison dispatch and Str|Null field concat', () => {
    const src = "class A {\n    convertToBigIntCustom (x: any) {\n        return parseInt (x);\n    }\n    signHash (hash: any, privateKey: any) {\n        const signature = ecdsa (hash, privateKey);\n        const r = signature['r'];\n        const s = signature['s'];\n        return {\n            'r': r.padStart (64, '0'),\n            's': s.padStart (64, '0'),\n            'v': 27,\n        };\n    }\n    signMessage (message: any, privateKey: any) {\n        return this.signHash (message, privateKey.slice (-64));\n    }\n    signOnboardingAction (): object {\n        const signature = this.signMessage ('x', 'y');\n        return signature;\n    }\n    run (request: any, params: any, config: any, cache: any[], h: any) {\n        const amountMultiplier = this.convertToBigIntCustom ('1000000');\n        const amountInt = request['num_tokens'] * amountMultiplier;\n        const z = this.parseToInt (request['num_tokens'] * amountMultiplier);\n        const limit = params['limit'];\n        const entry = config[0];\n        if (limit <= entry[0]) { return 1; }\n        const signature: any = this.signOnboardingAction ();\n        const pk = this.hashMessage (signature['r'] + signature['s']);\n        const cacheLength = cache.length;\n        const snapshotDelay = this.handleOption ('a', 'b', 25);\n        if (cacheLength === snapshotDelay) { return 2; }\n        if (h === 1) { return 3; }\n        return [ amountInt, z, pk ];\n    }\n}\n";
    let o = '';
    beforeAll(() => { o = transpiler.transpileRust(src).content; });
    test('any * numeric-call operand prints the multiply dispatch inline', () => {
        expect(o).toContain('let mut amountInt: Value = (match (&(crate::value::get_value_k(&request, "num_tokens")), &(amountMultiplier)) { (Value::Int(__x), Value::Int(__y)) => Value::Int(__x * __y), (__a, __b) =>');
        expect(o).not.toContain('multiply(');
    });
    test('any <= any prints the coercing order plus is_equal inline', () => {
        expect(o).toContain('if (match (&(limit), &(get_value(&entry, &Value::Int(0)))) { (__a, __b) =>');
        expect(o).toContain('(Value::Null, Value::Null) => true');
        expect(o).not.toContain('is_less_than_or_equal(');
    });
    test('Str|Null fields of a same-file returned literal concatenate natively', () => {
        expect(o).toContain('self.hashMessage((match (&(crate::value::get_value_k(&signature, "r")), &(crate::value::get_value_k(&signature, "s"))) { (Value::Null, Value::Null) => Value::Null, (__a, __b) => Value::Str(format!("{}{}", __a, __b).into()) }))');
        expect(o).not.toContain('add(');
    });
    test('a non-literal field source keeps the add helper', () => {
        const n = transpiler.transpileRust('class B {\n    run (x: any) {\n        const s = x[0];\n        return s[\'r\'] + s[\'s\'];\n    }\n}\n').content;
        expect(n).toContain('add(&');
    });
});

describe('tuple slot-1 params of base handle*AndParams helpers', () => {
    let rest = '';
    let pro = '';
    beforeAll(() => {
        rest = transpiler.transpileRustByPath('./tests/files/input/hx4r26/ts/src/venue.ts').content;
        pro = transpiler.transpileRustByPath('./tests/files/input/hx4r26/ts/src/pro/venue.ts').content;
    });

    test('const [ a, p ] = handleOptionBoolAndParams (params, …) inserts natively on p', () => {
        expect(rest).toContain(insert('paramsStock', 'stock', 'Value::Bool(true)'));
        expect(rest).not.toContain('add_element_to_object(&mut paramsStock');
    });

    test('[ a, p ] = handleMarketTypeAndParams (…, params) write: native insert and read', () => {
        expect(rest).not.toContain('add_element_to_object(&mut paramsType');
        expect(rest).toContain('paramsType.as_map().and_then(|__m| __m.get("other")).cloned().unwrap_or(Value::Null)');
    });

    test('an unproven params argument or a non-listed handler keeps the helper', () => {
        expect(rest).toContain('add_element_to_object(&mut paramsLoose');
        expect(rest).toContain('add_element_to_object(&mut paramsOther');
    });

    test('pro: a parameter source keeps the helper, a plain local source goes native', () => {
        expect(pro).toContain('add_element_to_object(&mut paramsStock');
        expect(pro).not.toContain('add_element_to_object(&mut paramsLocal');
    });
});

describe('rust typed tuple-destructure slots', () => {
    const src = `class T {
    pick (params: any): [string, any] { return [ 'spot', params ]; }
    flag (params: any): [boolean, any] { return [ true, params ]; }
    f (params: any) {
        const [ marketType, query ] = this.pick (params);
        const [ paginate, rest ] = this.flag (query);
        if (paginate) {
            return 1;
        }
        if (marketType === 'swap') {
            return rest;
        }
        const [ kept, other ] = this.pick (params);
        return marketType === undefined ? kept : other;
    }
}`;
    let out: string;
    beforeAll(() => { out = transpiler.transpileRust(src).content; });
    test('a string slot read only by literal / null compares is Option<String>', () => {
        expect(out).toContain('let mut marketType: Option<String> = marketTypequeryVariable.get(0).and_then(Value::as_str).map(str::to_owned)');
        expect(out).toContain('marketType.as_deref() == Some("swap")');
    });
    test('a boolean slot read only in conditions is bool', () => {
        expect(out).toContain('let mut paginate: bool = paginaterestVariable.get(0).and_then(Value::as_bool) == Some(true)');
        expect(out).toMatch(/if paginate \{/);
    });
    test('a slot with another use stays Value', () => {
        expect(out).toContain('let mut kept: Value = keptotherVariable.get(0).cloned().unwrap_or(Value::Null)');
        expect(out).toContain('let mut query: Value = marketTypequeryVariable.get(1).cloned().unwrap_or(Value::Null)');
    });
});

describe('scalar locals from venue methods with a declared scalar return', () => {
    let out: string;
    beforeAll(() => {
        out = transpiler.transpileRustByPath(path.join (rustFixtureRoot, 'venue-scalar-returns', 'ts/src/venue.ts')).content;
    });
    test('an int venue method keeps its Value signature and the local reads it once as i64', () => {
        expect(out).toMatch(/pub fn requestId\(&self\) -> Value \{/);
        expect(out).toContain('let mut requestId: i64 = self.requestId().as_i64().unwrap_or_default();');
        expect(out).toContain('format!("{}", requestId)');
    });
    test('a native-Str venue method result is taken as the Option<String> it returns', () => {
        expect(out).toMatch(/let mut topic: Option<String> = self\.topicName\(symbol[^;]*\);/);
        expect(out).not.toMatch(/let mut topic: Option<String> = [^;]*\.map\(Value::from\)/);
        expect(out).toContain('topic.is_none()');
    });
    test('a name another venue declares with a different return stays Value', () => {
        expect(out).toContain('let mut other: Value = self.mixedId();');
    });
});

describe('scalar locals from base methods with a concrete return', () => {
    let out: string;
    beforeAll(() => {
        out = transpiler.transpileRustByPath(path.join (rustFixtureRoot, 'base-scalar-returns', 'ts/src/venue.ts')).content;
    });
    test('a Str / number base return is an Option local, tested and re-boxed natively', () => {
        expect(out).toMatch(/let mut code: Option<String> = self\.safeCurrencyCode\(.*\)\.as_str\(\)\.map\(str::to_owned\);/);
        expect(out).toMatch(/let mut now: Option<i64> = self\.milliseconds\(\)\.as_i64\(\);/);
        expect(out).toContain('if (code.is_none()) {');
        expect(out).toContain('code.clone().map(Value::from).unwrap_or(Value::Null)');
        expect(out).toContain('Value::from(now)');
    });
    test('a local written through keeps its Value box', () => {
        expect(out).toMatch(/let mut kept: Value = self\.safeCurrencyCode\(/);
    });
});

describe('scalar locals from declared callee returns and string-list element reads', () => {
    let out: string;
    beforeAll(() => {
        out = transpiler.transpileRustByPath(path.join (rustFixtureRoot, 'derived-scalar-returns', 'ts/src/venue.ts')).content;
    });
    test('a declared Str / int return and a split element read are Option locals with native tests', () => {
        expect(out).toMatch(/let mut timeframe: Option<String> = self\.findTimeframe\(.*\)\.as_str\(\)\.map\(str::to_owned\);/);
        expect(out).toMatch(/let mut nonce: Option<i64> = self\.incrementingNonce\(\)\.as_i64\(\);/);
        expect(out).toMatch(/let mut first: Option<String> = parts\.get\(0\)\.and_then\(Value::as_str\)\.map\(str::to_owned\);/);
        expect(out).toContain('if (timeframe.is_none()) {');
        expect(out).toContain('first.as_deref() == Some("a")');
    });
    test('a local with only Value hand-offs keeps its Value box', () => {
        expect(out).toMatch(/let mut boxedOnly: Value = self\.findTimeframe\(/);
        expect(out).toMatch(/let mut key: Value = /);
    });
});

describe('scalar locals from base safe readers and literals', () => {
    let out: string;
    beforeAll(() => {
        out = transpiler.transpileRustByPath(path.join (rustFixtureRoot, 'scalar-locals', 'ts/src/venue.ts')).content;
    });
    test('nullable readers are Option<String|i64|f64>, tested and re-boxed natively', () => {
        expect(out).toMatch(/let mut id: Option<String> = .*\.as_str\(\)\.map\(str::to_owned\);/);
        expect(out).toMatch(/let mut ts: Option<i64> = .*\.as_i64\(\);/);
        expect(out).toMatch(/let mut price: Option<f64> = .*\.as_f64\(\);/);
        expect(out).toContain('if (id.is_none()) {');
        expect(out).toContain('.insert("ts".into(), Value::from(ts)); }');
        expect(out).toContain('.insert("id".into(), id.clone().map(Value::from).unwrap_or(Value::Null)); }');
    });
    test('a literal default makes the reader a bare String / i64 / bool', () => {
        expect(out).toMatch(/let mut lim: i64 = .*\.as_i64\(\)\.unwrap_or\(100\);/);
        expect(out).toMatch(/let mut side: String = .*\.as_str\(\)\.unwrap_or\("buy"\)\.to_string\(\);/);
        expect(out).toMatch(/let mut flag: bool = .*\.as_bool\(\)\.unwrap_or\(false\);/);
        expect(out).toContain('if flag {');
    });
    test('scalar literals are native and written natively', () => {
        expect(out).toContain('let mut spot: bool = true;');
        expect(out).toContain('let mut name: String = "abc".to_string();');
        expect(out).toContain('let mut page: i64 = 1;');
        expect(out).toContain('let mut fee: f64 = 0.25;');
        expect(out).toContain('if (name == "x") {');
        expect(out).toContain('name = "y".to_string();');
        expect(out).toContain('page = 2;');
        expect(out).toContain('spot = false;');
        expect(out).toContain('.insert("spot".into(), Value::Bool(spot)); }');
    });
    test('a local with another use stays Value', () => {
        expect(out).toMatch(/let mut kept: Value = /);
    });
});

describe('expression-shaped scalar locals', () => {
    let out: string;
    beforeAll(() => {
        out = transpiler.transpileRustByPath(path.join (rustFixtureRoot, 'expression-locals', 'ts/src/venue.ts')).content;
    });
    test('aliases and ternaries take the typed kind', () => {
        expect(out).toMatch(/let mut alias: Option<String> = id\.clone\(\);/);
        expect(out).toMatch(/let mut kind: String = \(if inverse \{ "base"\.to_string\(\) \} else \{ "quote"\.to_string\(\) \}\);/);
        expect(out).toMatch(/let mut idx: i64 = \(if inverse \{ 7 \} else \{ 5 \}\);/);
    });
    test('string methods and Precise results on typed receivers are native', () => {
        expect(out).toMatch(/let mut lower: String = side\.to_lowercase\(\);/);
        expect(out).toMatch(/let mut total: Option<String> = crate::precise::Precise::stringAdd\(.*\)\.as_str\(\)\.map\(str::to_owned\);/);
    });
    test('an expression local stored once and boxed straight back stays Value', () => {
        const rs = transpiler.transpileRustByPath(path.join (rustFixtureRoot, 'scalar-order', 'ts/src/venue.ts')).content;
        expect(rs).toMatch(/let mut once: Value = /);
    });
    test('a local whose operand is itself an expression-typed local takes the native kind', () => {
        expect(out).toContain('let mut sideLen: i64 = (side.chars().count() as i64);');
        expect(out).toContain('let mut doubled: i64 = (lim * 2);');
        expect(out).toContain('let mut big: bool = lim > sideLen;');
    });
    test('an optional number on the smaller side of an ordering is tested for presence first', () => {
        const rs = transpiler.transpileRustByPath(path.join (rustFixtureRoot, 'scalar-order', 'ts/src/venue.ts')).content;
        expect(rs).toContain('let mut last: Option<i64> = ');
        expect(rs).toContain('let mut stale: bool = (last.is_some() && Some(');
        expect(rs).not.toContain('is_greater_than');
    });
    test('a written local that is only read by another typed local takes the native kind', () => {
        const rs = transpiler.transpileRustByPath(path.join (rustFixtureRoot, 'scalar-order', 'ts/src/venue.ts')).content;
        expect(rs).toContain('let mut a: Option<String> = ');
        expect(rs).toContain('let mut b: Option<String> = ');
    });
    test('a string key of a native insert keeps the insert', () => {
        const src = "class T {\n    f (on: boolean, v: any) {\n        const req = {};\n        const key = on ? 'a' : 'b';\n        req[key] = v;\n        return req;\n    }\n}";
        const rs = transpiler.transpileRust(src).content;
        expect(rs).toContain('let mut key: String = ');
        expect(rs).not.toContain('add_element_to_object');
    });
    test('a string local rewritten by a concat with an any operand prints the native concat', () => {
        const src = "class T {\n    f (method: string, body: any) {\n        let auth = 'x' + method;\n        if (body !== undefined) {\n            auth = auth + body;\n        }\n        return auth;\n    }\n}";
        const rs = transpiler.transpileRust(src).content;
        expect(rs).toMatch(/let mut auth: String = /);
        expect(rs).toContain('auth = format!("{}{}", auth, body);');
        expect(rs).not.toContain('add(&auth');
    });
});

describe('typed locals: Vec literal seeds and Arr-only index reads', () => {
    const wrap = (body: string, params = 'items: any[]') => `class T {
    parseX (x) { return x; }
    f (${params}) {
${body}
    }
}`;
    const rs = (body: string, params?: string) => transpiler.transpileRust(wrap(body, params)).content;
    test('a non-empty literal seed is a Vec with the native literal', () => {
        const out = rs("        const out = [ 1 ];\n        out.push (2);\n        return out;");
        expect(out).toContain('let mut out: Vec<Value> = vec![Value::Int(1)];');
        expect(out).toContain('out.push(Value::Int(2));');
        expect(out).toContain('return Value::from(out);');
        expect(out).not.toContain('append_to_array');
    });
    test('a bare local element of a typed literal seed is cloned', () => {
        const out = rs("        const x = items[0];\n        const out = [ x ];\n        out.push (1);\n        return out;");
        expect(out).toContain('let mut out: Vec<Value> = vec![x.clone()];');
        expect(out).toContain('return Value::from(out);');
    });
    test('a literal index read on an Arr-only local is native', () => {
        const out = rs("        const parts = s.split ('-');\n        parts.push ('x');\n        const first = parts[0];\n        return first;", 's: string');
        expect(out).toContain('parts.as_array().and_then(|__arr| __arr.get(0)).cloned().unwrap_or(Value::Null)');
        expect(out).not.toContain('get_value(&parts');
    });
    test('a dynamic index read on an Arr-only local is native', () => {
        const out = rs("        const parts = s.split ('-');\n        parts.push ('x');\n        for (let i = 0; i < parts.length; i++) {\n            const v = parts[i];\n            if (v !== undefined) { return v; }\n        }\n        return undefined;", 's: string');
        expect(out).toContain('parts.as_array().map(Vec::as_slice).unwrap_or_default().get(i as usize)');
        expect(out).not.toContain('get_value(&parts');
    });
    test('negative: a string receiver or a dict keeps the helper', () => {
        expect(rs("        const v = items[0];\n        return v;", 'items: string')).toContain('get_value(&items');
        expect(rs("        const d = { 'a': 1 };\n        return d[0];")).toContain('get_value(&d');
    });
});

describe('native `bool` parameters', () => {
    let base = '';
    let venue = '';
    beforeAll(() => {
        const fresh = new Transpiler({
            'verbose': false,
            'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } }
        } as any);
        base = fresh.transpileRustByPath(path.join (rustFixtureRoot, 'bool-params', 'ts/src/base/Exchange.ts')).content;
        venue = fresh.transpileRustByPath(path.join (rustFixtureRoot, 'bool-params', 'ts/src/venue.ts')).content;
    });

    test('a required `boolean` read only in condition slots prints `bool`', () => {
        expect(venue).toContain('pub fn settlementData(&self, isBuy: bool, amount: Value) -> Value {');
        expect(venue).toContain('if isBuy {');
        expect(venue).not.toContain('is_true(&isBuy)');
    });

    test('an optional `boolean` binds the truthiness the use sites applied', () => {
        expect(venue).toContain('let roundUp: bool = get_arg(optional_args, 0, Value::Bool(false)).is_truthy();');
        expect(venue).toContain('if roundUp {');
        expect(venue).not.toContain('is_true(&roundUp)');
    });

    test('a call into a native-`bool` slot passes the bare bool, a `Value` coerces', () => {
        expect(venue).toContain('return self.settlementData(on, Value::Int(1));');
        expect(venue).toContain('return self.settlementData(raw.is_truthy(), Value::Int(2));');
    });

    test('a bool parameter read outside a bool sink keeps the box', () => {
        expect(venue).toContain('pub fn boxed(&self, flag: Value) -> Value {');
        expect(venue).toContain('let mut held: Value = flag;');
    });

    test('the base tier and base overrides keep the `Value` ABI', () => {
        expect(base).toContain('pub fn setSandboxMode(&self, enabled: Value)');
        expect(base).toContain('pub fn isPostOnly(&self, isMarketOrder: Value, optional_args: &[Value]) -> Value {');
        // native truthiness of a boolean-typed `Value` as the `as_bool()` compare,
        // so the boxed ABI still shows (no bare `if enabled {`)
        expect(base).toContain('if enabled.as_bool() == Some(true) {');
        expect(venue).toContain('pub fn setSandboxMode(&self, enabled: Value)');
    });

    test('a method passed as a value keeps the `Value` signature', () => {
        expect(venue).toContain('pub fn channelB(&self, flag: Value) -> Value {');
        // identifier arm: a boolean-typed `Value` prints the native `as_bool()` compare
        expect(venue).toContain('if flag.as_bool() == Some(true) {');
    });
});

describe('typed dict bearers', () => {
    const rs = rustInParseXClass;

    test('a literal-only dict local is a bare IndexMap with native reads and inserts', () => {
        const out = rs("        const request = { 'type': 'limit' };\n        request['symbol'] = v;\n        const sym = request['symbol'];\n        return sym;");
        expect(out).toContain('let mut request: indexmap::IndexMap<String, Value> = ({');
        expect(out).toContain('request.insert("symbol".into(), v.clone())');
        expect(out).toContain('request.get("symbol").cloned().unwrap_or(Value::Null)');
        expect(out).not.toContain('add_element_to_object');
        expect(out).not.toContain('get_value(&request');
        expect(out).not.toContain('as_map().and_then');
    });

    test('the final move is boxed once (return, and a `this.` argument)', () => {
        const ret = rs("        const res = {};\n        res['a'] = v;\n        return res;");
        expect(ret).toContain('let mut res: indexmap::IndexMap<String, Value> = ({');
        expect(ret).toContain('res.insert("a".into(), v.clone())');
        expect(ret).toContain('return Value::Map(res);');
        const arg = rs("        const params = {};\n        params['a'] = v;\n        return this.parseX (params);");
        expect(arg).toContain('return self.parseX(Value::Map(params));');
    });

    // a boxed key (`v`, `0`) now writes through `stringify_param` — the
    // helper's own conversion — so the negatives are receivers the bearer proof rejects.
    test('negative: an element-read receiver or a foreign container keeps the box', () => {
        const dyn = rs("        const d = {};\n        d[v] = 1;\n        return d['a'];");
        expect(dyn).toContain('let mut d: indexmap::IndexMap<String, Value> = ({');
        const elem = rs("        const d = this.parseX (v)[0];\n        d['a'] = 1;\n        return d;");
        expect(elem).toContain('add_element_to_object(&mut d');
        const keys = rs("        const d = this.parseX (v);\n        const n = Object.keys (d).length;\n        return n;");
        expect(keys).toContain('let mut d: Value = self.parseX(v);');
        expect(keys).toContain('object_keys(&d)');
    });

    test('a proven string key place reads and writes natively', () => {
        const out = rs("        const m = {};\n        m[k] = v;\n        return m[k];", 'v: any, k: string');
        expect(out).toContain('let mut m: indexmap::IndexMap<String, Value> = ({');
        expect(out).toContain('m.insert(crate::runtime::stringify_param(&k), v.clone())');
        expect(out).toContain('m.get(k.as_str().unwrap_or("")).cloned().unwrap_or(Value::Null)');
    });

    test('negative: a numeric key keeps the box', () => {
        const num = rs("        const d = {};\n        d[0] = v;\n        return d[0];");
        expect(num).toContain('let mut d: Value = Value::Map({');
        expect(num).toContain('add_element_to_object(&mut d, &Value::Int(0), v)');
    });

    test('a chained write on a one-level bearer types the local', () => {
        const nested = rs("        const d = {};\n        d['a']['b'] = v;\n        return d['a'];");
        expect(nested).toContain('let mut d: indexmap::IndexMap<String, Value>');
        expect(nested).toContain('if let Value::Dict(__d) = d.entry("a".into()).or_default()');
        expect(nested).not.toContain('get_value_mut');
    });
});

describe('bool locals into native-`bool` slots', () => {
    let venue = '';
    beforeAll(() => {
        const fresh = new Transpiler({
            'verbose': false,
            'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } }
        } as any);
        venue = fresh.transpileRustByPath(path.join (rustFixtureRoot, 'bool-locals', 'ts/src/venue.ts')).content;
    });

    test('a comparison local read in a native-`bool` slot is declared `bool`', () => {
        expect(venue).toContain('let mut isMarket: bool = type_var.as_str() == Some("market");');
        expect(venue).toContain('return self.settle(isMarket, Value::Int(2));');
        expect(venue).not.toContain('isMarket.is_truthy()');
    });

    test('a comparison local read only in conditions keeps the `bool` declaration', () => {
        expect(venue).toContain('let mut isSpot: bool = type_var.as_str() == Some("spot");');
    });

    test('negative: a local read in a `Value` slot keeps the box', () => {
        expect(venue).toContain('let mut isWide: Value = (Value::Bool(type_var.as_str() == Some("spot")));');
        expect(venue).not.toContain('let mut isWide: bool');
    });

    test('negative: a `Value` operand into the bool slot still coerces', () => {
        expect(venue).toContain('return self.settle(raw.is_truthy(), Value::Int(3));');
    });
});

describe('bearer write shapes', () => {
    const rs = rustInParseXClass;

    test('a string-proven computed key writes the bare map', () => {
        const out = rs("        const m = {};\n        m['a' + k] = v;\n        return m;", 'v: any, k: string');
        expect(out).toContain('let mut m: indexmap::IndexMap<String, Value> = ({');
        expect(out).toContain('m.insert(format!("{}{}", Value::Str("a".into()), k), v.clone())');
        expect(out).not.toContain('add_element_to_object');
    });

    test('negative: a computed-key read, or a key naming the receiver, keeps the box', () => {
        const read = rs("        const m = {};\n        m['a' + k] = v;\n        return m['a' + k];", 'v: any, k: string');
        expect(read).toContain('let mut m: Value = Value::Map({');
        expect(read).toContain('add_element_to_object(&mut m,');
        const self = rs("        const m = {};\n        m['a' + m['z']] = v;\n        return m;");
        expect(self).toContain('let mut m: Value = Value::Map({');
        expect(self).toContain('add_element_to_object(&mut m,');
    });

    test('the final move into a parent object literal is boxed once', () => {
        const out = rs("        const d = {};\n        d['a'] = v;\n        const t = { 'x': d };\n        return t;");
        expect(out).toContain('let mut d: indexmap::IndexMap<String, Value> = ({');
        expect(out).toContain('d.insert("a".into(), v.clone())');
        expect(out).toContain('m.insert("x".to_string(), Value::Map(d))');
        expect(out).not.toContain('add_element_to_object');
    });

    test('a shorthand move keeps the box; a later write stays the map', () => {
        const shorthand = rs("        const d = {};\n        d['a'] = v;\n        const t = { d };\n        return t;");
        expect(shorthand).toContain('let mut d: Value = Value::Map({');
        const late = rs("        const d = {};\n        d['a'] = v;\n        const t = { 'x': d };\n        d['b'] = v;\n        return t;");
        expect(late).toContain('let mut d: indexmap::IndexMap<String, Value> = ({');
        expect(late).toContain('m.insert("x".to_string(), Value::Map(d.clone()))');
        expect(late).toContain('d.insert("b".into(), v.clone())');
        expect(late).not.toContain('add_element_to_object');
    });

    test('a bearer handed out twice boxes a clone, then moves', () => {
        const out = rs("        const d = {};\n        d['a'] = v;\n        this.parseX (d);\n        this.parseX (d);\n        return d;");
        expect(out).toContain('let mut d: indexmap::IndexMap<String, Value> = ({');
        expect(out).toContain('self.parseX(Value::Map(d.clone()));\n        self.parseX(Value::Map(d.clone()));');
        expect(out).toContain('return Value::Map(d);');
        expect(out).not.toContain('add_element_to_object');
    });

    test('a bearer rebuilt from a plain literal stays the map', () => {
        const out = rs("        let d: Dict = {};\n        d['a'] = v;\n        if (v) {\n            d = { 'b': 1 };\n        }\n        return d['b'];");
        expect(out).toContain('let mut d: indexmap::IndexMap<String, Value> = ({');
        expect(out).toContain('d = ({');
        expect(out).toContain('return d.get("b").cloned().unwrap_or(Value::Null);');
        expect(out).not.toContain('add_element_to_object');
    });

    test('negative: a rebuild from a call keeps the box', () => {
        const out = rs("        let d: Dict = {};\n        d['a'] = v;\n        if (v) {\n            d = this.parseX (v);\n        }\n        return d;");
        expect(out).toContain('let mut d: Value = Value::Map({');
        expect(out).toContain('add_element_to_object(&mut d,');
    });
});

describe('lent params dicts', () => {
    test('a read-only params dict of a base handle method is lent by reference from typed dict locals', () => {
        const base = transpiler.transpileRustByPath(path.join (rustFixtureRoot, 'lent-params', 'ts/src/base/Exchange.ts')).content;
        expect(base).toMatch(/fn handleParamString\(&self, params: impl Into<crate::Value>, paramName: Value, optional_args: &\[Value\]\)/);
        expect(base).toMatch(/fn handleUntilOption\(&self, key: Value, request: Value, params: impl Into<crate::Value>, optional_args: &\[Value\]\)/);
        expect(base).toContain('let mut params: Value = params.into();');
        const out = transpiler.transpileRustByPath(path.join (rustFixtureRoot, 'lent-params', 'ts/src/venue.ts')).content;
        expect(out).toMatch(/let mut paramsTag: crate::value::Dict = \w+\.get\(1\)\.cloned\(\)\.unwrap_or\(Value::Null\)\.into_dict\(\);/);
        expect(out).toContain(', &paramsTag, &[])');
        expect(out).toMatch(/let mut paramsUntil: crate::value::Dict = /);
        expect(out).toContain('&[&paramsUntil])');
        expect(out).not.toContain('paramsTag: Value');
        expect(out).not.toContain('paramsUntil: Value');
    });

    test('negative: a written or overridden params dict keeps its Value parameter', () => {
        const base = transpiler.transpileRustByPath(path.join (rustFixtureRoot, 'lent-params', 'ts/src/base/Exchange.ts')).content;
        expect(base).toMatch(/fn handleWrittenParams\(&self, params: Value\)/);
        expect(base).toMatch(/fn handleOverriddenParams\(&self, params: Value\)/);
    });
});

describe('handed-on dict locals', () => {
    test('an omit result and a params slot lent only to readers, omit and extend hold the shared map', () => {
        const out = transpiler.transpileRustByPath(path.join (rustFixtureRoot, 'handed-dict', 'ts/src/venue.ts')).content;
        expect(out).toMatch(/let mut query: crate::value::Dict = \w+\.get\(1\)\.cloned\(\)\.unwrap_or\(Value::Null\)\.into_dict\(\);/);
        expect(out).toContain('let mut rest: crate::value::Dict = self.omit(&query, Value::Str("x".into()), &[]).into_dict();');
        expect(out).toContain('self.safe_string_k(&query, "s", &[])');
        expect(out).toContain('&[&rest])');
        expect(out).not.toContain('query: Value');
        expect(out).not.toContain('rest: Value');
    });

    test('negative: a dict local boxed straight back keeps its box', () => {
        const out = transpiler.transpileRustByPath(path.join (rustFixtureRoot, 'handed-dict', 'ts/src/venue.ts')).content;
        expect(out).toContain('let mut kept: Value = ');
    });
});

describe('borrowed dict locals', () => {
    test('a dict local read only by literal-key base readers holds the shared map and lends it to each read', () => {
        const out = transpiler.transpileRustByPath(path.join (rustFixtureRoot, 'borrowed-dict', 'ts/src/venue.ts')).content;
        expect(out).toMatch(/let mut data: crate::value::Dict = self\.safeDict\(resp(?:\.clone\(\))?, Value::Str\("data"\.into\(\)\), &\[\]\)\.into_dict\(\);/);
        expect(out).toContain('self.safe_string_k(&data, "id", &[])');
        expect(out).toContain('self.safe_integer_k(&data, "n", &[Value::Int(1)])');
        expect(out).toContain('let mut merged: crate::value::Dict = ');
        expect(out).toContain('self.safe_string_k(&merged, "s", &[])');
        expect(out).not.toContain('data: Value');
        expect(out).not.toContain('data.clone()');
    });

    test('negative: a dict local that escapes to a Value slot keeps its box', () => {
        const out = transpiler.transpileRustByPath(path.join (rustFixtureRoot, 'borrowed-dict', 'ts/src/venue.ts')).content;
        expect(out).toContain('let mut kept: Value = ');
        expect(out).not.toContain('safe_string_k(&kept');
    });
});

describe('optional dict and list locals', () => {
    test('null-tested or empty-declared container locals hold Option of the shared container and lend it', () => {
        const out = transpiler.transpileRustByPath(path.join (rustFixtureRoot, 'optional-containers', 'ts/src/venue.ts')).content;
        expect(out).toContain('let mut fees: Option<crate::value::Dict> = ');
        expect(out).toContain('.into_opt_dict()');
        expect(out).toContain('fees.is_some()');
        expect(out).toContain('self.safe_string_k(&fees, "id", &[])');
        expect(out).toContain('let mut rows: Option<crate::value::List> = None');
        expect(out).toContain('rows = None');
        expect(out).not.toContain('rows = None.into_opt_list()');
        expect(out).toContain('.into_opt_list()');
        expect(out).toContain('rows.is_some()');
        expect(out).toContain('self.safeValue(&rows, ');
        expect(out).toContain('let mut info: Option<crate::value::Dict> = None');
        expect(out).toContain('self.safeString(&info, key');
        expect(out).not.toContain('fees: Value');
        expect(out).not.toContain('rows: Value');
        expect(out).not.toContain('info: Value');
    });

    test('negative: a non-empty default, a boxed escape or a returned null keeps the box', () => {
        const out = transpiler.transpileRustByPath(path.join (rustFixtureRoot, 'optional-containers', 'ts/src/venue.ts')).content;
        expect(out).toContain('let mut filled: Value = ');
        expect(out).toContain('let mut lost: Value = ');
        expect(out).toContain('let mut kept: Value = ');
        expect(out).not.toContain('Option<crate::value::Dict> = self.safeDict(resp.clone(), "filled"');
    });
});

describe('containers lent to any-key readers', () => {
    test('dict and list locals read by variable keys, indexes and length hold the shared container and lend it', () => {
        const out = transpiler.transpileRustByPath(path.join (rustFixtureRoot, 'borrowed-any-key', 'ts/src/venue.ts')).content;
        expect(out).toContain('let mut data: crate::value::Dict = ');
        expect(out).toContain('self.safeString(&data, key');
        expect(out).toContain('self.safe_integer_k(&data, "n", &[Value::Int(1)])');
        expect(out).toContain('self.safeString(&vs, key');
        expect(out).not.toContain('vs.clone().into()');
        expect(out).toContain('let mut lst: crate::value::List = ');
        expect(out).toContain('.into_list()');
        expect(out).toContain('self.safeValue(&lst, ');
        expect(out).toContain('self.safeString2(&lst, ');
        expect(out).toContain('self.safeString(&rows, ');
        expect(out).toMatch(/rows\.len\(\) as i64/);
        expect(out).not.toContain('rows.clone().into()');
        expect(out).not.toContain('lst: Value');
        expect(out).not.toContain('data: Value');
    });

    test('negative: a list local read by a transpiled reader or boxed keeps its box', () => {
        const out = transpiler.transpileRustByPath(path.join (rustFixtureRoot, 'borrowed-any-key', 'ts/src/venue.ts')).content;
        expect(out).toContain('let mut kept: Value = ');
        expect(out).not.toContain('&kept');
    });
});

describe('container locals with boxing uses', () => {
    const rs = rustInParseXClass;

    test('a defaulted safeList / safeDict local is typed; reads stay native, Value slots box a clone', () => {
        const out = rs("        const xs = this.safeList (v, 'a', []);\n        const m = this.safeDict (v, 'k', {});\n        const b = xs[1];\n        const d = m['decimals'];\n        this.parseX (xs);\n        this.parseX (m);\n        return [ b, d, m ];");
        expect(out).toContain('let mut xs: Vec<Value> = self.safeList(');
        expect(out).toContain('let mut m: indexmap::IndexMap<String, Value> = self.safeDict(');
        expect(out).toContain('xs.get(1).cloned().unwrap_or(Value::Null)');
        expect(out).toContain('m.get("decimals").cloned().unwrap_or(Value::Null)');
        expect(out).toContain('self.parseX(xs.clone().into())');
        expect(out).toContain('self.parseX(m.clone().into())');
        expect(out).toContain('Value::Map(m.clone())]');
        expect(out).not.toContain('xs: Value');
        expect(out).not.toContain('m: Value');
    });

    test('a returned non-null container moves into its box', () => {
        const out = rs("        const xs = this.safeList (v, 'a', []);\n        const n = xs.length;\n        return xs;");
        expect(out).toContain('let mut xs: Vec<Value> = ');
        expect(out).toContain('return Value::from(xs);');
    });

    test('negative: a nullable local escaping beyond safe readers, a write or a reassignment keeps the box', () => {
        const nullable = rs("        const m = this.safeDict (v, 'k');\n        return m;");
        expect(nullable).toContain('let mut m: Value = self.safeDict(');
        const written = rs("        const m = this.safeDict (v, 'k', {});\n        m['a'] = 1;\n        this.parseX (m);\n        return 1;");
        expect(written).toContain('let mut m: Value = self.safeDict(');
        const reassigned = rs("        let xs = this.safeList (v, 'a', []);\n        this.parseX (xs);\n        xs = [];\n        return 1;");
        expect(reassigned).toContain('let mut xs: Value = self.safeList(');
    });
});

describe('read-only container bearers', () => {
    const rs = rustInParseXClass;

    test('a split local is a Vec<Value> with closure-free native reads', () => {
        const out = rs("        const parts = v.split ('-');\n        const a = parts[0];\n        const b = parts[1];\n        return a;");
        expect(out).toContain('let mut parts: Vec<Value> = split(&v, &Value::Str("-".into())).as_array().cloned().unwrap_or_default();');
        expect(out).toContain('parts.get(0).cloned().unwrap_or(Value::Null)');
        expect(out).toContain('parts.get(1).cloned().unwrap_or(Value::Null)');
        expect(out).not.toContain('get_value(&parts');
        expect(out).not.toContain('and_then(|__arr|');
        expect(out).not.toContain('as_map().and_then');
    });

    test('a loop counter indexes the bearer natively, `.length` is `len()`', () => {
        const out = rs("        const xs = v.split (',');\n        for (let i = 0; i < xs.length; i++) {\n            const e = xs[i];\n            if (e) { return e; }\n        }\n        return 0;");
        expect(out).toContain('let mut xs: Vec<Value> = split(&v, &Value::Str(",".into())).as_array().cloned().unwrap_or_default();');
        expect(out).toContain('i < (xs.len() as i64)');
        expect(out).toContain('xs.get(i as usize).cloned().unwrap_or(Value::Null)');
        expect(out).not.toContain('get_array_length(&xs');
        expect(out).not.toContain('get_value(&xs');
    });

    test('a safeList local with a list default is a Vec<Value>; Promise.all too', () => {
        const out = rs("        const xs = this.safeList (v, 'a', []);\n        const b = xs[1];\n        return b;");
        expect(out).toContain('let mut xs: Vec<Value> = self.safeList(v, Value::Str("a".into()), Value::from(vec![])).as_array().cloned().unwrap_or_default();');
        expect(out).toContain('xs.get(1).cloned().unwrap_or(Value::Null)');
        const allOut = rs("        const rs2 = await Promise.all (ps);\n        const b = rs2[0];\n        return b;", 'ps: any');
        expect(allOut).toContain('let mut rs2: Vec<Value> = promise_all(&ps).await.as_array().cloned().unwrap_or_default();');
    });

    test('a read-only dict local is a bare IndexMap; literal-key reads are map lookups', () => {
        const out = rs("        const m = this.safeDict (v, 'k', {});\n        const d = m['decimals'];\n        const e = m['base'];\n        return d;");
        expect(out).toContain('let mut m: indexmap::IndexMap<String, Value> = self.safeDict(');
        expect(out).toContain('m.get("decimals").cloned().unwrap_or(Value::Null)');
        expect(out).toContain('m.get("base").cloned().unwrap_or(Value::Null)');
        expect(out).not.toContain('get_value(&m');
        expect(out).not.toContain('as_map().and_then');
    });

    test('negative: an escape, a push, a write or an unproven key keeps the box', () => {
        // returned
        const escaped = rs("        const parts = v.split ('-');\n        const a = parts[0];\n        return parts;");
        expect(escaped).toContain('let mut parts: Value = split(&v, &Value::Str("-".into()));');
        expect(escaped).toContain('get_value(&parts, &Value::Int(0))');
        // pushed
        const pushed = rs("        const parts = v.split ('-');\n        parts.push (1);\n        return parts[0];");
        expect(pushed).toContain('let mut parts: Value = split(');
        expect(pushed).toContain('get_value(&parts, &Value::Int(0))');
        // written dict
        const written = rs("        const m = this.safeDict (v, 'k', {});\n        m['a'] = 1;\n        return m['a'];");
        expect(written).toContain('let mut m: Value = self.safeDict(');
        // dynamic key
        const dyn = rs("        const d = this.safeDict (v, 'k', {});\n        const e = d[a];\n        return e;", 'v: any, a: string');
        expect(dyn).toContain('let mut d: Value = self.safeDict(');
        expect(dyn).toContain('get_value(&d, &a)');
        // Object.keys on a list local
        const keys = rs("        const parts = v.split ('-');\n        const n = Object.keys (parts).length;\n        return n;");
        expect(keys).toContain('let mut parts: Value = split(');
    });
});

describe('two-level dict bearers', () => {
    const rs = rustInParseXClass;

    test('an object-of-objects local is a nested IndexMap with native write and move', () => {
        const out = rs("        const request = { 'params': {} };\n        request['params']['limit'] = v;\n        return request;");
        expect(out).toContain('let mut request: indexmap::IndexMap<String, indexmap::IndexMap<String, Value>> = (');
        expect(out).toContain('request.entry("params".to_string()).or_default().insert("limit".to_string(), v.clone())');
        expect(out).toContain('return Value::from(request);');
        expect(out).not.toContain('get_value_mut');
        expect(out).not.toContain('add_element_to_object');
    });

    test('a two-level read is the two map lookups, not a `get_value` on a box', () => {
        const out = rs("        const d = { 'a': {} };\n        d['a']['b'] = v;\n        return d['a']['b'];");
        expect(out).toContain('let mut d: indexmap::IndexMap<String, indexmap::IndexMap<String, Value>> = (');
        expect(out).toContain('d.get("a").and_then(|__n| __n.get("b")).cloned().unwrap_or(Value::Null)');
        expect(out).not.toContain('get_value(&d');
    });

    test('a proven string key place reaches the native entry insert', () => {
        const out = rs("        const d = {};\n        d['a'][k] = v;\n        return d;", 'v: any, k: string');
        expect(out).toContain('d.entry("a".to_string()).or_default().insert(crate::runtime::stringify_param(&k), v.clone())');
    });

    test('a bearer with no two-level use keeps the flat map it escapes through', () => {
        const out = rs("        const request = {};\n        const r = this.postActionRequest(t, request, params);\n        return r;", 't: any, params: any');
        expect(out).not.toContain('indexmap::IndexMap<String, indexmap::IndexMap');
        expect(out).toContain('Value::Map(request)');
    });

    test('a nested literal only used whole keeps the flat map', () => {
        const out = rs("        const statuses = { 'deposit': { 'New': 'pending' } };\n        const r = this.safeDict(statuses, t);\n        return r;", 't: any');
        expect(out).not.toContain('indexmap::IndexMap<String, indexmap::IndexMap');
        expect(out).toContain('Value::Map(statuses)');
    });

    test('a bucket seeded as `x[k1] = {}` is the inner map itself', () => {
        const out = rs("        const withdrawFees = {};\n        withdrawFees[code] = {};\n        withdrawFees[code][networkCode] = fee;\n        return { 'withdraw': withdrawFees };", 'code: string, networkCode: string, fee: any');
        expect(out).toContain('let mut withdrawFees: indexmap::IndexMap<String, indexmap::IndexMap<String, Value>>');
        expect(out).toContain('or_default()');
        expect(out).not.toContain('get_value_mut');
        expect(out).not.toContain('add_element_to_object');
        expect(out).toContain('Value::from(withdrawFees)');
    });

    test('a bucket seeded from a non-empty literal writes below the boxed seed natively', () => {
        const out = rs("        const d = {};\n        d['a'] = { 'b': v };\n        d['a']['c'] = v;\n        return d;");
        expect(out).toContain('let mut d: indexmap::IndexMap<String, Value>');
        expect(out).toContain('d.insert("a".into(), Value::Map({');
        expect(out).toContain('if let Value::Dict(__d) = d.entry("a".into()).or_default()');
    });

    test('a three-level chain keeps every middle hop on get_value_mut', () => {
        const out = rs("        const d = {};\n        d['a']['b']['c'] = v;\n        return d;");
        expect(out).toContain('add_element_to_object(get_value_mut(d.entry("a".into()).or_default(), &Value::Str("b".into())), &Value::Str("c".into()), v);');
    });

    test('negative: an unproven hop key or a receiver-reading value keeps the box', () => {
        // the hop key of the chain root is unproven: a numeric literal
        const num = rs("        const d = {};\n        d[0][1] = v;\n        return d[0];");
        expect(num).toContain('let mut d: Value = Value::Map({');
        expect(num).toContain('add_element_to_object(get_value_mut(&mut d, &Value::Int(0)), &Value::Int(1), v);');
        const self = rs("        const d = {};\n        d['a']['b'] = d['a'];\n        return d;");
        expect(self).toContain('let mut d: Value = Value::Map({');
    });
});

describe('dict bearer from a map-producing call', () => {
    const wrap = (body: string, params = 'v: any') => `type Dict = { [key: string]: any };
class T {
    safeDict (o: Dict, k: string, d: Dict = {}): Dict { return d; }
    safeString (o: Dict, k: string, d: string = ''): string { return ''; }
    extend (a: Dict, b: Dict): Dict { return {}; }
    f (${params}) {
${body}
    }
}`;
    const rs = (body: string, params?: string) => transpiler.transpileRust(wrap(body, params)).content;

    test('a safeDict local is a bearer: literal-key reads are map lookups', () => {
        const out = rs("        const data = this.safeDict (o, 'data', {});\n        return data['id'];", 'o: Dict');
        expect(out).toContain('let mut data: indexmap::IndexMap<String, Value> = (match o.get("data")');
        expect(out).toContain('data.get("id").cloned().unwrap_or(Value::Null)');
        expect(out).not.toContain('get_value(&data');
    });

    test('a produced local that escapes keeps the box', () => {
        // A helper call would have to re-box the map (`Value::Map(data.clone())`): no helper
        // falls, and the line grows. The local stays a `Value`.
        const out = rs("        const data = this.safeDict (o, 'data', {});\n        const t = this.extend (data, { 'id': this.safeString (data, 'id') });\n        return t;", 'o: Dict');
        expect(out).toContain('let mut data: Value = ');
        expect(out).not.toContain('Value::Map(data.clone())');
    });

    test('extend of an untyped parameter keeps the box', () => {
        const out = rs("        const t = this.extend (v, { 'id': 1 });\n        return t;");
        expect(out).toContain('let mut t: Value = self.extend(v');
        expect(out).not.toContain('indexmap::IndexMap');
    });
});

describe('rust sign api element', () => {
    const sign = (body: string, name = 'sign') => transpiler.transpileRust(`class Foo {
    ${name} (path: string, api: string[] = [ 'public' ], method: string = 'GET', params: any = {}) {
${body}
    }
}`).content;

    test('a local read from api and only compared with literals is an Option<String>', () => {
        const out = sign("        const apiName = api[0];\n        if (apiName === 'private') { return 1; }\n        return 0;");
        expect(out).toContain('let mut apiName: Option<String> = api.get(0).and_then(Value::as_str).map(str::to_owned);');
        expect(out).toContain('apiName.as_deref() == Some("private")');
    });

    test('a use that is not a literal compare keeps the Value', () => {
        const out = sign("        const apiName = api[0];\n        return this.foo(apiName);");
        expect(out).toContain('let mut apiName: Value = api.get(0).cloned().unwrap_or(Value::Null);');
        expect(out).not.toContain('Option<String>');
    });

    test('a null compare keeps the Value', () => {
        const out = sign("        const apiName = api[0];\n        if (apiName === 'a' || apiName !== undefined) { return 1; }\n        return 0;");
        expect(out).toContain('let mut apiName: Value = ');
    });

    test('a method that is not sign/fetch2/request keeps the Value', () => {
        const out = sign("        const apiName = api[0];\n        if (apiName === 'private') { return 1; }\n        return 0;", 'other');
        expect(out).not.toContain('Option<String>');
    });
});

describe('rust catch binding', () => {
    const rs = (body: string) => transpiler.transpileRust(`class Foo {\n    f () {\n${body}\n    }\n}`).content;

    test('a handler that never reads its binding tests is_err', () => {
        const out = rs("        try { this.foo (); } catch (e) { this.bar (); }");
        expect(out).toContain('if _try_result.is_err() {');
        expect(out).not.toContain('Err(_e)');
    });

    test('a handler that reads its binding keeps the Err pattern', () => {
        const out = rs("        try { this.foo (); } catch (e) { this.bar (e); }");
        expect(out).toContain('if let Err(_e) = _try_result {');
    });

    test('a catch without a binding tests is_err', () => {
        const out = rs("        try { this.foo (); } catch { this.bar (); }");
        expect(out).toContain('if _try_result.is_err() {');
    });
});

describe('rust string member read off a class-typed parameter', () => {
    const rs = (body: string) => transpiler.transpileRust(
        `class Src {\n    id: string = 'x';\n    markets: any = undefined;\n}\nclass Foo {\n    id: string = 'y';\n    f (other: Src) {\n${body}\n    }\n}`).content;

    test('a concat operand reads the member with get_value_k', () => {
        const out = rs("        return this.id + ' got ' + other.id;");
        expect(out).toContain('crate::value::get_value_k(&other, \"id\")');
        expect(out).not.toContain('other.id');
    });

    test('a non-string member keeps the default shape', () => {
        const out = rs("        return other.markets;");
        expect(out).not.toContain('get_value_k(&other, \"markets\")');
    });

    test('a string member written through the parameter is untouched', () => {
        const out = rs("        other.id = 'z';");
        expect(out).not.toContain('get_value_k(&other, \"id\")');
    });
});

describe('rust order-book field read', () => {
    const rs = (body: string) => transpiler.transpileRust(
        `class OrderBook { bids: any; nonce: number; foo: any; }\nfunction f (orderbook: OrderBook, other: any) {\n${body}\n}`).content;

    test('book bids/nonce print book_field', () => {
        const out = rs("    const b = orderbook['bids'];\n    const n = orderbook['nonce'];");
        expect(out).toContain('orderbook.book_field("bids")');
        expect(out).toContain('orderbook.book_field("nonce")');
    });

    test('book.cache / nonce property reads print book_field', () => {
        const out = rs("    const m = orderbook.cache;\n    const n = orderbook.nonce;");
        expect(out).toContain('orderbook.book_field("cache")');
        expect(out).toContain('orderbook.book_field("nonce")');
    });

    test('other keys and untyped receivers keep the default', () => {
        const out = rs("    const f = orderbook['foo'];\n    const o = other['bids'];");
        expect(out).not.toContain('book_field("foo")');
        expect(out).not.toContain('other.book_field');
    });
});

describe('rust typed unified-method signatures', () => {
    let output = '';
    beforeAll(() => {
        const typed = new Transpiler({ 'verbose': false, 'rust': { 'typedUnified': ['fetchTicker', 'fetchTickers', 'fetchTrades', 'fetchOHLCV', 'fetchOrder', 'createOrder', 'cancelOrder', 'cancelOrders', 'createOrders', 'fetchPositions', 'watchOrders', 'watchTrades', 'withdraw', 'transfer', 'fetchLedger', 'fetchTradingFees', 'setLeverage', 'fetchTime', 'watchOHLCVForSymbols', 'unWatchTicker', 'fetchEvents'], 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        output = typed.transpileRustByPath(path.join (rustFixtureRoot, 'typed-unified', 'ts/src/venue.ts')).content;
    });

    test('a listed unified method prints its typed public signature', () => {
        expect(output).toContain('pub fn fetchTicker(&self, symbol: &str, params: impl Into<crate::Params> + Send) -> crate::Result<crate::types::Ticker>');
        expect(output).toContain('pub fn fetchTrades(&self, symbol: &str, since: Option<i64>, limit: Option<i64>, params: impl Into<crate::Params> + Send) -> crate::Result<Vec<crate::types::Trade>>');
    });

    test('the Value body runs in an async block over the lowered arguments', () => {
        expect(output).toContain('let __args: Vec<Value> = vec![Value::from(symbol), params.into().into_value()];');
        expect(output).toContain('let mut symbol = __it.next().unwrap_or_default();');
        expect(output).toContain('let __optional_args: Vec<Value> = __it.collect();');
        expect(output).toContain('crate::runtime::call_typed(async move {');
        expect(output).not.toContain('call_typed((move |');
    });

    test('an intra-core call to a typed method lowers its arguments and boxes the result', () => {
        expect(output).toContain('crate::types::IntoRaw::into_raw(self.fetch_tickers((Value::from(vec![symbol])).to_opt_str_vec(), params.clone()).await)');
    });

    test('an optional string parameter prints Option<&str> and lowers to Null when absent', () => {
        expect(output).toContain('pub fn fetchOHLCV(&self, symbol: &str, timeframe: Option<&str>, since: Option<i64>, limit: Option<i64>, params: impl Into<crate::Params> + Send) -> crate::Result<Vec<crate::types::OHLCV>>');
        expect(output).toContain('pub fn fetchOrder(&self, id: &str, symbol: Option<&str>, params: impl Into<crate::Params> + Send) -> crate::Result<crate::types::Order>');
        expect(output).toContain('symbol.map(Value::from).unwrap_or_default()');
        expect(output).toContain('self.fetch_ohlcv(symbol.as_str().unwrap_or_default(), tf.as_str(), None, None, params.clone()).await');
    });

    test('a typed call inside an awaited Promise.all boxes its result', () => {
        expect(output).toContain('crate::types::IntoRaw::into_raw(self.fetch_order("1", symbol.as_str(), params.clone()).await)');
    });

    test('order writes print typed f64 / Option<f64> / Option<&str> / Vec<String> parameters', () => {
        expect(output).toContain('pub fn createOrder(&self, symbol: &str, type_var: &str, side: &str, amount: f64, price: Option<f64>, params: impl Into<crate::Params> + Send) -> crate::Result<crate::types::Order>');
        expect(output).toContain('pub fn cancelOrder(&self, id: &str, symbol: Option<&str>, params: impl Into<crate::Params> + Send) -> crate::Result<crate::types::Order>');
        expect(output).toContain('pub fn cancelOrders(&self, ids: Vec<String>, symbol: Option<&str>, params: impl Into<crate::Params> + Send) -> crate::Result<Vec<crate::types::Order>>');
    });

    test('an OrderRequest[] parameter prints the typed request list and decodes at intra-core calls', () => {
        expect(output).toContain('pub fn createOrders(&self, orders: Vec<crate::types::OrderRequest>, params: impl Into<crate::Params> + Send) -> crate::Result<Vec<crate::types::Order>>');
        expect(output).toContain('crate::types::IntoRaw::into_raw(orders)');
        expect(output).toContain('self.create_orders(crate::types::FromRaw::from_raw(Value::from(vec![order])), params.clone()).await');
    });

    test('literal arguments of a typed call print in the native parameter type', () => {
        expect(output).toContain('self.create_order(symbol.as_str().unwrap_or_default(), "market", "buy", cost.as_f64().unwrap_or_default(), None, ');
    });

    test('a Promise.all element call to a typed method boxes the result', () => {
        expect(output).toContain('promise_all(&Value::from(vec![crate::types::IntoRaw::into_raw(self.fetch_positions(None, Value::Null).await)]))');
        expect(output).toContain('let mut again: Vec<crate::types::Position> = (match self.fetch_positions(None, Value::Null).await {');
        expect(output).not.toContain('None.clone()');
    });

    test('a required int parameter prints i64 and Value / Option<i64> returns decode typed', () => {
        expect(output).toContain('pub fn setLeverage(&self, leverage: i64, symbol: Option<&str>, params: impl Into<crate::Params> + Send) -> crate::Result<Value>');
        expect(output).toContain('pub fn fetchTime(&self, params: impl Into<crate::Params> + Send) -> crate::Result<Option<i64>>');
        expect(output).toContain('self.set_leverage(');
    });

    test('a required Str parameter (nullable, positional in the other ports) prints Option<&str>', () => {
        expect(output).toContain('pub fn watchTrades(&self, symbol: Option<&str>, since: Option<i64>, limit: Option<i64>, params: impl Into<crate::Params> + Send) -> crate::Result<Vec<crate::types::Trade>>');
    });

    test('symbolsAndTimeframes prints Vec<Vec<String>>, an unsubscribe ack stays Value, event params are Params', () => {
        expect(output).toContain('pub fn watchOHLCVForSymbols(&self, symbolsAndTimeframes: Vec<Vec<String>>, since: Option<i64>, limit: Option<i64>, params: impl Into<crate::Params> + Send) -> crate::Result<crate::types::OHLCVsBySymbol>');
        expect(output).toContain('pub fn unWatchTicker(&self, symbol: &str, params: impl Into<crate::Params> + Send) -> crate::Result<crate::Value>');
        expect(output).toContain('pub fn fetchEvents(&self, params: impl Into<crate::Params> + Send) -> crate::Result<Vec<crate::types::PredictionEvent>>');
    });

    test('an optional Str parameter prints Option<&str> and a watch return decodes typed', () => {
        expect(output).toContain('pub fn watchOrders(&self, symbol: Option<&str>, since: Option<i64>, limit: Option<i64>, params: impl Into<crate::Params> + Send) -> crate::Result<Vec<crate::types::Order>>');
        // explicit undefined arguments print as the absent default (sibling order/account rule)
        expect(output).toContain('crate::types::IntoRaw::into_raw(self.watch_orders(symbol.as_str(), None, None, params.clone()).await)');
        expect(output).not.toContain('(Value::Null).as_i64()');
    });

    test('funding methods print typed signatures and typed intra-core calls', () => {
        expect(output).toContain('pub fn withdraw(&self, code: &str, amount: f64, address: &str, params: impl Into<crate::Params> + Send) -> crate::Result<crate::types::Transaction>');
        expect(output).toContain('pub fn transfer(&self, code: &str, amount: f64, fromAccount: &str, toAccount: &str, params: impl Into<crate::Params> + Send) -> crate::Result<crate::types::Transfer>');
        expect(output).toContain('-> crate::Result<Vec<crate::types::LedgerEntry>>');
        expect(output).toContain('-> crate::Result<crate::types::TradingFees>');
        expect(output).toContain('self.transfer(code.as_str().unwrap_or_default(), 1.0, "spot", "swap", params.clone()).await');
        expect(output).toContain('self.fetch_ledger(code.as_str(), None, (Value::Int(10)).as_i64(), Value::Null).await');
    });

    test('without the config entry the method keeps the Value signature', () => {
        const plain = transpiler.transpileRustByPath(path.join (rustFixtureRoot, 'typed-unified', 'ts/src/venue.ts')).content;
        expect(plain).toContain('pub fn fetchTicker(&self, symbol: Value, optional_args: &[Value]) -> Value');
    });
});

describe('rust string[] parameter used only by join', () => {
    let output = '';
    beforeAll(() => {
        output = transpiler.transpileRustByPath(path.join (rustFixtureRoot, 'a15dstrvec', 'ts/src/venue.ts')).content;
    });

    test('a joined-only string[] param is a Vec<String> with the std join and no closure', () => {
        expect(output).toContain('pub fn fetchByIds(&self, ids: Vec<String>, optional_args: &[Value])');
        expect(output).toContain('Value::Str(ids.join(",").into())');
    });

    test('the array-literal caller passes vec![..] of strings', () => {
        expect(output).toContain('self.fetchByIds(vec![id.to_string()]');
    });

    test('a public method with no ts caller also prints Vec<String>', () => {
        expect(output).toContain('fn fetchNoCaller(&self, ids: Vec<String>');
    });

    test('a plain Value local caller converts with to_str_vec', () => {
        expect(output).toContain('self.fetchByIds(chunk.to_str_vec()');
    });

    test('a param that is also indexed keeps the Value box', () => {
        expect(output).toContain('fn fetchIndexed(&self, ids: Value');
    });

    test('a caller that is not an array literal keeps the Value box', () => {
        expect(output).toContain('fn fetchComputed(&self, ids: Value');
        expect(output).not.toContain('self.fetchComputed(ids.to_str_vec()');
    });
});

describe('RF-rust-1 type-keyed closure-free native forms', () => {
    const body = (stmts: string, params = 'a: string, b: any') =>
        transpiler.transpileRust(`class A {\n    run(${params}) {\n${stmts}\n    }\n}`).content;

    test('indexOf("lit") >= 0 / > -1 on a string place is a contains test', () => {
        const o = body("        if (a.indexOf('x') >= 0) { return 1; }\n        if (a.indexOf('y') > -1) { return 2; }\n        return 0;");
        expect(o).toContain('if a.as_str().unwrap_or("").contains("x") {');
        expect(o).toContain('if a.as_str().unwrap_or("").contains("y") {');
        expect(o).not.toContain('__s.find');
    });

    test('indexOf("lit") < 0 negates; > 0 and an empty needle keep the position', () => {
        const o = body("        if (a.indexOf('x') < 0) { return 1; }\n        if (a.indexOf('y') > 0) { return 2; }\n        if (a.indexOf('') >= 0) { return 3; }\n        return 0;");
        expect(o).toContain('if !a.as_str().unwrap_or("").contains("x") {');
        expect(o).toContain('__s.find("y")');
        expect(o).toContain('__s.find("")');
    });

    test('indexOf("lit") >= 0 on an unproven receiver keeps the helper', () => {
        const o = body("        if (b.indexOf('x') >= 0) { return 1; }\n        return 0;");
        expect(o).not.toContain('.contains("x")');
    });

    test('indexOf("lit") >= 0 outside a condition boxes the bool', () => {
        const o = body("        const f = a.indexOf('x') >= 0;\n        return f;");
        expect(o).toContain('Value::Bool(a.as_str().unwrap_or("").contains("x"))');
    });

    test('slice start literal folds its Int cast', () => {
        const o = body("        return a.slice(0, b);", 'a: any, b: number');
        expect(o).toContain('(match (&(a), 0i64,');
        expect(o).not.toContain('unwrap_or(0)');
    });

    test('toLowerCase on a string place is closure-free', () => {
        const o = body("        return a.toLowerCase();");
        expect(o).toContain('(if let Some(__s) = a.as_str() { Value::Str(__s.to_lowercase().into()) } else { Value::Null })');
        expect(o).not.toContain('|__s|');
    });

    test('startsWith / split with a non-empty literal on a string place are closure-free', () => {
        const o = body("        const p = a.split(',');\n        return [p, a.startsWith('0x')];");
        expect(o).toContain('Value::Array(if let Some(__s) = a.as_str() { __s.split(",").map(Value::from).collect() } else { Vec::new() })');
        expect(o).toContain('a.as_str().unwrap_or("").starts_with("0x")');
    });

    test('an empty startsWith literal keeps the closure (an empty prefix matches only a Str)', () => {
        const o = body("        return a.startsWith('');");
        expect(o).toContain('a.as_str().is_some_and(|__s| __s.starts_with(""))');
    });
});

describe('FM-RS1 L2 integer for-loop counters', () => {
    const body = (stmts: string, params = 'lim: number, v: any') =>
        transpiler.transpileRust(`class A {\n    run(${params}) {\n${stmts}\n    }\n    bar(x) {}\n}`).content;
    const step = (v: string, sign = '+') => new RegExp(`if !__for_first_\\d+ \\{ if let Value::Int\\(n\\) = &mut ${v} \\{ \\*n \\${sign}= 1; \\} \\}`);
    const matchStep = (v: string, k = 1) => `${v} = (match (&(${v}), &(Value::Int(${k})))`;

    test('i++ / i-- on an int-literal counter bumps the Int payload in place', () => {
        const o = body("        for (let i = 0; i < lim; i++) { this.bar (lim); }\n        for (let j = 5; j > 0; j--) { this.bar (lim); }");
        expect(o).toMatch(step('i'));
        expect(o).toMatch(step('j', '-'));
        expect(o).not.toContain(matchStep('i'));
    });

    test('a counter written in the body keeps the printNativeNumeric step', () => {
        const o = body("        for (let i = 0; i < lim; i++) { i += 2; }\n        for (let j = 0; j < lim; j++) { j = n; }");
        expect(o).toContain(matchStep('i'));
        expect(o).toContain(matchStep('j'));
    });

    test('a non-literal start, a float start or a +=2 step keeps the match', () => {
        const o = body("        for (let a = lim; a < 9; a++) { }\n        for (let b = 0.5; b < 9; b++) { }\n        for (let c = 0; c < 9; c += 2) { }");
        expect(o).toContain(matchStep('a'));
        expect(o).toContain(matchStep('b'));
        expect(o).toContain(matchStep('c', 2));
        expect(o).not.toContain('if let Value::Int(n) = &mut');
    });

    test('a counter that only indexes a list and is passed to this.m() is an i64', () => {
        const o = body("        const xs = v.split (',');\n        for (let i = 0; i < xs.length; i++) {\n            const e = xs[i];\n            this.bar (i);\n        }");
        expect(o).toContain('let mut i: i64 = 0;');
        expect(o).toMatch(/if !__for_first_\d+ \{ i \+= 1; \}/);
        expect(o).toContain('i < (xs.len() as i64)');
        expect(o).toContain('xs.get(i as usize).cloned().unwrap_or(Value::Null)');
        expect(o).toContain('self.bar(Value::Int(i))');
    });

    test('the step binds __n when the function already uses the name n', () => {
        const o = body("        for (let i = 0; i < n; i++) { this.bar (n); }", 'n: number');
        expect(o).toContain('if let Value::Int(__n) = &mut i { *__n += 1; }');
    });

    test('a counter with any other use stays a Value counter', () => {
        const o = body("        const xs = v.split (',');\n        for (let i = 0; i < xs.length; i++) {\n            const e = xs[i];\n            if (i === 3) { return e; }\n        }");
        expect(o).toContain('let mut i: Value = Value::Int(0);');
        expect(o).toMatch(step('i'));
        expect(o).not.toContain('i: i64');
        expect(o).toContain('xs.get(i.as_i64().unwrap_or(-1) as usize)');
    });

    test('nested counters type independently and number their loop flags once each', () => {
        const o = body("        const xs = v.split (',');\n        for (let i = 0; i < xs.length; i++) {\n            for (let j = 0; j < xs.length; j++) { const e = xs[j]; this.bar (i); }\n        }");
        expect(o).toContain('let mut i: i64 = 0;');
        expect(o).toContain('let mut j: i64 = 0;');
        expect((o.match(/let mut __for_first_\d+: bool/g) ?? []).length).toBe(2);
        expect(new Set(o.match(/__for_first_\d+/g)).size).toBe(2);
    });
});

describe ('rustCallInitContainerLocals', () => {
    let transpiler: Transpiler;

    beforeAll(() => {
        transpiler = new Transpiler({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    });

    const PRELUDE = 'interface Dictionary<T> { [key: string]: T }\n' +
        'type Dict = Dictionary<any>;\n' +
        'type Str = string | undefined;\n' +
        'interface MarketInterface { id?: string, symbol?: string }\n' +
        'type Market = MarketInterface | undefined;\n' +
        'class Base {\n' +
        '    market (symbol: Str): Market { return undefined; }\n' +
        '    safeString (o: any, k: any, def: any = undefined): any { return undefined; }\n' +
        '    safeDict (o: any, k: any, def: any = undefined): Dict { return o[k]; }\n' +
        '    safeList (o: any, k: any, def: any = undefined): any[] { return []; }\n' +
        '    extend (a: any, b: any): any { return a; }\n' +
        '    parseOrderBook (o: any, s: Str): Dict { return { "symbol": s }; }\n' +
        '    use (x: any): any { return x; }\n' +
        '}\n' +
        'class Venue extends Base {\n';

    function rust(body: string): string {
        return transpiler.transpileRust(PRELUDE + body + '}\n').content;
    }

    // a local initialised from `this.<m>(…)` is typed as the container
    // the callee's own returns build, so its reads and writes print the native op.
    describe('call-init container locals', () => {
        test('a base method that returns a literal map types the local and its write', () => {
            const out = rust('    depth (response: any, symbol: Str) {\n'
                + '        const orderbook = this.parseOrderBook (response, symbol);\n'
                + "        orderbook['nonce'] = 1;\n"
                + '        return orderbook;\n'
                + '    }\n');
            expect(out).toContain('let mut orderbook: indexmap::IndexMap<String, Value> = self.parseOrderBook(response, symbol).as_map().cloned().unwrap_or_default();');
            expect(out).toContain('orderbook.insert("nonce".into(), Value::Int(1));');
            expect(out).not.toContain('add_element_to_object(&mut orderbook');
            expect(out).not.toContain('if let Value::Dict(__d) = &mut orderbook');
        });

        test('a literal-key read on the typed local prints the map lookup', () => {
            const out = rust('    depthNonce (response: any, symbol: Str) {\n'
                + '        const orderbook = this.parseOrderBook (response, symbol);\n'
                + "        return orderbook['nonce'];\n"
                + '    }\n');
            expect(out).toContain('let mut orderbook: indexmap::IndexMap<String, Value>');
            expect(out).toContain('orderbook.get("nonce").cloned().unwrap_or(Value::Null)');
            expect(out).not.toContain('get_value(&orderbook');
        });

        test('a request builder local rebuilt from its own literal local types too', () => {
            const out = rust('    orderRequest (symbol: Str, params: Dict) {\n'
                + '        const request = this.createOrderRequest (symbol, params);\n'
                + "        request['limit'] = 10;\n"
                + '        return request;\n'
                + '    }\n'
                + '\n'
                + '    createOrderRequest (symbol: Str, params: Dict): Dict {\n'
                + "        const request: Dict = { 'symbol': symbol };\n"
                + "        request['amount'] = 1;\n"
                + '        return this.extend (request, params);\n'
                + '    }\n');
            expect(out).toContain('let mut request: indexmap::IndexMap<String, Value> = self.createOrderRequest(symbol, params).as_map().cloned().unwrap_or_default();');
            expect(out).toContain('request.insert("limit".into(), Value::Int(10));');
            expect(out).not.toContain('add_element_to_object(&mut request');
        });

        test('a pass-through builder of a literal argument types the local', () => {
            const out = rust('    parsedTicker (t: Dict, m: Market) {\n'
                + '        const ticker = this.safeTicker ({}, m);\n'
                + "        ticker['symbol'] = 'BTC/USDT';\n"
                + '        return ticker;\n'
                + '    }\n'
                + '\n'
                + '    safeTicker (ticker: Dict, market: Market = undefined): Dict {\n'
                + '        return ticker;\n'
                + '    }\n');
            expect(out).toContain('let mut ticker: indexmap::IndexMap<String, Value>');
            expect(out).toContain('ticker.insert("symbol".into(), Value::Str("BTC/USDT".into()));');
            expect(out).not.toContain('add_element_to_object(&mut ticker');
        });

        test('a callee returning a boxed reader keeps the helper', () => {
            const out = rust('    boxed (response: any) {\n'
                + '        const orderbook = this.parseOrderBook (response, "BTC/USDT");\n'
                + '        return orderbook;\n'
                + '    }\n'
                + '\n'
                + '    parseOrderBook (o: any, s: Str): Dict {\n'
                + "        const data = this.safeDict (o, 'data');\n"
                + '        return data;\n'
                + '    }\n');
            expect(out).toContain('let mut orderbook: Value = self.parseOrderBook(response, Value::Str("BTC/USDT".into()));');
        });

        test('a callee that also returns an element read keeps the helper', () => {
            const out = rust('    mixed (rows: any[]) {\n'
                + '        const first = this.pick (rows);\n'
                + "        first['seen'] = true;\n"
                + '        return first;\n'
                + '    }\n'
                + '\n'
                + '    pick (rows: any[]): Dict {\n'
                + "        if (rows.length > 0) { return rows[0]; }\n"
                + "        return { 'seen': false };\n"
                + '    }\n');
            expect(out).toContain('add_element_to_object(&mut first');
            expect(out).toContain('let mut first: Value = self.pick(rows)');
        });

        test('a callee that reassigns its built local keeps the box', () => {
            const out = rust('    reassigned (symbol: Str) {\n'
                + '        const request = this.build (symbol);\n'
                + "        request['limit'] = 5;\n"
                + '        return request;\n'
                + '    }\n'
                + '\n'
                + '    build (symbol: Str): Dict {\n'
                + "        let request: Dict = { 'symbol': symbol };\n"
                + '        request = [ request ] as any;\n'
                + '        return request;\n'
                + '    }\n');
            expect(out).toContain('add_element_to_object(&mut request');
        });

        test('a produced local that escapes boxes once at the escape, write folded', () => {
            const out = rust('    escaped (response: any) {\n'
                + '        const orderbook = this.parseOrderBook (response, "BTC/USDT");\n'
                + "        orderbook['nonce'] = 1;\n"
                + '        return this.use (orderbook);\n'
                + '    }\n');
            expect(out).toContain('let mut orderbook: indexmap::IndexMap<String, Value>');
            expect(out).toContain('orderbook.insert("nonce".into(), Value::Int(1));');
            expect(out).toContain('self.use(Value::Map(orderbook))');
            expect(out).not.toContain('add_element_to_object(&mut orderbook');
        });

        test('a produced local that only escapes keeps the box (no helper folds)', () => {
            const out = rust('    onlyEscaped (response: any) {\n'
                + '        const orderbook = this.parseOrderBook (response, "BTC/USDT");\n'
                + '        return this.use (orderbook);\n'
                + '    }\n');
            expect(out).toContain('let mut orderbook: Value = self.parseOrderBook(response, Value::Str("BTC/USDT".into()));');
        });

        test('a local read out of the live ws order cache keeps the helper', () => {
            const out = rust('    cachedOrders (cached: any, orderId: Str) {\n'
                + '        const orders = this.safeDict (cached.hashmap (), "BTC/USDT", {});\n'
                + '        orders[orderId] = 1;\n'
                + '        return orders;\n'
                + '    }\n');
            expect(out).toContain('let mut orders: Value = self.safeDict(cached.hashmap(), Value::Str("BTC/USDT".into())');
            expect(out).not.toContain('let mut orders: indexmap::IndexMap');
        });

        test('a callee that stores the container it returns keeps the box', () => {
            const out = rust('    stored (response: any) {\n'
                + '        const book = this.seed (response);\n'
                + "        book['nonce'] = 1;\n"
                + '        return book;\n'
                + '    }\n'
                + '\n'
                + '    seed (response: any): Dict {\n'
                + '        const book: Dict = {};\n'
                + '        this.orderbooks["BTC/USDT"] = book;\n'
                + '        return book;\n'
                + '    }\n');
            expect(out).toContain('add_element_to_object(&mut book');
        });
    });
});

describe ('rustGetValueOnMapLocals', () => {
    jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

    let transpiler: Transpiler;
    beforeAll(() => {
        transpiler = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
    });

    // The ws order book is a `Value::Dict` in the rust port even though ts/src declares it
    // as a class: `order_book()` builds the map and every element read is a plain map read.
    const HEAD = 'type Dict = { [key: string]: any };\n' +
        'type Dictionary<T> = { [key: string]: T };\n' +
        'class OrderBook { bids: any; asks: any; nonce: any; constructor(o: any = undefined) {} }\n' +
        'class A {\n' +
        '    orderbooks: Dictionary<OrderBook> = {};\n';

    const rs = (body: string): string => transpiler.transpileRust(HEAD + body + '}\n').content;

    const MAP_READ = (name: string, key: string) => `${name}.get("${key}").cloned().unwrap_or(Value::Null)`;
    const SHADOW = 'let orderbook = orderbook.as_map().unwrap_or(&__orderbook_empty);';

    describe('get_value on proven map locals (ws order book)', () => {
        test('an OrderBook parameter is shadowed as a map; literal reads are lookups', () => {
            const out = rs('    handleBookDelta(orderbook: OrderBook, delta: Dict) {\n' +
                "        const bids = orderbook['bids'];\n" +
                "        const asks = orderbook['asks'];\n" +
                '        return bids;\n' +
                '    }\n');
            expect(out).toContain('pub fn handleBookDelta(&self, orderbook: Value, delta: Value)');
            expect(out).toContain(SHADOW);
            expect(out).toContain(`let mut bids: Value = ${MAP_READ('orderbook', 'bids')};`);
            expect(out).toContain(`let mut asks: Value = ${MAP_READ('orderbook', 'asks')};`);
            expect(out).not.toContain('get_value(&orderbook');
            expect(out).not.toContain('as_map().and_then');
        });

        test('a dynamic key keeps the helper (and the box)', () => {
            const out = rs('    h(orderbook: OrderBook, k: string) {\n        return orderbook[k];\n    }\n');
            expect(out).not.toContain('__orderbook_empty');
            expect(out).toContain('get_value(&orderbook, &k)');
        });

        test('an escaped OrderBook parameter keeps the box', () => {
            const out = rs('    i(orderbook: OrderBook) {\n        return orderbook;\n    }\n');
            expect(out).not.toContain('__orderbook_empty');
            expect(out).toContain('return orderbook;');
        });

        test('a marker-routed key keeps the helper', () => {
            const out = rs('    j(orderbook: OrderBook) {\n        return orderbook[\'nonce\'];\n    }\n');
            expect(out).not.toContain('__orderbook_empty');
            expect(out).toContain('orderbook.book_field("nonce")');
        });

        test('a read-only local from this.orderbooks[sym] is a bare IndexMap', () => {
            const out = rs('    k(sym: string) {\n' +
                "        const ob = this.orderbooks[sym];\n" +
                "        const bids = ob['bids'];\n" +
                '        return bids;\n' +
                '    }\n');
            expect(out).toContain('let mut ob: indexmap::IndexMap<String, Value> = (if let (Some(__m), Some(__k)) = (self.orderbooks.as_map(), sym.as_str())');
            expect(out).toContain(`let mut bids: Value = ${MAP_READ('ob', 'bids')};`);
            expect(out).not.toContain('get_value(&ob');
        });

        test('a read-only local from safeValue(container, key) is a bare IndexMap', () => {
            const out = rs('    l(sym: string) {\n' +
                '        const ob = this.safeValue (this.orderbooks, sym);\n' +
                "        const bids = ob['bids'];\n" +
                '        return bids;\n' +
                '    }\n');
            expect(out).toContain('let mut ob: indexmap::IndexMap<String, Value> = self.safeValue(self.orderbooks, sym)');
            expect(out).toContain(`let mut bids: Value = ${MAP_READ('ob', 'bids')};`);
            expect(out).not.toContain('get_value(&ob');
        });

        test('written and escaped locals keep the box and the helper', () => {
            const written = rs('    m(sym: string, ts: any) {\n' +
                "        const ob = this.orderbooks[sym];\n" +
                "        const bids = ob['bids'];\n" +
                "        ob['nonce'] = ts;\n" +
                '        return bids;\n' +
                '    }\n');
            expect(written).toContain('ob.book_field("bids")');
            const escaped = rs('    n(sym: string) {\n' +
                "        const ob = this.orderbooks[sym];\n" +
                "        const bids = ob['bids'];\n" +
                '        return ob;\n' +
                '    }\n');
            expect(escaped).toContain('let mut ob: Value = (if let (Some(__m), Some(__k)) = (self.orderbooks.as_map(), sym.as_str())');
            expect(escaped).toContain('ob.book_field("bids")');
        });
    });
});

describe ('rustDictParamBearers', () => {
        // fixture trees are written to a temp dir so the suite carries no fixture files
        const inlineFixtures: Record<string, Record<string, string>> = {
     "owned-map-params": {
      "ts/src/venue.ts": "interface Dictionary<T> {\n    [key: string]: T;\n}\ntype Dict = Dictionary<any>;\n\nclass venue {\n    omit (a: any, b: any): any {\n        return a;\n    }\n\n    watch (a: any, b: any, c: any): any {\n        return a;\n    }\n\n    // a `Dict` parameter written by literal key, called only with a\n    // typed dict bearer -> `&mut IndexMap` and a bare `.insert`.\n    orderRequest (method: string, request: Dict, orderParams: Dict, params: Dict = {}): [Dict, Dict] {\n        if (method === 'create') {\n            orderParams['limit_price'] = this.omit (params, []);\n        }\n        orderParams['order_type'] = method;\n        request['params'] = orderParams;\n        const omitted: Dict = this.omit (params, []);\n        return [ request, omitted ];\n    }\n\n    createOrder (type: string, params: Dict = {}) {\n        const orderParams: Dict = {\n            'order_type': type,\n            'order_qty': 1,\n        };\n        const request: Dict = {\n            'method': 'add_order',\n            'params': orderParams,\n        };\n        const [ requestValue, paramsValue ] = this.orderRequest ('create', request, orderParams, params);\n        return this.watch ('url', 'hash', this.omit (requestValue, paramsValue));\n    }\n\n    // A caller that passes a non-bearer keeps the boxed parameter.\n    plainCreate (params: Dict = {}) {\n        const request: Dict = { 'method': 'add_order' };\n        return this.plainOrder ('create', request, params, params);\n    }\n\n    plainOrder (method: string, request: Dict, orderParams: Dict, params: Dict = {}): [Dict, Dict] {\n        orderParams['order_type'] = method;\n        request['params'] = orderParams;\n        return [ request, params ];\n    }\n\n    // A read-only `Dict` parameter keeps the D-25 borrowed shadow.\n    readOnly (orderParams: Dict): any {\n        return orderParams['order_type'];\n    }\n}\n\nclass second {\n    extend (a: any, b: any = undefined): any {\n        return a;\n    }\n\n    safeInteger (a: any, b: any): any {\n        return 1;\n    }\n\n    postAction (operationType: string, sigPayload: Dict, params: Dict): Dict {\n        sigPayload['builder_code'] = operationType;\n        const finalHeaders: Dict = { };\n        finalHeaders['account'] = operationType;\n        const request = this.extend (finalHeaders, sigPayload);\n        return request;\n    }\n\n    caller (type: string, params: Dict = {}) {\n        const sigPayload: Dict = { 'amount': 1 };\n        sigPayload['exclude'] = type;\n        return this.postAction ('op', sigPayload, params);\n    }\n}\n\nclass nested {\n    omit (a: any, b: any): any {\n        return a;\n    }\n\n    build (orderParams: Dict, params: Dict): Dict {\n        orderParams['type'] = 'market';\n        const triggers: Dict = {};\n        triggers['price'] = '1';\n        triggers['price_type'] = 'quote';\n        orderParams['triggers'] = triggers;\n        return this.omit (orderParams, params);\n    }\n\n    caller (params: Dict = {}) {\n        const orderParams: Dict = { 'qty': 1 };\n        const request: Dict = { 'params': orderParams };\n        const [ value, rest ] = [ this.build (orderParams, params), params ];\n        return this.omit (request, rest);\n    }\n}\n"
     },
     "owned-map-params-chain": {
      "ts/src/venue.ts": "interface Dictionary<T> {\n    [key: string]: T;\n}\ntype Dict = Dictionary<any>;\n\nclass venue {\n    // a key-chain write has no native print on a map parameter, so the parameter stays boxed\n    watchMany (request: Dict, ids: string[]) {\n        request['type'] = 'SUBSCRIBE';\n        request['channels'][0]['codes'] = ids;\n        return request;\n    }\n\n    watch (ids: string[]) {\n        const request: Dict = {\n            'channels': [ {} ],\n        };\n        return this.watchMany (request, ids);\n    }\n}\n\nexport default venue;\n"
     }
    };
        const fixtureRoot = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-'));
        for (const [dir, files] of Object.entries (inlineFixtures)) {
            for (const [rel, text] of Object.entries (files)) {
                const out = path.join (fixtureRoot, dir, rel);
                fs.mkdirSync (path.dirname (out), { recursive: true });
                fs.writeFileSync (out, text);
            }
        }
        afterAll (() => fs.rmSync (fixtureRoot, { recursive: true, force: true }));
    jest.mock('module', () => ({
        __esModule: true,
        default: jest.fn()
    }));

    let transpiler: Transpiler;

    beforeAll(() => {
        transpiler = new Transpiler({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    });

    // a `Dict` parameter that only takes map operations and whose every
    // call site passes a typed dict bearer prints `&mut IndexMap`, so its writes are
    // plain `.insert` instead of a per-site `Arc::make_mut` guard.
    describe('owned map parameters', () => {
        let rust = '';

        beforeAll(() => {
            rust = transpiler.transpileRustByPath(path.join (fixtureRoot, 'owned-map-params', 'ts/src/venue.ts')).content;
        });

        test('the proven parameter prints a mutable map reference', () => {
            expect(rust).toContain('orderParams: &mut indexmap::IndexMap<String, Value>');
        });

        test('its writes are plain inserts, with no COW guard', () => {
            expect(rust).toContain('orderParams.insert("limit_price".into(), self.omit(params, Value::from(vec![])))');
            expect(rust).toContain('orderParams.insert("order_type".into(), method.clone())');
            const body = rust.slice(rust.indexOf('pub fn orderRequest('), rust.indexOf('pub fn createOrder('));
            expect(body).not.toContain('= &mut orderParams');
            expect(body).not.toContain('add_element_to_object');
        });

        test('the caller passes the bearer by reference', () => {
            expect(rust).toContain('self.orderRequest(Value::Str("create".into()), Value::Map(request), &mut orderParams, &[params])');
            expect(rust).toContain('let mut orderParams: indexmap::IndexMap<String, Value> = (');
        });

        test('publishing the map boxes a clone', () => {
            expect(rust).toContain('insert("params".into(), Value::Map(orderParams.clone()))');
        });

        test('a parameter called with a plain `Value` keeps the box and the guard', () => {
            expect(rust).toContain('pub fn plainOrder(&self, method: Value, request: Value, orderParams: Value');
            expect(rust).toContain('if let Value::Dict(__d) = &mut orderParams');
        });

        test('a read-only parameter keeps its borrowed shadow', () => {
            expect(rust).toContain('let orderParams = orderParams.as_map().unwrap_or(&__orderParams_empty);');
        });
    });

    describe('owned map parameters: chained writes', () => {
        test('a parameter written through a key chain stays boxed', () => {
            const rust = transpiler.transpileRustByPath(path.join (fixtureRoot, 'owned-map-params-chain', 'ts/src/venue.ts')).content;
            expect(rust).toContain('pub fn watchMany(&self, request: Value, ids: Value)');
            expect(rust).not.toContain('request: &mut indexmap::IndexMap<String, Value>');
        });
    });
});

describe ('rustBearerBoxedKeyWrites', () => {
    let transpiler: Transpiler;

    beforeAll(() => {
        transpiler = new Transpiler({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    });

    const PRELUDE = 'interface Dictionary<T> { [key: string]: T }\n' +
        'type Dict = Dictionary<any>;\n' +
        'type Str = string | undefined;\n' +
        'interface MarketInterface { id?: string, symbol?: string }\n' +
        'type Market = MarketInterface | undefined;\n' +
        'class Base {\n' +
        '    market (symbol: Str): Market { return undefined; }\n' +
        '    safeString (o: any, k: any, def: any = undefined): any { return undefined; }\n' +
        '    safeDict (o: any, k: any, def: any = undefined): Dict { return {}; }\n' +
        '    parseOrderBook (o: any, s: Str): Dict { return {}; }\n' +
        '    use (x: any): any { return x; }\n' +
        '}\n' +
        'class Venue extends Base {\n';

    function rust(body: string): string {
        return transpiler.transpileRust(PRELUDE + body + '}\n').content;
    }

    // `x[k] = v` / `k in x` on a typed dict bearer whose key is not a
    // checker-proven `string`. The helper stores a non-`Str` key through
    // `stringify_simple` — `stringify_param` is that function — and `in_op` only ever
    // matches a `Str` key, so both stay exact on the bare `IndexMap`.
    describe('bearer writes with a boxed key', () => {
        test('a computed key writes through stringify_param, no helper, no cow guard', () => {
            const out = rust('    build (values: any[]) {\n'
                + '        const result: Dict = {};\n'
                + '        for (let i = 0; i < values.length; i++) {\n'
                + '            const value = values[i];\n'
                + '            result[value["id"]] = [ value ];\n'
                + '        }\n'
                + '        return result;\n'
                + '    }\n');
            expect(out).toContain('let mut result: indexmap::IndexMap<String, Value> = (');
            expect(out).toContain('result.insert(crate::runtime::stringify_param(&(crate::value::get_value_k(&value, "id"))), Value::from(vec![value]));');
            expect(out).not.toContain('add_element_to_object(&mut result');
            expect(out).not.toContain('if let Value::Dict(__d) = &mut result');
        });

        test('`k in x` on a bearer prints the map lookup behind the helper Str test', () => {
            const out = rust('    has (values: any[]) {\n'
                + '        const result: Dict = {};\n'
                + '        for (let i = 0; i < values.length; i++) {\n'
                + '            const value = values[i];\n'
                + "            if (value['id'] in result) {\n"
                + "                result[value['id']] = value;\n"
                + '            }\n'
                + '        }\n'
                + '        return result;\n'
                + '    }\n');
            expect(out).toContain('let mut result: indexmap::IndexMap<String, Value> = (');
            expect(out).toContain('if (matches!(&crate::value::get_value_k(&value, "id"), Value::Str(__k) if result.contains_key(__k.as_ref()))) {');
            expect(out).toContain('result.insert(crate::runtime::stringify_param(&(crate::value::get_value_k(&value, "id"))), value.clone());');
            expect(out).not.toContain('in_op(&result');
            expect(out).not.toContain('add_element_to_object(&mut result');
        });

        test('a market member key writes natively and numeric keys stringify like the helper', () => {
            const out = rust('    byMarket (parsedOrders: any[]) {\n'
                + '        const marketIds: Dict = {};\n'
                + '        for (let i = 0; i < parsedOrders.length; i++) {\n'
                + '            const parsed = parsedOrders[i];\n'
                + "            const market = this.market (parsed['symbol']);\n"
                + "            if (market['id'] !== undefined) {\n"
                + "                marketIds[market['id']] = true;\n"
                + '            }\n'
                + '        }\n'
                + '        return Object.keys (marketIds);\n'
                + '    }\n');
            expect(out).toContain('let mut marketIds: indexmap::IndexMap<String, Value> = (');
            expect(out).toContain('marketIds.insert(crate::runtime::stringify_param(&(market.as_map().and_then(|__m| __m.get("id")).cloned().unwrap_or(Value::Null))), Value::Bool(true));');
            expect(out).toContain('Value::Array(marketIds.keys().map(|__k| Value::Str(__k.clone().into())).collect())');
            expect(out).not.toContain('add_element_to_object(&mut marketIds');
        });

        test('a numeric key stringifies exactly like the helper', () => {
            const out = rust('    indexed (v: any) {\n'
                + '        const d: Dict = {};\n'
                + '        d[0] = v;\n'
                + '        return d;\n'
                + '    }\n');
            expect(out).toContain('d.insert(crate::runtime::stringify_param(&(Value::Int(0))), v.clone());');
            expect(out).not.toContain('add_element_to_object(&mut d');
        });

        test('Object.keys on a bearer prints the iterators and unlocks the write', () => {
            const out = rust('    keysOf (values: any[]) {\n'
                + '        const seen: Dict = {};\n'
                + '        for (let i = 0; i < values.length; i++) {\n'
                + '            const value = values[i];\n'
                + '            seen[value["id"]] = value;\n'
                + '        }\n'
                + '        return Object.keys (seen);\n'
                + '    }\n');
            expect(out).toContain('let mut seen: indexmap::IndexMap<String, Value> = (');
            expect(out).toContain('seen.insert(crate::runtime::stringify_param(&(crate::value::get_value_k(&value, "id"))), value.clone());');
            expect(out).toContain('Value::Array(seen.keys().map(|__k| Value::Str(__k.clone().into())).collect())');
            expect(out).not.toContain('add_element_to_object(&mut seen');
            expect(out).not.toContain('object_keys(&seen');
        });

        test('a proven-string key keeps the shipped key spelling', () => {
            const out = rust('    keyed (values: any[], key: string) {\n'
                + '        const result: Dict = {};\n'
                + '        result[key] = values;\n'
                + '        return result;\n'
                + '    }\n');
            expect(out).toContain('result.insert(crate::runtime::stringify_param(&key), values.clone());');
        });

        test('a value that reads the receiver still binds first', () => {
            const out = rust('    self (values: any[]) {\n'
                + '        const result: Dict = {};\n'
                + '        for (let i = 0; i < values.length; i++) {\n'
                + '            const value = values[i];\n'
                + '            result[value["id"]] = this.use (result);\n'
                + '        }\n'
                + '        return result;\n'
                + '    }\n');
            expect(out).toContain('{ let __be_tmp = self.use(Value::Map(result.clone())); result.insert(');
            expect(out).not.toContain('add_element_to_object(&mut result');
        });

        test('a receiver whose value can be anything keeps the helper', () => {
            const out = rust('    plain (data: any) {\n'
                + '        let order: any = this.safeDict (data, "order");\n'
                + '        order["id"] = 1;\n'
                + '        return order;\n'
                + '    }\n');
            expect(out).toContain('add_element_to_object(&mut order, &Value::Str("id".into()), Value::Int(1));');
        });

        test('a key with an assignment keeps the helper', () => {
            const out = rust('    assigned (values: any[]) {\n'
                + '        const result: Dict = {};\n'
                + '        for (let i = 0; i < values.length; i++) {\n'
                + '            const value = values[i];\n'
                + '            result[(value["id"] = 1)] = value;\n'
                + '        }\n'
                + '        return result;\n'
                + '    }\n');
            expect(out).toContain('add_element_to_object(&mut result');
        });

        test('a read with a boxed key keeps the boxed local', () => {
            const out = rust('    reader (values: any[]) {\n'
                + '        const result: Dict = {};\n'
                + '        for (let i = 0; i < values.length; i++) {\n'
                + '            const value = values[i];\n'
                + '            result[value["id"]] = value;\n'
                + '        }\n'
                + '        return result[values[0]["id"]];\n'
                + '    }\n');
            expect(out).toContain('let mut result: Value = Value::Map({');
            expect(out).toContain('add_element_to_object(&mut result');
        });
    });
});

describe ('rustStringMethodLocals', () => {
    jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

    const transpiler = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } });
    const rust = (ts: string) => transpiler.transpileRust(ts).content;

    describe('rust string-method locals print a native String', () => {
        const cls = (body: string) => `class A extends Exchange { f(params: Dict, side: string): any { ${body} } }`;
        test('capitalize local boxed only at its object-literal move', () => {
            const out = rust(cls("const low = this.safeStringLower (params, 'k', 'd'); const tif: string = this.capitalize (low); return { 'tif': tif };"));
            expect(out).toContain('let mut tif: String = self.capitalize(low');
            expect(out).toContain('Value::from(tif)');
        });
        test('toUpperCase local on a string param, boxed at a request write', () => {
            const out = rust(cls("const request: Dict = {}; const up: string = side.toUpperCase (); request['s'] = up; return request;"));
            expect(out).toContain('let mut up: String = side.as_str().map(str::to_uppercase).unwrap_or_default();');
        });
        test('another use of the local keeps the Value box', () => {
            const out = rust(cls("const up: string = side.toLowerCase (); if (up === 'a') { return 1; } return up;"));
            expect(out).not.toContain('let mut up: String');
        });
    });
});

describe ('rustNativeDelete', () => {
        // fixture trees are written to a temp dir so the suite carries no fixture files
        const inlineFixtures: Record<string, Record<string, string>> = {
     "r05": {
      "ts/src/pro/venue.ts": "interface Dictionary<T> { [key: string]: T }\ntype Dict = Dictionary<any>;\n\nclass Client { subscriptions: Dictionary<any> = {}; futures: Dictionary<any> = {}; }\n\nexport default class venuews {\n    tickers: Dictionary<any> = {};\n    bidsasks: Dictionary<any> = {};\n    orders: Dictionary<any> = {};\n    options: Dict = {};\n\n    safeDict (obj, key: string, def: any = undefined) { return obj[key] || def; }\n    parsePosition (x) { return { 'a': x }; }\n\n    handle (client: Client, symbol: string, messageHash: string, total: Dict) {\n        delete this.tickers[symbol];\n        delete client.subscriptions[messageHash];\n        const subs = client.subscriptions;\n        delete subs[messageHash];\n        delete total[messageHash];\n        return 1;\n    }\n\n    purge (symbols: Value[], i: number, key: string, params: Dict) {\n        delete this.tickers[symbols[i]];\n        delete this.bidsasks[symbols[i]];\n        const stored = this.safeDict (this.options, 'symbolsByOrderId', {});\n        delete stored[key];\n        const balance: Dict = this.parsePosition (1);\n        delete balance[key];\n        const cache = this.orders;\n        delete cache[key];\n        delete this.tickers[this.options['x']];\n        delete this.tickers[params['x']];\n        return 1;\n    }\n}\n",
      "ts/src/venue.ts": "interface Dictionary<T> { [key: string]: T }\ntype Dict = Dictionary<any>;\n\nexport default class venue {\n    tickers: Dictionary<any> = {};\n    options: Dict = {};\n\n    safeDict (obj, key: string, def: any = undefined) { return obj[key] || def; }\n\n    purge (symbols: Value[], i: number, key: string) {\n        delete this.tickers[symbols[i]];\n        const stored = this.safeDict (this.options, 'rows', {});\n        delete stored[key];\n        return 1;\n    }\n}\n"
     }
    };
        const fixtureRoot = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-'));
        for (const [dir, files] of Object.entries (inlineFixtures)) {
            for (const [rel, text] of Object.entries (files)) {
                const out = path.join (fixtureRoot, dir, rel);
                fs.mkdirSync (path.dirname (out), { recursive: true });
                fs.writeFileSync (out, text);
            }
        }
        afterAll (() => fs.rmSync (fixtureRoot, { recursive: true, force: true }));
    let transpiler: Transpiler;

    beforeAll(() => {
        transpiler = new Transpiler({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    });

    describe('native `delete` with a computed key on a proven dict receiver', () => {
        let rest = '';
        let ws = '';
        beforeAll(() => {
            rest = transpiler.transpileRustByPath(path.join (fixtureRoot, 'r05', 'ts/src/venue.ts')).content;
            ws = transpiler.transpileRustByPath(path.join (fixtureRoot, 'r05', 'ts/src/pro/venue.ts')).content;
        });

        test('an element-read key borrows beside the field', () => {
            expect(rest).toContain('if let (Value::Dict(__d), Value::Str(__k)) = (&mut self.tickers, &get_value(&symbols, &i)) { std::sync::Arc::make_mut(__d).shift_remove(__k.as_ref()); }');
            expect(ws).toContain('if let (Value::Dict(__d), Value::Str(__k)) = (&mut self.bidsasks, &get_value(&symbols, &i)) { std::sync::Arc::make_mut(__d).shift_remove(__k.as_ref()); }');
        });

        test('a declared-Dict local is admitted in a ws-capable tier too', () => {
            expect(ws).toContain('if let (Value::Dict(__d), Value::Str(__k)) = (&mut stored, &key) { std::sync::Arc::make_mut(__d).shift_remove(__k.as_ref()); }');
            expect(rest).toContain('if let (Value::Dict(__d), Value::Str(__k)) = (&mut stored, &key) { std::sync::Arc::make_mut(__d).shift_remove(__k.as_ref()); }');
        });

        test('a key that reads the receiver or a non-proven receiver keeps the helper', () => {
            expect(ws).toContain('remove(&mut self.tickers, &self.options.as_map().and_then(|__m| __m.get("x")).cloned().unwrap_or(Value::Null))');
            expect(ws).toContain('remove(&mut client.subscriptions, &messageHash)');
            expect(ws).toContain('remove(&mut subs, &messageHash)');
            expect(ws).toContain('remove(&mut total, &messageHash)');
            expect(ws).toContain('remove(&mut balance, &key)');
            expect(ws).toContain('remove(&mut cache, &key)');
        });
    });
});

describe ('rustNestedDictParamWrites', () => {
        // fixture trees are written to a temp dir so the suite carries no fixture files
        const inlineFixtures: Record<string, Record<string, string>> = {
     "rp05": {
      "ts/src/venue.ts": "interface Dictionary<T> { [key: string]: T }\ntype Dict = Dictionary<any>;\n\nexport default class venue {\n    balance: Dict = {};\n    ohlcvs: Dict = {};\n    orderbook: any = {};\n    cache: any = {};\n    tickers: Dict = {};\n\n    omit (x, k) { return x; }\n\n    sign (path: string, params: Dict = {}) {\n        const marks = Object.keys (this.tickers);\n        params['x']['y'] = 5;\n        params['a']['b']['c'] = 8;\n        const code = 'USDT';\n        params[code]['free'] = 4;\n        const request: Dict = { 'a': 1 };\n        request['a']['b'] = 2;\n        const response: Dict = this.omit (params, 'x');\n        response['a']['b'] = 5;\n        this.orderbook['a']['b'] = 6;\n        return [ request, response, code, marks ];\n    }\n\n    dynamic (key: any, params: Dict = {}) {\n        const marks = Object.keys (this.tickers);\n        params[key]['b'] = 1;\n        params['a']['b'] = 2;\n        return [ params, marks ];\n    }\n}\n"
     }
    };
        const fixtureRoot = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-'));
        for (const [dir, files] of Object.entries (inlineFixtures)) {
            for (const [rel, text] of Object.entries (files)) {
                const out = path.join (fixtureRoot, dir, rel);
                fs.mkdirSync (path.dirname (out), { recursive: true });
                fs.writeFileSync (out, text);
            }
        }
        afterAll (() => fs.rmSync (fixtureRoot, { recursive: true, force: true }));
    jest.mock('module',()=>({
        __esModule: true,
        default: jest.fn()
    }));

    describe('native nested dict writes on proven Dict parameters', () => {
        let out = '';
        beforeAll(() => {
            const config = { 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
            out = new Transpiler(config).transpileRustByPath(path.join (fixtureRoot, 'rp05', 'ts/src/venue.ts')).content;
        });

        test('a Dict parameter takes the native get_mut hop and insert', () => {
            expect(out).toContain('if let Value::Dict(__h0) = &mut params { if let Some(Value::Dict(__h1)) = std::sync::Arc::make_mut(__h0).get_mut("x") { std::sync::Arc::make_mut(__h1).insert("y".to_string(), Value::Int(5)); } }');
        });

        test('one get_mut hop per key, three levels deep', () => {
            expect(out).toContain('if let Value::Dict(__h0) = &mut params { if let Some(Value::Dict(__h1)) = std::sync::Arc::make_mut(__h0).get_mut("a") { if let Some(Value::Dict(__h2)) = std::sync::Arc::make_mut(__h1).get_mut("b") { std::sync::Arc::make_mut(__h2).insert("c".to_string(), Value::Int(8)); } } }');
        });

        test('a checker-proven string hop key is stringified', () => {
            expect(out).toContain('get_mut(&crate::runtime::stringify_param(&code))');
        });

        test('locals are left to the final-text pass (no churn on its output)', () => {
            expect(out).toContain('add_element_to_object(get_value_mut(&mut request, &Value::Str("a".into())), &Value::Str("b".into()), Value::Int(2));');
        });

        test('unproven receivers keep the helpers', () => {
            // `omit` returns its argument: no plain-build proof, so the hop stays.
            expect(out).toContain('add_element_to_object(get_value_mut(&mut response, &Value::Str("a".into())), &Value::Str("b".into()), Value::Int(5));');
            // an `any` key proves no string
            expect(out).toContain('add_element_to_object(get_value_mut(&mut params, &key), &Value::Str("b".into()), Value::Int(1));');
        });

        test('tagged handle fields keep the helpers', () => {
            expect(out).toContain('add_element_to_object(get_value_mut(&mut self.orderbook, &Value::Str("a".into())), &Value::Str("b".into()), Value::Int(6));');
        });
    });
});

describe ('rustDictRead', () => {
        // fixture trees are written to a temp dir so the suite carries no fixture files
        const inlineFixtures: Record<string, Record<string, string>> = {
     "rsdictread": {
      "ts/src/base/Exchange.ts": "export interface Dict { [key: string]: any }\nexport interface BalanceAccount { free: string | undefined, used: string | undefined, total: string | undefined }\nconst omit = (x: Dict | undefined, ...args: any) => x;\nconst extend = (...args: any[]) => Object.assign ({}, ...args);\nexport default class Exchange {\n    options: Dict = {};\n    omit = omit;\n    extend = extend;\n    account (): BalanceAccount {\n        return { 'free': undefined, 'used': undefined, 'total': undefined };\n    }\n    handleUntilOption (key: string, request: Dict, params: Dict, multiplier: number = 1): [Dict, Dict] {\n        return [ request, params ];\n    }\n    parseOrder (order: Dict): Dict {\n        return order;\n    }\n}\n",
      "ts/src/venue.ts": "import Exchange from './base/Exchange.js';\nexport default class venue extends Exchange {\n    plainLocal (code) {\n        let result = undefined;\n        result = { 'a': 1 };\n        const viaCode = result[code];\n        const viaCore = result['core'];\n        const viaMarker = result['symbol'];\n        const has = code in result;\n        return [ viaCode, viaCore, viaMarker, has ];\n    }\n    dictyLocal (code) {\n        const merged = this.extend ({ 'a': 1 }, {});\n        const viaLit = merged['core'];\n        const viaCode = merged[code];\n        const hasCode = code in merged;\n        const hasLit = 'core' in merged;\n        return [ viaLit, viaCode, hasCode, hasLit ];\n    }\n    optionsField (code) {\n        const viaCode = this.options[code];\n        const viaLit = this.options['defaultType'];\n        const has = code in this.options;\n        return [ viaCode, viaLit, has ];\n    }\n    unprovenLocal (a, code) {\n        let x = a;\n        const viaLit = x['core'];\n        return [ viaLit, x[code] ];\n    }\n}\n"
     }
    };
        const fixtureRoot = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-'));
        for (const [dir, files] of Object.entries (inlineFixtures)) {
            for (const [rel, text] of Object.entries (files)) {
                const out = path.join (fixtureRoot, dir, rel);
                fs.mkdirSync (path.dirname (out), { recursive: true });
                fs.writeFileSync (out, text);
            }
        }
        afterAll (() => fs.rmSync (fixtureRoot, { recursive: true, force: true }));
    jest.mock('module', () => ({
        __esModule: true,
        default: jest.fn(),
    }));

    let output = '';

    beforeAll(() => {
        const transpiler = new Transpiler({ verbose: false, rust: { parser: { NUM_LINES_END_FILE: 0 } } } as any);
        output = transpiler.transpileRustByPath(path.join (fixtureRoot, 'rsdictread', 'ts/src/venue.ts')).content;
    });

    const free = (recv: string, key: string) =>
        `(if let (Some(__m), Some(__k)) = (${recv}.as_map(), ${key}.as_str()) { __m.get(__k).cloned().unwrap_or(Value::Null) } else { Value::Null })`;

    describe('rust closure-free dict reads', () => {
        test('a Str-place key into a fresh-literal local prints the closure-free read', () => {
            expect(output).toContain(`let mut viaCode: Value = ${free('result', 'code')};`);
            expect(output).not.toContain('get_value(&result, &code)');
        });

        test('a literal key into a proven local prints the native read', () => {
            expect(output).toContain('let mut viaCore: Value = result.as_map().and_then(|__m| __m.get("core")).cloned().unwrap_or(Value::Null);');
            expect(output).toContain('let mut viaLit: Value = merged.as_map().and_then(|__m| __m.get("core")).cloned().unwrap_or(Value::Null);');
        });

        test('a dict-only callee local reads a Str-place key closure-free', () => {
            expect(output).toContain(`let mut viaCode: Value = ${free('merged', 'code')};`);
        });

        test('membership: a computed key on a dict-callee local keeps in_op (content unproven)', () => {
            expect(output).toContain('Value::Bool(in_op(&merged, &code))');
            expect(output).not.toContain('merged.as_map().is_some_and');
        });

        test('a base runtime-state field reads and tests membership natively', () => {
            expect(output).toContain(`let mut viaCode: Value = ${free('self.options', 'code')};`);
        });

        test('an unproven local keeps the helper', () => {
            expect(output).not.toContain('x.as_map()');
            expect(output).toContain('get_value(&x, &code)');
        });
    });
});

describe ('rustPredictionBearers', () => {
        // fixture trees are written to a temp dir so the suite carries no fixture files
        const inlineFixtures: Record<string, Record<string, string>> = {
     "prediction-bearers": {
      "ts/src/prediction/venue.ts": "interface Dictionary<T> {\n    [key: string]: T;\n}\ntype Dict = Dictionary<any>;\n\nclass venue {\n    extend (a: any, b: any): any {\n        return a;\n    }\n\n    use (a: any): any {\n        return a;\n    }\n\n    parseNestedAction (params: Dict = {}, vault: any = undefined) {\n        const orderAction: Dict = { 'type': 'order' };\n        orderAction['orders'] = [ this.use (params) ];\n        if (vault !== undefined) {\n            orderAction['vault'] = vault;\n        }\n        const signature = this.use (orderAction);\n        return { 'action': orderAction, 'signature': signature };\n    }\n\n    parseSingleMove (params: Dict = {}) {\n        const request: Dict = { 'limit': 10 };\n        request['type'] = 'limit';\n        return this.use (request);\n    }\n\n    parseReassigned (params: Dict = {}) {\n        let query: Dict = { 'limit': 10 };\n        query = this.extend (query, params);\n        return this.use (query);\n    }\n\n    parseCaptured (params: Dict = {}) {\n        const seen: Dict = {};\n        seen['a'] = true;\n        return [ 1, 2 ].map ((x) => this.use (seen) as any);\n    }\n\n    parseShorthand (params: Dict = {}) {\n        const inner: Dict = { 'a': 1 };\n        return { inner };\n    }\n}\n",
      "ts/src/venue.ts": "interface Dictionary<T> {\n    [key: string]: T;\n}\ntype Dict = Dictionary<any>;\n\nclass venue {\n    extend (a: any, b: any): any {\n        return a;\n    }\n\n    use (a: any): any {\n        return a;\n    }\n\n    parseNestedAction (params: Dict = {}, vault: any = undefined) {\n        const orderAction: Dict = { 'type': 'order' };\n        orderAction['orders'] = [ this.use (params) ];\n        if (vault !== undefined) {\n            orderAction['vault'] = vault;\n        }\n        const signature = this.use (orderAction);\n        return { 'action': orderAction, 'signature': signature };\n    }\n}\n"
     }
    };
        const fixtureRoot = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-'));
        for (const [dir, files] of Object.entries (inlineFixtures)) {
            for (const [rel, text] of Object.entries (files)) {
                const out = path.join (fixtureRoot, dir, rel);
                fs.mkdirSync (path.dirname (out), { recursive: true });
                fs.writeFileSync (out, text);
            }
        }
        afterAll (() => fs.rmSync (fixtureRoot, { recursive: true, force: true }));
    jest.mock('module', () => ({
        __esModule: true,
        default: jest.fn()
    }));

    let transpiler: Transpiler;

    beforeAll(() => {
        transpiler = new Transpiler({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    });

    // a prediction venue nests one request map inside another (`{ action: obj }`,
    // `this.use (obj, …)`), so the typed-bearer proof admits several escapes there, each boxed
    // as a clone; every other tier keeps the single-final-move rule.
    describe('prediction-tier multi-escape dict bearers', () => {
        let prediction = '';
        let rest = '';

        beforeAll(() => {
            prediction = transpiler.transpileRustByPath(path.join (fixtureRoot, 'prediction-bearers', 'ts/src/prediction/venue.ts')).content;
            rest = transpiler.transpileRustByPath(path.join (fixtureRoot, 'prediction-bearers', 'ts/src/venue.ts')).content;
        });

        test('a nested builder writes natively and boxes a clone per escape', () => {
            expect(prediction).toContain('let mut orderAction: indexmap::IndexMap<String, Value> = (');
            expect(prediction).toContain('orderAction.insert("orders".into(), Value::from(vec![self.use(params)]));');
            expect(prediction).toContain('self.use(Value::Map(orderAction.clone()))');
            expect(prediction).toContain('m.insert("action".to_string(), Value::Map(orderAction.clone()));');
            expect(prediction).not.toContain('add_element_to_object(&mut orderAction');
            expect(prediction).not.toContain('if let Value::Dict(__d) = &mut orderAction');
        });

        test('a single final move still moves the map', () => {
            expect(prediction).toContain('let mut request: indexmap::IndexMap<String, Value> = (');
            expect(prediction).toContain('request.insert("type".into(), Value::Str("limit".into()));');
            expect(prediction).toContain('return self.use(Value::Map(request));');
        });

        test('a reassigned local keeps the box', () => {
            expect(prediction).toContain('let mut query: Value = Value::Map({');
            expect(prediction).toContain('query = self.extend(query, params);');
        });

        test('a closure capture keeps the box', () => {
            expect(prediction).toContain('let mut seen: Value = Value::Map({');
            expect(prediction).toContain('if let Value::Dict(__d) = &mut seen { std::sync::Arc::make_mut(__d).insert("a".into(), Value::Bool(true)); }');
        });

        test('a shorthand property keeps the box', () => {
            expect(prediction).toContain('let mut inner: Value = Value::Map({');
            expect(prediction).toContain('m.insert("inner".to_string(), inner.clone());');
        });

        test('outside the prediction tier the bearer rule types it: clone before the last use, move at it', () => {
            expect(rest).toContain('let mut orderAction: indexmap::IndexMap<String, Value> = (');
            expect(rest).toContain('self.use(Value::Map(orderAction.clone()))');
            expect(rest).toContain('Value::Map(orderAction));');
        });
    });
});

describe('rust dynamic self access and optional-argument slices', () => {
    const base = 'ts/src/base/Exchange.ts';
    const fixture = (rel: string, text: string): string => {
        const out = path.join(rustFixtureRoot, 'variadic', rel);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, text);
        return out;
    };
    let venue = '';
    beforeAll(() => {
        fixture(base, 'export default class Exchange {\n'
            + '    safeStringUpperN (o: any, k: any, d: any = undefined): any { return o; }\n'
            + '    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n'
            + '    parseLiquidation (order: any, market: any = undefined): any { return order; }\n'
            + '}\n');
        const file = fixture('ts/src/venue.ts', "import Exchange from './base/Exchange.js';\n"
            + 'export default class venue extends Exchange {\n'
            + '    async run (name: string, key: string, o: any) {\n'
            + '        const r = await this[name] (o);\n'
            + '        const v = this[key];\n'
            + "        const s = this.safeStringUpperN (o, 'id');\n"
            + '        const p = this.parseLiquidation (o);\n'
            + '        return [ r, v, s, p ];\n'
            + '    }\n'
            + '}\n');
        venue = transpiler.transpileRustByPath(file).content;
    });
    test('this[name](args) dispatches by name with cloned arguments', () => {
        expect(venue).toContain('self.call_dynamic_checked(name.clone(), vec![(o).clone()])');
    });
    test('a this[key] read resolves the field by name', () => {
        expect(venue).toContain('self.prop(&key)');
        expect(venue).not.toContain('get_value(&self');
    });
    test('a hand-written base helper folds past its runtime arity', () => {
        expect(venue).toContain('self.safeStringUpperN(o.clone(), Value::Str("id".into()), &[])');
    });
    test('a transpiled base method folds its optional parameters', () => {
        expect(venue).toContain('self.parseLiquidation(o.clone(), &[])');
    });
});

describe('rust free test-helper functions', () => {
    test('defaulted params collapse into optional_args; calls pad the slice and await async helpers', () => {
        const fresh = new Transpiler({ verbose: false, rust: {} } as any);
        const out = fresh.transpileRustByPath(path.join (rustFixtureRoot, 'free-fn-defaults', 'ts/src/test/Exchange/test.helper.ts')).content;
        expect(out).toContain('async fn helperTest(exchange: Value, symbol: Value, optional_args: &[Value])');
        expect(out).toContain('let mut params: Value = get_arg(optional_args, 0, Value::Null);');
        expect(out).toContain('helperTest(exchange, symbol, &[]).await');
        expect(out).toMatch(/let mut b: Value = helperTest\(exchange, symbol, &\[Value::Map\([\s\S]+?\)\]\)\.await;/);
        expect(out).toContain('async fn noAwait(');
        expect(out).toContain('noAwait(exchange).await');
    });

    test('a value-position this.spawn inlines as call_dynamic and drops the await on its local', () => {
        const ts = "class A { options: any; async negotiate (id) { const urls = {}; let future = urls[id]; if (future !== undefined) { return await future; } urls[id] = this.spawn (this.helper, id); future = urls[id]; return await future; } async helper (id) { return id; } spawn (m, ...a) { return m; } }";
        const out = new Transpiler({ verbose: false, rust: {} } as any).transpileRust(ts).content;
        expect(out).toContain('self.call_dynamic("helper", vec![id.clone()]).await');
        expect(out).not.toContain('future.await');
    });
});

describe('rust typed unified-method signatures, round 4', () => {
    let output = '';
    beforeAll(() => {
        const typed = new Transpiler({ 'verbose': false, 'rust': { 'typedUnified': ['cancelOrdersForSymbols', 'cancelUnifiedOrder', 'fetchOrderStatus'], 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        output = typed.transpileRustByPath(path.join (rustFixtureRoot, 'typed-unified-r4', 'ts/src/venue.ts')).content;
    });

    test('CancellationRequest[] / Order params print typed and decode at intra-core calls; a Str return is Option<String>', () => {
        expect(output).toContain('pub fn cancelOrdersForSymbols(&self, orders: Vec<crate::types::CancellationRequest>, params: impl Into<crate::Params> + Send) -> crate::Result<Vec<crate::types::Order>>');
        expect(output).toContain('pub fn cancelUnifiedOrder(&self, order: crate::types::Order, params: impl Into<crate::Params> + Send) -> crate::Result<crate::types::Order>');
        expect(output).toContain('let __args: Vec<Value> = vec![crate::types::IntoRaw::into_raw(order), params.into().into_value()];');
        expect(output).toContain('self.cancel_orders_for_symbols(crate::types::FromRaw::from_raw(');
        expect(output).toContain('pub fn fetchOrderStatus(&self, id: &str, symbol: Option<&str>, params: impl Into<crate::Params> + Send) -> crate::Result<Option<String>>');
    });
});

describe('rust typed setup methods (loadMarkets / market / setSandboxMode)', () => {
    let output = '';
    beforeAll(() => {
        const typed = new Transpiler({ 'verbose': false, 'rust': { 'typedUnified': ['loadMarkets', 'market', 'setSandboxMode'], 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        output = typed.transpileRustByPath(path.join (rustFixtureRoot, 'typed-unified-setup', 'ts/src/venue.ts')).content;
    });

    test('one typed method per name: bool / Params / &str parameters and typed returns', () => {
        expect(output).toContain('pub fn loadMarkets(&self, reload: bool, params: impl Into<crate::Params> + Send) -> crate::Result<crate::types::Markets>');
        expect(output).toContain('pub fn market(&self, symbol: &str) -> crate::Result<crate::types::Market>');
        expect(output).toContain('pub fn setSandboxMode(&self, enable: bool) -> crate::Result<()>');
    });

    test('a sync typed body is polled once; an async one is awaited', () => {
        expect(output).toContain('futures::FutureExt::now_or_never(crate::runtime::call_typed(async move {');
        expect(output).toContain('})).expect("a sync body never awaits")?))');
    });

    test('internal calls convert at the call site (defaulted flag, literal flag, no await on a sync callee)', () => {
        expect(output).toContain('if let Err(__e) = self.load_markets(false, Value::Null).await { panic!("{}", __e) }');
        expect(output).toContain('if let Err(__e) = self.load_markets(true, Value::Null).await { panic!("{}", __e) }');
        expect(output).toContain('crate::types::IntoRaw::into_raw(self.market(symbol.as_str().unwrap_or_default()))');
        expect(output).toContain('if let Err(__e) = self.set_sandbox_mode(true) { panic!("{}", __e) }');
        expect(output).not.toContain('self.set_sandbox_mode(true).await');
    });
});

describe('rust typed Market locals', () => {
    let output = '';
    beforeAll(() => {
        const typed = new Transpiler({ 'verbose': false, 'rust': { 'typedUnified': ['market'], 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        output = typed.transpileRustByPath(path.join (rustFixtureRoot, 'typed-market-local', 'ts/src/venue.ts')).content;
    });

    test('a read-only market local keeps the struct and reads listed fields natively', () => {
        expect(output).toContain('let mut market: crate::types::Market = (match self.market(');
        expect(output).toContain('Value::from((market).id.clone())');
        expect(output).toContain('(market).swap || (market.linear == Some(true))'.replace('market.linear', '(market).linear'));
        expect(output).toContain('(market).raw.as_map().and_then(|__m| __m.get("info"))');
        expect(output).toContain('Value::from((market).symbol.clone())');
        expect(output).toContain('self.hold((market).raw.clone())');
    });

    test('a market local re-written by this.market stays the struct', () => {
        expect(output).toContain('market = (match self.market("x") { Ok(__mk) => __mk, Err(__e) => panic!("{}", __e) })');
        expect(output).not.toContain('IntoRaw::into_raw(self.market(');
    });

    test('flag reads off a market struct print plain bools, never is_true', () => {
        expect(output).toContain('let mut isStock: Value = (market).raw.as_map().and_then(|__m| __m.get("stock"))');
        expect(output).toContain('isStock.as_bool() == Some(true) && ((market).spot)');
        expect(output).toContain('!(market).spot');
        expect(output).not.toContain('is_true(&isStock)');
        expect(output).not.toContain('Value::Bool((market).spot)');
    });
});

describe('rust typed core call results', () => {
    let output = '';
    beforeAll(() => {
        const typed = new Transpiler({ 'verbose': false, 'rust': { 'typedUnified': ['market', 'loadMarkets', 'fetchOrders'], 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        output = typed.transpileRustByPath(path.join (rustFixtureRoot, 'typed-call-results', 'ts/src/venue.ts')).content;
    });

    test('a discarded typed call re-raises its Err without boxing the result', () => {
        expect(output).toContain('if let Err(__e) = self.load_markets(false, Value::Null).await { panic!("{}", __e) }');
        expect(output).not.toContain('IntoRaw::into_raw(self.load_markets');
    });

    test('an empty local written only by this.market is an Option<Market>', () => {
        expect(output).toContain('let mut market: Option<crate::types::Market> = None');
        expect(output).toContain('market = Some(match self.market(');
        expect(output).toContain('market.clone().map(crate::types::IntoRaw::into_raw).unwrap_or_default()');
    });

    test('a reassigned market local stays a struct and reads declared keys as fields', () => {
        expect(output).toContain('let mut market: crate::types::Market = (match self.market(');
        expect(output).toContain('market = (match self.market(');
        expect(output).toContain('Value::from((market).market_type.clone())');
        expect(output).toContain('Value::from((market).settle.as_deref())');
        expect(output).toContain('(market).linear.map(Value::Bool).unwrap_or_default()');
        expect(output).toContain('Value::from((market).base_id.clone())');
        expect(output).not.toContain('IntoRaw::into_raw(self.market(');
    });

    test('a typed call result handed off keeps its struct type', () => {
        expect(output).toContain('let mut orders: Vec<crate::types::Order> = (match self.fetch_orders(');
        expect(output).toContain('self.hold(crate::types::IntoRaw::into_raw(orders.clone())');
    });
});

describe('rust literal containers handed off by move', () => {
    let output = '';
    beforeAll(() => {
        const typed = new Transpiler({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        output = typed.transpileRustByPath(path.join (rustFixtureRoot, 'literal-handoff', 'ts/src/venue.ts')).content;
    });

    test('a map keyed by a Value-printed string local inserts natively and moves into the return', () => {
        expect(output).toContain('let mut result: indexmap::IndexMap<String, Value> = (');
        expect(output).toContain('result.insert(crate::runtime::stringify_param(&symbol), ');
        expect(output).toContain('return Value::Map(result);');
    });

    test('an in-check on such a key reads the map and a cast return still moves', () => {
        expect(output).toContain('let mut seen: indexmap::IndexMap<String, Value> = (');
        expect(output).toContain('seen.contains_key(__k.as_ref())');
        expect(output).not.toContain('&seen, &id');
        expect(output).toContain('return Value::Map(seen);');
    });

    test('a pushed list returned under a cast is a Vec moved out once', () => {
        expect(output).toContain('let mut tiers: Vec<Value> = Vec::new();');
        expect(output).toContain('tiers.push(');
        expect(output).toContain('return Value::from(tiers);');
    });

    test('same-named block-scoped requests are decided one by one', () => {
        expect(output).toContain('request.insert("y".into(), Value::Int(2))');
        expect(output).toContain('Value::Map(request)');
    });

    test('a list handed out before a cast return keeps the Value box', () => {
        expect(output).toContain('let mut out: Value = Value::from(vec![]);');
    });
});

describe('rust message-hash string locals handed to the ws client', () => {
    const files: Record<string, string> = {
        'ts/src/base/ws/Client.ts': 'export default class Client {\n    url: string;\n    subscriptions: any;\n    resolve (result: any, messageHash: string): any { return result; }\n    reject (result: any, messageHash: string = undefined): any { return result; }\n    reusableFuture (messageHash: string): any { return messageHash; }\n}\n',
        'ts/src/base/Exchange.ts': "import Client from './ws/Client.js';\nexport default class Exchange {\n    orders: any = undefined;\n    client (url: string): Client { return new Client (); }\n}\n",
        'ts/src/venue.ts': "import Exchange from './base/Exchange.js';\nimport Client from './base/ws/Client.js';\nexport default class venue extends Exchange {\n" +
            "    handleError (client: Client, message: any, symbol: string) {\n        const messageHash = 'orders:' + symbol;\n        client.reject (message, messageHash);\n        client.resolve (message, messageHash);\n    }\n" +
            "    handleSub (client: Client, message: any) {\n        const messageHash = 'auth';\n        if (messageHash in client.subscriptions) {\n            client.resolve (message, messageHash);\n        }\n    }\n" +
            "    handleOnce (client: Client, message: any) {\n        const messageHash = 'orders';\n        client.resolve (this.orders, messageHash);\n    }\n}\n",
    };
    let out: string;
    beforeAll(() => {
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-rs-wsc-'));
        for (const [rel, text] of Object.entries (files)) {
            fs.mkdirSync (path.dirname (path.join (root, rel)), { recursive: true });
            fs.writeFileSync (path.join (root, rel), text);
        }
        out = transpiler.transpileRustByPath(path.join (root, 'ts/src/venue.ts')).content;
        fs.rmSync (root, { recursive: true, force: true });
    });
    test('a hash read by two client calls is a String boxed at each client slot', () => {
        expect(out).toContain('let mut messageHash: String = format!(');
        expect(out).toContain('client.reject(&[message.clone(), Value::from(messageHash.clone())]);');
        // the final read moves into the client call
        expect(out).toContain('client.resolve(&[message.clone(), Value::from(messageHash)]);');
    });
    test('a hash handed once to the client, or keyed into its subscriptions, stays Value', () => {
        expect(out).toContain('let mut messageHash: Value = Value::Str("orders".into());');
        expect(out).toContain('let mut messageHash: Value = Value::Str("auth".into());');
    });
});

describe('rust string lists lent to base methods', () => {
    test('a never-empty string list holds the shared list, reads natively and hands on the handle', () => {
        const out = transpiler.transpileRustByPath(path.join (rustFixtureRoot, 'lent-string-list', 'ts/src/venue.ts')).content;
        expect(out).toContain('let mut normalized: crate::value::List = ');
        expect(out).toContain('normalized.get(0).cloned().unwrap_or(Value::Null)');
        expect(out).toContain('let mut ids: crate::value::List = ');
        expect(out).toContain('Value::Arr(normalized.clone())');
        expect(out).toMatch(/ids\.len\(\) as i64/);
        expect(out).not.toContain('normalized: Value');
        expect(out).toContain('let mut listed: crate::value::List = ');
        expect(out).toContain('self.safeString(&listed, ');
        expect(out).toMatch(/listed\.len\(\) as i64/);
    });

    test('negative: a list that may be undefined keeps its box', () => {
        const out = transpiler.transpileRustByPath(path.join (rustFixtureRoot, 'lent-string-list', 'ts/src/venue.ts')).content;
        expect(out).toContain('let mut maybe: Value = ');
        expect(out).toContain('let mut keys: Vec<Value> = ');
    });
});

describe('rust ws client handle', () => {
    const files: Record<string, string> = {
        'ts/src/base/ws/Client.ts': 'export default class Client {\n    url: string;\n    subscriptions: any;\n    futures: any;\n    resolve (result: any, messageHash: string): any { return result; }\n    send (message: any): any { return message; }\n}\n',
        'ts/src/base/ws/WsClient.ts': "import Client from './Client.js';\nexport default class WsClient extends Client {\n}\n",
        'ts/src/base/Exchange.ts': "import WsClient from './ws/WsClient.js';\nexport default class Exchange {\n    client (url: string): WsClient { return new WsClient (); }\n    safeValue (obj: any, key: any): any { return obj[key]; }\n}\n",
        'ts/src/pro/venue.ts': "import Exchange from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\nexport default class venue extends Exchange {\n" +
            "    subscribe (url: string, messageHash: string) {\n        const client = this.client (url);\n        if (!(messageHash in client.subscriptions)) {\n            client.subscriptions[messageHash] = true;\n        }\n        const future = this.safeValue (client.futures, messageHash);\n        client.send ({ 'op': 'sub' });\n        return future;\n    }\n" +
            "    handleUnsub (client: Client, messageHash: string) {\n        if (messageHash in client.subscriptions) {\n            delete client.subscriptions[messageHash];\n        }\n        if (messageHash in client.futures) {\n            client.resolve (true, messageHash);\n        }\n    }\n" +
            "    isSpot (client: Client) {\n        return client.url.indexOf ('spot') >= 0;\n    }\n" +
            "    handleAfterWrite (client: Client, messageHash: string) {\n        delete client.subscriptions[messageHash];\n        const left = client.subscriptions;\n        return left;\n    }\n}\n",
    };
    let out: string;
    beforeAll(() => {
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-rs-wch-'));
        for (const [rel, text] of Object.entries (files)) {
            fs.mkdirSync (path.dirname (path.join (root, rel)), { recursive: true });
            fs.writeFileSync (path.join (root, rel), text);
        }
        out = transpiler.transpileRustByPath(path.join (root, 'ts/src/pro/venue.ts')).content;
        fs.rmSync (root, { recursive: true, force: true });
    });
    test('a client local served only by the handle is declared as the handle', () => {
        expect(out).toContain('let mut client: crate::pro::ws_client::ClientHandle = crate::pro::ws_client::ClientHandle::from_value(self.client(');
        expect(out).toContain('if !(client.has_subscription(&messageHash)) {');
        expect(out).toContain('client.add_subscription(&messageHash, Value::Bool(true))');
        expect(out).toContain('(client).futures.clone()');
    });
    test('a client parameter binds the handle once and reads through it', () => {
        expect(out).toMatch(/let mut __ch = crate::pro::ws_client::ClientHandle::from_value\(client\.clone\(\)\);\n\s*if \(__ch\.has_subscription\(&messageHash\)\) \{/);
        expect(out).toContain('__ch.remove_subscription(&messageHash)');
        expect(out).toContain('if (__ch.has_future(&messageHash)) {');
    });
    test('a handle field used as a method receiver is read in place', () => {
        expect(out).toContain('__ch.url.as_str().unwrap_or("").contains("spot")');
    });
    test('a field read after a write of that field keeps the live lookup', () => {
        expect(out).toContain('let mut __ch = crate::pro::ws_client::ClientHandle::from_value(client.clone());');
        expect(out).toContain('let mut left: Value = client.subscriptions;');
    });
});

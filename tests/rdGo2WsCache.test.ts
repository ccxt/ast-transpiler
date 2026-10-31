import { Transpiler, installRdGo2WsCache } from '../src/transpiler';

// RD-GO-2: the base ws caches belong to the dispatch loop; code that runs off it asks the owner. Every rule is keyed on
// the checker-resolved BaseExchange field and on the kind of the enclosing method, not on printed text.
const t = (install = true) => {
    const x = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    if (install) { installRdGo2WsCache (x.goTranspiler); }
    return x;
};
const BASE = [
    'class BaseExchange {',
    '    orderbooks: any = {};',
    '    balance: any = {};',
    '    fundingRates: any = {};',
    '    safeValue (d: any, k: string) { return d[k]; }',
    '    safeDict (d: any, k: string) { return d[k]; }',
    '    filterByArray (d: any, k: string, v: any) { return d; }',
    '    extend (a: any, b: any) { return a; }',
    '    createSafeDictionary (x: boolean = false): any { return {}; }',
    '    cleanWsData () {',
    '        this.balance = this.createSafeDictionary (true);',
    '        this.orderbooks = this.createSafeDictionary (true);',
    '    }',
    '}',
    '',
].join ('\n');
const venue = (body: string) => BASE + 'class venue extends BaseExchange {\n' + body + '}\n';
const go = (body: string, install = true) => t (install).transpileGo (venue (body)).content;

describe('RD-GO-2 ws cache ownership', () => {
    test('an async body asks the owner for membership, reads and writes', () => {
        const out = go ('    async watchOrderBook (symbol: string): Promise<any> {\n        if (!(symbol in this.orderbooks)) {\n            this.orderbooks[symbol] = {};\n        }\n        return this.orderbooks[symbol];\n    }\n');
        expect (out).toContain ('if !this.WsCacheHas("Orderbooks", symbol) {');
        expect (out).toContain ('this.WsCacheSet("Orderbooks", symbol, ');
        expect (out).toContain ('this.WsCacheGet("Orderbooks", symbol)');
        expect (out).not.toContain ('InOp(this.Orderbooks');
    });
    test('a sync handler keeps the plain map', () => {
        const out = go ('    handleOrderBook (symbol: string) {\n        if (!(symbol in this.orderbooks)) {\n            this.orderbooks[symbol] = {};\n        }\n    }\n');
        const handler = out.substring (out.indexOf ('HandleOrderBook'));
        expect (handler).not.toContain ('WsCache');
        expect (handler).toContain ('InOp(this.Orderbooks, symbol)');
        expect (handler).toContain ('AddElementToObject(this.Orderbooks, symbol');
    });
    test('safeValue and safeDict over a cache read through the owner', () => {
        const out = go ('    async fetchOrderBookSnapshot (symbol: string): Promise<any> {\n        const a = this.safeValue (this.orderbooks, symbol);\n        const b = this.safeDict (this.orderbooks, symbol);\n        return [ a, b ];\n    }\n');
        expect (out).toContain ('this.WsCacheGet("Orderbooks", symbol)');
        expect (out).not.toContain ('this.SafeValue(this.WsCache');
    });
    test('walking a whole cache reads a snapshot', () => {
        const out = go ('    async watchFundingRates (symbols: string): Promise<any> {\n        return this.filterByArray (this.fundingRates, \'symbol\', symbols);\n    }\n');
        expect (out).toContain ('this.FilterByArray(this.WsCacheSnapshot("FundingRates"), "symbol", symbols)');
    });
    test('balance entries go through the scalar twins and a whole-map write replaces the contents', () => {
        const out = go ('    setBalanceCache (type: string) {\n        if (!(type in this.balance)) {\n            this.balance[type] = {};\n        }\n    }\n    async loadBalanceSnapshot (type: string, response: any) {\n        this.balance[type] = this.extend (response, this.safeDict (this.balance, type));\n        this.balance = this.extend (response, this.balance);\n        return this.balance[type];\n    }\n');
        expect (out).toContain ('this.WsCacheSetScalar("Balance", typeVar, map[string]any{})');
        expect (out).toContain ('this.WsCacheSetScalar("Balance", typeVar, this.Extend(response, this.SafeDict(this.WsCacheSnapshot("Balance"), typeVar');
        expect (out).toContain ('this.WsCacheReplace("Balance", this.Extend(response, this.WsCacheSnapshot("Balance")))');
        expect (out).toContain ('this.WsCacheGetScalar("Balance", typeVar)');
    });
    test('cleanWsData resets each cache through the owner', () => {
        const out = t ().transpileGo (BASE).content;
        expect (out).toContain ('\tthis.WsCacheReset("Balance")\n\tthis.WsCacheReset("Orderbooks")');
        expect (out).not.toContain ('this.CreateSafeDictionary(true)');
    });
    test('the same field name on an unrelated class is untouched', () => {
        const src = 'class Other {\n    orderbooks: any = {};\n    async watchX (s: string) {\n        return s in this.orderbooks;\n    }\n}\n';
        const out = t ().transpileGo (src).content;
        expect (out).not.toContain ('WsCache');
    });
    test('fails without the hook (the printer keeps the plain map operations)', () => {
        const body = '    async watchOrderBook (symbol: string): Promise<any> {\n        if (!(symbol in this.orderbooks)) {\n            this.orderbooks[symbol] = {};\n        }\n        return this.orderbooks[symbol];\n    }\n';
        const out = go (body, false);
        expect (out).not.toContain ('WsCacheHas');
        expect (out).not.toContain ('WsCacheSet');
        expect (t (false).transpileGo (BASE).content).not.toContain ('WsCacheReset');
    });
});

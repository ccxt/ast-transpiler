import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

// ws cache properties of the hand-written base are owner-routed IDictionary<string, object> members;
// an object-keyed read of a declared dictionary local carries the helper's (string) cast
const DECLARED: { [name: string]: any } = {
    'ohlcvs': { type: 'IDictionary<string, object>', initializer: 'null', routed: true },
    'orderbooks': { type: 'IDictionary<string, object>', initializer: 'null', routed: true },
    'currencies_by_id': { type: 'IDictionary<string, object>', initializer: 'null', routed: false },
};
const config = {
    'verbose': false,
    'csharp': { 'parser': { 'NUM_LINES_END_FILE': 0, 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(', 'ELEMENT_ACCESS_WRAPPER_CLOSE': ')' } }
};

function printed(lines: string, keyType: string, params = 'symbol: string'): string {
    const source = 'class BaseExchange {\n    ohlcvs: any; orderbooks: any; currencies_by_id: any;\n    f (' + params + ') {\n' + lines + '\n    }\n}';
    const transpiler = new Transpiler(config);
    (transpiler as any).csharpTranspiler.csharpLocalTypeOf = (node: any) => (node.text === 'symbol' ? keyType : undefined);
    (transpiler as any).csharpTranspiler.csharpPrintedLocalType = (node: any) => (node.text === 'balances' ? 'Dictionary<string, object>' : undefined);
    (transpiler as any).csharpTranspiler.csharpDeclaredMemberType = (owner: string, name: string) => (owner === 'this' ? DECLARED : {} as any)[name];
    return transpiler.transpileCSharp(source).content;
}

describe('csharp routed ws cache and object-key dictionary reads (RFM-C2-A / 1F-hx10w2-C01 / RFM-X3-cs)', () => {
    test('a string? key on a routed ws cache is a guarded ContainsKey read', () => {
        const out = printed('        return this.ohlcvs[symbol];', 'string?');
        expect(out).toContain('(this.ohlcvs != null && symbol != null && this.ohlcvs.ContainsKey(symbol) ? this.ohlcvs[symbol] : null)');
        expect(out).not.toContain('getValue(this.ohlcvs');
    });
    test('orderbooks keeps the helper the ws transpile maps to getOrderBook', () => {
        expect(printed('        return this.orderbooks[symbol];', 'string?')).toContain('getValue(this.orderbooks, symbol)');
    });
    test('a key of another type keeps the helper', () => {
        expect(printed('        return this.ohlcvs[symbol];', 'int')).toContain('getValue(this.ohlcvs, symbol)');
    });
    test('an object key on a declared dictionary local carries the helper cast', () => {
        const out = printed('        const balances = {};\n        return balances[symbol];', 'object');
        expect(out).toContain('(balances != null && symbol != null && balances.ContainsKey((string)symbol) ? balances[(string)symbol] : null)');
    });
    test('an object key parameter the body writes keeps the helper (a retyped shadow local)', () => {
        const out = printed('        symbol = symbol + "x";\n        const balances = {};\n        return balances[symbol];', 'object');
        expect(out).toContain('getValue(balances, symbol)');
    });
    test('a local copy of currencies_by_id names the declared dictionary type', () => {
        const out = printed('        const byId = this.currencies_by_id;\n        return byId.length;', 'string');
        expect(out).toContain('IDictionary<string, object> byId = this.currencies_by_id;');
    });
});

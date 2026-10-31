import { Transpiler } from '../src/transpiler';

let transpiler: Transpiler;

beforeAll(() => {
    const config = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
    transpiler = new Transpiler(config);
});

function go(ts: string): string {
    return transpiler.transpileGo(ts).content;
}

// `getMarketFromSymbols` is declared as an overload pair in ts/src/base/Exchange.ts, so the body
// proof cannot resolve its body-carrying declaration from a venue call site while the base-file
// print still proves it (exchange_generated.go declares `map[string]any`). The snippet models the
// caller's side: a producer whose body the proof cannot resolve.
const PRELUDE = 'interface MarketInterface { id: string; symbol: string; }\n' +
    'type Market = MarketInterface | undefined;\n' +
    'type Strings = string[] | undefined;\n' +
    'type Str = string | undefined;\n' +
    'class Base {\n' +
    '    market (symbol: Str): Market { return undefined; }\n' +
    '    raw (x: any): any { return x; }\n' +
    '    getMarketFromSymbols (symbols: Strings): MarketInterface {\n' +
    '        return this.raw (symbols);\n' +
    '    }\n' +
    '}\n';

describe('hx10w8 GP09 redundant MapTyped on an overloaded base producer', () => {
    test('a table-named base producer types the caller local without MapTyped', () => {
        const ts = PRELUDE +
            'class Test extends Base {\n' +
            '    main (symbols: string[]): any {\n' +
            '        const market = this.getMarketFromSymbols (symbols);\n' +
            '        return market[\'id\'];\n' +
            '    }\n' +
            '}\n';
        const out = go(ts);
        expect(out).toContain('var market map[string]any = this.GetMarketFromSymbols(symbols)');
        expect(out).toContain('return market["id"]');
        expect(out).not.toContain('MapTyped(this.GetMarketFromSymbols');
    });

    test('a producer outside the table keeps the conversion', () => {
        const ts = PRELUDE +
            'class Test extends Base {\n' +
            '    buildRow (symbols: Strings): MarketInterface { return this.raw (symbols); }\n' +
            '    main (symbols: string[]): any {\n' +
            '        const market = this.buildRow (symbols);\n' +
            '        return market[\'id\'];\n' +
            '    }\n' +
            '}\n';
        const out = go(ts);
        expect(out).toContain('MapTyped(this.BuildRow(symbols))');
    });

    test('a local written as a map is typed (the callee prints the map); a literal store is native', () => {
        const ts = PRELUDE +
            'class Test extends Base {\n' +
            '    main (symbols: string[]): any {\n' +
            '        const market = this.getMarketFromSymbols (symbols);\n' +
            '        market[\'id\'] = \'x\';\n' +
            '        return market;\n' +
            '    }\n' +
            '}\n';
        const out = go(ts);
        expect(out).toContain('var market map[string]any = this.GetMarketFromSymbols(symbols)');
        expect(out).toContain('market["id"] = "x"');
    });

    test('a pointer value stored into the typed local keeps the deref helper', () => {
        const ts = PRELUDE +
            'class Test extends Base {\n' +
            '    safeInteger (o: any, k: string): number | undefined { return undefined; }\n' +
            '    main (symbols: string[], o: any): any {\n' +
            '        const market = this.getMarketFromSymbols (symbols);\n' +
            '        market[\'ts\'] = this.safeInteger (o, \'ts\');\n' +
            '        return market;\n' +
            '    }\n' +
            '}\n';
        const out = go(ts);
        expect(out).toContain('var market map[string]any = this.GetMarketFromSymbols(symbols)');
        expect(out).toContain('AddElementToObject(market, "ts", this.SafeInteger(o, "ts"))');
    });
});

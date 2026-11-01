import { Transpiler, installFmGo5G04 } from '../src/transpiler';

// The four market/currency tables of BaseExchange are plain map fields in Go: reads are native
// field reads, a write assigns a whole map or goes through the copy-on-write Add*Entry method.
const t = () => {
    const x = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    installFmGo5G04 (x.goTranspiler);
    return x;
};
const PRELUDE = [
    'type Dict = {[key: string]: any};',
    'class BaseExchange {',
    '    markets: Dict | undefined = undefined;',
    '    markets_by_id: Dict | undefined = undefined;',
    '    currencies: Dict = {};',
    '    currencies_by_id: Dict | undefined = undefined;',
    '    createSafeDictionary (): Dict { return {}; }',
    '    mapToSafeMap (d: Dict): Dict { return d; }',
    '    indexBySafe (a: any, k: string): Dict { return {}; }',
    '    indexBy (a: any, k: string): Dict { return {}; }',
    '}',
    '',
].join ('\n');
const go = (body: string) => t ().transpileGo (PRELUDE + 'class venue extends BaseExchange {\n' + body + '}\n').content;

describe ('go market tables are plain map fields', () => {
    test ('whole-map writes assign the field', () => {
        const out = go ([
            '    reset () {',
            '        this.markets = undefined;',
            '        this.markets_by_id = this.mapToSafeMap (this.indexBy ([], \'id\'));',
            '        this.currencies = this.createSafeDictionary ();',
            '        this.currencies_by_id = this.indexBySafe (this.currencies, \'id\');',
            '    }',
        ].join ('\n') + '\n');
        expect (out).toContain ('this.Markets = nil');
        expect (out).toContain ('this.Markets_by_id = this.IndexBy([]any{}, "id")');
        expect (out).toContain ('this.Currencies = map[string]any{}');
        expect (out).toContain ('this.Currencies_by_id = this.IndexBy(this.Currencies, "id")');
        expect (out).not.toMatch (/= .*MapToSafeMap\(/);
        expect (out).not.toMatch (/= .*IndexBySafe\(/);
        expect (out).not.toContain ('Publish');
    });
    test ('an element write copies instead of mutating the published map', () => {
        const out = go ('    add (k: string, m: any) {\n        this.markets[k] = m;\n        this.markets_by_id[k] = [ m ];\n    }\n');
        expect (out).toContain ('this.AddMarketsEntry(k, m)');
        expect (out).toContain ('this.AddMarketsByIdEntry(k, []any{m})');
        expect (out).not.toContain ('this.Markets[k] =');
        expect (out).not.toContain ('AddElementToObject');
    });
    test ('a compound write also copies', () => {
        const out = go ('    bump (k: string) {\n        this.markets[k] += 1;\n    }\n');
        expect (out).toContain ('this.AddMarketsEntry(k, Add(GetValue(this.Markets, k), 1))');
        expect (out).not.toContain ('AddElementToObject');
    });
    test ('reads are native field reads', () => {
        const out = go ('    read () {\n        const k = \'BTC/USDT\';\n        if (this.markets === undefined) {\n            return undefined;\n        }\n        if (k in this.markets_by_id) {\n            return this.markets[k];\n        }\n        return 1;\n    }\n');
        expect (out).toContain ('this.Markets == nil');
        expect (out).toContain ('_, ok := this.Markets_by_id[k]');
        expect (out).toContain ('return this.Markets[k]');
        expect (out).not.toMatch (/\b(Markets|Markets_by_id|Currencies|Currencies_by_id)\(\)/);
    });
    test ('sharing another exchange\'s table assigns the field without a conversion', () => {
        const out = go ('    share (source: any) {\n        this.markets = source.markets;\n        this.currencies = source.currencies;\n    }\n');
        expect (out).toContain ('this.Markets = source.Markets');
        expect (out).toContain ('this.Currencies = source.Currencies');
        expect (out).not.toContain ('MapTyped');
    });
    test ('a slice element key printed as GetValue keeps the helper read', () => {
        const out = go ('    pick () {\n        const keys: string[] = Object.keys (this.markets);\n        return this.markets[keys[0]];\n    }\n');
        expect (out).toContain ('GetValue(this.Markets, ');
        expect (out).not.toMatch (/this\.Markets\[GetValue/);
    });
    test ('a write through a const local aliasing this.markets copies like the field write', () => {
        const out = go ('    add (k: string, m: any) {\n        const markets = this.markets;\n        markets[k] = m;\n        const byId = this.markets_by_id;\n        byId[k] = [ m ];\n    }\n');
        expect (out).toContain ('this.AddMarketsEntry(k, m)');
        expect (out).toContain ('this.AddMarketsByIdEntry(k, []any{m})');
        expect (out).not.toMatch (/\b(markets|byId)\[k\] =/);
        expect (out).not.toContain ('AddElementToObject');
    });
    test ('a compound write through the alias copies too', () => {
        const out = go ('    bump (k: string) {\n        const markets = this.markets;\n        markets[k] += 1;\n    }\n');
        expect (out).toContain ('this.AddMarketsEntry(k, Add(GetValue(markets, k), 1))');
    });
    test ('a local that is not an alias of a market table keeps its own write', () => {
        const out = go ('    other (k: string, m: any) {\n        const local = this.createSafeDictionary ();\n        local[k] = m;\n        let moved = this.markets;\n        moved = {};\n        moved[k] = m;\n    }\n');
        expect (out).not.toContain ('AddMarketsEntry');
    });
    test ('a same-named member of another class is not a market table', () => {
        const out = t ().transpileGo ('class Other {\n    markets: any = {};\n    f (k: string) {\n        this.markets[k] = 1;\n    }\n}\n').content;
        expect (out).not.toContain ('AddMarketsEntry');
    });
});

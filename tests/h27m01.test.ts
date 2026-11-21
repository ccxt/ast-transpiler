import fs from 'fs';
import path from 'path';
import * as os from 'os';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const HEAD =
    'type Str = string | undefined;\n' +
    'type Num = number | undefined;\n' +
    'type Bool = boolean | undefined;\n' +
    'type Dict = { [key: string]: any };\n' +
    'interface MinMax { min: Num; max: Num; }\n' +
    'interface Precision { amount: Num; price: Num; }\n' +
    'interface MarketInterface { id: Str; symbol: string; base: string; spot: boolean; linear: Bool; contractSize: Num;\n' +
    '    precision: Precision; limits: { amount?: MinMax }; info: any; }\n' +
    'interface CurrencyInterface { id: string; code: string; precision: number; info: any; }\n' +
    'type Market = MarketInterface | undefined;\n' +
    'export class ex {\n' +
    '    market (symbol: string): MarketInterface { return undefined; }\n' +
    '    currency (code: string): CurrencyInterface { return undefined; }\n' +
    '    safeMarket (id: Str): MarketInterface { return undefined; }\n' +
    '    safeCurrency (id: Str): CurrencyInterface { return undefined; }\n' +
    '    parseX (x: any, market: Market = undefined): Dict { return {}; }\n' +
    '    safeString (x: any, k: any): Str { return undefined; }\n';
const print = (body: string, on: boolean = true): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h27m01-'));
    fs.mkdirSync (path.join (dir, 'ts', 'src'), { recursive: true });
    fs.writeFileSync (path.join (dir, 'ts', 'src', 'ex.ts'), HEAD + body + '}\n');
    const cwd = process.cwd ();
    try {
        process.chdir (dir);
        const go: any = { 'parser': { 'NUM_LINES_END_FILE': 0 } };
        if (on) {
            go['nativeStoreFields'] = { 'markets': { 'rowStructReads': true, 'mapStorage': true } };
        }
        const x = new Transpiler ({ 'verbose': false, 'go': go });
        installCcxtGoLocalTypes (x.goTranspiler);
        return x.transpileGoByPath ('ts/src/ex.ts').content;
    } finally {
        process.chdir (cwd);
        fs.rmSync (dir, { recursive: true, force: true });
    }
};
const fn = (params: string, lines: string): string =>
    '    f (' + params + ') {\n' + lines + '    }\n';
const M = 'market: MarketInterface';

describe ('h27m01: market rows bound typed only where every use is a native field read', () => {
    test ('positive: a binder read only through struct fields is the typed row', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        const s = market["symbol"];\n        return [ s, market["spot"] ];\n'));
        expect (go).toContain ('var market MarketInterface = MarketInterfaceFromMap(this.Market(symbol))');
        expect (go).toContain ('var s *string = market.Symbol');
        expect (go).not.toContain ('ToMap(');
    });
    test ('positive: currency binder with a pointer field local', () => {
        const go = print (fn ('code: string', '        const currency = this.currency (code);\n        const id = currency["id"];\n        return id;\n'));
        expect (go).toContain ('var currency Currency = CurrencyFromMap(this.Currency(code))');
        expect (go).toContain ('currency.Id');
    });
    test ('negative: a binder also passed on as a map keeps the map, no conversion printed', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        const s = market["symbol"];\n        return [ s, this.parseX ({}, market) ];\n'));
        expect (go).not.toContain ('var market MarketInterface');
        expect (go).not.toContain ('ToMap(');
        expect (go).not.toContain ('market.Symbol');
    });
    test ('negative: a field stored into a request map keeps the map', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        const r = { "pair": market["id"] };\n        return r;\n'));
        expect (go).not.toContain ('var market MarketInterface');
        expect (go).not.toContain ('ToMap(');
    });
    test ('negative: a nil-tested binder keeps the map and its nil answer', () => {
        const go = print (fn ('id: string', '        const market = this.safeMarket (id);\n        if (market === undefined) {\n            return undefined;\n        }\n        return market["symbol"];\n'));
        expect (go).not.toContain ('var market MarketInterface');
        expect (go).not.toContain ('market.Symbol');
    });
    test ('negative: a MarketInterface-typed value that is no binder (a map in Go) is never read as a struct', () => {
        const go = print (fn ('x: any', '        const m: MarketInterface = this.parseRow (x);\n        const s = m["symbol"];\n        return s;\n').replace ('    f (', '    parseRow (x: any): MarketInterface { return x; }\n    f ('));
        expect (go).not.toContain ('m.Symbol');
    });
    test ('row switched off: unchanged', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        return market["symbol"];\n'), false);
        expect (go).not.toContain ('MarketInterface');
    });
});

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
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h23m01-'));
    fs.mkdirSync (path.join (dir, 'ts', 'src'), { recursive: true });
    fs.writeFileSync (path.join (dir, 'ts', 'src', 'ex.ts'), HEAD + body + '}\n');
    const cwd = process.cwd ();
    try {
        process.chdir (dir);
        const go: any = { 'parser': { 'NUM_LINES_END_FILE': 0 } };
        if (on) {
            go['nativeStoreFields'] = { 'markets': { 'rowStructReads': true } };
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

describe ('h23m01: typed row binder for market / currency locals', () => {
    test ('market binder prints the typed row, field reads native, other uses converted once', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        const s = market["symbol"];\n        const r = { "pair": market["id"] };\n        return [ s, r, this.parseX (r, market), this.safeString (market, "type") ];\n'));
        expect (go).toContain ('var market MarketInterface = MarketInterfaceFromMap(this.Market(symbol))');
        expect (go).toContain ('var s *string = &market.Symbol');
        expect (go).toContain ('if market.Id != nil {\n\t\tr["pair"] = *market.Id\n\t}');
        expect (go).toContain ('this.ParseX(r, MarketInterfaceToMap(market))');
        expect (go).toContain ('this.SafeString(MarketInterfaceToMap(market), "type")');
    });
    test ('safeMarket, currency and safeCurrency binders', () => {
        const go = print (fn ('id: string', '        const m = this.safeMarket (id);\n        const c = this.currency (id);\n        const d = this.safeCurrency (id);\n        return [ m["spot"], c["code"] === undefined, this.parseX (d) ];\n'));
        expect (go).toContain ('var m MarketInterface = MarketInterfaceFromMap(this.SafeMarket(id))');
        expect (go).toContain ('var c Currency = CurrencyFromMap(this.Currency(id))');
        expect (go).toContain ('CurrencyToMap(d)');
        expect (go).toContain ('m.Spot');
    });
    test ('row switched off: binder output unchanged', () => {
        const body = fn ('symbol: string', '        const market = this.market (symbol);\n        return this.parseX ({}, market);\n');
        const go = print (body, false);
        expect (go).not.toContain ('MarketInterface');
        expect (go).not.toContain ('ToMap(');
    });
    test ('negative: a rebound local keeps the map', () => {
        const go = print (fn ('symbol: string', '        let market = this.market (symbol);\n        market = this.market ("x");\n        return this.parseX ({}, market);\n'));
        expect (go).not.toContain ('var market MarketInterface');
        expect (go).not.toContain ('MarketInterfaceToMap(market)');
    });
    test ('negative: a write through the local keeps the map', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        market["id"] = "y";\n        return market;\n'));
        expect (go).not.toContain ('var market MarketInterface');
    });
    test ('negative: a nil-tested local keeps the map and its nil answer', () => {
        const go = print (fn ('id: string', '        const market = this.safeMarket (id);\n        if (market === undefined) {\n            return undefined;\n        }\n        return market["symbol"];\n'));
        expect (go).not.toContain ('var market MarketInterface');
        expect (go).not.toContain ('MarketInterfaceToMap');
    });
    test ('negative: a market parameter is not a binder', () => {
        const go = print (fn ('market: Market', '        return this.parseX ({}, market);\n'));
        expect (go).not.toContain ('MarketInterfaceToMap');
    });
});

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
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h27m02-'));
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

describe ('h27m02: market symbol / base / quote are plain Go strings', () => {
    test ('positive: a concat with the bound row symbol reads the string field', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        return \"a:\" + market[\"symbol\"];\n'));
        expect (go).toContain ('market.Symbol');
        expect (go).not.toContain ('MarketInterfaceToMap(market)["symbol"]');
    });
    test ('negative: a nil test keeps the map read', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        if (market[\"symbol\"] === undefined) {\n            return \"x\";\n        }\n        return \"y\";\n'));
        expect (go).not.toContain ('market.Symbol ==');
    });
    test ('negative: a store into a request map keeps the map form', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        const r = { \"pair\": market[\"symbol\"] };\n        return this.parseX (r, market);\n'));
        expect (go).not.toContain ('"pair": market.Symbol');
    });
    test ('negative: a string declaration keeps the map read (old *string field rule no longer applies)', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        const s = market[\"symbol\"];\n        return s;\n'));
        expect (go).not.toContain ('= market.Symbol');
        expect (go).toContain ('var s *string = &market.Symbol');
    });
    test ('negative: rows switched off print no struct field', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        return \"a:\" + market[\"symbol\"];\n'), false);
        expect (go).not.toContain ('market.Symbol');
    });
});

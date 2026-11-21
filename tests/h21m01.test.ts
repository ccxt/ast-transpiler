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
    '    safeString (x: any, k: any): Str { return undefined; }\n';
const print = (body: string, on: boolean = true): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h21m01-'));
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

describe ('h21m01: struct field reads on a typed market / currency row', () => {
    test ('string pointer field initialising a local', () => {
        const go = print (fn (M, '        const symbol = market["symbol"];\n        return symbol;\n'));
        expect (go).toContain ('var symbol *string = SafeStringPtr(GetValue(market, "symbol"))');
        expect (go).not.toContain ('market["symbol"]');
    });
    test ('renamed Go field (base -> BaseCurrency)', () => {
        const go = print (fn (M, '        const b = market["base"];\n        return b;\n'));
        expect (go).toContain ('var b *string = SafeStringPtr(GetValue(market, "base"))');
    });
    test ('string pointer nil test', () => {
        const go = print (fn (M, '        return market["id"] === undefined;\n'));
        expect (go).toMatch (/market\.Id == nil|IsEqual\(market\.Id, nil\)/);
    });
    test ('string pointer compared with a value stays a map read', () => {
        const go = print (fn (M, '        return market["id"] === "x";\n'));
        expect (go).not.toContain ('market.Id');
    });
    test ('required bool in a truth test', () => {
        const go = print (fn (M, '        if (market["spot"]) {\n            return 1;\n        }\n        return 0;\n'));
        expect (go).toContain ('if market.Spot {');
        expect (go).not.toContain ('EvalTruthy(market');
    });
    test ('optional bool in a truth test is nil-guarded', () => {
        const go = print (fn (M, '        if (market["linear"]) {\n            return 1;\n        }\n        return 0;\n'));
        expect (go).toContain ('if market.Linear != nil && *market.Linear {');
    });
    test ('number pointer field initialising a local', () => {
        const go = print (fn (M, '        const cs = market["contractSize"];\n        return cs;\n'));
        expect (go).toContain ('var cs *float64 = market.ContractSize');
    });
    test ('nested precision and limits reads', () => {
        const go = print (fn (M, '        const p = market["precision"]["price"];\n        const m = market["limits"]["amount"]["min"];\n        return [ p, m ];\n'));
        expect (go).toContain ('var p *float64 = market.Precision.Price');
        expect (go).toContain ('var m *float64 = market.Limits.Amount.Min');
    });
    test ('currency fields', () => {
        const go = print (fn ('currency: CurrencyInterface', '        const code = currency["code"];\n        const p = currency["precision"];\n        return [ code, p ];\n'));
        expect (go).toContain ('var code *string = currency.Code');
        expect (go).toContain ('var p *float64 = currency.Precision');
    });
    test ('Market alias (union with undefined) resolves to the struct', () => {
        const go = print (fn ('market: Market', '        const symbol = market["symbol"];\n        return symbol;\n'));
        expect (go).toContain ('var symbol *string = SafeStringPtr(GetValue(market, "symbol"))');
    });
    test ('info stays a map read', () => {
        const go = print (fn (M, '        const info = market["info"];\n        return info;\n'));
        expect (go).not.toContain ('market.Info');
        expect (go).toMatch (/market\["info"\]|GetValue\(market, "info"\)/);
    });
    test ('a key that is not a struct field stays a map read', () => {
        const go = print (fn ('market: MarketInterface & Dict', '        const t = market["tradability"];\n        return t;\n'));
        expect (go).not.toContain ('market.Tradability');
    });
    test ('a pointer field handed to an any consumer stays a map read (nil answer kept)', () => {
        const go = print (fn (M, '        return this.safeString (market, "symbol") + market["symbol"];\n'));
        expect (go).not.toContain ('market.Symbol');
    });
    test ('a write into the row stays a map write', () => {
        const go = print (fn (M, '        market["symbol"] = "x";\n        return market;\n'));
        expect (go).not.toContain ('market.Symbol');
    });
    test ('an untyped operand stays a map read', () => {
        const go = print (fn ('market: Dict', '        const symbol = market["symbol"];\n        return symbol;\n'));
        expect (go).not.toContain ('market.Symbol');
    });
    test ('with the table row off nothing changes', () => {
        const body = fn (M, '        const symbol = market["symbol"];\n        if (market["spot"]) {\n            return symbol;\n        }\n        return market["precision"]["price"];\n');
        const off = print (body, false);
        expect (off).not.toContain ('market.Symbol');
        expect (off).not.toContain ('market.Spot');
        expect (off).not.toContain ('market.Precision');
    });
});

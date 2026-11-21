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
    'interface MarketInterface { id: Str; type: Str; symbol: string; base: string; spot: boolean; linear: Bool; contractSize: Num;\n' +
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
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h28m01-'));
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

describe ('h28m01: typed-binder pointer fields compared with a literal or stored into a request map', () => {
    test ('positive: request-map store of a *string field keeps the nil answer', () => {
        const go = print (fn ('symbol: string', '        const request = {};\n        const market = this.market (symbol);\n        request["symbol"] = market["id"];\n        return request;\n'));
        expect (go).toContain ('var market MarketInterface = MarketInterfaceFromMap(this.Market(symbol))');
        expect (go).toContain ('request["symbol"] = nil\n');
        expect (go).toContain ('if market.Id != nil {');
        expect (go).toContain ('request["symbol"] = *market.Id');
        expect (go).not.toContain ('ToMap(');
    });
    test ('positive: *string field compared with a string literal', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        if (market["type"] === "spot") {\n            return 1;\n        }\n        return market["type"] !== "swap";\n'));
        expect (go).toContain ('var market MarketInterface');
        expect (go).toContain ('if market.Type != nil && *market.Type == "spot" {');
        expect (go).toContain ('(market.Type == nil || *market.Type != "swap")');
    });
    test ('positive: *bool field compared with true / false', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        const a = market["linear"] === true;\n        const b = market["linear"] !== false;\n        return [ a, b ];\n'));
        expect (go).toContain ('(market.Linear != nil && *market.Linear)');
        expect (go).toContain ('(market.Linear == nil || *market.Linear)');
    });
    test ('negative: store into a map that is not a local object literal keeps the map form', () => {
        const go = print (fn ('symbol: string, request: Dict', '        const market = this.market (symbol);\n        request["symbol"] = market["id"];\n        return request;\n'));
        expect (go).not.toContain ('*market.Id');
        expect (go).not.toContain ('var market MarketInterface');
    });
    test ('negative: compare against a non-literal keeps the map', () => {
        const go = print (fn ('symbol: string, t: string', '        const market = this.market (symbol);\n        return market["type"] === t;\n'));
        expect (go).not.toContain ('var market MarketInterface');
        expect (go).not.toContain ('*market.Type');
    });
    test ('negative: nil-tested binder keeps the map and no deref is printed', () => {
        const go = print (fn ('id: string', '        const request = {};\n        const market = this.safeMarket (id);\n        if (market !== undefined) {\n            request["symbol"] = market["id"];\n        }\n        return request;\n'));
        expect (go).not.toContain ('var market MarketInterface');
        expect (go).not.toContain ('*market.Id');
    });
    test ('row switched off: unchanged', () => {
        const go = print (fn ('symbol: string', '        const request = {};\n        const market = this.market (symbol);\n        request["symbol"] = market["id"];\n        return market["type"] === "spot";\n'), false);
        expect (go).not.toContain ('MarketInterface');
    });
});

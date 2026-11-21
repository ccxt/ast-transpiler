import fs from 'fs';
import path from 'path';
import * as os from 'os';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const HEAD =
    'type Str = string | undefined;\n' +
    'type Num = number | undefined;\n' +
    'type Bool = boolean | undefined;\n' +
    'type Dict = { [key: string]: any };\n' +
    'interface MarketInterface { id: Str; symbol: string; base: string; spot: boolean; linear: Bool; contractSize: Num; info: any; }\n' +
    'interface CurrencyInterface { id: string; code: string; precision: number; info: any; }\n' +
    'type Market = MarketInterface | undefined;\n' +
    'export class ex {\n' +
    '    market (symbol: string): MarketInterface { return undefined; }\n' +
    '    currency (code: string): CurrencyInterface { return undefined; }\n' +
    '    safeMarket (id: Str): MarketInterface { return undefined; }\n' +
    '    parseX (x: any, market: Market = undefined): Dict { return {}; }\n' +
    '    safeString (x: any, k: any, d: string): string;\n' +
    '    safeString (x: any, k: any, d?: Str): Str;\n' +
    '    safeString (x: any, k: any, d: Str = undefined): Str { return undefined; }\n' +
    '    safeBool (x: any, k: any, d: boolean): boolean;\n' +
    '    safeBool (x: any, k: any, d?: Bool): Bool;\n' +
    '    safeBool (x: any, k: any, d: Bool = undefined): Bool { return undefined; }\n';
const print = (body: string, on: boolean = true): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h30m03-'));
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


describe ('h30m03: defaulted safeString on a typed row binder prints the field or the default', () => {
    test ('positive: string local from safeString (row, f, "")', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        const marketId = this.safeString (market, \'id\', \'\');\n        return marketId.split (\'_\');\n'));
        expect (go).toContain ('var market MarketInterface = MarketInterfaceFromMap(this.Market(symbol))');
        expect (go).toContain ('var marketId string = ""\n');
        expect (go).toMatch (/if market\.Id != nil \{\n\s*marketId = \*market\.Id\n\s*\}/);
        expect (go).not.toContain ('this.SafeString(');
    });
    test ('negative: a non-literal default keeps the accessor and the map', () => {
        const go = print (fn ('symbol: string, d: string', '        const market = this.market (symbol);\n        const s = this.safeString (market, \'id\', d);\n        return s;\n'));
        expect (go).not.toContain ('var market MarketInterface');
        expect (go).toContain ('this.SafeString(market, "id", d)');
    });
    test ('negative: a nil-tested binder keeps the map and the accessor', () => {
        const go = print (fn ('id: string', '        const market = this.safeMarket (id);\n        if (market === undefined) {\n            return undefined;\n        }\n        const s = this.safeString (market, \'id\', \'\');\n        return s;\n'));
        expect (go).not.toContain ('var market MarketInterface');
        expect (go).toContain ('this.SafeString(market, "id", "")');
    });
    test ('negative: a non-table key keeps the accessor', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        const s = this.safeString (market, \'status\', \'\');\n        return s;\n'));
        expect (go).not.toContain ('market.Status');
        expect (go).toContain ('this.SafeString(market, "status", "")');
    });
    test ('negative: the row also passed on as a map keeps the accessor', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        const s = this.safeString (market, \'id\', \'\');\n        return [ s, this.parseX ({}, market) ];\n'));
        expect (go).not.toContain ('market.Id');
        expect (go).toContain ('this.SafeString(market, "id", "")');
    });
    test ('negative: a local the printer declares *string (keyed store, bitbank shape) keeps the accessor', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        const result: Dict = {};\n        const s = this.safeString (market, \'id\', \'\');\n        result[s] = { \'id\': s };\n        return result;\n'));
        expect (go).not.toMatch (/var s string = ""\n\s*if market\.Id != nil/);
        expect (go).not.toContain ('*market.Id');
    });
    test ('positive: value-string symbol with the "" default prints the plain field, no nil test', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        const s = this.safeString (market, \'symbol\', \'\');\n        return s.split (\'/\');\n'));
        expect (go).toContain ('var s string = market.Symbol\n');
        expect (go).not.toContain ('market.Symbol != nil');
    });
    test ('negative: value-string symbol with a non-empty default keeps the accessor', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        const s = this.safeString (market, \'symbol\', \'x\');\n        return s.split (\'/\');\n'));
        expect (go).not.toContain ('market.Symbol');
        expect (go).toContain ('this.SafeString(market, "symbol", "x")');
    });
    test ('off: without rowStructReads nothing changes', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        const s = this.safeString (market, \'id\', \'\');\n        return s;\n'), false);
        expect (go).toContain ('this.SafeString(market, "id", "")');
    });
});

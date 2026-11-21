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
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h28m03-'));
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

describe ('h28m03: literal-key safe accessors on a typed row binder print the struct field', () => {
    test ('positive: safeBool (row, value-bool field, false) truth test is the bool field', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        if (this.safeBool (market, \'spot\', false)) {\n            return 1;\n        }\n        return 0;\n'));
        expect (go).toContain ('var market MarketInterface = MarketInterfaceFromMap(this.Market(symbol))');
        expect (go).toContain ('if market.Spot {');
        expect (go).not.toContain ('this.SafeBool(');
    });
    test ('positive: safeString / safeBool without default initialise pointer locals from the fields', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        const id = this.safeString (market, \'id\');\n        const lin = this.safeBool (market, \'linear\');\n        return [ id, lin ];\n'));
        expect (go).toContain ('var id *string = market.Id');
        expect (go).toContain ('var lin *bool = market.Linear');
    });
    test ('positive: currency row code / id', () => {
        const go = print (fn ('code: string', '        const currency = this.currency (code);\n        const c = this.safeString (currency, \'code\');\n        return c;\n'));
        expect (go).toContain ('var currency Currency = CurrencyFromMap(this.Currency(code))');
        expect (go).toContain ('var c *string = currency.Code');
    });
    test ('negative: a pointer field stored into a request map keeps the accessor and the map', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        const r = { \'pair\': this.safeString (market, \'id\') };\n        return r;\n'));
        expect (go).not.toContain ('var market MarketInterface');
        expect (go).not.toContain ('market.Id');
    });
    test ('negative: a defaulted safeString (non-nil answer) is not the nilable field', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        const s = this.safeString (market, \'symbol\', \'\');\n        return s;\n'));
        expect (go).not.toContain ('market.Symbol');
    });
    test ('negative: a nil-tested binder keeps the map and the nil answer', () => {
        const go = print (fn ('id: string', '        const market = this.safeMarket (id);\n        if (market === undefined) {\n            return undefined;\n        }\n        return this.safeString (market, \'id\');\n'));
        expect (go).not.toContain ('var market MarketInterface');
        expect (go).not.toContain ('market.Id');
    });
    test ('negative: the row also passed on as a map keeps every accessor', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        const id = this.safeString (market, \'id\');\n        return [ id, this.parseX ({}, market) ];\n'));
        expect (go).not.toContain ('market.Id');
        expect (go).not.toContain ('ToMap(');
    });
    test ('negative: a safeBool (row, pointer field, false) is not the value field', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        if (this.safeBool (market, \'linear\', false)) {\n            return 1;\n        }\n        return 0;\n'));
        expect (go).not.toContain ('market.Linear');
    });
    test ('row switched off: unchanged', () => {
        const go = print (fn ('symbol: string', '        const market = this.market (symbol);\n        return this.safeString (market, \'id\');\n'), false);
        expect (go).not.toContain ('market.Id');
    });
});

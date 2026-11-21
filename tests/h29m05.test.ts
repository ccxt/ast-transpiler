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
    '    safeString (x: any, k: any): Str { return undefined; }\n' +
    '    handleUntilOption (key: string, request: Dict, params: Dict): [Dict, Dict] { return [ request, params ]; }\n';
const print = (body: string, on: boolean = true): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h29m05-'));
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

describe ('h29m05: typed-row *string field stored into a typed map local from another producer', () => {
    test ('positive: store into a map slot of handleUntilOption', () => {
        const go = print (fn ('symbol: string, params: Dict', '        console.log (1);\\n        const request = {};\n        const [ requestUntil, paramsUntil ] = this.handleUntilOption ("end", request, params);\n        const market = this.market (symbol);\n        requestUntil["symbol"] = market["id"];\n        return [ requestUntil, paramsUntil ];\n'));
        expect (go).toContain ('var market MarketInterface');
        expect (go).toContain ('requestUntil["symbol"] = *market.Id');
    });
    test ('negative: store into a parameter map keeps the map form', () => {
        const go = print (fn ('symbol: string, request: Dict', '        const market = this.market (symbol);\n        request["symbol"] = market["id"];\n        return request;\n'));
        expect (go).not.toContain ('*market.Id');
        expect (go).not.toContain ('var market MarketInterface');
    });
    test ('negative: store into an untyped any local keeps the map form', () => {
        const go = print (fn ('symbol: string, x: any', '        const market = this.market (symbol);\n        const target = x;\n        target["symbol"] = market["id"];\n        return target;\n'));
        expect (go).not.toContain ('*market.Id');
    });
    test ('negative: nil-tested binder keeps the map and no deref is printed', () => {
        const go = print (fn ('id: string, x: Dict', '        const parsed = this.parseX (x, undefined);\n        const market = this.safeMarket (id);\n        if (market !== undefined) {\n            parsed["symbol"] = market["id"];\n        }\n        return parsed;\n'));
        expect (go).not.toContain ('var market MarketInterface');
        expect (go).not.toContain ('*market.Id');
    });
    test ('negative: row storage off keeps the map form', () => {
        const go = print (fn ('symbol: string, x: Dict', '        const market = this.market (symbol);\n        const parsed = this.parseX (x, undefined);\n        parsed["id"] = market["id"];\n        return parsed;\n'), false);
        expect (go).not.toContain ('*market.Id');
    });
});

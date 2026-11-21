import fs from 'fs';
import path from 'path';
import * as os from 'os';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const HEAD =
    'type Str = string | undefined;\n' +
    'type Dict = { [key: string]: any };\n' +
    'interface MarketInterface { id: Str; symbol: string; base: string; quote: string; spot: boolean; info: any; }\n' +
    'export class ex {\n' +
    '    market (symbol: string): MarketInterface { return undefined; }\n' +
    '    safeMarket (id: Str): MarketInterface { return undefined; }\n' +
    '    take (x: any): Dict { return {}; }\n' +
    '    parseOrderBook (o: any, s: Str = undefined): Dict { return {}; }\n';
const print = (body: string, on: boolean = true): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h30m04-'));
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
const fn = (lines: string): string => '    f (symbol: string) {\n' + lines + '    }\n';

describe ('h30m04: a this.market row symbol handed on as an argument is the string field', () => {
    test ('positive: call argument types the binder', () => {
        const go = print (fn ('        const market = this.market (symbol);\n        const r = { "pair": market["id"] };\n        this.take (r);\n        return this.parseOrderBook ({}, market["symbol"]);\n'));
        expect (go).toContain ('var market MarketInterface = MarketInterfaceFromMap(this.Market(symbol))');
        expect (go).toContain ('this.ParseOrderBook(map[string]any{}, market.Symbol)');
    });
    test ('positive: list element', () => {
        const go = print (fn ('        const market = this.market (symbol);\n        return this.take ([ market["symbol"] ]);\n'));
        expect (go).toContain ('[]any{market.Symbol}');
    });
    test ('negative: a safeMarket row symbol argument keeps the map (fallback row may lack a symbol)', () => {
        const go = print (fn ('        const market = this.safeMarket (symbol);\n        return this.parseOrderBook ({}, market["symbol"]);\n'));
        expect (go).not.toContain ('market.Symbol');
        expect (go).toContain ('market["symbol"]');
    });
    test ('negative: rows switched off keep the map read', () => {
        const go = print (fn ('        const market = this.market (symbol);\n        return this.parseOrderBook ({}, market["symbol"]);\n'), false);
        expect (go).not.toContain ('market.Symbol');
    });
    test ('negative: a binder also passed whole stays a map', () => {
        const go = print (fn ('        const market = this.market (symbol);\n        this.take (market);\n        return this.parseOrderBook ({}, market["symbol"]);\n'));
        expect (go).not.toContain ('market.Symbol');
    });
});

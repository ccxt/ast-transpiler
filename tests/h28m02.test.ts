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
    '    take (x: any): Dict { return {}; }\n';
const print = (body: string, on: boolean = true): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h28m02-'));
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

describe ('h28m02: a symbol local used only in string concats is a Go string', () => {
    test ('positive: declaration from the bound row symbol, used only in a concat', () => {
        const go = print (fn ('        const market = this.market (symbol);\n        const s = market["symbol"];\n        return "trade:" + s;\n'));
        expect (go).toContain ('var s string = market.Symbol');
        expect (go).not.toContain ('SafeStringPtr(');
    });
    test ('positive: base and quote on a safeMarket binder', () => {
        const go = print (fn ('        const market = this.safeMarket (symbol);\n        const b = market["base"];\n        const q = market["quote"];\n        return b + "/" + q;\n'));
        expect (go).toContain ('var b string = market.BaseCurrency');
        expect (go).toContain ('var q string = market.QuoteCurrency');
    });
    test ('negative: a local also nil-tested is never a Go string', () => {
        const go = print (fn ('        const market = this.market (symbol);\n        const s = market["symbol"];\n        if (s !== undefined) {\n            return "a:" + s;\n        }\n        return "";\n'));
        expect (go).not.toContain ('var s string');
    });
    test ('negative: a local stored into a map is never a Go string', () => {
        const go = print (fn ('        const market = this.market (symbol);\n        const s = market["symbol"];\n        return this.take ({ "symbol": s, "h": "a:" + s });\n'));
        expect (go).not.toContain ('var s string');
    });
    test ('positive: a this.market row symbol that escapes keeps *string as the field address', () => {
        const go = print (fn ('        const market = this.market (symbol);\n        const s = market["symbol"];\n        return this.take ({ "symbol": s });\n'));
        expect (go).toContain ('var s *string = &market.Symbol');
        expect (go).not.toContain ('SafeStringPtr(');
    });
    test ('positive: a safeMarket row symbol keeps nil for an absent symbol', () => {
        const go = print (fn ('        const market = this.safeMarket (symbol);\n        const s = market["symbol"];\n        return this.take ({ "symbol": s });\n'));
        expect (go).toContain ('if market.Symbol != "" {');
        expect (go).toContain ('s = &market.Symbol');
        expect (go).not.toContain ('var s *string = &market.Symbol');
    });
    test ('negative: a concat on a row still stored as a map (binder not typed) prints no struct field', () => {
        const go = print (fn ('        const market = this.market (symbol);\n        return this.take ({ "h": "a:" + market["symbol"], "m": market });\n'));
        expect (go).not.toContain ('market.Symbol');
    });
    test ('positive: a string-annotated symbol local on a this.market row is the field address', () => {
        const go = print (fn ('        const market = this.market (symbol);\n        const s: string = market["symbol"];\n        return this.take ([ s ]);\n'));
        expect (go).toContain ('var s *string = &market.Symbol');
    });
    test ('negative: rows switched off', () => {
        const go = print (fn ('        const market = this.market (symbol);\n        const s = market["symbol"];\n        return "trade:" + s;\n'), false);
        expect (go).not.toContain ('market.Symbol');
    });
});

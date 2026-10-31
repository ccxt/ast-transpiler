import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// hx11 RFM-X2 (GO-A): `var x any = this.<M>(..)` where <M> is a BaseExchange method whose Go signature
// (base, every override, IDerivedExchange) is `map[string]any` prints `var x map[string]any`. The callee
// already hands back that map boxed into `any` (a nil map stays a typed nil in the box), so only the
// static type narrows: nil compares (`IsEqual(x, nil)` -> `x == nil`) and pushing the local into a list
// keep their meaning. The prediction tree keeps its box.

const PRELUDE =
    'type Dict = { [key: string]: any };\n' +
    'type MarketInterface = { id: string };\n' +
    'type Market = MarketInterface | undefined;\n' +
    'class Exchange {\n' +
    '    parseMarket (market: Dict): Market { return undefined; }\n' +
    '    parseBalance (response: Dict): Dict { return {}; }\n' +
    '    parseWsTrade (trade: Dict, market: Market = undefined): Dict { return {}; }\n' +
    '    parseTicker (ticker: Dict): Dict { return {}; }\n' +
    '    describe (): Dict { return {}; }\n' +
    '    getMarketFromSymbols (symbols: string[]): Market { return undefined; }\n' +
    '    markets: Dict = undefined;\n' +
    '    %BODY%\n' +
    '}\n';

const config = () => ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });

function go (body: string, hooks = true): string {
    const t = new Transpiler (config ());
    if (hooks) {
        installCcxtGoHooks (t.goTranspiler);
    }
    return t.transpileGo (PRELUDE.replace ('%BODY%', body)).content;
}

function goAt (relative: string, body: string): string {
    const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'hx11rfm-x2-'));
    try {
        const file = path.join (tmp, relative);
        fs.mkdirSync (path.dirname (file), { recursive: true });
        fs.writeFileSync (file, PRELUDE.replace ('%BODY%', body).replace ('class Exchange', 'export class Exchange'));
        const t = new Transpiler (config ());
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGoByPath (file).content;
    } finally {
        fs.rmSync (tmp, { recursive: true, force: true });
    }
}

const NIL_AND_PUSH =
    '    run (rows: Dict[]): any {\n' +
    '        const result = [];\n' +
    '        for (let i = 0; i < rows.length; i++) {\n' +
    '            const parsed = this.parseMarket (rows[i]);\n' +
    '            if (parsed !== undefined) {\n' +
    '                result.push (parsed);\n' +
    '            }\n' +
    '        }\n' +
    '        return result;\n' +
    '    }\n';

describe ('hx11 RFM-X2 base map-returning callee locals', () => {
    test ('a nil-tested local that is pushed into a list is typed and the nil test goes native', () => {
        const out = go (NIL_AND_PUSH);
        expect (out).toContain ('var parsed map[string]any = this.ParseMarket(');
        expect (out).toContain ('if parsed != nil {');
        expect (out).not.toContain ('IsEqual(parsed, nil)');
        expect (out).toContain ('append(result, parsed)');
    });

    test ('the typed local reads natively', () => {
        const out = go (
            '    run (m: Dict): any {\n' +
            '        const parsed = this.parseMarket (m);\n' +
            '        if (parsed === undefined) { return undefined; }\n' +
            '        return parsed[\'id\'];\n' +
            '    }\n');
        expect (out).toContain ('var parsed map[string]any = this.ParseMarket(');
        expect (out).toContain ('parsed["id"]');
    });

    test ('getMarketFromSymbols, parseBalance, parseWsTrade and describe are in the family', () => {
        const out = go (
            '    run (symbols: string[], m: Dict): any {\n' +
            '        const first = this.getMarketFromSymbols (symbols);\n' +
            '        const balance = this.parseBalance (m);\n' +
            '        const trade = this.parseWsTrade (m);\n' +
            '        const description = this.describe ();\n' +
            '        return [ first, balance, trade, description ];\n' +
            '    }\n');
        expect (out).toContain ('var first map[string]any = this.GetMarketFromSymbols(symbols)');
        expect (out).toContain ('var balance map[string]any = this.ParseBalance(m)');
        expect (out).toMatch (/var trade map\[string\]any = (MapTyped\()?this\.ParseWsTrade\(m\)/);
        expect (out).toContain ('var description map[string]any = this.Describe()');
    });

    test ('a base book accessor local (this.markets) is typed and its nil test goes native', () => {
        const body =
            '    run (): any {\n' +
            '        const markets = this.markets;\n' +
            '        if (markets === undefined) { return 1; }\n' +
            '        return 0;\n' +
            '    }\n';
        const out = goAt ('ts/src/base/Exchange.ts', body);
        expect (out).toContain ('var markets map[string]any = this.Markets');
        expect (out).toContain ('if markets == nil {');
        // a same-named member outside the base Exchange is not the book getter
        expect (go (body)).toContain ('var markets any = this.Markets');
    });

    test ('a callee outside the family keeps the box', () => {
        const out = go (
            '    run (m: Dict): any {\n' +
            '        const t = this.parseTicker (m);\n' +
            '        return t;\n' +
            '    }\n');
        expect (out).not.toContain ('var t map[string]any = this.ParseTicker(');
    });

    test ('a local rebound to another type keeps the box', () => {
        const out = go (
            '    run (m: Dict): any {\n' +
            '        let parsed: any = this.parseMarket (m);\n' +
            '        parsed = 5;\n' +
            '        return parsed;\n' +
            '    }\n');
        expect (out).not.toContain ('var parsed map[string]any');
    });

    test ('a local that is the receiver of push keeps the box', () => {
        const out = go (
            '    run (m: Dict): any {\n' +
            '        const parsed: any = this.parseMarket (m);\n' +
            '        parsed.push (1);\n' +
            '        return parsed;\n' +
            '    }\n');
        expect (out).not.toContain ('var parsed map[string]any');
    });

    test ('the prediction tree keeps its box, the REST tree does not', () => {
        const body = NIL_AND_PUSH;
        expect (goAt ('ts/src/prediction/kalshi.ts', body)).toContain ('var parsed any = this.ParseMarket(');
        expect (goAt ('ts/src/kalshi.ts', body)).toContain ('var parsed map[string]any = this.ParseMarket(');
    });
});

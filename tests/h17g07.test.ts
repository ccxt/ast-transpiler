import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go marketOutcomeToSymbol is a *string producer', () => {
    const root = path.join (__dirname, 'files', 'tmp-h17g07', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        "    id: string = 'x';\n" +
        '    safeString (o: any, k: string): Str {\n' +
        '        return o[k];\n' +
        '    }\n' +
        '}\n';
    const VENUE =
        "import { Exchange } from './base/Exchange.js';\n" +
        "import type { Str } from './base/Exchange.js';\n" +
        'export default class v extends Exchange {\n' +
        '    outcomes_by_id: any = {};\n' +
        '    marketOutcomeToSymbol (networkId: Str, marketId: Str, outcomeId: Str): Str {\n' +
        '        if ((networkId === undefined) || (marketId === undefined) || (outcomeId === undefined)) {\n' +
        '            return undefined;\n' +
        '        }\n' +
        "        const ocId = networkId + ':' + marketId + '/' + outcomeId;\n" +
        "        return this.safeString (this.outcomes_by_id, ocId);\n" +
        '    }\n' +
        '    guarded (client: any, n: Str, m: Str, o: Str) {\n' +
        '        const sym = this.marketOutcomeToSymbol (n, m, o);\n' +
        '        if (sym === undefined) {\n' +
        '            return;\n' +
        '        }\n' +
        "        client.resolve (1, 'trades::' + sym);\n" +
        '    }\n' +
        '    unguarded (client: any, n: Str, m: Str, o: Str) {\n' +
        '        const sym = this.marketOutcomeToSymbol (n, m, o);\n' +
        "        client.resolve (1, 'orders::' + sym);\n" +
        '    }\n' +
        '    rebound (n: Str, m: Str, o: Str) {\n' +
        '        let other: any = this.marketOutcomeToSymbol (n, m, o);\n' +
        '        other = 5;\n' +
        '        return other;\n' +
        '    }\n' +
        '}\n';
    const print = (): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'v.ts'), VENUE);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'v.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h17g07'), { recursive: true, force: true }));

    test ('declared Str return prints *string; a nil-guarded leaf concatenates natively', () => {
        const out = print ();
        expect (out).toMatch (/MarketOutcomeToSymbol\(networkId any, marketId any, outcomeId any\) \*string \{/);
        expect (out).toContain ('var sym *string = this.MarketOutcomeToSymbol(n, m, o)');
        expect (out).toContain ('"trades::"+*sym');
    });

    test ('negative: an unguarded (nilable) leaf keeps the Add helper', () => {
        const out = print ();
        expect (out).toContain ('Add("orders::", sym)');
        expect (out).not.toContain ('"orders::"+*sym');
    });

    test ('negative: a local rebound to a non-string keeps its box', () => {
        expect (print ()).toContain ('var other any = this.MarketOutcomeToSymbol(n, m, o)');
    });
});

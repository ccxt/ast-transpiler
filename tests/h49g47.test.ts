import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a pro-tree local of a parent `Str` method whose only read is a slot the callee derefs at entry (safeSymbol,
// safeMarket, market) takes the parent's *string; a local with no such read keeps the box
describe ('h49g47: inherited *string local read only by a deref-at-entry slot', () => {
    const BASE = 'export type Dict = { [key: string]: any };\nexport type Str = string | undefined;\nexport class Exchange {\n'
        + '    safeString (a: any, k: any, d: any = undefined): Str { return a; }\n'
        + '    safeSymbol (marketId: Str, market: any = undefined): Str { return marketId; }\n'
        + '    watch (url: any): any { return url; }\n}\n';
    const REST = 'import { Exchange, Str } from \'./base/Exchange\';\nexport default class venue extends Exchange {\n'
        + '    coinToMarketId (coin: Str): Str {\n'
        + '        if (coin === undefined) {\n'
        + '            return undefined;\n'
        + '        }\n'
        + '        return this.safeString ({ \'a\': \'b\' }, coin);\n'
        + '    }\n}\n';
    const run = (members: string): string => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h49g47-'));
        try {
            const src = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (path.join (src, 'base'), { recursive: true });
            fs.mkdirSync (path.join (src, 'pro'), { recursive: true });
            fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE);
            fs.writeFileSync (path.join (src, 'venue.ts'), REST);
            const file = path.join (src, 'pro', 'venue.ts');
            fs.writeFileSync (file, 'import venueRest from \'../venue\';\nexport default class venue extends venueRest {\n' + members + '}\n');
            const inst: any = new Transpiler ({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 } } });
            installCcxtGoHooks (inst.goTranspiler);
            return inst.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { recursive: true, force: true });
        }
    };
    test ('a result handed only to safeSymbol prints *string', () => {
        const out = run ('    f (o: any) {\n'
            + '        const marketId = this.coinToMarketId (this.safeString (o, \'coin\'));\n'
            + '        const symbol = this.safeSymbol (marketId);\n'
            + '        return symbol;\n'
            + '    }\n');
        expect (out).toContain ('var marketId *string = this.CoinToMarketId(');
        expect (out).not.toContain ('var marketId any');
    });
    test ('a result handed only to a boxed call argument keeps any', () => {
        const out = run ('    f (o: any) {\n'
            + '        const marketId = this.coinToMarketId (this.safeString (o, \'coin\'));\n'
            + '        return this.watch (marketId);\n'
            + '    }\n');
        expect (out).toContain ('var marketId any = this.CoinToMarketId(');
    });
    test ('a result that only feeds a map literal keeps any', () => {
        const out = run ('    f (o: any) {\n'
            + '        const marketId = this.coinToMarketId (this.safeString (o, \'coin\'));\n'
            + '        return { \'id\': marketId };\n'
            + '    }\n');
        expect (out).toContain ('var marketId any = this.CoinToMarketId(');
    });
});

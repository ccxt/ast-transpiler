import fs from 'fs';
import path from 'path';
import { Transpiler } from '../src/transpiler';
import { installCcxtGoLocalTypes } from '../src/goTranspiler';

const tmp = path.join (__dirname, 'files', 'tmp-h56r5g-' + (process.env.JEST_WORKER_ID || '0'));

describe ('h56r5g: Go if/else typeof string narrowing on any param, SafeCurrency *string, createOrder float64(-1)', () => {
    afterAll (() => fs.rmSync (tmp, { recursive: true, force: true }));

    test ('Go: if (typeof response === "string") { marketId = response; } else { ... } + exiting nil guard emits *string and strings.ToUpper', () => {
        const srcDir = path.join (tmp, 'go-gemini', 'ts', 'src');
        fs.mkdirSync (srcDir, { recursive: true });
        const file = path.join (srcDir, 'demo.ts');
        fs.writeFileSync (file, `
type Str = string | undefined;
type Dict = { [key: string]: any };
class Exchange {
    safeStringLower (d: any, k: any): Str { return undefined; }
}
export class Demo extends Exchange {
    parseMarket (response: any): Dict {
        let marketId: Str = undefined;
        const isString = (typeof response === 'string');
        const isArray = (Array.isArray (response));
        if (!isString && !isArray) {
            marketId = this.safeStringLower (response, 'symbol');
        } else {
            if (typeof response === 'string') {
                marketId = response;
            } else {
                marketId = this.safeStringLower (response, 0);
            }
            if (marketId === undefined) {
                throw new Error ('missing marketId');
            }
            const marketIdUpper = marketId.toUpperCase ();
            return { 'id': marketId, 'upper': marketIdUpper };
        }
        return { 'id': marketId };
    }
    createOrder (symbol: string, type: string, side: string, amount: number): Dict {
        if (amount === undefined) { throw new Error ('x'); }
        return { 'amount': amount };
    }
    callNeg (): Dict {
        return this.createOrder ('BTC/USDT', 'market', 'buy', -1);
    }
}
`);
        const t = new Transpiler ({ go: { useTypeScriptChecker: true, unifiedFloat64Params: { createOrder: [ 3 ] } } });
        installCcxtGoLocalTypes (t.goTranspiler, undefined, { createOrder: [ 3 ] });
        const out = t.transpileGoByPath (file).content;
        expect (out).toContain ('var marketId *string = nil');
        expect (out).toContain ('if responseStr, ok := response.(string); ok {');
        expect (out).toContain ('marketId = &responseStr');
        expect (out).toContain ('strings.ToUpper(*marketId)');
        expect (out).not.toMatch (/(?<![.\w])ToUpper\(/);
        expect (out).toContain ('this.CreateOrder("BTC/USDT", "market", "buy", float64(-1))');
        expect (out).not.toContain ('OpNeg(1)');
    });
});

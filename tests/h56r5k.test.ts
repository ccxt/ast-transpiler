import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler.js';
import { installCcxtGoHooks, installCcxtGoParamTypes } from '../src/goTranspiler.js';

describe('hx12-H56-r5k native Math.pow, Float64Arg, phemex Math.max, C# typeof string concat', () => {
    const tmpRoot = fs.mkdtempSync (path.join (os.tmpdir (), 'h56r5k-'));
    afterAll (() => fs.rmSync (tmpRoot, { recursive: true, force: true }));

    test('Rust Math.pow with negated Option<i64> emits f64::powf without Math::pow', () => {
        const dir = path.join (tmpRoot, 'rust-pow');
        fs.mkdirSync (path.join (dir, 'ts/src/base'), { recursive: true });
        fs.writeFileSync (path.join (dir, 'ts/src/base/Exchange.ts'), `
export type Dict = { [key: string]: any };
export type Int = number | undefined;
export default class Exchange {
    safeInteger (o: any, k: any, d: Int = undefined): Int { return o[k]; }
}
`);
        const venue = path.join (dir, 'ts/src/revolutx.ts');
        fs.writeFileSync (venue, `
import Exchange, { Dict } from './base/Exchange.js';
export default class revolutx extends Exchange {
    parseCurrency (currency: Dict): Dict {
        const scale = this.safeInteger (currency, 'scale');
        const precision = (scale !== undefined) ? Math.pow (10, -scale) : undefined;
        return { 'precision': precision };
    }
}
`);
        const t = new Transpiler ({ rust: { strictTyping: true } });
        const out = t.transpileRustByPath (venue).content;
        expect (out).toContain ('f64::powf(10.0, (-__y) as f64)');
        expect (out).not.toContain ('Math::pow');
    });

    test('Go prediction editOrder early-exit guarded Num param binds GetArgFloat64Ptr and passes *amount', () => {
        const dir = path.join (tmpRoot, 'go-kalshi');
        fs.mkdirSync (path.join (dir, 'ts/src/prediction'), { recursive: true });
        const venue = path.join (dir, 'ts/src/prediction/kalshi.ts');
        fs.writeFileSync (venue, `
type Num = number | undefined;
export default class Kalshi {
    async createOrder (outcome: string, type: string, side: string, amount: number, price: Num = undefined): Promise<any> { return {}; }
    async editOrder (id: string, outcome: string, type: string, side: string, amount: Num = undefined, price: Num = undefined): Promise<any> {
        if (amount === undefined) {
            throw new Error ('need amount');
        }
        return await this.createOrder (outcome, type, side, amount, price);
    }
}
`);
        const t = new Transpiler ({ go: { predictionUnifiedFloat64Params: { createOrder: [ 3 ] } } });
        installCcxtGoHooks (t.goTranspiler);
        installCcxtGoParamTypes (t.goTranspiler, { predictionUnifiedFloat64Params: { createOrder: [ 3 ] } });
        const out = t.transpileGoByPath (venue).content;
        expect (out).toContain ('var amount *float64 = GetArgFloat64Ptr');
        expect (out).toContain ('*amount');
        expect (out).not.toContain ('Float64Arg');
    });

    test('Go nil-init Int local with else-guarded Math.max(ts, last) types *int64 and emits max', () => {
        const ts = `
type Dict = { [key: string]: any };
type Int = number | undefined;
class Phemex {
    safeIntegerProduct (o: any, k: string, factor: number): Int { return undefined; }
    safeList (o: any, k: string, d?: any): any[] { return []; }
    safeDict (o: any, k: any): Dict { return {}; }
    parseSpotBalance (response: Dict): Dict {
        let timestamp: Int = undefined;
        const data = this.safeList (response, 'data', []);
        for (let i = 0; i < data.length; i++) {
            const balance = this.safeDict (data, i);
            const lastUpdateTimeNs = this.safeIntegerProduct (balance, 'lastUpdateTimeNs', 0.000001);
            if ((timestamp === undefined) || (lastUpdateTimeNs === undefined)) {
                timestamp = lastUpdateTimeNs;
            } else {
                timestamp = Math.max (timestamp, lastUpdateTimeNs);
            }
        }
        return { 'timestamp': timestamp };
    }
}`;
        const t = new Transpiler ({ go: {} });
        installCcxtGoHooks (t.goTranspiler);
        const out = t.transpileGo (ts).content;
        expect (out).toContain ('var timestamp *int64 = nil');
        expect (out).toContain ('max(*timestamp, *lastUpdateTimeNs)');
        expect (out).not.toContain ('mathMax');
    });

    test('C# typeof x === string narrowed param emits native string concat instead of add', () => {
        const ts = `
type Str = string | undefined;
class Binance {
    market (symbol: Str): any {
        if (typeof symbol === 'string') {
            let settle: Str = 'USDT';
            const futuresSymbol = symbol + ':' + settle;
            return futuresSymbol;
        }
        return undefined;
    }
}`;
        const t = new Transpiler ({ csharp: {} });
        const out = t.transpileCSharp (ts).content;
        expect (out).toContain ('((string)symbol)');
        expect (out).not.toContain ('add(');
    });
});

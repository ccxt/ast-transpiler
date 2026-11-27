import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler.js';
import { installCcxtGoHooks, installCcxtGoParamTypes } from '../src/goTranspiler.js';

describe('hx12-H56-r5n Go WsArrayCache.Remove, encodeDydxTxForSigning slot-0 string, int loop-counter write, CreateExpiredOptionMarket map return', () => {
    const tmpRoot = fs.mkdtempSync (path.join (os.tmpdir (), 'h56r5n-'));
    afterAll (() => fs.rmSync (tmpRoot, { recursive: true, force: true }));

    test('Go delete on WsArrayCache local with string key emits cache.Remove(symbol) without Remove helper', () => {
        const dir = path.join (tmpRoot, 'ws-remove');
        fs.mkdirSync (path.join (dir, 'ts/src/pro'), { recursive: true });
        fs.mkdirSync (path.join (dir, 'ts/src/base'), { recursive: true });
        fs.writeFileSync (path.join (dir, 'ts/src/base/Exchange.ts'), `
export type Dict = { [key: string]: any };
export class ArrayCache {
    append (item: any): void {}
}
export default class Exchange {
    orders: ArrayCache | undefined;
}
`);
        const venue = path.join (dir, 'ts/src/pro/backpack.ts');
        fs.writeFileSync (venue, `
import Exchange, { Dict } from '../base/Exchange.js';
export default class backpack extends Exchange {
    handleUnsub (symbol: string, rawObj: any): void {
        const cache = this.orders as Dict;
        if (this.orders !== undefined) {
            delete cache[symbol];
        }
        delete rawObj[symbol];
    }
}
`);
        const t = new Transpiler ({ go: {} });
        installCcxtGoHooks (t.goTranspiler);
        installCcxtGoParamTypes (t.goTranspiler, {});
        const out = t.transpileGoByPath (venue).content;
        expect (out).toContain ('var cache WsArrayCache = this.Orders');
        expect (out).toContain ('cache.Remove(symbol)');
        expect (out).toContain ('Remove(rawObj, symbol)');
    });

    test('Go encodeDydxTxForSigning slot-0 string proves SignHash(hash string, privateKey string)', () => {
        const dir = path.join (tmpRoot, 'dydx-sign');
        fs.mkdirSync (path.join (dir, 'ts/src/base'), { recursive: true });
        fs.writeFileSync (path.join (dir, 'ts/src/base/Exchange.ts'), `
export type Dict = { [key: string]: any };
export default class Exchange {
    encodeDydxTxForSigning (message: any): [ string, Dict ] { return [ '', {} ]; }
    hash (data: any, alg: string, digest: string): string { return ''; }
}
`);
        const venue = path.join (dir, 'ts/src/dydx.ts');
        fs.writeFileSync (venue, `
import Exchange, { Dict } from './base/Exchange.js';
export default class dydx extends Exchange {
    hashMessage (message: any): string {
        return this.hash (message, 'keccak', 'hex');
    }
    signHash (hash: string, privateKey: string): Dict {
        const a = hash.slice (-64);
        const b = privateKey.slice (-64);
        return { 'a': a, 'b': b };
    }
    signDydxTx (privateKey: string, message: any): Dict {
        const [ encodedTx, signDoc ] = this.encodeDydxTxForSigning (message);
        return this.signHash (encodedTx, privateKey);
    }
    signMsg (message: any, privateKey: string): Dict {
        return this.signHash (this.hashMessage (message), privateKey);
    }
    run (message: any): Dict {
        const r1 = this.signDydxTx ('priv', message);
        const r2 = this.signMsg (message, 'priv');
        return r1;
    }
}
`);
        const t = new Transpiler ({ go: {} });
        installCcxtGoHooks (t.goTranspiler);
        installCcxtGoParamTypes (t.goTranspiler, {});
        const out = t.transpileGoByPath (venue).content;
        expect (out).toContain ('SignHash(hash string, privateKey string)');
        expect (out).toContain ('hash[max(len(hash) - 64, 0):]');
        expect (out).not.toContain ('Slice(hash');
    });

    test('Go mutable int local assigned a for-loop counter types var start int = 63', () => {
        const ts = `
class Paradex {
    sbeReadAddress (raw: string): string {
        let start = 63;
        for (let i = 0; i < 63; i++) {
            if (raw.slice (i, i + 1) !== '0') {
                start = i;
                break;
            }
        }
        return '0x' + raw.slice (start, 64);
    }
    negativeMixed (raw: string, x: any): any {
        let start = 63;
        start = x;
        return start;
    }
}
`;
        const t = new Transpiler ({ go: {} });
        installCcxtGoHooks (t.goTranspiler);
        installCcxtGoParamTypes (t.goTranspiler, {});
        const out = t.transpileGo (ts).content;
        expect (out).toContain ('var start int = 63');
        const neg = out.slice (out.indexOf ('NegativeMixed'));
        expect (neg).toContain ('var start any = 63');
    });

    test('Go createExpiredOptionMarket returns map[string]any', () => {
        const ts = `
type Dict = { [key: string]: any };
class Exchange {
    createExpiredOptionMarket (symbol: string): Dict {
        throw new Error ('not supported');
    }
}
class Bybit extends Exchange {
    override createExpiredOptionMarket (symbol: string): Dict {
        return { 'symbol': symbol };
    }
}
`;
        const t = new Transpiler ({ go: {} });
        installCcxtGoHooks (t.goTranspiler);
        installCcxtGoParamTypes (t.goTranspiler, {});
        const out = t.transpileGo (ts).content;
        expect (out).toContain ('CreateExpiredOptionMarket(symbol any) map[string]any');
    });
});

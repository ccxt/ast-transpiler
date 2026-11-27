import fs from 'fs';
import path from 'path';
import { Transpiler } from '../src/transpiler';
import { installCcxtGoLocalTypes } from '../src/goTranspiler';

const tmp = path.join (__dirname, 'files', 'tmp-h56r5e-' + (process.env.JEST_WORKER_ID || '0'));

describe ('h56r5e: Rust client.subscriptions Object.values -> subscription_values, Go venue *float64 param', () => {
    afterAll (() => fs.rmSync (tmp, { recursive: true, force: true }));

    test ('Rust: Object.values(client.subscriptions) direct and via const alias emit subscription_values (0 object_values)', () => {
        const wsDir = path.join (tmp, 'rs', 'ts', 'src', 'base', 'ws');
        const proDir = path.join (tmp, 'rs', 'ts', 'src', 'pro');
        fs.mkdirSync (wsDir, { recursive: true });
        fs.mkdirSync (proDir, { recursive: true });
        fs.writeFileSync (path.join (wsDir, 'Client.ts'), `
type Dict = { [key: string]: any };
export default class Client {
    url: string = '';
    subscriptions: Dict = {};
    futures: Dict = {};
    rejections: Dict = {};
}
`);
        const proFile = path.join (proDir, 'demo.ts');
        fs.writeFileSync (proFile, `
import Client from '../base/ws/Client.js';
type Dict = { [key: string]: any };
export class Demo {
    handleDirect (client: Client, message: Dict) {
        const subscriptions = Object.values (client.subscriptions);
        for (let i = 0; i < subscriptions.length; i++) {
            const sub = subscriptions[i];
            if (sub !== undefined) {
                return sub;
            }
        }
        return undefined;
    }
    handleAlias (client: Client, message: Dict) {
        const subs = client.subscriptions;
        const values = Object.values (subs);
        for (let i = 0; i < values.length; i++) {
            const v = values[i];
            if (v !== undefined) {
                return v;
            }
        }
        return undefined;
    }
}
`);
        const t = new Transpiler ({ rust: { useTypeScriptChecker: true } });
        const out = t.transpileRustByPath (proFile).content;
        expect (out).toContain ('.subscription_values()');
        expect (out).not.toContain ('object_values(');
        expect (out).not.toContain ('let subs:');
    });

    test ('Go: venue-local Num param called with float64 and *float64 prints *float64 and native > 0', () => {
        const srcDir = path.join (tmp, 'go', 'ts', 'src');
        fs.mkdirSync (srcDir, { recursive: true });
        const file = path.join (srcDir, 'demo.ts');
        fs.writeFileSync (file, `
type Dict = { [key: string]: any };
type Num = number | undefined;
class Exchange {
    safeNumber (d: any, k: string): Num { return undefined; }
}
export class Demo extends Exchange {
    buildReq (amount: Num): Dict {
        const req: Dict = {};
        if ((amount !== undefined) && (amount > 0)) {
            req['size'] = amount;
        }
        return req;
    }
    createOrder (symbol: string, type: string, side: string, amount: number): Dict {
        return this.buildReq (amount);
    }
    createFromDict (raw: Dict): Dict {
        const amt = this.safeNumber (raw, 'amount');
        return this.buildReq (amt);
    }
}
`);
        const t = new Transpiler ({ go: { useTypeScriptChecker: true, unifiedFloat64Params: { createOrder: [ 3 ] } } });
        installCcxtGoLocalTypes (t.goTranspiler, undefined, { createOrder: [ 3 ] });
        const out = t.transpileGoByPath (file).content;
        expect (out).toContain ('BuildReq(amount *float64)');
        expect (out).toContain ('this.BuildReq(&amount)');
        expect (out).toContain ('this.BuildReq(amt)');
        expect (out).not.toContain ('IsGreaterThan(');
        expect (out).toContain ('*amount > 0');
    });
});

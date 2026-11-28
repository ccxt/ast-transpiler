import fs from 'fs';
import path from 'path';
import { Transpiler } from '../src/transpiler';

const tmp = path.join (__dirname, 'files', 'tmp-h56r5d-' + (process.env.JEST_WORKER_ID || '0'));

describe ('h56r5d: Rust client handle deletes + untagged Dict param delete, C# Int64 non-null add local', () => {
    afterAll (() => fs.rmSync (tmp, { recursive: true, force: true }));

    test ('Rust: cleanUnsubscription, cleanCache, pro rejections delete, and untagged Dict param delete emit native code (0 remove)', () => {
        const baseDir = path.join (tmp, 'ts', 'src', 'base');
        const wsDir = path.join (tmp, 'ts', 'src', 'base', 'ws');
        const proDir = path.join (tmp, 'ts', 'src', 'pro');
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
        const exchangeFile = path.join (baseDir, 'Exchange.ts');
        fs.writeFileSync (exchangeFile, `
type Str = string | undefined;
type Dict = { [key: string]: any };
export class Exchange {
    clients: Dict = {};
    cleanUnsubscription (client: any, subHash: Str, unsubHash: Str, subHashIsPrefix = false) {
        const clientSubscriptions = Object.keys (client.subscriptions);
        for (let i = 0; i < clientSubscriptions.length; i++) {
            const sub = clientSubscriptions[i];
            if (sub.startsWith (subHash as string)) {
                delete client.subscriptions[sub];
            }
        }
    }
    cleanCache (subscription: Dict | undefined) {
        const clients = Object.values (this.clients);
        for (let i = 0; i < clients.length; i++) {
            const client = clients[i];
            if ('fetchPositionsSnapshot' in client.futures) {
                delete client.futures['fetchPositionsSnapshot'];
            }
        }
    }
}
`);
        const proFile = path.join (proDir, 'demo.ts');
        fs.writeFileSync (proFile, `
import Client from '../base/ws/Client.js';
type Dict = { [key: string]: any };
export class Demo {
    inArray (a: any, b: any[]): boolean { return false; }
    handleUnsub (client: Client, subHash: string) {
        if (subHash in client.rejections) {
            delete client.rejections[subHash];
        }
    }
    pruneKeys (balanceObject: Dict, seenKeys: Dict): Dict {
        const keys = Object.keys (balanceObject);
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (!(key in seenKeys)) {
                delete balanceObject[key];
            }
        }
        return balanceObject;
    }
    callPrune () {
        const obj: Dict = { 'a': 1 };
        const seen: Dict = {};
        return this.pruneKeys (obj, seen);
    }
}
`);
        const t = new Transpiler ({ rust: { useTypeScriptChecker: true } });
        const baseOut = t.transpileRustByPath (exchangeFile).content;
        expect (baseOut).toContain ('.remove_subscription(');
        expect (baseOut).toContain ('.has_future("fetchPositionsSnapshot")');
        expect (baseOut).toContain ('.remove_future("fetchPositionsSnapshot")');
        expect (baseOut).not.toContain ('remove(&mut');

        const proOut = t.transpileRustByPath (proFile).content;
        expect (proOut).toContain ('.has_rejection(');
        expect (proOut).toContain ('.remove_rejection(');
        expect (proOut).toContain ('shift_remove(');
        expect (proOut).not.toContain ('remove(&mut');
    });

    test ('C#: non-null Int64? + Int64? local, minFundingAddressLength field, and required string param CompareOrdinal', () => {
        const dir = path.join (tmp, 'cs', 'ts', 'src');
        fs.mkdirSync (dir, { recursive: true });
        const file = path.join (dir, 'demo.ts');
        fs.writeFileSync (file, `
type Dict = { [key: string]: any };
type Int = number | undefined;
export class Demo {
    options: Dict = {};
    minFundingAddressLength: number = 1;
    safeInteger (d: any, k: any, def?: number): Int { return def; }
    stream (k: string, numSubscriptions: Int = 1): boolean {
        const prev = this.safeInteger (this.options, 'prev', -1);
        const idx = prev + 1;
        const subscriptionsByStream = this.safeInteger (this.options, k, 0);
        const newNumSubscriptions = subscriptionsByStream + numSubscriptions;
        const limit = this.safeInteger (this.options, 'limit', 200);
        return (idx !== undefined) && (newNumSubscriptions > limit);
    }
    checkLen (address: string): boolean {
        return address.length < this.minFundingAddressLength;
    }
    checkHex (hex: string): boolean {
        return hex < '80';
    }
    caller (): boolean {
        return this.stream ('a', 2) && this.checkHex ('ab');
    }
}
`);
        const t = new Transpiler ({ csharp: { useTypeScriptChecker: true } });
        const out = t.transpileCSharpByPath (file).content;
        expect (out).toContain ('Int64 newNumSubscriptions =');
        expect (out).not.toContain ('Int64 idx = (prev + 1)');
        expect (out).not.toContain ('isGreaterThan(newNumSubscriptions');
        expect (out).toContain ('< this.minFundingAddressLength');
        expect (out).not.toContain ('isLessThan(');
        expect (out).toContain ('string.CompareOrdinal(hex, "80") < 0');
    });
});

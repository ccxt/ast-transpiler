import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler.js';
import { installCcxtGoLocalTypes, installFmGo5G01 } from '../src/goTranspiler.js';

const t = (install = true) => {
    const x = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    installCcxtGoLocalTypes (x.goTranspiler);
    if (install) { installFmGo5G01 (x.goTranspiler); }
    return x;
};
const src = (body: string) => [
    'class Client {',
    '    subscriptions: Record<string, any> = {};',
    '}',
    'class Other {',
    '    subscriptions: Record<string, any> = {};',
    '}',
    'class Ex {',
    '    safeString (a: any, b: any, c: any = undefined) { return undefined; }',
    '    m (client: any, other: Other, h: string, hs: string[]) {',
    body,
    '    }',
    '}',
    '',
].join ('\n');
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h25b07-'));
const PRO = 'ts/src/pro/ex.ts';
const BASE = 'ts/src/base/ex.ts';
const go = (body: string, file: string, install = true) => {
    const full = path.join (root, file);
    fs.mkdirSync (path.dirname (full), { recursive: true });
    fs.writeFileSync (full, src (body));
    return t (install).transpileGoByPath (full).content as string;
};

describe ('h25 B07 ws subscription read into a local', () => {
    test ('a pro-source local reads the owner, not GetValue of the snapshot', () => {
        const out = go ('        const sub = client.subscriptions[h];\n        if (sub === undefined) { return 1; }\n        return [ sub ];', PRO);
        expect (out).toContain ('var sub any = client.(ClientInterface).SubscriptionGet(h)');
        expect (out).not.toContain ('SubscriptionsSnapshot');
    });
    test ('an element-of-list key also reads the owner', () => {
        const out = go ('        for (let i = 0; i < hs.length; i++) {\n            const sub = client.subscriptions[hs[i]];\n            if (sub !== undefined) { return [ sub ]; }\n        }', PRO);
        expect (out).toContain ('SubscriptionGet(');
        expect (out).not.toContain ('SubscriptionsSnapshot');
    });
    test ('a local the checker types as a dict is not an any local (negative)', () => {
        const out = go ('        const sub = client.subscriptions[h];\n        return this.safeString (sub, \'id\');', PRO);
        expect (out).not.toContain ('var sub any =');
    });
    test ('base-class source keeps the base read (negative)', () => {
        const out = go ('        const sub = client.subscriptions[h];\n        if (sub === undefined) { return 1; }\n        return [ sub ];', BASE);
        expect (out).not.toContain ('SubscriptionGet(h)');
    });
    test ('the same field on another class is untouched (negative)', () => {
        const out = go ('        const sub = other.subscriptions[h];\n        return this.safeString (sub, \'id\');', PRO);
        expect (out).toContain ('GetValue(other.Subscriptions, h)');
    });
    test ('without the hook nothing reads the owner (negative)', () => {
        const out = go ('        const sub = client.subscriptions[h];\n        if (sub === undefined) { return 1; }\n        return [ sub ];', PRO, false);
        expect (out).not.toContain ('SubscriptionGet');
    });
});

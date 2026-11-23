import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler.js';
import { installCcxtGoLocalTypes, installFmGo5G01 } from '../src/goTranspiler.js';

const t = () => {
    const x = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    installCcxtGoLocalTypes (x.goTranspiler);
    installFmGo5G01 (x.goTranspiler);
    return x;
};
const src = (params: string, body: string) => [
    'class Client {',
    '    subscriptions: Record<string, any> = {};',
    '    futures: Record<string, any> = {};',
    '}',
    'class Other {',
    '    subscriptions: Record<string, any> = {};',
    '    futures: Record<string, any> = {};',
    '}',
    'class Ex {',
    '    safeValue (a: any, b: any, c: any = undefined) { return undefined; }',
    '    m (' + params + ') {',
    body,
    '    }',
    '}',
    '',
].join ('\n');
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h26g48-'));
const go = (params: string, body: string, file: string) => {
    const full = path.join (root, file);
    fs.mkdirSync (path.dirname (full), { recursive: true });
    fs.writeFileSync (full, src (params, body));
    return t ().transpileGoByPath (full).content as string;
};
const PRO = 'ts/src/prediction/ex.ts';
const BASE = 'ts/src/base/ex.ts';

describe ('h26 G48 ws client presence tests', () => {
    test ('a subscription presence bool prints a native nil compare (fails on the base printer)', () => {
        const out = go ('client: Client, h: string', '        const isNew = this.safeValue (client.subscriptions, \'a\') === undefined;\n        return isNew;', PRO);
        expect (out).toContain ('var isNew bool = client.SubscriptionSafe("a") == nil');
        expect (out).not.toContain ('IsEqual(');
    });
    test ('!== undefined prints != nil', () => {
        const out = go ('client: Client, h: string', '        const has = this.safeValue (client.subscriptions, \'a\') !== undefined;\n        return has;', PRO);
        expect (out).toContain ('client.SubscriptionSafe("a") != nil');
    });
    test ('negative: a boxed key keeps the helper', () => {
        const out = go ('client: Client, h', '        const isNew = this.safeValue (client.subscriptions, h) === undefined;\n        return isNew;', PRO);
        expect (out).not.toContain ('SubscriptionSafe(h) == nil');
    });
    test ('negative: another class\'s table keeps the helper', () => {
        const out = go ('other: Other, h: string', '        const isNew = this.safeValue (other.subscriptions, h) === undefined;\n        return isNew;', PRO);
        expect (out).not.toContain ('SubscriptionSafe');
    });
    test ('base frame `k in client.futures` prints FutureHas (fails on the base printer)', () => {
        const out = go ('client: any, h: string', '        if (h in client.futures) {\n            return 1;\n        }\n        return 0;', BASE);
        expect (out).toContain ('if client.FutureHas(h) {');
        expect (out).not.toContain ('InOp(');
    });
    test ('negative: a typed receiver of another class keeps InOp', () => {
        const out = go ('client: Other, h: string', '        if (h in client.futures) {\n            return 1;\n        }\n        return 0;', BASE);
        expect (out).toContain ('InOp(');
    });
    test ('negative: a pro-source frame is left to the ws table rules', () => {
        const out = go ('client: any, h: string', '        if (h in client.futures) {\n            return 1;\n        }\n        return 0;', 'ts/src/pro/ex.ts');
        expect (out).not.toContain ('client.FutureHas(h)');
    });
});

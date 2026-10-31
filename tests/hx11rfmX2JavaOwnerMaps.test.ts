import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

// hx11 rfm X2 (folds hx10w4 OJ01 + hx10w7 OJ06): hand-written single-owner maps print native ops.
//  * `this.options` (BaseExchange.java: `options = new SynchronizedOptions ()`, put(k, null) removes)
//    takes a literal-key element write as `put`, and the loadMarkets currency hand-off key reads
//    through its owner-field accessor;
//  * `client.futures|subscriptions|rejections` (ts/src/base/ws/Client.ts = WsClient.java OwnerMap views)
//    read as a null-guarded `get`.
describe('java owner-store maps', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-hx11rfm-x2');
    const CLIENT = path.join(TMP, 'ts', 'src', 'base', 'ws', 'Client.ts');
    const BASE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const VENUE = path.join(TMP, 'ts', 'src', 'pro', 'fake.ts');
    const OTHER = path.join(TMP, 'ts', 'src', 'pro', 'other.ts');
    const body =
        "export class fake extends Exchange {\n" +
        "    w1 (v: any, k: string) {\n" +
        "        this.options['sandbox'] = v;\n" +
        "        this.options[k] = v;\n" +
        "        this.options['gone'] = undefined;\n" +
        "        this.markets['sandbox'] = v;\n" +
        "    }\n" +
        "    r1 () {\n" +
        "        const a = this.safeDict (this.options, 'cachedCurrencies');\n" +
        "        const b = this.safeDict (this.options, 'cachedCurrencies', {});\n" +
        "        const c = this.safeDict (this.options, 'cachedCurrenciesById', {});\n" +
        "        const d = this.safeDict (this.options, 'cachedCurrencies', { 'x': 1 });\n" +
        "        return [ a, b, c, d ];\n" +
        "    }\n" +
        "    c1 (client: Client, messageHash: string) {\n" +
        "        const sub = client.subscriptions[messageHash];\n" +
        "        const rej = client.rejections[messageHash];\n" +
        "        const other = client.other[messageHash];\n" +
        "        const call = client.subscriptions[this.hash (messageHash)];\n" +
        "        const future = client.futures[messageHash];\n" +
        "        return [ sub, rej, other, call, future ];\n" +
        "    }\n" +
        "    c2 (client: Client, messageHash: string) {\n" +
        "        const future = client.futures[messageHash];\n" +
        "        future.resolve (1);\n" +
        "        client.subscriptions[messageHash]['checksum'] = true;\n" +
        "        client.subscriptions['authenticated']['expires'] = 1;\n" +
        "    }\n" +
        "    hash (s: string): string { return s; }\n" +
        "}\n";
    let out: string;
    let outOther: string;
    let outBare: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(CLIENT), { recursive: true });
        fs.mkdirSync(path.dirname(VENUE), { recursive: true });
        fs.writeFileSync(CLIENT, "type Dictionary<T> = { [key: string]: T };\nexport default class Client {\n    futures: Dictionary<any>;\n    subscriptions: Dictionary<any>;\n    rejections: Dictionary<any>;\n    other: Dictionary<any>;\n}\n");
        fs.writeFileSync(BASE,
            "export class Exchange {\n" +
            "    options: any;\n" +
            "    markets: any;\n" +
            "    safeDict (d: any, k: any, def: any = undefined): any { return d; }\n" +
            "}\n");
        fs.writeFileSync(VENUE, "import { Exchange } from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\n" + body);
        // a client-shaped class that is NOT the ws Client, and a venue that overrides safeDict
        fs.writeFileSync(OTHER, "import { Exchange } from '../base/Exchange.js';\n" +
            "type Dictionary<T> = { [key: string]: T };\nclass Client {\n    futures: Dictionary<any>;\n    subscriptions: Dictionary<any>;\n    rejections: Dictionary<any>;\n    other: Dictionary<any>;\n}\n" +
            body.replace('export class fake extends Exchange {', 'export class other extends Exchange {\n    safeDict (d: any, k: any, def: any = undefined): any { return def; }'));
        const byPath = new Transpiler({ 'verbose': false, 'java': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        // the build layer names the header's owner stores and hand-off accessors (installJavaOwnerStores)
        const printer: any = (byPath as any).javaTranspiler;
        printer.javaOwnerStoreFields = new Set(['options']);
        printer.javaOwnerStoreHandoffs = { 'cachedCurrencies': ['cachedCurrenciesForLoad', 'cachedCurrenciesForLoadOrEmpty'] };
        out = byPath.transpileJavaByPath(VENUE).content;
        outOther = byPath.transpileJavaByPath(OTHER).content;
        // no owner store named: every options site keeps the helper
        const bare = new Transpiler({ 'verbose': false, 'java': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        outBare = bare.transpileJavaByPath(VENUE).content;
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    const method = (text: string, name: string) => {
        const start = text.indexOf(' ' + name + '(');
        return text.slice(start, text.indexOf('\n    }', start));
    };

    test('a literal-key write on the owner store options is the native put', () => {
        const w1 = method(out, 'w1');
        expect(w1).toContain('this.options.put("sandbox", v);');
        expect(w1).not.toContain('addElementToObject(this.options, "sandbox"');
    });

    test('a computed key, a nullish literal and another field keep the helper', () => {
        const w1 = method(out, 'w1');
        expect(w1).toContain('Helpers.addElementToObject(this.options, k, v)');
        expect(w1).not.toContain('this.options.put("gone"');
        expect(w1).toContain('Helpers.addElementToObject(this.markets, "sandbox", v)');
    });

    test('the cachedCurrencies hand-off reads the owner field accessor', () => {
        const r1 = method(out, 'r1');
        expect(r1).toContain('this.cachedCurrenciesForLoad()');
        expect(r1).toContain('this.cachedCurrenciesForLoadOrEmpty()');
        // another key and a non-empty default keep the options read
        expect(r1).toContain('this.safeDict(this.options, "cachedCurrenciesById"');
        expect(r1).toContain('this.safeDict(this.options, "cachedCurrencies", new');
    });

    test('without a declared owner store every options site keeps the helper', () => {
        const w1 = method(outBare, 'w1');
        expect(w1).toContain('Helpers.addElementToObject(this.options, "sandbox", v)');
        expect(method(outBare, 'r1')).not.toContain('cachedCurrenciesForLoad');
    });

    test('a venue-overridden safeDict keeps the options read', () => {
        const r1 = method(outOther, 'r1');
        expect(r1).not.toContain('cachedCurrenciesForLoad');
        expect(r1).toContain('this.safeDict(this.options, "cachedCurrencies"');
    });

    test('ws client map reads are the guarded native get', () => {
        const c1 = method(out, 'c1');
        expect(c1).toContain('(client.subscriptions == null || messageHash == null ? null : client.subscriptions.get(messageHash))');
        expect(c1).toContain('(client.rejections == null || messageHash == null ? null : client.rejections.get(messageHash))');
        expect(c1).not.toContain('Helpers.GetValue(client.subscriptions, messageHash)');
        expect(c1).not.toContain('Helpers.GetValue(client.rejections');
    });

    test('a computed key and a non-ws-client receiver keep the helper', () => {
        const c1 = method(out, 'c1');
        expect(c1).toContain('Helpers.GetValue(client.subscriptions, this.hash((String) (messageHash)))');
        expect(c1).toContain('Helpers.GetValue(client.other, messageHash)');
        const o1 = method(outOther, 'c1');
        expect(o1).toContain('Helpers.GetValue(client.subscriptions, messageHash)');
        expect(o1).not.toContain('client.subscriptions == null');
    });

    test('a local read from client.futures prints the Future type and the chained write reads natively', () => {
        const c2 = method(out, 'c2');
        expect(c2).toContain('io.github.ccxt.ws.Future future = (client.futures == null || messageHash == null ? null : client.futures.get(messageHash));');
        expect(c2).toContain('(client.subscriptions == null || messageHash == null ? null : client.subscriptions.get(messageHash))');
        expect(c2).toContain('(client.subscriptions == null ? null : client.subscriptions.get("authenticated"))');
        expect(c2).not.toContain('Helpers.GetValue(client.subscriptions');
    });
});

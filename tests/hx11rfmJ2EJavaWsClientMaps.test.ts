import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

// hx11 RFM-J2 E (folds ccxt hx10w3-J01): the ws Client's futures / subscriptions / rejections are
// `public final Map<String, V>` fields of the hand-written WsClient.java (ts/src/base/ws/Client.ts),
// declared `Dictionary<any>` in TS. On the `client` the generated handlers receive, and on a local
// bound to one of them, every Map operation binds on the field's own type: no receiver cast, native
// keySet / values, `put` for a String key (OwnerMap.put(k, null) is the helper's removal), `remove`.
describe('java ws client map operations', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-hx11rfm-j2e');
    const CLIENT = path.join(TMP, 'ts', 'src', 'base', 'ws', 'Client.ts');
    const BASE = path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const VENUE = path.join(TMP, 'ts', 'src', 'pro', 'fake.ts');
    const OTHER = path.join(TMP, 'ts', 'src', 'pro', 'other.ts');
    const body =
        "export class fake extends Exchange {\n" +
        "    d1 (client: Client, messageHash: string, other: Client) {\n" +
        "        if (messageHash in client.subscriptions) {\n" +
        "            delete client.subscriptions[messageHash];\n" +
        "        }\n" +
        "        if (messageHash in client.futures) {\n" +
        "            delete client.futures[messageHash];\n" +
        "        }\n" +
        "        if (messageHash in other.subscriptions) {\n" +
        "            delete other.subscriptions[messageHash];\n" +
        "        }\n" +
        "    }\n" +
        "    k1 (client: Client) {\n" +
        "        const keys = Object.keys (client.subscriptions);\n" +
        "        const futures = Object.keys (client.futures);\n" +
        "        const values = Object.values (client.rejections);\n" +
        "        return [ keys, futures, values ];\n" +
        "    }\n" +
        "    p1 (client: Client, messageHash: string, v: any) {\n" +
        "        client.subscriptions[messageHash] = v;\n" +
        "        client.subscriptions['authenticated'] = v;\n" +
        "        client.futures[messageHash] = v;\n" +
        "    }\n" +
        "    a1 (client: Client, messageHash: string) {\n" +
        "        const subs = client.subscriptions;\n" +
        "        const keys = Object.keys (subs);\n" +
        "        const values = Object.values (subs);\n" +
        "        if (messageHash in subs) {\n" +
        "            delete subs[messageHash];\n" +
        "        }\n" +
        "        const futs = client.futures;\n" +
        "        return [ keys, values, futs ];\n" +
        "    }\n" +
        "    u1 (client: any, messageHash: string) {\n" +
        "        const keys = Object.keys (client.futures);\n" +
        "        if (messageHash in client.subscriptions) {\n" +
        "            delete client.subscriptions[messageHash];\n" +
        "        }\n" +
        "        return keys;\n" +
        "    }\n" +
        "    l1 (client: Client) {\n" +
        "        const promise = client.futures['authenticated'];\n" +
        "        promise.resolve (1);\n" +
        "    }\n" +
        "    a2 (client: Client, messageHash: string) {\n" +
        "        let subs = client.subscriptions;\n" +
        "        subs = {};\n" +
        "        const keys = Object.keys (subs);\n" +
        "        return keys;\n" +
        "    }\n" +
        "}\n";
    let out: string;
    let outOther: string;

    beforeAll(() => {
        fs.mkdirSync(path.dirname(CLIENT), { recursive: true });
        fs.mkdirSync(path.dirname(VENUE), { recursive: true });
        fs.writeFileSync(CLIENT, "type Dictionary<T> = { [key: string]: T };\nexport default class Client {\n    futures: Dictionary<any>;\n    subscriptions: Dictionary<any>;\n    rejections: Dictionary<any>;\n}\n");
        fs.writeFileSync(BASE, "export class Exchange {\n}\n");
        fs.writeFileSync(VENUE, "import { Exchange } from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\n" + body);
        // a client-shaped class that is NOT the ws Client
        fs.writeFileSync(OTHER, "import { Exchange } from '../base/Exchange.js';\n" +
            "type Dictionary<T> = { [key: string]: T };\nclass Client {\n    futures: Dictionary<any>;\n    subscriptions: Dictionary<any>;\n    rejections: Dictionary<any>;\n}\n" +
            body.replace('export class fake extends Exchange {', 'export class other extends Exchange {'));
        const byPath = new Transpiler({ 'verbose': false, 'java': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        out = byPath.transpileJavaByPath(VENUE).content;
        outOther = byPath.transpileJavaByPath(OTHER).content;
    });

    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
    });

    const method = (text: string, name: string) => {
        const start = text.indexOf(' ' + name + '(');
        return text.slice(start, text.indexOf('\n    }', start));
    };

    test('in / delete on the first-parameter client bind on the field type with no receiver cast', () => {
        const d1 = method(out, 'd1');
        expect(d1).toContain('client.subscriptions.containsKey(messageHash)');
        expect(d1).toContain('client.subscriptions.remove((String)messageHash)');
        expect(d1).toContain('client.futures.containsKey(messageHash)');
        expect(d1).toContain('client.futures.remove((String)messageHash)');
        expect(d1).not.toContain('((java.util.Map<?, ?>)client');
        expect(d1).not.toContain('((java.util.Map<String,Object>)client');
    });

    test('a client that is not the first parameter keeps the receiver cast', () => {
        const d1 = method(out, 'd1');
        expect(d1).toContain('((java.util.Map<?, ?>)other.subscriptions).containsKey(messageHash)');
        expect(d1).toContain('((java.util.Map<String,Object>)other.subscriptions).remove((String)messageHash)');
    });

    test('a class that is not the ws Client keeps the receiver cast', () => {
        const d1 = method(outOther, 'd1');
        expect(d1).toContain('((java.util.Map<String,Object>)client.subscriptions).remove((String)messageHash)');
        expect(d1).not.toContain('client.subscriptions.remove(');
    });

    test('Object.keys / Object.values on a ws map print the native copy', () => {
        const k1 = method(out, 'k1');
        expect(k1).toContain('new java.util.ArrayList<Object>(client.subscriptions.keySet())');
        expect(k1).toContain('new java.util.ArrayList<Object>(client.futures.keySet())');
        expect(k1).toContain('new java.util.ArrayList<Object>(client.rejections.values())');
        expect(k1).not.toContain('Helpers.objectKeys');
        expect(k1).not.toContain('Helpers.objectValues');
        expect(method(outOther, 'k1')).toContain('Helpers.objectKeys(client.subscriptions)');
    });

    test('a String-key write on a Map<String, Object> field is the native put; the Future map keeps the helper', () => {
        const p1 = method(out, 'p1');
        expect(p1).toContain('client.subscriptions.put(messageHash, v);');
        expect(p1).toContain('client.subscriptions.put(\"authenticated\", v);');
        expect(p1).toContain('Helpers.addElementToObject(client.futures, messageHash, v)');
        expect(method(outOther, 'p1')).toContain('Helpers.addElementToObject(client.subscriptions, messageHash, v)');
    });

    test('a local bound to a ws map holds the field type and its operations need no cast', () => {
        const a1 = method(out, 'a1');
        expect(a1).toContain('java.util.Map<String, Object> subs = client.subscriptions;');
        expect(a1).toContain('new java.util.ArrayList<Object>(subs.keySet())');
        expect(a1).toContain('new java.util.ArrayList<Object>(subs.values())');
        expect(a1).toContain('subs.containsKey(messageHash)');
        expect(a1).toContain('subs.remove((String)messageHash)');
        expect(a1).toContain('java.util.Map<String, io.github.ccxt.ws.Future> futs = client.futures;');
    });

    test('an any-typed first-parameter client (the base tier) binds the same way', () => {
        const u1 = method(out, 'u1');
        expect(u1).toContain('new java.util.ArrayList<Object>(client.futures.keySet())');
        // the `any` receiver keeps the null test on a key it cannot check
        expect(u1).toContain('(messageHash != null && client.subscriptions.containsKey(messageHash))');
        expect(u1).toContain('client.subscriptions.remove((String)messageHash)');
    });

    test('a literal-key read out of client.futures declares the Future type', () => {
        expect(method(out, 'l1')).toContain('io.github.ccxt.ws.Future promise = client.futures.get(\"authenticated\");');
    });

    test('a rewritten alias local stays an Object box', () => {
        const a2 = method(out, 'a2');
        expect(a2).toContain('Object subs = client.subscriptions;');
        expect(a2).not.toContain('java.util.Map<String, Object> subs');
    });
});

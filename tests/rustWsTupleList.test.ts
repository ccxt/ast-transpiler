import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

jest.setTimeout(120000);
const transpiler = new Transpiler({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);

describe('a watch tuple whose every resolve is an array literal is read as a list', () => {
    const files: Record<string, string> = {
        "ts/src/base/ws/OrderBook.ts": "export class WsOrderBook {\n    cache: any[] = [];\n    constructor (snapshot: any = {}, depth: any = undefined) {}\n    limit () { return this; }\n    reset (snapshot: any = {}) {}\n}\n",
        "ts/src/base/ws/Cache.ts": "export class ArrayCache {\n    constructor (maxSize: any = undefined) {}\n    append (item: any) {}\n    getLimit (symbol: any, limit: any): any { return limit; }\n}\n",
        "ts/src/base/ws/Client.ts": "export default class Client {\n    resolve (result: any, messageHash: string): any { return result; }\n}\n",
        "ts/src/base/Exchange.ts": "import { WsOrderBook } from './ws/OrderBook.js';\nimport { ArrayCache } from './ws/Cache.js';\nexport interface Dictionary<T> { [key: string]: T }\nexport type Int = number | undefined;\nexport default class Exchange {\n    orderbooks: Dictionary<WsOrderBook> = {};\n    trades: Dictionary<ArrayCache> = {};\n    newUpdates: boolean = true;\n    safeString (obj: any, key: any, defaultValue: string = undefined): string { return obj[key]; }\n    async watch (url: string, messageHash: string, message: any = undefined, subscribeHash: any = undefined, subscription: any = undefined): Promise<any> { return undefined; }\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n    filterBySinceLimit (array: object[] | undefined, since: Int = undefined, limit: Int = undefined, tail = false): any[] {\n        return [];\n    }\n    cleanUnsubscription (client: any, subHash: string, unsubHash: string) {\n        client.resolve (true, unsubHash);\n    }\n}\n",
        "ts/src/pro/venue.ts": "import Exchange from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\nimport { ArrayCache } from '../base/ws/Cache.js';\nexport default class venue extends Exchange {\n    async watchCandles (symbol: string, limit: any = undefined) {\n        const messageHash = 'candles:' + symbol + ':1m';\n        const [ s, tf, candles ] = await this.watch ('wss://x', messageHash, {}, messageHash);\n        let limitResolved = limit;\n        if (this.newUpdates) {\n            limitResolved = candles.getLimit (s, limit);\n        }\n        return this.filterBySinceLimit (candles, undefined, limitResolved, true);\n    }\n    handleOHLCV (client: Client, message: any) {\n        const symbol = this.safeString (message, 's');\n        const stored = new ArrayCache (10);\n        client.resolve ([ symbol, '1m', stored ], 'candles:' + symbol + ':1m');\n    }\n    handleUnsubscription (client: Client, message: any) {\n        const hash = this.safeString (message, 'h');\n        this.cleanUnsubscription (client, hash, 'unsubscribe:' + hash);\n        client.resolve (true, hash);\n    }\n    handleMessage (client: Client, message: any) {\n        this.handleOHLCV (client, message);\n        this.handleUnsubscription (client, message);\n    }\n}\n"
    };
    let out: string;
    beforeAll(() => {
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-rs-wstuple-'));
        for (const [rel, text] of Object.entries (files)) {
            fs.mkdirSync (path.dirname (path.join (root, rel)), { recursive: true });
            fs.writeFileSync (path.join (root, rel), text);
        }
        out = transpiler.transpileRustByPath(path.join (root, 'ts/src/pro/venue.ts')).content;
        fs.rmSync (root, { recursive: true, force: true });
    });
    test('positive: the slots read Vec elements, no get_value', () => {
        expect(out).toContain('let stfcandlesVariable: Vec<Value> = ');
        expect(out).toContain('.as_array().cloned().unwrap_or_default();');
        expect(out).toContain('let mut s: Option<String> = stfcandlesVariable.get(0).cloned().unwrap_or(Value::Null).as_str()');
        expect(out).not.toMatch(/get_value\(&stfcandlesVariable/);
    });
});

describe('a watch tuple with a non-literal resolve keeps get_value', () => {
    const files: Record<string, string> = {
        "ts/src/base/ws/OrderBook.ts": "export class WsOrderBook {\n    cache: any[] = [];\n    constructor (snapshot: any = {}, depth: any = undefined) {}\n    limit () { return this; }\n    reset (snapshot: any = {}) {}\n}\n",
        "ts/src/base/ws/Cache.ts": "export class ArrayCache {\n    constructor (maxSize: any = undefined) {}\n    append (item: any) {}\n    getLimit (symbol: any, limit: any): any { return limit; }\n}\n",
        "ts/src/base/ws/Client.ts": "export default class Client {\n    resolve (result: any, messageHash: string): any { return result; }\n}\n",
        "ts/src/base/Exchange.ts": "import { WsOrderBook } from './ws/OrderBook.js';\nimport { ArrayCache } from './ws/Cache.js';\nexport interface Dictionary<T> { [key: string]: T }\nexport type Int = number | undefined;\nexport default class Exchange {\n    orderbooks: Dictionary<WsOrderBook> = {};\n    trades: Dictionary<ArrayCache> = {};\n    newUpdates: boolean = true;\n    safeString (obj: any, key: any, defaultValue: string = undefined): string { return obj[key]; }\n    async watch (url: string, messageHash: string, message: any = undefined, subscribeHash: any = undefined, subscription: any = undefined): Promise<any> { return undefined; }\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n    filterBySinceLimit (array: object[] | undefined, since: Int = undefined, limit: Int = undefined, tail = false): any[] {\n        return [];\n    }\n    cleanUnsubscription (client: any, subHash: string, unsubHash: string) {\n        client.resolve (true, unsubHash);\n    }\n}\n",
        "ts/src/pro/venue.ts": "import Exchange from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\nimport { ArrayCache } from '../base/ws/Cache.js';\nexport default class venue extends Exchange {\n    async watchCandles (symbol: string, limit: any = undefined) {\n        const messageHash = 'candles:' + symbol + ':1m';\n        const [ s, tf, candles ] = await this.watch ('wss://x', messageHash, {}, messageHash);\n        let limitResolved = limit;\n        if (this.newUpdates) {\n            limitResolved = candles.getLimit (s, limit);\n        }\n        return this.filterBySinceLimit (candles, undefined, limitResolved, true);\n    }\n    handleOHLCV (client: Client, message: any) {\n        const symbol = this.safeString (message, 's');\n        const stored = new ArrayCache (10);\n        client.resolve ([ symbol, '1m', stored ], 'candles:' + symbol + ':1m');\n        client.resolve (message, 'candles:' + symbol + ':1m');\n    }\n    handleUnsubscription (client: Client, message: any) {\n        const hash = this.safeString (message, 'h');\n        this.cleanUnsubscription (client, hash, 'unsubscribe:' + hash);\n        client.resolve (true, hash);\n    }\n    handleMessage (client: Client, message: any) {\n        this.handleOHLCV (client, message);\n        this.handleUnsubscription (client, message);\n    }\n}\n"
    };
    let out: string;
    beforeAll(() => {
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-rs-wstuple-'));
        for (const [rel, text] of Object.entries (files)) {
            fs.mkdirSync (path.dirname (path.join (root, rel)), { recursive: true });
            fs.writeFileSync (path.join (root, rel), text);
        }
        out = transpiler.transpileRustByPath(path.join (root, 'ts/src/pro/venue.ts')).content;
        fs.rmSync (root, { recursive: true, force: true });
    });
    test('negative: a raw message settle (any kind) keeps the boxed read', () => {
        expect(out).toMatch(/get_value\(&stfcandlesVariable, &Value::Int\(0\)\)/);
    });
});


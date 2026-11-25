import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a ws handler's `message: Dict` stays borrowed when its only key writes go into a stored order book or a parsed snapshot
const book = 'import type { Dict, Int, Str } from \'../Exchange.js\';\n' +
    'class OrderBook {\n    cache: any[] = [];\n    asks: any[];\n    bids: any[];\n    timestamp: Int;\n    datetime: Str;\n    nonce: Int;\n    symbol: Str;\n' +
    '    constructor (snapshot: Dict = {}) {\n        this.asks = [];\n        this.bids = [];\n    }\n    reset (s: Dict) {\n        this.nonce = undefined;\n    }\n}\n' +
    'export { OrderBook, OrderBook as WsOrderBook };\n';
const base = 'import { WsOrderBook } from \'./ws/OrderBook.js\';\n' +
    'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport type Int = number | undefined;\n' +
    'export interface Dictionary<T> { [key: string]: T }\n' +
    'export default class Exchange {\n    orderbooks: Dictionary<WsOrderBook> = {};\n' +
    '    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    safeInteger (o: any, k: any, d: Int = undefined): Int { return o; }\n' +
    '    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o; }\n' +
    '    orderBook (snapshot: Dict = {}): WsOrderBook { return new WsOrderBook (snapshot); }\n' +
    '    parseOrderBook (ob: object | undefined, symbol: Str, timestamp: Int = undefined): any {\n        return { \'symbol\': symbol, \'timestamp\': timestamp, \'nonce\': undefined } as any;\n    }\n' +
    '    sharedBook: Dict = {};\n    mixedBook (): any {\n        return { \'bids\': this.sharedBook, \'nonce\': undefined };\n    }\n' +
    '    echoRow (ob: Dict): Dict {\n        return ob;\n    }\n' +
    '    hold (x: any): any { return x; }\n}\n';
const wsClient = 'export default class Client {\n    resolve (a: any, b: any) {}\n}\n';
const venue = "import Exchange from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    // positive: writes into the stored book and into a parsed snapshot
    "    handleOrderBook (client: Client, message: Dict) {\n        const symbol = this.safeString (message, 'symbol', '');\n" +
    "        const data = this.safeDict (message, 'data');\n        if (!(symbol in this.orderbooks)) {\n            this.orderbooks[symbol] = this.orderBook ();\n        }\n" +
    "        const orderbook = this.orderbooks[symbol];\n        const timestamp = this.safeInteger (data, 'ts');\n" +
    "        const snapshot = this.parseOrderBook (data, symbol, timestamp);\n        snapshot['nonce'] = this.safeInteger (data, 'seq');\n" +
    "        orderbook.reset (snapshot);\n        orderbook['timestamp'] = timestamp;\n        client.resolve (orderbook, symbol);\n    }\n" +
    // negative: a write into a row read off the message
    "    handleRowBook (client: Client, message: Dict) {\n        const row = this.safeDict (message, 'data');\n        row['ts'] = 1;\n        this.hold (row);\n    }\n" +
    // negative: a write into what a method that returns its argument hands back (may be the message)
    "    handleEchoBook (client: Client, message: Dict) {\n        const row = this.echoRow (message);\n        row['ts'] = 1;\n        this.hold (row);\n    }\n" +
    // negative: a literal that holds a shared value
    "    handleMixedBook (client: Client, message: Dict) {\n        const snap = this.mixedBook ();\n        snap['nonce'] = this.safeInteger (message, 'seq');\n        this.hold (snap);\n    }\n" +
    "    handleMessage (client: Client, message: Dict) {\n        const methods: Dict = {\n            'book': this.handleOrderBook,\n            'row': this.handleRowBook,\n            'echo': this.handleEchoBook,\n            'mixed': this.handleMixedBook,\n        };\n        this.hold (methods);\n    }\n}\n";

describe ('rust ws handler message stays borrowed beside order-book writes (rustLocalHoldsFreshBook)', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h44r11-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'Client.ts'), wsClient);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'OrderBook.ts'), book);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('writes into the stored book and a parsed snapshot keep the message borrowed', () => {
        expect (output).toMatch (/fn handleOrderBook\(&(?:mut )?self, client: [^,]+, message: &indexmap::IndexMap<String, Value>\)/);
    });

    test ('negatives keep the Value slot', () => {
        expect (output).not.toMatch (/fn handleRowBook\([^)]*message: &indexmap::IndexMap/);
        expect (output).not.toMatch (/fn handleMixedBook\([^)]*message: &indexmap::IndexMap/);
        expect (output).not.toMatch (/fn handleEchoBook\([^)]*message: &indexmap::IndexMap/);
    });
});

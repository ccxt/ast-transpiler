import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a ws handler whose `message: Dict` is returned or handed whole to an `any` slot takes the dict handle
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    keep (o: Dict): Dict { return o; }\n}\n';
const rest = "import Exchange from './base/Exchange.js';\nexport default class venueRest extends Exchange {\n    parseOHLCV (ohlcv: any, market: any = undefined): number[] { return []; }\n}\n";
const wsClient = 'export default class Client {\n    lastPong: number = 0;\n    resolve (x: any, h: string) {}\n}\n';
const proVenue = "import Exchange from '../venueRest.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    handleOHLCV (client: Client, message: Dict): Dict {\n        const id = this.safeString (message, 'symbol', '');\n        client.resolve (this.parseOHLCV (message), id);\n        return message;\n    }\n" +
    "    handleTrades (client: Client, message: Dict) {\n        const id = this.safeString (message, 'symbol', '');\n        client.resolve (this.keep (message), id);\n    }\n" +
    "    handleTicker (client: Client, message: Dict) {\n        message['x'] = 1;\n        client.resolve (this.parseOHLCV (message), 'h');\n    }\n" +
    "    handleMessage (client: Client, message: Dict) {\n        const methods: Dict = { 'kline': this.handleOHLCV, 'trades': this.handleTrades, 'ticker': this.handleTicker };\n        const m = this.safeString (message, 'ch');\n        if (m !== undefined) {\n            methods[m].call (this, client, message);\n        }\n    }\n}\n";

describe ('rust ws handler message: returned or handed whole to an any slot', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h44r20-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venueRest.ts'), rest);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'Client.ts'), wsClient);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), proVenue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('the handler takes the dict handle and boxes it whole where a Value is wanted', () => {
        expect (output).toMatch (/fn handleOHLCV\([^)]*message: &crate::value::Dict\)/);
        expect (output).toMatch (/parseOHLCV\(Value::from\(message\)/);
        expect (output).toMatch (/return Value::from\(message\);/);
    });

    test ('a typed Dict slot or a key write keeps the Value message', () => {
        expect (output).not.toMatch (/fn handleTrades\([^)]*message: &crate::value::Dict/);
        expect (output).not.toMatch (/fn handleTicker\([^)]*message: &crate::value::Dict/);
    });
});

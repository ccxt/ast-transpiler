import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a pro-file optional market symbol (`market['symbol']` off a safeMarket record) keyed on a cache field and boxed at lending
// slots lends there instead of staying a `Value`
const cache = 'class ArrayCacheByTimestamp extends Array {\n    constructor (n: number = undefined) {\n        super ();\n    }\n    append (x: any) {}\n}\nexport { ArrayCacheByTimestamp };\n';
const base = "import { ArrayCacheByTimestamp } from './ws/Cache.js';\n" + 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport type Int = number | undefined;\n' +
    'export interface Dictionary<T> { [key: string]: T }\nexport interface Market { id: Str; symbol: string; }\n' +
    'export default class Exchange {\n    ohlcvs: Dictionary<Dictionary<ArrayCacheByTimestamp>> = {};\n' +
    '    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o; }\n' +
    '    safeMarket (id: Str = undefined): Market { return undefined; }\n' +
    '    hold (x: any): any { return x; }\n}\n';
const wsClient = 'export default class Client {\n    resolve (a: any, b: any) {}\n}\n';
const venue = "import Exchange from '../base/Exchange.js';\nimport { ArrayCacheByTimestamp } from '../base/ws/Cache.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    // positive: a cache-field key, then boxed into a resolved list
    "    handleOHLCV (client: Client, message: Dict) {\n        const market = this.safeMarket (this.safeString (message, 's'));\n" +
    "        const symbol = market['symbol'];\n        const tf = this.safeString (message, 't');\n" +
    "        this.ohlcvs[symbol] = this.safeDict (this.ohlcvs, symbol, {});\n" +
    "        if (this.safeDict (this.ohlcvs[symbol], tf) === undefined) {\n            this.ohlcvs[symbol][tf as string] = new ArrayCacheByTimestamp (10);\n        }\n" +
    "        const stored = this.ohlcvs[symbol][tf as string];\n        stored.append (message);\n        this.ohlcvs[symbol][tf as string] = stored;\n" +
    "        const resolveData = [ symbol, tf, stored ];\n        client.resolve (resolveData, 'ohlcv|' + symbol);\n    }\n" +
    // negative: a REST-tier shape is untouched (no cache field), stays as before
    "    handleOther (client: Client, message: Dict) {\n        const symbol = message['symbol'];\n        client.resolve (symbol, 'x');\n    }\n" +
    '}\n';

describe ('rust pro cache-field optional market symbol lends at its boxes (rustFieldKeyCostly)', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h53r42-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'Client.ts'), wsClient);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'Cache.ts'), cache);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('the key local is an Option<String> read off the record map, lent where it is boxed', () => {
        expect (output).toContain ('let mut symbol: Option<String> = crate::value::KeyRead::key_read(&&market, "symbol").as_str().map(str::to_owned);');
        expect (output).toContain ('Value::from(symbol.as_deref())');
    });
    test ('negative: a read off an untyped dict is not a market field and keeps the Value', () => {
        const other = output.slice (output.indexOf ('fn handle_other'));
        expect (other).not.toContain ('symbol: Option<String>');
    });
});

import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a pro read of the ws cache `hashmap` snapshot (a typed `Dict`) reads the symbol bucket off the map
const cache = 'class ArrayCache extends Array {\n    hashmap: any = {};\n    constructor (n: number = undefined) {\n        super ();\n    }\n    append (x: any) {}\n}\nexport { ArrayCache };\n';
const base = "import { ArrayCache } from './ws/Cache.js';\n" + 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    orders: ArrayCache | undefined = undefined;\n' +
    '    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    safeDict (o: any, k: any, d: Dict = undefined): Dict { return o; }\n' +
    '    hold (x: any): any { return x; }\n}\n';
const venue = "import Exchange from '../base/Exchange.js';\nimport type { Dict } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    handleOrder (client: any, message: Dict) {\n        const symbol = this.safeString (message, 's');\n        const id = this.safeString (message, 'i');\n" +
    "        const cachedOrders = this.orders;\n        const bucket = this.safeDict (cachedOrders.hashmap, symbol, {});\n        const previous = this.safeDict (bucket, id);\n        return this.hold (previous);\n    }\n" +
    "    handleKeys (client: any, message: Dict) {\n        const cachedOrders = this.orders;\n        const keys = Object.keys (cachedOrders.hashmap);\n        return keys.length;\n    }\n" +
    "    handleOther (client: any, message: Dict) {\n        const cachedOrders = this.orders;\n        const other = this.safeDict (cachedOrders.hashmap, 'BTC/USDT', { 'a': 1 });\n        return this.hold (other);\n    }\n" +
    "    handleWrite (client: any, message: Dict) {\n        const symbol = this.safeString (message, 's');\n        const cachedOrders = this.orders;\n" +
    "        const written = this.safeDict (cachedOrders.hashmap, symbol, {});\n        written['x'] = 1;\n        return this.hold (written);\n    }\n" +
    '}\n';

jest.mock ('module', () => ({ __esModule: true, default: jest.fn () }));

describe ('rust pro ws cache hashmap snapshot is a typed Dict', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h55r36-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'Cache.ts'), cache);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('positive: a read-only bucket is read off the typed snapshot map', () => {
        expect (output).toContain ('let mut bucket: crate::value::Dict = cachedOrders.hashmap().key_dict(symbol.as_deref().unwrap_or("null"));');
        expect (output).not.toContain ('if let Some(Value::Dict(__m))');
    });
    test ('positive: the snapshot keys are the map keys', () => {
        expect (output).toContain ('Value::Array(cachedOrders.hashmap().keys().cloned().map(Value::from).collect())');
        expect (output).not.toContain ('object_keys(&cachedOrders.hashmap())');
    });
    test ('negative: a non-empty default keeps the reader', () => {
        expect (output).not.toMatch (/let (mut )?other: crate::value::Dict = [^;]*key_dict/);
    });
    test ('negative: a bucket that is written keeps the reader (its write must reach the store)', () => {
        expect (output).not.toMatch (/let (mut )?written: crate::value::Dict = [^;]*key_dict/);
    });
});

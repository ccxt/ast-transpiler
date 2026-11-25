import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a ws handler that writes a key into a record built by a method returning an object literal (`parseOrderBook`) borrows its message
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    shared: Dict = {};\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    hold (x: any): any { return x; }\n' +
    "    parseBook (book: object | undefined, symbol: Str): Dict {\n        return {\n            'symbol': symbol,\n            'bids': this.safeString (book, 'bids'),\n            'nonce': undefined,\n        } as any;\n    }\n" +
    "    parseMixed (book: Dict, symbol: Str): Dict {\n        if (symbol === undefined) {\n            return book;\n        }\n        return {\n            'symbol': symbol,\n        };\n    }\n" +
    "    parseKept (book: Dict): Dict {\n        return this.shared;\n    }\n}\n";
const wsClient = 'export default class Client {\n    lastPong: number = 0;\n}\n';
const proVenue = "import Exchange from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    handleOrderBookSnapshot (client: Client, message: Dict) {\n        const data = this.safeString (message, 'data');\n        const snapshot = this.parseBook ({}, data);\n        snapshot['nonce'] = 1;\n        this.hold (snapshot);\n    }\n" +
    "    handleMixed (client: Client, message: Dict) {\n        const snapshot = this.parseMixed (message, undefined);\n        snapshot['nonce'] = 1;\n        this.hold (snapshot);\n    }\n" +
    "    handleKept (client: Client, message: Dict) {\n        const snapshot = this.parseKept (message);\n        snapshot['nonce'] = 1;\n        this.hold (snapshot);\n    }\n" +
    "    handleMessage (client: Client, message: Dict) {\n        const methods: Dict = {\n            'snapshot': this.handleOrderBookSnapshot,\n            'mixed': this.handleMixed,\n            'kept': this.handleKept,\n        };\n        this.hold (methods);\n    }\n}\n";

describe ('rust ws handler message slot: writes into a record returned as an object literal do not alias the message', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h45r16-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'Client.ts'), wsClient);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), proVenue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('a write into a fresh parsed book borrows the message', () => {
        expect (output).toMatch (/fn handle_?[oO]rder_?[bB]ook_?[sS]napshot\([^)]*message: &indexmap::IndexMap<String, Value>/);
    });

    test ('negatives keep the Value slot', () => {
        // one path hands back the argument itself
        expect (output).toMatch (/fn handle_?[mM]ixed\([^)]*message: Value/);
        // the reader hands back a shared field
        expect (output).toMatch (/fn handle_?[kK]ept\([^)]*message: Value/);
    });
});

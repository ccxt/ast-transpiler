import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// rustVenueDictParam: a venue helper's read-only `Dict` parameter prints a borrowed map
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o; }\n    hold (x: any): any { return x; }\n}\n';
const venue = "import Exchange from './base/Exchange.js';\nimport type { Dict, Str } from './base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    readEntry (entry: Dict): Str {\n        return this.safeString (entry, 'free');\n    }\n" +
    "    keepEntry (entry: Dict): Dict {\n        return entry;\n    }\n" +
    "    quotedEntry (entry: Dict): Str {\n        return this.safeString (entry, 'q');\n    }\n" +
    "    run (response: Dict) {\n        const data = this.safeDict (response, 'data', {});\n" +
    "        const a = this.readEntry (data);\n        const b = this.keepEntry (data);\n" +
    "        const c = this.quotedEntry (data);\n        const m = 'quotedEntry';\n        return this.hold ([ a, b, c, m ]);\n    }\n}\n";

const wsClient = 'export default class Client {\n    lastPong: number = 0;\n}\n';
const proVenue = "import Exchange from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict, Str } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    handleOpt (client: Client, message: Dict, subscription: Dict | undefined = undefined) {\n        const s = this.safeString (message, 'last');\n        this.hold (s);\n    }\n" +
    "    handleReq (client: Client, message: Dict, subscription: Dict) {\n        const s = this.safeString (message, 'last');\n        this.hold ([ s, subscription ]);\n    }\n" +
    "    handleTrades (client: Client, message: Dict) {\n        const s = this.safeString (message, 'id');\n        this.hold (s);\n    }\n" +
    "    handleOrders (client: Client, message: Dict) {\n        this.handleTrades (client, message);\n        const s = this.safeString (message, 'id');\n        this.hold (s);\n    }\n" +
    "    handleLeak (client: Client, message: Dict) {\n        this.handleSink (client, message);\n    }\n" +
    "    handleSink (client: Client, message: Dict) {\n        this.hold (message);\n    }\n" +
    "    handleMessage (client: Client, message: Dict) {\n        const methods: Dict = {\n            'opt': this.handleOpt,\n            'req': this.handleReq,\n            'trades': this.handleTrades,\n            'orders': this.handleOrders,\n            'leak': this.handleLeak,\n            'sink': this.handleSink,\n        };\n        this.hold (methods);\n    }\n}\n";

describe ('rust ws handler message borrowed with optional trailing slots and lent on to a borrowed handler', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h44r44-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'Client.ts'), wsClient);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), proVenue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('an optional trailing parameter keeps the message borrowed', () => {
        expect (output).toMatch (/fn handleOpt\([^)]*message: &indexmap::IndexMap<String, Value>/);
    });

    test ('a message lent on whole to a borrowed handler stays borrowed', () => {
        expect (output).toMatch (/fn handleTrades\([^)]*message: &indexmap::IndexMap<String, Value>/);
        expect (output).toMatch (/fn handleOrders\([^)]*message: &indexmap::IndexMap<String, Value>/);
        expect (output).toMatch (/self\.handleTrades\([^)\n]*, message\)/);
    });

    test ('negatives keep the Value slot', () => {
        // a required third parameter
        expect (output).not.toMatch (/fn handleReq\([^)]*message: &indexmap::IndexMap/);
        // lent on to a handler that keeps the box
        expect (output).not.toMatch (/fn handleSink\([^)]*message: &indexmap::IndexMap/);
        expect (output).not.toMatch (/fn handleLeak\([^)]*message: &indexmap::IndexMap/);
    });
});

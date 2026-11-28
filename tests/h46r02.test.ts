import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a ws handler that lends its message to a sibling whose slot takes the dict handle takes the handle too
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    hold (x: any): any { return x; }\n}\n';
const wsClient = 'export default class Client {\n    lastPong: number = 0;\n    resolve (x: any, h: string) { return x; }\n}\n';
const proVenue = "import Exchange from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    handleBidAsk (client: Client, message: Dict) {\n        const s = this.safeString (message, 'bid');\n        const row = { 'info': message, 'bid': s };\n        client.resolve (row, 'bidask:' + this.safeString (message, 'symbol'));\n        this.hold (s);\n    }\n" +
    "    handleTicker (client: Client, message: Dict) {\n        this.handleBidAsk (client, message);\n        const s = this.safeString (message, 'symbol');\n        this.hold (s);\n    }\n" +
    "    handlePlain (client: Client, message: Dict) {\n        const s = this.safeString (message, 'bid');\n        this.hold (s);\n    }\n" +
    "    handleTrades (client: Client, message: Dict) {\n        this.handlePlain (client, message);\n        const s = this.safeString (message, 'symbol');\n        this.hold (s);\n    }\n" +
    "    handleKeep (client: Client, message: Dict) {\n        this.hold (message);\n    }\n" +
    "    handleOther (client: Client, message: Dict) {\n        this.handleKeep (client, message);\n        const s = this.safeString (message, 'symbol');\n        this.hold (s);\n    }\n}\n";

describe ('rust ws handler message lent to a sibling dict-handle slot', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h46r02-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'Client.ts'), wsClient);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), proVenue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('the lending handler takes the handle and passes it on as is', () => {
        expect (output).toMatch (/fn handleBidAsk\([^)]*message: &crate::value::Dict\)/);
        expect (output).toMatch (/fn handleTicker\([^)]*message: &crate::value::Dict\)/);
        expect (output).toMatch (/self\.handleBidAsk\(client, message\)/);
        expect (output).not.toMatch (/message\.as_map\(\)\.unwrap_or/);
    });

    test ('a sibling with a borrowed-map slot keeps the map view', () => {
        expect (output).toMatch (/fn handlePlain\([^)]*message: &indexmap::IndexMap<String, Value>\)/);
        expect (output).toMatch (/fn handleTrades\([^)]*message: &indexmap::IndexMap<String, Value>\)/);
    });

    test ('a sibling keeping the box: the box is shared into it', () => {
        expect (output).not.toMatch (/fn handleKeep\([^)]*message: &/);
        expect (output).toMatch (/self\.handleKeep\(client, Value::from\(message\)\)/);
    });
});

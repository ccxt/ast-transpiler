import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a ws handler whose `message: Dict` is read and handed to a sibling's borrowed-map slot takes a borrowed map too
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    hold (x: any): any { return x; }\n}\n';
const wsClient = 'export default class Client {\n    lastPong: number = 0;\n}\n';
const proVenue = "import Exchange from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    handleBidAsk (client: Client, message: Dict) {\n        const s = this.safeString (message, 'bid');\n        this.hold (s);\n    }\n" +
    "    handleTicker (client: Client, message: Dict) {\n        this.handleBidAsk (client, message);\n        const s = this.safeString (message, 'symbol');\n        this.hold (s);\n    }\n" +
    "    handleKeep (client: Client, message: Dict) {\n        this.hold (message);\n    }\n" +
    "    handleTrades (client: Client, message: Dict) {\n        this.handleKeep (client, message);\n        const s = this.safeString (message, 'symbol');\n        this.hold (s);\n    }\n}\n";

describe ('rust ws handler message slot: lent on to a sibling borrowed-map slot', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h44r12-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'Client.ts'), wsClient);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), proVenue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('the handler that lends its message on takes a borrowed map, and so does the sibling', () => {
        expect (output).toMatch (/fn handleBidAsk\([^)]*message: &indexmap::IndexMap<String, Value>\)/);
        expect (output).toMatch (/fn handleTicker\([^)]*message: &indexmap::IndexMap<String, Value>\)/);
        expect (output).toMatch (/self\.handleBidAsk\([^;]*\bmessage\)/);
    });

    test ('a handler that hands the message to a slot keeping the box stays Value', () => {
        expect (output).not.toMatch (/fn handleKeep\([^)]*message: &indexmap::IndexMap/);
        expect (output).not.toMatch (/fn handleTrades\([^)]*message: &indexmap::IndexMap/);
    });
});

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

describe ('rust venue helper Dict parameters read only (rustVenueDictParam)', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h14p04-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('a read-only Dict parameter is borrowed and the caller lends its dict local', () => {
        expect (output).toContain ('pub fn readEntry(&self, entry: &indexmap::IndexMap<String, Value>)');
        expect (output).toMatch (/self\.readEntry\(&data\)/);
        expect (output).not.toMatch (/readEntry\(&self[^\n]*\n[^\n]*__entry_empty/);
    });

    test ('negatives keep the Value slot', () => {
        // returned whole: needs it owned
        expect (output).not.toContain ('pub fn keepEntry(&self, entry: &indexmap::IndexMap');
        // named by a quoted string (dynamic dispatch)
        expect (output).not.toContain ('pub fn quotedEntry(&self, entry: &indexmap::IndexMap');
    });
});

// a pro ws handler `handleX (client: Client, message: Dict)` referenced by name borrows its message the same way
const wsClient = 'export default class Client {\n    lastPong: number = 0;\n}\n';
const proVenue = "import Exchange from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict, Str } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    handleTicker (client: Client, message: Dict) {\n        const s = this.safeString (message, 'last');\n        this.hold (s);\n    }\n" +
    "    handleKeep (client: Client, message: Dict) {\n        this.hold (message);\n    }\n" +
    "    handleThree (client: Client, message: Dict, extra: Dict) {\n        const s = this.safeString (message, 'symbol');\n        this.hold ([ s, extra ]);\n    }\n" +
    "    handleRow (client: Client, message: Dict) {\n        const row = this.safeDict (message, 'data');\n        row['ts'] = 1;\n        this.hold (row);\n    }\n" +
    "    handlePost (client: Client, message: Dict) {\n        const s = this.safeString (message, 'id');\n        this.hold (s);\n    }\n" +
    "    handleMessage (client: Client, message: Dict) {\n        const methods: Dict = {\n            'ticker': this.handleTicker,\n            'post': this.handlePost,\n            'row': this.handleRow,\n            'keep': this.handleKeep,\n            'three': this.handleThree,\n        };\n        this.hold (methods);\n    }\n}\n";

// another pro file declares handlePost (an override family with one slot type)
const otherVenue = "import Exchange from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict } from '../base/Exchange.js';\n" +
    'export default class other extends Exchange {\n' +
    "    handlePost (client: Client, message: Dict) {\n        this.hold (message);\n    }\n" +
    "    handleMessage (client: Client, message: Dict) {\n        this.handlePost (client, message);\n    }\n}\n";

describe ('rust pro ws handler message: Dict is a borrowed map (rustWsHandlerMessageSlot)', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h39r05-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'Client.ts'), wsClient);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), proVenue);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'other.ts'), otherVenue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('a read-only message of a by-name handler is borrowed', () => {
        expect (output).toMatch (/fn handleTicker\(&self, client: [^,]+, message: &indexmap::IndexMap<String, Value>\)/);
    });

    test ('negatives keep the Value slot', () => {
        // handed on whole: needs the box
        expect (output).not.toMatch (/fn handleKeep\([^)]*message: &indexmap::IndexMap/);
        // a handler with a third parameter is not the two-slot dispatch shape
        expect (output).not.toMatch (/fn handleThree\([^)]*message: &indexmap::IndexMap/);
        // writes into a row read off the message (it may alias the message): keeps the box
        expect (output).not.toMatch (/fn handleRow\([^)]*message: &indexmap::IndexMap/);
        // another pro file declares it and calls it directly (that slot stays boxed): keep one type for the family
        expect (output).not.toMatch (/fn handlePost\([^)]*message: &indexmap::IndexMap/);
    });
});

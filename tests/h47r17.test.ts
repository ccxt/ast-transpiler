import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// rustWsHandlerMessageSlot: a required trailing parameter keeps the message borrowed when every call passes it
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    safeValue (o: any, k: any, d: any = undefined): any { return o; }\n' +
    '    hold (x: any): any { return x; }\n}\n';
const wsClient = 'export default class Client {\n    lastPong: number = 0;\n}\n';
const handler = (name: string): string => `    ${name} (client: Client, message: Dict, subscription: Dict) {\n        const s = this.safeString (message, 'topic');\n        this.hold ([ s, subscription ]);\n    }\n`;
const proVenue = "import Exchange from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict, Str } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    handler ('handleSnap') + handler ('handleShort') + handler ('handleTable') +
    "    handleWrite (client: Client, message: Dict, subscription: Dict) {\n        const s = this.safeString (message, 'ts');\n        subscription['last'] = s;\n    }\n" +
    "    watchSnap (client: Client, message: Dict, subscription: Dict) {\n        this.handleSnap (client, message, subscription);\n        this.handleShort (client, message);\n    }\n" +
    "    handleSubscribed (client: Client, message: Dict, subscription: Dict) {\n        const sub: Dict = { 'method': this.handleTable, 'short': this.handleShort, 'write': this.handleWrite };\n        const method = this.safeValue (sub, 'method');\n        method.call (this, client, message, subscription);\n    }\n" +
    "    handleMessage (client: Client, message: Dict) {\n        const methods: Dict = {\n            'a': this.handleSnap,\n        };\n        const method = this.safeValue (methods, 'a');\n        method.call (this, client, message);\n    }\n}\n";

describe ('rust ws handler message borrowed with a required trailing parameter every call passes', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h47r17-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'Client.ts'), wsClient);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), proVenue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('direct and table `.call` sites pass the third argument: the message is borrowed', () => {
        expect (output).toMatch (/fn handle_?[tT]able\([^)]*message: &(?:indexmap::IndexMap<String, Value>|crate::value::Dict)/);
    });

    test ('a key write into the required trailing slot keeps the message borrowed', () => {
        expect (output).toMatch (/fn handle_?[wW]rite\([^)]*message: &(?:indexmap::IndexMap<String, Value>|crate::value::Dict)/);
    });

    test ('negatives keep the Value slot', () => {
        // a direct call drops the third argument (the handler is also routed by value)
        expect (output).toMatch (/fn handle_?[sS]hort\([^)]*message: Value/);
        // a short `.call` through a table that names the handler
        expect (output).toMatch (/fn handle_?[sS]nap\([^)]*message: Value/);
    });
});

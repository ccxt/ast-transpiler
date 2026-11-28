import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a pro ws handler writing keys into a row of the exchange's own state (`this.safeDict (this.balance, k, {})`) still borrows its message
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    balance: Dict = {};\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o; }\n    hold (x: any): any { return x; }\n}\n';
const wsClient = 'export default class Client {\n    lastPong: number = 0;\n}\n';
const proVenue = "import Exchange from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict, Str } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    handleBalance (client: Client, message: Dict) {\n        const type = this.safeString (message, 'e', 'spot');\n        const row = this.safeDict (this.balance, type, {});\n        row['ts'] = 1;\n        this.hold (row);\n    }\n" +
    "    handleOther (client: Client, message: Dict) {\n        const row = this.safeDict (this.balance, 'x', message);\n        row['ts'] = 1;\n        this.hold (row);\n    }\n" +
    "    handleAgain (client: Client, message: Dict) {\n        let row = this.safeDict (this.balance, 'x', {});\n        row = this.safeDict (message, 'data', {});\n        row['ts'] = 1;\n        this.hold (row);\n    }\n" +
    "    handleMessage (client: Client, message: Dict) {\n        const methods: Dict = {\n            'balance': this.handleBalance,\n            'other': this.handleOther,\n            'again': this.handleAgain,\n        };\n        this.hold (methods);\n    }\n}\n";

describe ('rust pro ws handler: key writes into a this-state row keep the message borrowed', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h44r15-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'Client.ts'), wsClient);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), proVenue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('a write into this.safeDict (this.balance, k, {}) borrows the message', () => {
        expect (output).toMatch (/fn handleBalance\(&self, client: [^,]+, message: &indexmap::IndexMap<String, Value>\)/);
    });

    test ('negatives keep the Value slot', () => {
        // the default is the message itself: the row may be the message
        expect (output).not.toMatch (/fn handleOther\([^)]*message: &indexmap::IndexMap/);
        // the local is reassigned from the message
        expect (output).not.toMatch (/fn handleAgain\([^)]*message: &indexmap::IndexMap/);
    });
});

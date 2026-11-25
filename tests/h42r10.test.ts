import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a ws handler that writes keys into `this.account ()` (a fresh literal per call) still borrows its message
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    balance: Dict = {};\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o; }\n    hold (x: any): any { return x; }\n' +
    "    account (): Dict {\n        return {\n            'free': undefined,\n            'used': undefined,\n        };\n    }\n" +
    '    shared: Dict = {};\n    sharedAccount (): Dict {\n        return this.shared;\n    }\n' +
    "    mixedAccount (): Dict {\n        return {\n            'info': this.shared,\n        };\n    }\n}\n";
const wsClient = 'export default class Client {\n    lastPong: number = 0;\n}\n';
const proVenue = "import Exchange from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    handleBalance (client: Client, message: Dict) {\n        const account = this.account ();\n        account['free'] = this.safeString (message, 'free');\n        this.balance['BTC'] = account;\n    }\n" +
    "    handleShared (client: Client, message: Dict) {\n        const account = this.sharedAccount ();\n        account['free'] = this.safeString (message, 'free');\n    }\n" +
    "    handleMixed (client: Client, message: Dict) {\n        const account = this.mixedAccount ();\n        account['free'] = this.safeString (message, 'free');\n    }\n" +
    "    handleRow (client: Client, message: Dict) {\n        const row = this.safeDict (message, 'data');\n        row['ts'] = 1;\n        this.hold (row);\n    }\n" +
    "    handleMessage (client: Client, message: Dict) {\n        const methods: Dict = {\n            'balance': this.handleBalance,\n            'shared': this.handleShared,\n            'mixed': this.handleMixed,\n            'row': this.handleRow,\n        };\n        this.hold (methods);\n    }\n}\n";

describe ('rust ws handler message slot: writes into a fresh account () map do not alias the message', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h42r10-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'Client.ts'), wsClient);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), proVenue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('a key write into this.account () keeps the borrowed message', () => {
        expect (output).toMatch (/fn handleBalance\(&self, client: [^,]+, message: &indexmap::IndexMap<String, Value>\)/);
    });

    test ('negatives keep the Value slot', () => {
        // the method hands back a shared field: a write may reach anything
        expect (output).not.toMatch (/fn handleShared\([^)]*message: &indexmap::IndexMap/);
        // a literal holding a non-literal value
        expect (output).not.toMatch (/fn handleMixed\([^)]*message: &indexmap::IndexMap/);
        // a row read off the message
        expect (output).not.toMatch (/fn handleRow\([^)]*message: &indexmap::IndexMap/);
    });
});

import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a pro ws handler writing keys into a row read off a row of its own state (derive `account = this.safeDict (subBalance, code)`) borrows its message
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    balance: Dict = {};\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o; }\n    hold (x: any): any { return x; }\n    account (): Dict { return { \'free\': undefined, \'used\': undefined, \'total\': undefined }; }\n}\n';
const wsClient = 'export default class Client {\n    lastPong: number = 0;\n}\n';
const proVenue = "import Exchange from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict, Str } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    handleBalance (client: Client, message: Dict) {\n        const type = this.safeString (message, 'e', 'spot');\n        const sub = this.safeDict (this.balance, type, {});\n        let account = this.safeDict (sub, 'BTC');\n        if (account === undefined) {\n            account = this.account ();\n        }\n        account['total'] = 1;\n        sub['BTC'] = account;\n        this.hold (sub);\n    }\n" +
    "    handleOther (client: Client, message: Dict) {\n        const sub = this.safeDict (this.balance, 'x', {});\n        let account = this.safeDict (sub, 'BTC');\n        account = this.safeDict (message, 'data');\n        account['total'] = 1;\n        this.hold (account);\n    }\n" +
    "    handleAgain (client: Client, message: Dict) {\n        const sub = this.safeDict (message, 'data', {});\n        const account = this.safeDict (sub, 'BTC', {});\n        account['total'] = 1;\n        this.hold (account);\n    }\n" +
    "    handleMessage (client: Client, message: Dict) {\n        const methods: Dict = {\n            'balance': this.handleBalance,\n            'other': this.handleOther,\n            'again': this.handleAgain,\n        };\n        this.hold (methods);\n    }\n}\n";

describe ('rust pro ws handler: a row read off a this-state row keeps the message borrowed', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h45r11-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'Client.ts'), wsClient);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), proVenue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('a write into a row of a this.balance row borrows the message', () => {
        expect (output).toMatch (/fn handleBalance\(&self, client: [^,]+, message: &indexmap::IndexMap<String, Value>\)/);
    });

    test ('negatives keep the Value slot', () => {
        // the row is reassigned from the message
        expect (output).not.toMatch (/fn handleOther\([^)]*message: &indexmap::IndexMap/);
        // the row is read off a row of the message
        expect (output).not.toMatch (/fn handleAgain\([^)]*message: &indexmap::IndexMap/);
    });
});

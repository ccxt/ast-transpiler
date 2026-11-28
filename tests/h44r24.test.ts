import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// an async ws handler that only reads its message borrows it; async non-handlers and handlers that hand it on keep Value
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    balance: Dict = {};\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o; }\n    hold (x: any): any { return x; }\n' +
    "    account (): Dict {\n        return {\n            'free': undefined,\n            'used': undefined,\n        };\n    }\n" +
    '    shared: Dict = {};\n    sharedAccount (): Dict {\n        return this.shared;\n    }\n' +
    "    mixedAccount (): Dict {\n        return {\n            'info': this.shared,\n        };\n    }\n}\n";
const wsClient = 'export default class Client {\n    lastPong: number = 0;\n}\n';
const proVenue = "import Exchange from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    async handlePing (client: Client, message: Dict) {\n        client.lastPong = 1;\n        const pingId = this.safeString (message, 'ping');\n        this.hold (pingId);\n    }\n" +
    "    async handleForward (client: Client, message: Dict) {\n        this.hold (message);\n    }\n" +
    "    async helperRead (message: Dict) {\n        return this.safeString (message, 'ping');\n    }\n" +
    "    handleMessage (client: Client, message: Dict) {\n        const methods: Dict = {\n            'ping': this.handlePing,\n            'fwd': this.handleForward,\n        };\n        this.hold (methods);\n    }\n}\n";
describe ('rust async ws handler message slot', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h44r24-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'Client.ts'), wsClient);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), proVenue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('an async handler that only reads its message borrows the map', () => {
        expect (output).toMatch (/fn handlePing\([^)]*message: &indexmap::IndexMap<String, Value>\)/);
    });

    test ('negatives keep the Value slot', () => {
        // the message is handed on whole
        expect (output).not.toMatch (/fn handleForward\([^)]*message: &indexmap::IndexMap/);
        // an async method that is not a ws handler
        expect (output).not.toMatch (/fn helperRead\([^)]*message: &indexmap::IndexMap/);
    });
});

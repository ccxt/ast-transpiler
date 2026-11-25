import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// rustWsHandlerMessageSlot: optional trailing parameters past the message keep it borrowed
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    hold (x: any): any { return x; }\n}\n';
const wsClient = 'export default class Client {\n    lastPong: number = 0;\n}\n';
const proVenue = "import Exchange from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict, Str } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    handleMyTrades (client: Client, message: Dict, subscription: Dict | undefined = undefined) {\n        const s = this.safeString (message, 'topic');\n        this.hold (s);\n    }\n" +
    "    handleReq (client: Client, message: Dict, subscription: Dict) {\n        const s = this.safeString (message, 'topic');\n        this.hold ([ s, subscription ]);\n    }\n" +
    "    handleKeep (client: Client, message: Dict, subscription: Dict | undefined = undefined) {\n        this.hold (message);\n    }\n" +
    "    handleMessage (client: Client, message: Dict) {\n        const methods: Dict = {\n            'usertrade': this.handleMyTrades,\n            'req': this.handleReq,\n            'keep': this.handleKeep,\n        };\n        this.hold (methods);\n    }\n}\n";

describe ('rust ws handler message borrowed with an optional trailing parameter', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h45r22-'));
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
        expect (output).toMatch (/fn handleMyTrades\([^)]*message: &indexmap::IndexMap<String, Value>/);
    });

    test ('negatives keep the Value slot', () => {
        // a required third parameter
        expect (output).not.toMatch (/fn handleReq\([^)]*message: &indexmap::IndexMap/);
        // the message handed on whole
        expect (output).not.toMatch (/fn handleKeep\([^)]*message: &indexmap::IndexMap/);
    });
});

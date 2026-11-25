import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a pro ws handler's `message: Dict` handed whole to a venue parser slot takes the dict handle (`&crate::value::Dict`)
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o; }\n    hold (x: any): any { return x; }\n}\n';
const wsClient = 'export default class Client {\n    lastPong: number = 0;\n    resolve (x: any, h: string) { return x; }\n}\n';
const proVenue = "import Exchange from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict, Str } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    parseWsTrade (trade: Dict, market: Dict = undefined): Dict {\n        const t = this.safeString (trade, 'id');\n        this.hold (t);\n        return { 'id': t, 'info': trade, 'market': market };\n    }\n" +
    "    handleMyTrade (client: Client, message: Dict) {\n        const marketId = this.safeString (message, 'symbol');\n        const trade = this.parseWsTrade (message);\n        const row = {\n            'info': message,\n            'id': this.safeString (message, 'id'),\n        };\n        client.resolve (trade, 'myTrades:' + marketId);\n        client.resolve (row, 'row');\n    }\n" +
    "    handleLast (client: Client, message: Dict) {\n        const marketId = this.safeString (message, 'symbol');\n        const trade = this.parseWsTrade (message);\n        const row = { 'info': message, 'id': marketId };\n        client.resolve (trade, 'last');\n        client.resolve (row, 'row');\n    }\n" +
    "    handleHeld (client: Client, message: Dict) {\n        const marketId = this.safeString (message, 'symbol');\n        const row = { 'info': message };\n        this.hold (message);\n        client.resolve (row, 'held:' + marketId);\n    }\n" +
    "    handleMessage (client: Client, message: Dict) {\n        const methods: Dict = {\n            'trade': this.handleMyTrade,\n            'held': this.handleHeld,\n            'last': this.handleLast,\n        };\n        this.hold (methods);\n        this.hold (message);\n    }\n}\n";

const predVenue = "import Exchange from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict, Str } from '../base/Exchange.js';\n" +
    'export default class pvenue extends Exchange {\n' +
    "    handleOrder (client: Client, message: Dict) {\n        const id = this.safeString (message, 'id');\n        const row = {\n            'id': id,\n            'info': message,\n            'side': this.safeString (message, 'side'),\n        };\n        client.resolve (row, 'orders');\n    }\n" +
    "    handleMessage (client: Client, message: Dict) {\n        this.handleOrder (client, message);\n        this.hold (message);\n    }\n}\n";

describe ('rust pro ws handler dict-handle message: shadow view and info entry', () => {
    let output = '';
    let predOutput = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h45r06-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'Client.ts'), wsClient);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), proVenue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
        fs.mkdirSync (path.join (root, 'ts', 'src', 'prediction'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'prediction', 'pvenue.ts'), predVenue);
        predOutput = t.transpileRustByPath (path.join (root, 'ts', 'src', 'prediction', 'pvenue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('a dict-handle message: the view borrows the handle and the info entry shares it', () => {
        const fn = output.slice (output.indexOf ('fn handleMyTrade('), output.indexOf ('fn handleHeld('));
        expect (fn).toMatch (/message: &crate::value::Dict\)/);
        expect (fn).not.toMatch (/if let Value::Dict\(__d\) = &message/);
        expect (fn).not.toMatch (/Value::Dict\(message\)/);
        expect (fn).toMatch (/"info"[^\n]*Value::from\(message\)\)/);
    });

    test ('an info entry at the last use shares the dict handle', () => {
        const fn = output.slice (output.indexOf ('fn handleLast('), output.indexOf ('fn handleMessage('));
        expect (fn).toMatch (/fn handleLast\([^)]*message: &crate::value::Dict\)/);
        expect (fn).toMatch (/"info"[^\n]*Value::from\(message\)\)/);
    });

    test ('negatives keep the Value slot', () => {
        // handed to a base runtime method whole: the message stays a box and keeps its own info print
        expect (output).not.toMatch (/fn handleHeld\([^)]*message: &/);
    });
    test ('a prediction handler with a view: the info entry boxes the handle with no clone to drop', () => {
        const fn = predOutput.slice (predOutput.indexOf ('fn handleOrder('), predOutput.indexOf ('fn handleMessage('));
        expect (fn).not.toMatch (/Value::Dict\(message(\.clone\(\))?\)/);
    });
});

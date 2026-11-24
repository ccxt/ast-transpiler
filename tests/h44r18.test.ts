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
    "    handleMyTrade (client: Client, message: Dict) {\n        const marketId = this.safeString (message, 'symbol');\n        const trade = this.parseWsTrade (message);\n        client.resolve (trade, 'myTrades:' + marketId);\n    }\n" +
    "    handleHeld (client: Client, message: Dict) {\n        const trade = this.hold (message);\n        client.resolve (trade, 'held');\n    }\n" +
    "    handleList (client: Client, message: any[]) {\n        const trade = this.parseWsTrade (message[0]);\n        client.resolve (trade, 'list');\n    }\n" +
    "    handleMessage (client: Client, message: Dict) {\n        const data = this.safeDict (message, 'data', {});\n        this.handleMyTrade (client, data);\n        const methods: Dict = {\n            'trade': this.handleMyTrade,\n            'held': this.handleHeld,\n            'list': this.handleList,\n        };\n        this.hold (methods);\n        this.hold (message);\n    }\n}\n";

describe ('rust pro ws handler message: Dict handed whole to a venue parser', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h44r18-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'Client.ts'), wsClient);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), proVenue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('the handler takes the dict handle and boxes it once for the parser', () => {
        expect (output).toMatch (/fn handleMyTrade\(&(mut )?self, client: [^,]+, message: &crate::value::Dict\)/);
        expect (output).toMatch (/self\.parseWsTrade\(Value::from\(message\)/);
        expect (output).toMatch (/self\.handleMyTrade\(client, &data\)/);

    });

    test ('negatives keep the Value slot', () => {
        // handed to a base runtime method whole
        expect (output).not.toMatch (/fn handleHeld\([^)]*message: &/);
        // declared a list
        expect (output).not.toMatch (/fn handleList\([^)]*message: &/);
    });
});

import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a ws handler that hands its whole message to a lent parser slot takes the dict handle and shares it into the box
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    shared: Dict = {};\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o; }\n    hold (x: any): any { return x; }\n' +
    "    safePosition (position: Dict): Dict {\n        position['k'] = 1;\n        return position;\n    }\n" +
    '    keepShared (position: Dict): Dict {\n        return this.shared;\n    }\n}\n';
const wsClient = 'export default class Client {\n    lastPong: number = 0;\n}\n';
const proVenue = "import Exchange from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    parseWsOrder (order: Dict, market: any = undefined): Dict {\n        return { 'id': this.safeString (order, 'id') };\n    }\n" +
    "    parseOne (): Dict {\n        const row: Dict = {};\n        return this.parseWsOrder (row);\n    }\n" +
    "    mutate (order: Dict): Dict {\n        order['id'] = 1;\n        return order;\n    }\n" +
    "    handleOrder (client: Client, message: Dict) {\n        const parsed = this.parseWsOrder (message);\n        this.hold (parsed);\n    }\n" +
    "    handleMutated (client: Client, message: Dict) {\n        const parsed = this.mutate (message);\n        this.hold (parsed);\n    }\n" +
    "    handleHeld (client: Client, message: Dict) {\n        this.hold (message);\n    }\n" +
    "    handleMessage (client: Client, message: Dict) {\n        const methods: Dict = {\n            'order': this.handleOrder,\n            'mutated': this.handleMutated,\n            'held': this.handleHeld,\n        };\n        this.hold (methods);\n    }\n}\n";

describe ('rust ws handler message slot: a whole message lent to a parser slot', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h44r13-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'Client.ts'), wsClient);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), proVenue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('the handler takes the dict handle and shares it into the parser box', () => {
        expect (output).toMatch (/fn handleOrder\([^)]*message: &crate::value::Dict\)/);
        expect (output).toMatch (/self\.parseWsOrder\(Value::Dict\(std::sync::Arc::clone\(message\)\)/);
    });

    test ('negatives keep the Value slot', () => {
        // the callee writes into the row it is handed
        expect (output).not.toMatch (/fn handleMutated\([^)]*message: &crate::value::Dict/);
        // handed to a base slot that is not a lent venue parser
        expect (output).not.toMatch (/fn handleHeld\([^)]*message: &crate::value::Dict/);
    });
});

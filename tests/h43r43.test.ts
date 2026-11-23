import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a ws handler that writes keys into a parsed record (`this.safePosition ({ .. })` returns its fresh argument) still borrows its message
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    shared: Dict = {};\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o; }\n    hold (x: any): any { return x; }\n' +
    "    safePosition (position: Dict): Dict {\n        position['k'] = 1;\n        return position;\n    }\n" +
    '    keepShared (position: Dict): Dict {\n        return this.shared;\n    }\n}\n';
const wsClient = 'export default class Client {\n    lastPong: number = 0;\n}\n';
const proVenue = "import Exchange from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    parseFresh (raw: Dict): Dict {\n        return this.safePosition ({\n            'id': this.safeString (raw, 'id'),\n        });\n    }\n" +
    "    parseShared (raw: Dict): Dict {\n        return this.keepShared ({\n            'id': this.safeString (raw, 'id'),\n        });\n    }\n" +
    "    parsePassed (raw: Dict): Dict {\n        return this.safePosition (raw);\n    }\n" +
    "    handlePositions (client: Client, message: Dict) {\n        const position = this.parseFresh (message);\n        position['side'] = 'long';\n        this.hold (position);\n    }\n" +
    "    handleShared (client: Client, message: Dict) {\n        const position = this.parseShared (message);\n        position['side'] = 'long';\n        this.hold (position);\n    }\n" +
    "    handlePassed (client: Client, message: Dict) {\n        const position = this.parsePassed (message);\n        position['side'] = 'long';\n        this.hold (position);\n    }\n" +
    "    handleMessage (client: Client, message: Dict) {\n        const methods: Dict = {\n            'positions': this.handlePositions,\n            'shared': this.handleShared,\n            'passed': this.handlePassed,\n        };\n        this.hold (methods);\n    }\n}\n";

describe ('rust ws handler message slot: writes into a fresh parsed record do not alias the message', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h43r43-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'Client.ts'), wsClient);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), proVenue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('a key write into this.safePosition ({ .. }) keeps the borrowed message', () => {
        expect (output).toMatch (/fn handlePositions\(&self, client: [^,]+, message: &indexmap::IndexMap<String, Value>\)/);
    });

    test ('negatives keep the Value slot', () => {
        // the inner reader hands back a shared field, not its argument
        expect (output).not.toMatch (/fn handleShared\([^)]*message: &indexmap::IndexMap/);
        // the record is the message row itself (no fresh literal)
        expect (output).not.toMatch (/fn handlePassed\([^)]*message: &indexmap::IndexMap/);
    });
});

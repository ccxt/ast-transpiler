import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a by-name pro ws handler that reads its message and stringifies it whole takes the dict handle
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    safeBool (o: any, k: any, d: any = undefined): any { return o; }\n' +
    '    json (o: any): string { return \'\'; }\n    hold (x: any): any { return x; }\n}\n';
const wsClient = 'export default class Client {\n    futures: Dict = {};\n}\ninterface Dict { [key: string]: any }\n';
const proVenue = "import Exchange from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    handleAuth (client: Client, message: Dict) {\n        const success = this.safeBool (message, 'success', false);\n        if (!success) {\n            throw new Error (this.json (message));\n        }\n    }\n" +
    "    handleRaw (client: Client, message: Dict) {\n        throw new Error (this.json (message));\n    }\n" +
    "    handleBoxed (client: Client, message: Dict) {\n        this.handleRawCalled (client, message);\n    }\n" +
    "    handleRawCalled (client: Client, message: Dict) {\n        const success = this.safeBool (message, 'success', false);\n        if (!success) {\n            throw new Error (this.json (message));\n        }\n        this.hold (message);\n    }\n" +
    "    handleDirect (client: Client, message: Dict) {\n        const success = this.safeBool (message, 'success', false);\n        if (!success) {\n            throw new Error (this.json (message));\n        }\n    }\n" +
    "    handleValued (client: Client, message: Dict): boolean {\n        const success = this.safeBool (message, 'success', false);\n        if (!success) {\n            throw new Error (this.json (message));\n        }\n        return true;\n    }\n" +
    "    handleMessage (client: Client, message: Dict) {\n        const methods: Dict = {\n            'auth': this.handleAuth,\n            'raw': this.handleRaw,\n            'boxed': this.handleBoxed,\n            'valued': this.handleValued,\n            'direct': this.handleDirect,\n        };\n        this.hold (methods);\n        this.handleDirect (client, message);\n    }\n}\n";

describe ('rust pro ws handler: a this.json operand takes the dict handle', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h45r32-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'Client.ts'), wsClient);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), proVenue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('a read plus a json operand types the slot and lends the handle', () => {
        expect (output).toMatch (/fn handleAuth\(&self, client: [^,]+, message: &crate::value::Dict\)/);
        expect (output).toMatch (/json_stringify\(message\)/);
        // a by-name handler that only stringifies the message lends it the same way
        expect (output).toMatch (/fn handleRaw\(&self, client: [^,]+, message: &crate::value::Dict\)/);
    });

    test ('negatives keep the Value slot', () => {
        // a handler called with the caller's boxed message cannot take the dict handle
        expect (output).not.toMatch (/fn handleRawCalled\([^)]*message: &(?:crate::value::Dict|indexmap)/);
        // a by-name handler also called directly with the caller's boxed message keeps its slot
        expect (output).not.toMatch (/fn handleDirect\([^)]*message: &(?:crate::value::Dict|indexmap)/);
        // a handler that returns a value keeps its slot
        expect (output).not.toMatch (/fn handleValued\([^)]*message: &(?:crate::value::Dict|indexmap)/);
    });
});

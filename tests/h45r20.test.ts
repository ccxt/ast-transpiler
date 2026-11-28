import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a ws handler that reads its message and resolves it whole on its own client takes the dict handle
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    hold (x: any): any { return x; }\n' +
    '    handleMessage (client: any, message: Dict) {\n        return message;\n    }\n}\n';
const wsClient = 'export default class Client {\n    resolve (v: any, h: string | undefined = undefined): void {}\n}\n';
const proVenue = "import Exchange from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    handleHeartbeat (client: Client, message: Dict) {\n        const event = this.safeString (message, 'channel');\n        client.resolve (message, event);\n    }\n" +
    "    handleNoHash (client: Client, message: Dict) {\n        const event = this.safeString (message, 'channel');\n        client.resolve (message);\n        this.hold (event);\n    }\n" +
    "    handleWritten (client: Client, message: Dict) {\n        const event = this.safeString (message, 'channel');\n        const row = message;\n        row['x'] = 1;\n        client.resolve (message, event);\n    }\n" +
    "    override handleMessage (client: Client, message: Dict) {\n        const methods: Dict = {\n            'heartbeat': this.handleHeartbeat,\n            'nohash': this.handleNoHash,\n            'written': this.handleWritten,\n        };\n        const method = this.safeString (message, 'event');\n        const fn = methods[method];\n        if (fn !== undefined) {\n            fn.call (this, client, message);\n        }\n    }\n}\n";

describe ('rust ws handler: a message resolved whole with a hash on its own client', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h45r20-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'Client.ts'), wsClient);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), proVenue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('the handler takes the dict handle and resolves a shared copy of it', () => {
        expect (output).toMatch (/fn handleHeartbeat\([^)]*message: &crate::value::Dict\)/);
        expect (output).toContain ('Value::Dict(std::sync::Arc::clone(message))');
    });

    test ('a resolve with no hash, or a message aliased by a key write, keeps the Value slot', () => {
        expect (output).not.toMatch (/fn handleNoHash\([^)]*message: &crate::value::Dict/);
        expect (output).not.toMatch (/fn handleWritten\([^)]*message: &(crate::value::Dict|indexmap)/);
    });
});

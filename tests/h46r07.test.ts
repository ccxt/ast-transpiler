import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a ws handler that returns its `message: Dict` whole takes the dict handle
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    keep (o: Dict): Dict { return o; }\n}\n';
const rest = "import Exchange from './base/Exchange.js';\nexport default class venueRest extends Exchange {\n}\n";
const wsClient = 'export default class Client {\n    lastPong: number = 0;\n    resolve (x: any, h: string) {}\n}\n';
const proVenue = "import Exchange from '../venueRest.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    '    handleSystemStatus (client: Client, message: Dict): Dict {\n        return message;\n    }\n' +
    "    handleTick (client: Client, message: Dict): Dict {\n        const e = this.safeString (message, 'event');\n        if (e !== undefined) {\n            client.resolve (e, 'x');\n        }\n        return message;\n    }\n" +
    "    handleStatus (client: Client, message: Dict): Dict {\n        message['x'] = 1;\n        return message;\n    }\n" +
    '    handleWelcome (client: Client, message: Dict): Dict {\n        this.keep (message);\n        return message;\n    }\n' +
    "    handleMessage (client: Client, message: Dict) {\n        const methods: Dict = { 'info': this.handleSystemStatus, 'tick': this.handleTick, 'status': this.handleStatus, 'welcome': this.handleWelcome };\n        const m = this.safeString (message, 'event');\n        if (m !== undefined) {\n            methods[m].call (this, client, message);\n        }\n    }\n}\n";

describe ('rust ws handler returning its dict-handle message', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h46r07-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venueRest.ts'), rest);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'Client.ts'), wsClient);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), proVenue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('the handler returns the same map as its typed return', () => {
        expect (output).toMatch (/fn handleSystemStatus\([^)]*message: &crate::value::Dict\) -> crate::value::Dict \{/);
        expect (output).toMatch (/return std::sync::Arc::clone\(message\);/);
    });

    test ('a read handler borrows the map it was handed, no boxed view', () => {
        const tick = output.slice (output.indexOf ('fn handleTick'), output.indexOf ('fn handleStatus'));
        expect (tick).toMatch (/let __pro_message: &indexmap::IndexMap<String, Value> = &message;/);
        expect (tick).not.toMatch (/__pro_message_arc/);
    });

    test ('a boxed message keeps the Value return', () => {
        expect (output).toMatch (/fn handleStatus\([^)]*\) -> Value \{/);
        expect (output).toMatch (/fn handleWelcome\([^)]*\) -> Value \{/);
    });
});

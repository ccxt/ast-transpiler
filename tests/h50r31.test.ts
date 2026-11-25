import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// `Object.keys (msg)` on a ws handler's bound message view lists the view's own keys
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    keep (o: Dict): Dict { return o; }\n}\n';
const rest = "import Exchange from './base/Exchange.js';\nexport default class venueRest extends Exchange {\n}\n";
const wsClient = 'export default class Client {\n    lastPong: number = 0;\n    resolve (x: any, h: string) {}\n}\n';
const proVenue = "import Exchange from '../venueRest.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    handleFrame (client: Client, msg: Dict) {\n        const keys = Object.keys (msg);\n        if (keys.length === 0) {\n            return;\n        }\n        const e = this.safeString (msg, 'event');\n        if (e !== undefined) {\n            client.resolve (e, 'x');\n        }\n    }\n" +
    "    handleWritten (client: Client, msg: Dict) {\n        msg['x'] = 1;\n        const keys = Object.keys (msg);\n        const e = this.safeString (msg, 'event');\n        client.resolve (keys.length, 'y');\n    }\n" +
    "    readFrame (client: Client, msg: Dict) {\n        const keys = Object.keys (msg);\n        const e = this.safeString (msg, 'event');\n        client.resolve (keys.length, 'z');\n    }\n" +
    "    handleMessage (client: Client, message: Dict) {\n        this.handleFrame (client, message);\n    }\n}\n";

describe ('rust Object.keys on a ws handler message view', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h50r31-'));
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

    const body = (name: string) => {
        const at = output.indexOf ('fn ' + name);
        const next = output.indexOf ('\n    pub fn ', at + 1);
        return output.slice (at, next < 0 ? undefined : next);
    };

    test ('the bound view lists its own keys', () => {
        const frame = body ('handleFrame');
        expect (frame).toMatch (/__pro_message\.keys\(\)\.cloned\(\)\.map\(Value::from\)\.collect\(\)/);
        expect (frame).not.toMatch (/object_keys\(/);
    });

    test ('a written message keeps the helper', () => {
        expect (body ('handleWritten')).toMatch (/object_keys\(&msg\)/);
    });

    test ('a method that is not a handler keeps the helper', () => {
        expect (body ('readFrame')).toMatch (/object_keys\(/);
        expect (body ('readFrame')).not.toMatch (/__pro_message/);
    });
});

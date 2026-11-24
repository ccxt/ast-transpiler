import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// an async pro method reached only by name through `this.spawn` / `this.delay` borrows its read-only `Dict` slots
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    safeInteger (o: any, k: any, d: any = undefined): any { return o; }\n' +
    '    spawn (m: any, ...args: any[]): any { return m; }\n    delay (t: any, m: any, ...args: any[]): any { return m; }\n' +
    '    hold (x: any): any { return x; }\n}\n';
const wsClient = 'export default class Client {\n    lastPong: number = 0;\n    resolve (x: any, h: string) { return x; }\n}\n';
const proVenue = "import Exchange from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict, Str } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    async snapRead (client: Client, message: Dict, subscription: Dict) {\n        const h = this.safeString (subscription, 'messageHash');\n        const ts = this.safeInteger (message, 'ts');\n        client.resolve (ts, h);\n        return undefined;\n    }\n" +
    "    async snapHeld (client: Client, message: Dict, subscription: Dict) {\n        const h = this.safeString (subscription, 'messageHash');\n        this.hold (subscription);\n        this.hold (message);\n        client.resolve (h, 'x');\n        return undefined;\n    }\n" +
    "    async snapCalled (client: Client, message: Dict, subscription: Dict) {\n        const h = this.safeString (subscription, 'messageHash');\n        client.resolve (h, 'y');\n        return undefined;\n    }\n" +
    "    handleBook (client: Client, message: Dict) {\n        const subscription: Dict = { 'messageHash': 'a' };\n        this.delay (10, this.snapRead, client, message, subscription);\n        this.spawn (this.snapHeld, client, message, subscription);\n        this.snapCalled (client, message, subscription);\n        this.spawn (this.snapCalled, client, message, subscription);\n    }\n}\n";

describe ('rust pro spawn-only target: borrowed dict slots', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h46r29-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'Client.ts'), wsClient);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), proVenue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('a delay target that only reads its maps borrows them', () => {
        expect (output).toMatch (/fn snapRead\([^)]*message: &indexmap::IndexMap<String, Value>, subscription: &indexmap::IndexMap<String, Value>\)/);
    });

    test ('negatives keep the Value slot', () => {
        // handed on whole: stays a box
        expect (output).toMatch (/fn snapHeld\([^)]*subscription: Value\)/);
        // also called directly: stays a box
        expect (output).toMatch (/fn snapCalled\([^)]*subscription: Value\)/);
    });
});

import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a by-name pro ws handler whose body never names `message` borrows it as a map (rustWsHandlerMessageSlot)
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    safeValue (o: any, k: any, d: any = undefined): any { return o; }\n    hold (x: any): any { return x; }\n}\n';
const wsClient = 'export default class Client {\n    futures: Dict = {};\n}\ninterface Dict { [key: string]: any }\n';
const proVenue = "import Exchange from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    handleAuthenticate (client: Client, message: Dict) {\n        const future = this.safeValue (client.futures, 'authenticated');\n        future.resolve (true);\n    }\n" +
    "    handleResolve (client: Client, message: Dict) {\n        const future = this.safeValue (client.futures, 'authenticated');\n        future.resolve (message);\n    }\n" +
    "    handleUnreferenced (client: Client, message: Dict) {\n        this.hold (client);\n    }\n" +
    "    handleDirect (client: Client, message: Dict) {\n        const future = this.safeValue (client.futures, 'authenticated');\n        future.resolve (true);\n    }\n" +
    "    handleMessage (client: Client, message: Dict) {\n        this.handleDirect (client, message);\n        const methods: Dict = {\n            'login': this.handleAuthenticate,\n            'resolve': this.handleResolve,\n        };\n        this.hold (methods);\n    }\n}\n";

describe ('rust pro ws handler with an unnamed message borrows a map', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h44r45-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'Client.ts'), wsClient);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), proVenue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('a by-name handler that never names message borrows it', () => {
        expect (output).toMatch (/fn handleAuthenticate\(&self, client: [^,]+, message: &indexmap::IndexMap<String, Value>\)/);
    });

    test ('a directly called handler that never names message borrows it', () => {
        expect (output).toMatch (/fn handleDirect\(&self, client: [^,]+, message: &indexmap::IndexMap<String, Value>\)/);
    });

    test ('negatives keep the Value slot', () => {
        // handed on whole to resolve: needs the box
        expect (output).not.toMatch (/fn handleResolve\([^)]*message: &indexmap::IndexMap/);
        // not referenced by name and never called: no dispatch proof
        expect (output).not.toMatch (/fn handleUnreferenced\([^)]*message: &indexmap::IndexMap/);
    });
});

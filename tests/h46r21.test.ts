import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a venue-private `x: Dict` slot fed by a local the declared-Dict table proves a map borrows the shared handle
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    safeDict (o: any, k: any, d: Dict = undefined): Dict { return o; }\n' +
    '    safeDict2 (o: any, k: any, k2: any, d: Dict = undefined): Dict { return o; }\n' +
    '    safeValue (o: any, k: any, d: any = undefined): any { return o; }\n' +
    '    hold (x: any): any { return x; }\n}\n';
const wsClient = 'export default class Client {\n    lastPong: number = 0;\n}\n';
const proVenue = "import Exchange from '../base/Exchange.js';\nimport Client from '../base/ws/Client.js';\nimport type { Dict } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    handleTicker (client: Client, message: Dict) {\n        const data = this.safeDict (message, 'feed', {});\n        const ticker = this.parseWsTicker (data);\n        this.hold (ticker);\n    }\n" +
    "    parseWsTicker (ticker: Dict): Dict {\n        const last = this.safeString (ticker, 'last');\n        return { 'last': last, 'id': this.safeString (ticker, 'id') };\n    }\n" +
    "    handleLoose (client: Client, message: Dict) {\n        const data = this.safeValue (message, 'feed');\n        const ticker = this.parseLoose (data);\n        this.hold (ticker);\n    }\n" +
    "    handleRefetched (client: Client, message: Dict) {\n        let row = this.safeDict (message, 'order', {});\n        if (this.safeString (row, 'id') === undefined) {\n            row = this.safeDict (message, 'fallback', {});\n        }\n        const parsed = this.parseRow (row);\n        this.hold (parsed);\n    }\n" +
    "    parseRow (row: Dict): Dict {\n        return { 'id': this.safeString (row, 'id') };\n    }\n" +
    "    handleBook (client: Client, message: Dict) {\n        const book = this.safeDict (message, 'book', {});\n        this.hold (this.parseBookRow (book));\n    }\n" +
    "    handleBookRaw (client: Client, message: Dict) {\n        this.hold (message);\n        this.hold (this.parseBookRow (message));\n    }\n" +
    "    parseBookRow (row: Dict): Dict {\n        return { 'id': this.safeString (row, 'id') };\n    }\n" +
    "    handleSubscribe (client: Client, message: Dict) {\n        const methods: Dict = { 'trade': this.handleRows };\n        const result = this.safeDict2 (message, 'result', 'info', {});\n        const channel = this.safeString (result, 'channel');\n        if (channel !== undefined) {\n            this.handleRows (client, result);\n        }\n        const method = this.safeValue (methods, channel);\n        if (method !== undefined) {\n            method.call (this, client, result);\n        }\n    }\n" +
    "    handleRows (client: Client, message: Dict) {\n        this.hold (this.safeString (message, 'id'));\n    }\n" +
    "    parseLoose (ticker: Dict): Dict {\n        return { 'last': this.safeString (ticker, 'last') };\n    }\n}\n";

describe ('rust venue dict slot: an argument the declared-Dict table proves a map lends its handle', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h46r21-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base', 'ws'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'ws', 'Client.ts'), wsClient);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), proVenue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('a safeDict-with-default local borrows the slot', () => {
        expect (output).toMatch (/fn parse_?[wW]s_?[tT]icker\(&self, ticker: &(?:crate::value::Dict|indexmap::IndexMap<String, Value>)/);
        expect (output).toMatch (/parse_?[wW]s_?[tT]icker\(&data/);
    });

    test ('a reassigned local keeps the Value slot', () => {
        expect (output).toMatch (/fn parse_?[rR]ow\(&self, (?:mut )?row: (?:Value|impl Into<crate::Value>)[,)]/);
    });

    test ('a slot another caller feeds from a boxed parameter keeps the Value slot (no map view at that call)', () => {
        expect (output).toMatch (/fn parse_?[bB]ook_?[rR]ow\(&self, (?:mut )?row: (?:Value|impl Into<crate::Value>)[,)]/);
        expect (output).not.toMatch (/as_map\(\)\.unwrap_or\(&Default::default\(\)\)/);
    });

    test ('a boxed safeValue argument keeps the Value slot', () => {
        expect (output).toMatch (/fn parse_?[lL]oose\(&self, (?:mut )?ticker: (?:Value|impl Into<crate::Value>)[,)]/);
    });

    test ('a handler fed a local the printer keeps boxed keeps the Value message slot', () => {
        expect (output).toMatch (/let (?:mut )?result: Value = /);
        expect (output).not.toMatch (/fn handle_?[rR]ows\(&(?:mut )?self, client: &?Value, message: &(?:crate::value::Dict|indexmap::IndexMap<String, Value>)/);
        expect (output).toMatch (/handle_?[rR]ows\((?:&client|client\.clone\(\)), (?:&)?result(?:\.clone\(\))?\)/);
    });
});

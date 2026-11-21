import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// rustVenueDictParam: a venue helper's read-only `Dict` parameter prints a borrowed map
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o; }\n    hold (x: any): any { return x; }\n}\n';
const venue = "import Exchange from './base/Exchange.js';\nimport type { Dict, Str } from './base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    readEntry (entry: Dict): Str {\n        return this.safeString (entry, 'free');\n    }\n" +
    "    keepEntry (entry: Dict): Dict {\n        return entry;\n    }\n" +
    "    quotedEntry (entry: Dict): Str {\n        return this.safeString (entry, 'q');\n    }\n" +
    "    run (response: Dict) {\n        const data = this.safeDict (response, 'data', {});\n" +
    "        const a = this.readEntry (data);\n        const b = this.keepEntry (data);\n" +
    "        const c = this.quotedEntry (data);\n        const m = 'quotedEntry';\n        return this.hold ([ a, b, c, m ]);\n    }\n}\n";

describe ('rust venue helper Dict parameters read only (rustVenueDictParam)', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h14p04-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('a read-only Dict parameter is borrowed and the caller lends its dict local', () => {
        expect (output).toContain ('pub fn readEntry(&self, entry: &indexmap::IndexMap<String, Value>)');
        expect (output).toMatch (/self\.readEntry\(&data\)/);
        expect (output).not.toMatch (/readEntry\(&self[^\n]*\n[^\n]*__entry_empty/);
    });

    test ('negatives keep the Value slot', () => {
        // returned whole: needs it owned
        expect (output).not.toContain ('pub fn keepEntry(&self, entry: &indexmap::IndexMap');
        // named by a quoted string (dynamic dispatch)
        expect (output).not.toContain ('pub fn quotedEntry(&self, entry: &indexmap::IndexMap');
    });
});

import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a local seeded from a call of a typed-return table method that answers `Dict` (`restInstance.describe ()`) and only
// handed to `deepExtend` as its head holds the map itself, not a `Value` box
const base = 'export interface Dict { [key: string]: any }\n' +
    'export default class Exchange {\n' +
    '    describe (): Dict { return {}; }\n' +
    '    describeData (): any { return {}; }\n' +
    '    deepExtend (...args: any[]): Dict { return args[0]; }\n' +
    '    hold (x: any): any { return x; }\n}\n';
const rest = "import Exchange from './base/Exchange.js';\nimport type { Dict } from './base/Exchange.js';\n" +
    'export default class venueRest extends Exchange {\n' +
    "    override describe (): Dict {\n        return this.deepExtend (super.describe (), { 'id': 'venue' });\n    }\n}\n";
const venue = "import Exchange from '../base/Exchange.js';\nimport venueRest from '../venueRest.js';\nimport type { Dict } from '../base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    '    override describe (): Dict {\n        const restInstance = new venueRest ();\n        const restDescribe = restInstance.describe ();\n' +
    "        const parentWsDescribe = super.describeData ();\n        const extended = this.deepExtend (restDescribe, parentWsDescribe);\n        return this.deepExtend (extended, { 'id': 'venue' });\n    }\n" +
    // negative: a `Dict` answer that is written into stays as before (the rule only takes read / handed-on uses)
    "    other () {\n        const restInstance = new venueRest ();\n        const data = restInstance.describe ();\n        data['x'] = this.hold (data);\n        return data;\n    }\n" +
    '}\n';

describe ('rust: a local from a typed `Dict` table-method call is a Dict (rustHandedDictLocal)', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h54r42-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venueRest.ts'), rest);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('the describe answer is held as the map', () => {
        expect (output).toContain ('let mut restDescribe: crate::value::Dict = restInstance.describe();');
        expect (output).not.toContain ('restDescribe: Value');
    });
    test ('negative: a written and self-boxed answer keeps the Value', () => {
        const other = output.slice (output.indexOf ('fn other'));
        expect (other).toContain ('data: Value');
    });
});

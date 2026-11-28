import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a ws local seeded from `super.m ()` whose parent ws method prints its own `-> Dict` return holds the map itself
const base = 'export interface Dict { [key: string]: any }\n' +
    'export default class Exchange {\n' +
    '    describe (): Dict { return {}; }\n' +
    '    deepExtend (...args: any[]): Dict { return args[0]; }\n}\n';
const parent = "import Exchange from '../base/Exchange.js';\nimport type { Dict } from '../base/Exchange.js';\n" +
    'export default class venueParent extends Exchange {\n' +
    '    override describe (): Dict {\n        return this.deepExtend (super.describe (), this.describeData ());\n    }\n' +
    "    describeData (): Dict {\n        return { 'has': { 'ws': true } };\n    }\n" +
    "    otherData (): any {\n        return { 'has': { 'ws': true } };\n    }\n}\n";
const venue = "import venueParent from './venueParent.js';\nimport type { Dict } from '../base/Exchange.js';\n" +
    'export default class venue extends venueParent {\n' +
    '    override describe (): Dict {\n        const parentWsDescribe = super.describeData ();\n' +
    "        const extended = this.deepExtend ({ 'id': 'x' }, parentWsDescribe);\n        return this.deepExtend (extended, { 'id': 'venue' });\n    }\n" +
    // negative: a parent method declared `any` keeps the box
    "    other (): Dict {\n        const untypedData = super.otherData ();\n        return this.deepExtend ({ 'id': 'x' }, untypedData);\n    }\n" +
    '}\n';

describe ('rust: a ws local from `super.m ()` with a typed `Dict` parent return is a Dict', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h55r42-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.mkdirSync (path.join (root, 'ts', 'src', 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venueParent.ts'), parent);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'pro', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'pro', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('the parent describe-data answer is held as the map', () => {
        expect (output).toContain ('let mut parentWsDescribe: crate::value::Dict = ');
        expect (output).not.toContain ('parentWsDescribe: Value');
    });
    test ('negative: a parent method declared any keeps the Value', () => {
        expect (output).toContain ('untypedData: Value');
    });
});

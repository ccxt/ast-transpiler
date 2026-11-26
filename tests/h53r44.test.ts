import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a sync venue `params: Dict` slot whose callers all lend an `omit` / `handle*AndParams` local borrows the map
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport type Num = number | undefined;\n' +
    'export default class Exchange {\n    id: string = \'\';\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
    '    safeNumber (obj: any, key: any, d: Num = undefined): Num { return obj; }\n' +
    '    safeNumber2 (dictionary: object | undefined, key1: any, key2: any, d: Num = undefined): number { return 0; }\n' +
    '    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    omit (x: any, ...args: any): any { return x; }\n' +
    '    hold (x: any): any { return x; }\n' +
    '    handleOptionBoolAndParams (params: Dict, methodName: Str, optionName: string, defaultValue: boolean = undefined): [boolean, Dict] { return [ true, params ]; }\n}\n';
const venue = "import Exchange from './base/Exchange.js';\nimport type { Dict, Str } from './base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    checkIt (params: Dict) {\n        const a = this.safeString (params, 'triggerPrice');\n        const b = this.safeString (params, 'stopLossPrice');\n        if ((a !== undefined) && (b !== undefined)) {\n            throw new Error (this.id + ' x');\n        }\n    }\n" +
    "    one (params: Dict = {}): Str {\n        const paramsOmitted: Dict = this.omit (params, 'test');\n        this.checkIt (paramsOmitted);\n        return this.safeString (paramsOmitted, 'k');\n    }\n" +
    "    two (params: Dict = {}): Str {\n        const [ useSync, paramsSync ] = this.handleOptionBoolAndParams (params, 'createOrder', 'sync', false);\n        this.checkIt (paramsSync);\n        return this.safeString (paramsSync, 'k');\n    }\n" +
    "    keepIt (params: Dict) {\n        return this.hold (params);\n    }\n" +
    "    three (params: Dict = {}): Str {\n        const paramsOmitted: Dict = this.omit (params, 'test');\n        this.keepIt (paramsOmitted);\n        return this.safeString (paramsOmitted, 'k');\n    }\n" +
    "    readIt (params: Dict) {\n        return this.safeString (params, 'k');\n    }\n" +
    "    four (params: Dict = {}): Str {\n        this.readIt (this.hold (params));\n        return this.readIt (this.omit (params, 'x'));\n    }\n}\n";

describe ('rust venue Dict params slot lent from handed-on locals', () => {
    let output = '';
    beforeAll (() => {
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h53r44-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'venue.ts')).content;
        if (process.env.H53R44_DUMP) fs.writeFileSync (process.env.H53R44_DUMP, output);
        fs.rmSync (root, { recursive: true, force: true });
    });
    test ('the read-only slot borrows the map: no untyped params local (fails on the base printer)', () => {
        const a = output.slice (output.indexOf ('fn checkIt'), output.indexOf ('fn one'));
        expect (a).toMatch (/fn checkIt\(&self, params: &indexmap::IndexMap<String, Value>\)/);
        expect (a).not.toContain ('let mut params: Value');
        expect (a).not.toContain ('params.into()');
    });
    test ('both callers lend their handed-on local by reference', () => {
        expect (output.slice (output.indexOf ('fn one'), output.indexOf ('fn two'))).toContain ('self.checkIt(&paramsOmitted);');
        expect (output.slice (output.indexOf ('fn two'), output.indexOf ('fn keepIt'))).toContain ('self.checkIt(&paramsSync);');
    });
    test ('negative: a slot handed on whole keeps the lent Value form', () => {
        const k = output.slice (output.indexOf ('fn keepIt'), output.indexOf ('fn three'));
        expect (k).not.toContain ('&indexmap::IndexMap<String, Value>');
    });
    test ('negative: a slot fed a boxed call result keeps its Value', () => {
        const r = output.slice (output.indexOf ('fn readIt'), output.indexOf ('fn four'));
        expect (r).not.toContain ('&indexmap::IndexMap<String, Value>');
    });
});

import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// `const [ a, b ] = await Promise.all ([ x, y ])` over once-read map locals: each slot takes its operand's map
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
    '    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    extend (...args: any[]): Dict { return {}; }\n}\n';
const venue = "import Exchange from './base/Exchange.js';\nimport type { Dict, Str } from './base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    async methodA (params: Dict = {}) {\n        const pa: Dict = this.extend ({}, params);\n        const pb: Dict = this.extend ({}, params);\n        const [ ra, rb ] = await Promise.all ([ pa, pb ]);\n        return [ this.safeString (ra, 'x'), this.safeString (rb, 'y') ];\n    }\n" +
    "    async methodB (params: Dict = {}) {\n        const pa: Dict = this.extend ({}, params);\n        const pb: Dict = this.extend ({}, params);\n        const [ ra, rb ] = await Promise.all ([ pa, pb ]);\n        return [ this.safeString (ra, 'x'), this.safeString (rb, 'y'), pa ];\n    }\n" +
    "    async methodC (pa: any, pb: any) {\n        const [ ra, rb ] = await Promise.all ([ pa, pb ]);\n        return [ this.safeString (ra, 'x'), this.safeString (rb, 'y') ];\n    }\n}\n";

describe ('rust Promise.all over map locals: slots take the operand maps', () => {
    let output = '';
    beforeAll (() => {
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h51r37-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'venue.ts')).content;
        fs.rmSync (root, { recursive: true, force: true });
    });
    test ('once-read map operands: no promise_all box, no into_dict', () => {
        const a = output.slice (output.indexOf ('fn methodA'), output.indexOf ('fn methodB'));
        expect (a).not.toContain ('promise_all(');
        expect (a).not.toMatch (/let mut r[ab]: [^\n]*into_dict/);
        expect (a).toContain ('let mut rb: crate::value::Dict = pb;');
        expect (a).toMatch (/let mut ra: (crate::value::Dict = pa|Value = Value::Dict\(pa\))/);
    });
    test ('negatives: an operand read again, and untyped operands, keep promise_all', () => {
        const b = output.slice (output.indexOf ('fn methodB'), output.indexOf ('fn methodC'));
        const c = output.slice (output.indexOf ('fn methodC'));
        expect (b).toContain ('promise_all(');
        expect (c).toContain ('promise_all(');
    });
});

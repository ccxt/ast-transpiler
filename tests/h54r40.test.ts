import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// `const [ a, b ] = await Promise.all ([ x, y ])` over once-read list locals: each list slot takes its operand's list
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
    '    arrayConcat (a: any[], b: any[]): any[] { return a; }\n}\n';
const venue = "import Exchange from './base/Exchange.js';\nimport type { Dict } from './base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    '    async fetchA (params: Dict = {}): Promise<Dict[]> {\n        const r: Dict[] = [];\n        r.push (params);\n        return r;\n    }\n' +
    '    async fetchB (params: Dict = {}): Promise<Dict[]> {\n        const r: Dict[] = [];\n        r.push (params);\n        return r;\n    }\n' +
    '    async methodA (params: Dict = {}) {\n        const pa = this.fetchA (params);\n        const pb = this.fetchB (params);\n        const [ ra, rb ] = await Promise.all ([ pa, pb ]);\n        return this.arrayConcat (ra, rb);\n    }\n' +
    '    async methodB (params: Dict = {}) {\n        const pa = this.fetchA (params);\n        const pb = this.fetchB (params);\n        const [ ra, rb ] = await Promise.all ([ pa, pb ]);\n        return [ this.arrayConcat (ra, rb), pa ];\n    }\n' +
    '    async methodC (pa: any, pb: any) {\n        const [ ra, rb ] = await Promise.all ([ pa, pb ]);\n        return this.arrayConcat (ra, rb);\n    }\n}\n';

describe ('rust Promise.all over list locals: slots take the operand lists', () => {
    let output = '';
    beforeAll (() => {
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h54r40-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'venue.ts')).content;
        fs.rmSync (root, { recursive: true, force: true });
    });
    test ('once-read list operands: no promise_all box, no into_list on the slots', () => {
        const a = output.slice (output.indexOf ('fn methodA'), output.indexOf ('fn methodB'));
        expect (a).not.toContain ('promise_all(');
        expect (a).not.toMatch (/let mut r[ab]: [^\n]*into_list/);
        expect (a).toMatch (/let mut rb: (crate::value::List = pb|Value = Value::Arr\(pb\))/);
    });
    test ('negatives: an operand read again, and untyped operands, keep promise_all', () => {
        const b = output.slice (output.indexOf ('fn methodB'), output.indexOf ('fn methodC'));
        const c = output.slice (output.indexOf ('fn methodC'));
        expect (b).toContain ('promise_all(');
        expect (c).toContain ('promise_all(');
    });
});

import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// `const [ a, b ] = await Promise.all ([ x, y ])` where slot a is only the head of a deepExtend: it takes the operand map
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport interface Ticker { symbol: string; info: any }\n' +
    'export default class Exchange {\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
    '    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    safeDict (o: any, k: any, d: any = undefined): Dict { return o; }\n' +
    '    deepExtend (...args: any[]): any { return {}; }\n' +
    '    extend (...args: any[]): Dict { return {}; }\n}\n';
const venue = "import Exchange from './base/Exchange.js';\nimport type { Dict, Str, Ticker } from './base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    async fetchA (symbol: string, params: Dict = {}): Promise<Ticker> {\n        return this.extend ({ 's': symbol }, params) as Ticker;\n    }\n" +
    "    async methodA (symbol: string, params: Dict = {}): Promise<Dict> {\n        const pa = this.fetchA (symbol, params);\n        const pb = this.fetchA (symbol, params);\n        const [ ra, rb ] = await Promise.all ([ pa, pb ]);\n        return this.deepExtend (ra, {\n            'open': this.safeString (rb, 'open'),\n            'info': this.safeDict (rb, 'info'),\n        });\n    }\n}\n";

describe ('rust Promise.all: a deepExtend head slot takes its operand map', () => {
    let output = '';
    beforeAll (() => {
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h53r02a7-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'venue.ts')).content;
        fs.rmSync (root, { recursive: true, force: true });
    });
    test ('the head slot takes the operand map, no re-box', () => {
        const a = output.slice (output.search (/fn method_?[aA]/));
        expect (a).toContain ('let mut ra: crate::value::Dict = pa;');
        expect (a).toContain ('let mut rb: crate::value::Dict = pb;');
        expect (a).not.toContain ('Value::Dict(pa)');
    });
});

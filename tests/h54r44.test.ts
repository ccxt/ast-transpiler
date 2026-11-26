import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a reassigned `Dict` omit local written back from the params slot of a `handle*AndParams` destructure stays the map
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    id: string = \'\';\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
    '    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    omit (x: any, ...args: any): any { return x; }\n' +
    '    extend (...args: any): any { return {}; }\n' +
    '    handleParamString (params: object, paramName: string, defaultValue: Str = undefined): [Str, Dict] { return [ undefined, {} ]; }\n}\n';
const venue = "import Exchange from './base/Exchange.js';\nimport type { Dict, Str } from './base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    one (params: Dict = {}): Dict {\n        let orderParams: Dict = this.omit (this.extend ({}, params), [ 'a', 'b' ]);\n        const t = this.safeString (orderParams, 't');\n" +
    "        if (t !== undefined) {\n            const [ dir, paramsDir ] = this.handleParamString (orderParams, 'dir');\n            orderParams = paramsDir;\n            if (dir === undefined) {\n                throw new Error (this.id + ' x');\n            }\n        }\n" +
    "        orderParams = this.omit (orderParams, 'c');\n        return this.extend ({}, orderParams);\n    }\n" +
    "    two (params: Dict = {}): Dict {\n        let orderParams: Dict = this.omit (this.extend ({}, params), [ 'a', 'b' ]);\n        const [ dir, paramsDir ] = this.handleParamString (orderParams, 'dir');\n" +
    "        orderParams = paramsDir;\n        const again = this.safeString (paramsDir, 'k');\n        return this.extend ({ 'again': again }, orderParams);\n    }\n}\n";

describe ('rust handed omit local written back from a handle*AndParams params slot', () => {
    let output = '';
    beforeAll (() => {
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h54r44-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'venue.ts')).content;
        fs.rmSync (root, { recursive: true, force: true });
    });
    test ('the local is the typed map and the slot moves in (fails on the base printer)', () => {
        const a = output.slice (output.indexOf ('fn one'), output.indexOf ('fn two'));
        expect (a).toContain ('let mut orderParams: crate::value::Dict = ');
        expect (a).not.toContain ('let mut orderParams: Value');
        expect (a).toMatch (/orderParams = paramsDir;/);
        expect (a).not.toContain ('Value::Dict(paramsDir)');
    });
    test ('negative: a slot read again after the write keeps the boxed local', () => {
        const b = output.slice (output.indexOf ('fn two'));
        expect (b).toContain ('let mut orderParams: Value');
    });
});

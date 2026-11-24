import fs from 'fs';
import os from 'os';
import path from 'path';
import Transpiler from '../src/transpiler.js';

// `this.deepExtend (a, .., m)` whose LAST operand is a proven map answers a map on every path, so its local is a typed
// map and literal-key writes on it are native inserts.
describe('h49r51: deepExtend ending in a proven map', () => {
    let out = '';
    beforeAll(() => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h49r51-'));
        fs.mkdirSync (path.join (dir, 'ts/src/base'), { recursive: true });
        fs.writeFileSync (path.join (dir, 'ts/src/base/Exchange.ts'), "export interface Dict { [key: string]: any }\nexport default class Exchange {\n" +
            "    fees: any = {};\n    options: any = {};\n    deepExtend (...args: any[]): any { return {}; }\n    safeBool (x: any, k: any, d: any = undefined): any { return d; }\n" +
            "    hold (x: any): any { return x; }\n" +
            "    buildLast (value: any): any {\n" +
            "        const valueDefined: Dict = {};\n        valueDefined['id'] = this.hold (value);\n" +
            "        const market = this.deepExtend (this.hold (value), { 'a': 1 }, this.fees['trading'], valueDefined);\n" +
            "        if (this.safeBool (market, 'linear', false)) {\n            market['subType'] = 'linear';\n        } else {\n            market['subType'] = undefined;\n        }\n" +
            "        return market;\n    }\n" +
            "    buildAnyLast (value: any): any {\n" +
            "        const other = this.deepExtend ({ 'a': 1 }, value);\n        other['subType'] = 'linear';\n        return other;\n    }\n" +
            "    buildTagged (client: any): any {\n" +
            "        const valueDefined: Dict = {};\n        const tagged = this.deepExtend (client.subscriptions, valueDefined);\n        tagged['subType'] = 'linear';\n        return tagged;\n    }\n}\n");
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        out = t.transpileRustByPath (path.join (dir, 'ts/src/base/Exchange.ts')).content;
    });
    test('a proven last operand: the writes are native inserts', () => {
        const body = out.slice (out.indexOf ('fn buildLast'), out.indexOf ('fn buildAnyLast'));
        expect (body).toContain ('Arc::make_mut(&mut market).insert("subType"');
        expect (body).not.toContain ('add_element_to_object(&mut market');
    });
    test('negative: an any last operand keeps the helper', () => {
        const body = out.slice (out.indexOf ('fn buildAnyLast'), out.indexOf ('fn buildTagged'));
        expect (body).toContain ('add_element_to_object(&mut other');
    });
    test('negative: an operand read from a tagged store keeps the helper', () => {
        const body = out.slice (out.indexOf ('fn buildTagged'));
        expect (body).not.toContain ('Arc::make_mut(&mut tagged).insert(');
    });
});

import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a tuple-declared venue method whose every return prints `return []any{..}` is a Go []any: the
// local it seeds takes the call as is; a method that may return a non-literal keeps ArrayTyped
describe ('h48g38 tuple producer seeds a []any local without ArrayTyped', () => {
    const root = path.join (__dirname, 'files', 'tmp-h48g38', 'ts', 'src');
    const BASE =
        'export type Dict = { [key: string]: any };\n' +
        'export type Str = string | undefined;\n' +
        'class Exchange {\n' +
        '    safeString (o: any, k: any, d: any = undefined): Str { return o; }\n' +
        '    omit (o: any, k: any): Dict { return o; }\n' +
        '}\n' +
        'export { Exchange };\n';
    const VENUE =
        "import { Exchange, Dict, Str } from './base/Exchange.js';\n" +
        'export default class v extends Exchange {\n' +
        '    getOrderChannelAndMessageHash (type: Str, subType: Str, market: Dict = undefined, params: Dict = {}): [string, string] {\n' +
        "        let a: Str = undefined;\n" +
        "        let b: Str = undefined;\n" +
        "        if (type === 'x') { a = 'q'; b = 'r'; }\n" +
        "        return [ a, b ];\n" +
        '    }\n' +
        '    other (type: Str, params: Dict = {}): [string, string] {\n' +
        "        const p: any = this.safeString (params, 'p');\n" +
        "        if (type === 'x') { return p; }\n" +
        "        return [ 'a', 'b' ];\n" +
        '    }\n' +
        '    useOther (type: Str, params: Dict = {}) {\n' +
        '        const cm = this.other (type, params);\n' +
        '        const c = this.safeString (cm, 0);\n' +
        '        return c;\n' +
        '    }\n' +
        '    use (type: Str, params: Dict = {}) {\n' +
        '        const cm = this.getOrderChannelAndMessageHash (type, type, undefined, params);\n' +
        '        const c = this.safeString (cm, 0);\n' +
        '        return c;\n' +
        '    }\n' +
        '}\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'v.ts'), VENUE);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        out = t.transpileGoByPath (path.join (root, 'v.ts')).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h48g38'), { recursive: true, force: true }));
    test ('positive: the []any result is taken as is (fails on the base printer)', () => {
        expect (out).toContain ('var cm []any = this.GetOrderChannelAndMessageHash(typeVar, typeVar, nil, params)');
        expect (out).not.toContain ('ArrayTyped(this.GetOrderChannelAndMessageHash(');
    });
    test ('negative: a producer with a non-literal return keeps its box', () => {
        expect (out).not.toContain ('var cm []any = this.Other(');
    });
});

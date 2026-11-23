import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe('nil-seeded locals filled by omits of maps', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nil-seed-omit-'));
    afterAll(() => {
        fs.rmSync(tmp, { 'recursive': true, 'force': true });
    });
    const run = (body: string): string => {
        const dir = path.join(tmp, 'ts', 'src', 'base');
        fs.mkdirSync(dir, { 'recursive': true });
        const file = path.join(dir, 'Exchange.ts');
        fs.writeFileSync(file, 'type Dict = { [key: string]: any };\ntype NullableDict = Dict | undefined;\ntype Str = string | undefined;\n'
            + 'export class BaseExchange {\n'
            + '    handleOptionBoolAndParams (params: Dict, m: string, k: string, d: boolean): [boolean, Dict] {\n'
            + '        return [ d, this.omit (params, k) ];\n    }\n'
            + '    safeString (a: any, b: any): Str { return a; }\n'
            + '    omit (a: any, ...b: any[]): Dict { return a; }\n}\n'
            + 'export default class Exchange extends BaseExchange {\n    run (symbol: string, params: Dict = {}) {\n' + body + '    }\n}\n');
        const inst: any = new Transpiler({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } });
        installCcxtGoHooks(inst.goTranspiler);
        return inst.transpileGoByPath(file).content;
    };
    // the omit argument slot reads a typed-nil map as absent (OmitN / OmitMap deref it to nil), as it did the box
    test('a nil seed filled by an omit of a map and read by a later omit is a map local', () => {
        const output = run(
            "        let q: NullableDict = undefined;\n" +
            "        const [ f, rest ] = this.handleOptionBoolAndParams (params, 'run', 'x', true);\n" +
            "        if (f) {\n" +
            "            q = this.omit (rest, 'r');\n" +
            "        }\n" +
            "        const r = this.omit (q, [ 'h' ]);\n" +
            "        return this.safeString (r, 'x');\n");
        expect(output).toContain('var q map[string]any = nil');
        expect(output).not.toContain('var q any');
    });
    test('an omit of the local in a later argument slot keeps the box', () => {
        const output = run(
            "        let q: NullableDict = undefined;\n" +
            "        const [ f, rest ] = this.handleOptionBoolAndParams (params, 'run', 'x', true);\n" +
            "        if (f) {\n" +
            "            q = this.omit (rest, 'r');\n" +
            "        }\n" +
            "        const r = this.omit (params, q);\n" +
            "        return this.safeString (r, 'x');\n");
        expect(output).toContain('var q any = nil');
    });
    test('a write of an untyped value keeps the box', () => {
        const output = run(
            "        let q: NullableDict = undefined;\n" +
            "        if (symbol === 'a') {\n" +
            "            q = this.omit (params, 'r');\n" +
            "        } else {\n" +
            "            q = symbol as any;\n" +
            "        }\n" +
            "        const r = this.omit (q, [ 'h' ]);\n" +
            "        return this.safeString (r, 'x');\n");
        expect(output).toContain('var q any = nil');
    });
    test('a ternary copy of the local keeps the box', () => {
        const output = run(
            "        let q = undefined;\n" +
            "        if (symbol === 'a') {\n" +
            "            q = this.omit (params, 'r');\n" +
            "        }\n" +
            "        const b = (q === undefined) ? params : q;\n" +
            "        return this.safeString (b, 'x');\n");
        expect(output).toContain('var q any = nil');
    });
});

import { Transpiler, installCcxtGoHooks } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('an async venue Int/Num parameter every caller hands a pointer or undefined prints the pointer', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h15m10-'));
    afterAll(() => { fs.rmSync(tmp, { 'recursive': true, 'force': true }); });
    const run = (helper: string, callers: string): string => {
        const dir = path.join(tmp, 'ts', 'src');
        fs.mkdirSync(dir, { 'recursive': true });
        const file = path.join(dir, 'venue.ts');
        fs.writeFileSync(file, 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\ntype Int = number | undefined;\ntype Num = number | undefined;\n'
            + 'class Exchange {\n    iso8601 (a: any): Str { return a; }\n}\n'
            + 'class venue extends Exchange {\n' + helper + callers + '}\n');
        const inst: any = new Transpiler({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } });
        installCcxtGoHooks(inst.goTranspiler);
        return inst.transpileGoByPath(file).content;
    };
    const helper = '    async helperTx (types: string, since: Int, limit: Int, params: any): Promise<Dict> {\n'
        + '        const request: Dict = { \'types\': types };\n'
        + '        if (since !== undefined) {\n            request[\'from\'] = this.iso8601 (since);\n        }\n'
        + '        if (limit !== undefined) {\n            request[\'limit\'] = limit;\n        }\n'
        + '        return request;\n    }\n';
    test('GetArg-bound Int callers: the helper takes *int64 and nil-tests natively', () => {
        const out = run(helper, '    async a (since: Int = undefined, limit: Int = undefined, params = {}) {\n        return await this.helperTx (\'A\', since, limit, params);\n    }\n'
            + '    async b (since: Int = undefined, limit: Int = undefined, params: any = undefined) {\n        return await this.helperTx (\'B\', since, undefined, params);\n    }\n');
        expect(out).toMatch(/helperTxBody\(ch chan [^)]*, types string, since \*int64, limit \*int64, params any\)/);
        expect(out).toContain('if since != nil {');
        expect(out).not.toContain('IsEqual(since, nil)');
    });
    test('a caller passing a boxed value keeps the any parameter and IsEqual', () => {
        const out = run(helper, '    async a (since: Int = undefined, limit: Int = undefined, params = {}) {\n        return await this.helperTx (\'A\', since, limit, params);\n    }\n'
            + '    async b (x: any, params = {}) {\n        return await this.helperTx (\'B\', x, x, params);\n    }\n');
        expect(out).toContain('IsEqual(since, nil)');
    });
    test('a body that writes a number into the parameter keeps the box', () => {
        const h = helper.replace ('const request', 'since = 5;\n        const request');
        const out = run(h, '    async a (since: Int = undefined, limit: Int = undefined, params = {}) {\n        return await this.helperTx (\'A\', since, limit, params);\n    }\n');
        expect(out).not.toMatch(/since \*int64, limit/);
    });
});

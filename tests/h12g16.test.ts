import { Transpiler, installCcxtGoHooks, installCcxtGoTupleSlotReads } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('a tuple slot holding a required typed-container parameter reads natively', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h12g16-'));
    afterAll(() => { fs.rmSync(tmp, { 'recursive': true, 'force': true }); });
    const run = (body: string): string => {
        const dir = path.join(tmp, 'ts', 'src');
        fs.mkdirSync(dir, { 'recursive': true });
        const file = path.join(dir, 'venue.ts');
        fs.writeFileSync(file, 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n    options: Dict = {};\n    safeString (a: any, b: any, c: any = undefined): Str { return a; }\n    omit (a: any, b: any): any { return a; }\n}\n'
            + 'class venue extends Exchange {\n    req (s: Str, request: Dict, params: Dict = {}): [Dict, Dict] {\n        request[\'a\'] = 1;\n        return [ request, this.omit (params, \'x\') ];\n    }\n    reqStr (s: Str, request: Dict): [Str, Dict] {\n        return [ s, request ];\n    }\n    run (p: Dict) {\n' + body + '    }\n}\n');
        const inst: any = new Transpiler({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } });
        installCcxtGoHooks(inst.goTranspiler);
        installCcxtGoTupleSlotReads(inst.goTranspiler);
        return inst.transpileGoByPath(file).content;
    };
    test('slot 0 is the Dict parameter: []any local and bare index', () => {
        const out = run("        const t = this.req ('s', {}, p);\n        return this.safeString (t[0], 'k', '');\n");
        expect(out).toContain('var t []any = this.Req(');
        expect(out).toContain('t[0]');
        expect(out).not.toContain('GetValue(t, 0)');
    });
    test('a Str parameter slot keeps the box', () => {
        const out = run("        const t = this.reqStr ('s', p);\n        return t[0];\n");
        expect(out).toContain('var t any = this.ReqStr(');
        expect(out).toContain('GetValue(t, 0)');
    });
});

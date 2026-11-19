import { Transpiler, installCcxtGoHooks, installCcxtGoTupleSlotReads } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('typed locals of SafeDictMap and exchange-local tuple producers', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h10g08-'));
    afterAll(() => { fs.rmSync(tmp, { 'recursive': true, 'force': true }); });
    const run = (body: string, extra = ''): string => {
        const dir = path.join(tmp, 'ts', 'src', 'pro');
        fs.mkdirSync(dir, { 'recursive': true });
        const file = path.join(dir, 'venue.ts');
        fs.writeFileSync(file, 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n    options: Dict = {};\n    safeDict (a: any, b: any, c: any = undefined): Dict { return a; }\n    safeString (a: any, b: any, c: any = undefined): Str { return a; }\n}\n'
            + 'class venue extends Exchange {\n    pair (p: Dict, s: string): [string, Str, Dict] {\n        if (s === \'a\') {\n            return [ \'x\', s, {} ];\n        }\n        return [ s, s, {} ];\n    }\n' + extra + '    run (p: Dict, flag: boolean) {\n' + body + '    }\n}\n');
        const inst: any = new Transpiler({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } });
        installCcxtGoHooks(inst.goTranspiler);
        installCcxtGoTupleSlotReads(inst.goTranspiler);
        return inst.transpileGoByPath(file).content;
    };
    test('a tuple local read by literal index is a []any and a plain slot reads natively', () => {
        const out = run("        const t = this.pair (p, 'b');\n        return t[2];\n");
        expect(out).toContain('var t []any = this.Pair(p, "b")');
        expect(out).toContain('return t[2]');
        expect(out).not.toContain('GetValue(t, 2)');
    });
    test('an index at or past the arity keeps the box', () => {
        const out = run("        const t = this.pair (p, 'b');\n        return t[3];\n");
        expect(out).toContain('var t any = this.Pair(');
        expect(out).toContain('GetValue(t, 3)');
    });
    test('a read of a slot that may hold a pointer keeps the box and GetValue', () => {
        const out = run("        const t = this.pair (p, 'b');\n        return [ t[1], t[2] ];\n");
        expect(out).toContain('var t any = this.Pair(p, "b")');
        expect(out).toContain('GetValue(t, 1)');
        expect(out).not.toContain('len(t)');
    });
    test('a non-index use keeps the box', () => {
        const out = run("        const t = this.pair (p, 'b');\n        const u = t;\n        return [ u, t[0] ];\n");
        expect(out).toContain('var t any = this.Pair(');
    });
});

describe('a safeDict local printed as SafeDictMap indexes natively with a string key', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h10g08b-'));
    afterAll(() => { fs.rmSync(tmp, { 'recursive': true, 'force': true }); });
    test('string local key', () => {
        const dir = path.join(tmp, 'ts', 'src', 'pro');
        fs.mkdirSync(dir, { 'recursive': true });
        const file = path.join(dir, 'venue.ts');
        fs.writeFileSync(file, 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n    options: Dict = {};\n    safeDict (a: any, b: any, c: any = undefined): Dict { return a; }\n    safeValue (a: any, b: any, c: any = undefined): any { return a; }\n}\n'
            + "class venue extends Exchange {\n    run (p: boolean) {\n        let connectId: Str = 'public';\n        if (p) {\n            connectId = 'private';\n        }\n        const urls = this.safeDict (this.options, 'urls', {});\n        let f = this.safeValue (urls, connectId);\n        urls[connectId] = 1;\n        this.options[\'urls\'] = urls;\n        f = urls[connectId];\n        const g = urls[connectId];\n        return [ f, g, urls[connectId] ];\n    }\n}\n");
        const inst: any = new Transpiler({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } });
        installCcxtGoHooks(inst.goTranspiler);
        const out = inst.transpileGoByPath(file).content;
        expect(out).toContain('[]any{f, g, urls[connectId]}');
        expect(out).toContain('var g any = GetValue(urls, connectId)');
        expect(out).toContain('f = GetValue(urls, connectId)'); // a plain write keeps the derefed producer
    });
});

import { Transpiler, installCcxtGoHooks } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('venue string returns proven through literal-defaulted safeString', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h15m29-'));
    afterAll(() => { fs.rmSync(tmp, { 'recursive': true, 'force': true }); });
    let n = 0;
    const run = (method: string): string => {
        const dir = path.join(tmp, String(n++), 'ts', 'src');
        fs.mkdirSync(dir, { 'recursive': true });
        const file = path.join(dir, 'venue.ts');
        fs.writeFileSync(file, 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n    options: Dict = {};\n    safeString (a: any, b: any, c: any = undefined): Str { return a; }\n}\n'
            + 'class venue extends Exchange {\n' + method + '}\n');
        const inst: any = new Transpiler({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } });
        installCcxtGoHooks(inst.goTranspiler);
        return inst.transpileGoByPath(file).content;
    };
    test('a sole literal-defaulted safeString return prints a string signature and a deref', () => {
        const out = run("    pickVersion (): string {\n        return this.safeString (this.options, 'v', 'v1');\n    }\n");
        expect(out).toContain('PickVersion() string {');
        expect(out).toContain('return *this.SafeString(this.Options, "v", "v1")');
    });
    test('a literal arm next to a defaulted safeString also proves string', () => {
        const out = run("    pickTif (t: string): string {\n        if (t === 'x') {\n            return 'GTC';\n        }\n        return this.safeString (this.options, t, 'GTC');\n    }\n");
        expect(out).toContain('PickTif(');
        expect(out).toContain(') string {');
        expect(out).toContain('return *this.SafeString(this.Options, t, "GTC")');
    });
    test('a safeString without a default keeps the any signature', () => {
        const out = run("    pickNo (): string {\n        return this.safeString (this.options, 'v');\n    }\n");
        expect(out).toContain('PickNo() any {');
        expect(out).not.toContain('return *this.SafeString');
    });
    test('an undefined path keeps the any signature', () => {
        const out = run("    pickNil (f: boolean): string {\n        if (f) {\n            return undefined;\n        }\n        return this.safeString (this.options, 'v', 'v1');\n    }\n");
        expect(out).not.toContain('return *this.SafeString');
    });
});

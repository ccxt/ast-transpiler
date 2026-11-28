import { Transpiler, installCcxtGoHooks } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('go guarded list read in a whole statement prints as statements', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h16g12-'));
    afterAll(() => { fs.rmSync(tmp, { 'recursive': true, 'force': true }); });
    const run = (body: string): string => {
        const dir = path.join(tmp, 'ts', 'src');
        fs.mkdirSync(dir, { 'recursive': true });
        const file = path.join(dir, 'venue.ts');
        fs.writeFileSync(file, 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n    safeList (a: any, b: any, c: any = undefined): any[] { return a; }\n    safeString (a: any, b: any, c: any = undefined): Str { return a; }\n}\n'
            + 'class venue extends Exchange {\n    run (trade: Dict, flag: boolean, k: number) {\n' + body + '    }\n}\n');
        const inst: any = new Transpiler({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } });
        installCcxtGoHooks(inst.goTranspiler);
        return inst.transpileGoByPath(file).content;
    };
    const rows = "        const rows = this.safeList (trade, 'result', []);\n";
    test('a declaration and an assignment from a SafeList element print the guard as statements', () => {
        const out = run(rows + "        let side = undefined;\n        if (flag) {\n            const marketId = rows[1];\n            side = rows[2];\n            return [ marketId, side ];\n        }\n        return side;\n");
        expect(out).not.toContain('func() any {');
        expect(out).toContain('\t\tvar marketId any = nil\n\t\tif 1 >= 0 && 1 < len(rows) {\n\t\t\tmarketId = rows[1]\n\t\t}\n');
        expect(out).toContain('\t\tside = nil\n\t\tif 2 >= 0 && 2 < len(rows) {\n\t\t\tside = rows[2]\n\t\t}\n');
    });
    test('an out-of-range read keeps the nil answer a consumer tests', () => {
        const out = run(rows + "        const first = rows[5];\n        if (first === undefined) {\n            return 'none';\n        }\n        return first;\n");
        expect(out).toContain('\tvar first any = nil\n\tif 5 >= 0 && 5 < len(rows) {\n\t\tfirst = rows[5]\n\t}\n');
        expect(out).toContain('if IsEqual(first, nil) {');
    });
    test('a list that is written with other values keeps the closure', () => {
        const out = run(rows + "        rows.push (this.safeString (trade, 'x'));\n        const marketId = rows[1];\n        return marketId;\n");
        expect(out).toContain('func() any {');
        expect(out).not.toContain('var marketId any = nil');
    });
    test('a read bounded by a length test is left to the in-range proof', () => {
        const out = run(rows + "        const n = rows.length;\n        if (n > 1) {\n            const marketId = rows[1];\n            return marketId;\n        }\n        return undefined;\n");
        expect(out).not.toContain('var marketId any = nil');
    });
    test('a read nested in a call argument is left alone', () => {
        const out = run(rows + "        return this.safeString (rows[1], 'id');\n");
        expect(out).not.toContain('= nil\n');
    });
});

import { Transpiler, installCcxtGoHooks } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('go guarded list read inside a SafeStringPtr / MapTyped declaration prints as statements', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h17g02-'));
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
    const lists = "        const hashes: string[] = this.safeList (trade, 'h', []);\n        const rows = this.safeList (trade, 'r', []);\n";
    test('a *string declaration from a string[] list element reads the string comma-ok', () => {
        const out = run(lists + "        let last = undefined;\n        for (let j = 0; j < rows.length; j++) {\n            const h = hashes[j];\n            last = h;\n        }\n        const first: Dict = rows[0];\n        return [ last, first ];\n");
        expect(out).toContain('\t\tvar h *string = nil\n\t\tif j >= 0 && j < len(hashes) {\n\t\t\tif s, ok := hashes[j].(string); ok {\n\t\t\t\th = &s\n\t\t\t}\n\t\t}\n');
    });
    test('an out-of-range read keeps the nil answer a consumer tests', () => {
        const out = run(lists + "        const h = hashes[3];\n        if (h === undefined) {\n            return 'none';\n        }\n        return h;\n");
        expect(out).toContain('\tvar h *string = nil\n\tif 3 >= 0 && 3 < len(hashes) {\n\t\tif s, ok := hashes[3].(string); ok {\n\t\t\th = &s\n\t\t}\n\t}\n');
        expect(out).toContain('h == nil');
    });
    test('a list written with other values keeps the closure', () => {
        const out = run(lists + "        hashes[0] = 'x';\n        rows.push (hashes);\n        const first: Dict = rows[0];\n        return first;\n");
        expect(out).not.toContain('first = MapTyped(rows[0])');
    });
    test('a read bounded by a length test is left to the in-range proof', () => {
        const out = run(lists + "        if (hashes.length > 1) {\n            const h = hashes[1];\n            return h;\n        }\n        return undefined;\n");
        expect(out).not.toContain('var h *string = nil');
    });
    test('a read nested in another call argument is left alone', () => {
        const out = run(lists + "        const h = this.safeString (rows[0], 'id');\n        return h;\n");
        expect(out).not.toContain('= nil\n\tif 0 >= 0');
    });
});

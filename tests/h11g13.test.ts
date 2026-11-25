import { Transpiler, installCcxtGoHooks } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('a List producer returning its own []any parameter feeds a unified slice slot', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'h11g13-'));
    afterAll(() => { fs.rmSync(tmp, { 'recursive': true, 'force': true }); });
    const run = (producer: string, slots: any): string => {
        const dir = path.join(tmp, 'ts', 'src');
        fs.mkdirSync(dir, { 'recursive': true });
        const file = path.join(dir, 'venue.ts');
        fs.writeFileSync(file, 'type Dict = { [key: string]: any };\ntype List = any[];\ntype Str = string | undefined;\nclass Exchange {\n'
            + '    safeList (a: any, b: any, c: any = undefined): List { return a; }\n    safeString (a: any, b: any, c: any = undefined): Str { return a; }\n'
            + '    parseRows (rows: Dict[], since: any = undefined): List { const out = []; for (let i = 0; i < rows.length; i++) { out.push (rows[i]); } return out; }\n}\n'
            + 'class venue extends Exchange {\n' + producer
            + '    run (p: Dict) {\n        const cursor = this.safeString (p, \'c\');\n        const rows = this.safeList (p, \'rows\', []);\n'
            + '        const withCursor = this.addCursor (cursor, rows);\n        return this.parseRows (withCursor);\n    }\n}\n');
        const inst: any = new Transpiler({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } });
        installCcxtGoHooks(inst.goTranspiler);
        inst.goTranspiler.unifiedSliceParams = slots;
        return inst.transpileGoByPath(file).content;
    };
    const producer = '    addCursor (cursor: Str, data: List): List {\n        if (cursor !== undefined) {\n            data[0] = cursor;\n        }\n        return data;\n    }\n';
    test('the producer prints []any and the caller local takes it', () => {
        const out = run(producer, { 'parseRows': { 0: '[]any' } });
        expect(out).toMatch(/AddCursor\(cursor \*string, data \[\]any\) \[\]any/);
        expect(out).toContain('var withCursor []any = this.AddCursor(');
    });
    test('a written parameter keeps the any signature', () => {
        const written = '    addCursor (cursor: Str, data: List): List {\n        if (cursor === undefined) {\n            data = this.safeList (data, 0);\n        }\n        return data;\n    }\n';
        const out = run(written, { 'parseRows': { 0: '[]any' } });
        expect(out).not.toMatch(/AddCursor\([^)]*\) \[\]any/);
    });
    test('a return of something other than the parameter keeps the any signature', () => {
        const other = '    addCursor (cursor: Str, data: List): List {\n        if (cursor !== undefined) {\n            return this.safeList (data, 0);\n        }\n        return data;\n    }\n';
        const out = run(other, { 'parseRows': { 0: '[]any' } });
        expect(out).not.toMatch(/AddCursor\([^)]*\) \[\]any/);
    });
});

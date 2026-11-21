import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// `rows[i][k] = v` on a bounded loop row of a pointer-free []any list: the comma-ok map store (non-map rows skipped,
// a *T local stored dereferenced or nil); anything the row-container proof refuses keeps the helper
describe ('go bounded loop row field store (h30g31)', () => {
    const root = path.join (__dirname, 'files', 'tmp-h30g31', 'ts', 'src');
    const SRC =
        'type Dict = { [key: string]: any };\n' +
        'class Exchange {\n' +
        '    toArray (o: any): any[] { return o; }\n' +
        '    safeString (o: any, k: any, d: any = undefined): string | undefined { return o[k]; }\n' +
        '    async publicGetRows (p: Dict = {}): Promise<any> { return p; }\n' +
        '}\n' +
        'class venue extends Exchange {\n' +
        '    async tagRows (params: Dict = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        let rows: Dict[] = [];\n' +
        '        if (response !== undefined) {\n' +
        '            rows = this.toArray (response);\n' +
        '        }\n' +
        '        for (let i = 0; i < rows.length; i++) {\n' +
        '            rows[i][\'type\'] = \'deposit\';\n' +
        '        }\n' +
        '        return rows;\n' +
        '    }\n' +
        '    async nextRows (params: Dict = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const next = this.safeString (response, \'next\');\n' +
        '        let rows: Dict[] = [];\n' +
        '        if (response !== undefined) {\n' +
        '            rows = this.toArray (response);\n' +
        '        }\n' +
        '        for (let i = 0; i < rows.length; i++) {\n' +
        '            rows[i][\'next\'] = next;\n' +
        '        }\n' +
        '        return rows;\n' +
        '    }\n' +
        '    async anyValue (params: Dict = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        let rows: Dict[] = [];\n' +
        '        if (response !== undefined) {\n' +
        '            rows = this.toArray (response);\n' +
        '        }\n' +
        '        for (let i = 0; i < rows.length; i++) {\n' +
        '            rows[i][\'raw\'] = response;\n' +
        '        }\n' +
        '        return rows;\n' +
        '    }\n' +
        '    async rebound (params: Dict = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        let other: Dict[] = this.toArray (response);\n' +
        '        for (let i = 0; i < other.length; i++) {\n' +
        '            other[i][\'type\'] = \'x\';\n' +
        '            other = [];\n' +
        '        }\n' +
        '        return other;\n' +
        '    }\n' +
        '    loose (items, n: number) {\n' +
        '        for (let i = 0; i < items.length; i++) {\n' +
        '            items[i][\'type\'] = \'z\';\n' +
        '        }\n' +
        '        return items;\n' +
        '    }\n' +
        '}\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (root, { recursive: true });
        const file = path.join (root, 'venue.ts');
        fs.writeFileSync (file, SRC);
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoLocalTypes (t.goTranspiler);
        out = t.transpileGoByPath (file).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h30g31'), { recursive: true, force: true }));
    const body = (name: string): string => { const at = out.indexOf (') ' + name + '('); return out.slice (at, out.indexOf ('\n}\n', at)); };
    test ('positive: a plain value is stored through the comma-ok row (fails on the base printer)', () => {
        const b = body ('tagRowsBody');
        expect (b).toMatch (/if row, ok := rows\[i\]\.\(map\[string\]any\); ok && \(row != nil\) \{\n\s*row\["type"\] = "deposit"\n\s*\}/);
        expect (b).not.toContain ('AddElementToObject(');
    });
    test ('positive: a nil-able *string value stores the pointee or nil, like derefScalar', () => {
        const b = body ('nextRowsBody');
        expect (b).toMatch (/if row, ok := rows\[i\]\.\(map\[string\]any\); ok && \(row != nil\) \{\n\s*if next != nil \{\n\s*row\["next"\] = \*next\n\s*\} else \{\n\s*row\["next"\] = nil\n\s*\}\n\s*\}/);
        expect (b).not.toContain ('AddElementToObject(');
    });
    test ('negative: an any value that may hold a pointer is not stored natively', () => {
        expect (body ('anyValueBody')).not.toContain ('row["raw"] = ');
    });
    test ('negative: a list rebound inside the loop keeps the helper', () => {
        expect (body ('reboundBody')).toMatch (/AddElementToObject\(GetValue\(other, i\), "type", "x"\)/);
    });
    test ('negative: an untyped parameter list keeps the helper', () => {
        expect (body ('Loose')).toMatch (/AddElementToObject\(GetValue\(items, i\), "type", "z"\)/);
    });
});

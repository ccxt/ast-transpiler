import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// `rows[i][k] = v` on a declared []any local inside a counting loop over its own length, with pointer-free elements,
// writes through the plain index `rows[i]`; an unbounded index, a loop that rebinds the list, or an untyped list keeps GetValue.
describe ('go bounded list row write container', () => {
    const root = path.join (__dirname, 'files', 'tmp-h25g20', 'ts', 'src');
    const SRC =
        'type Dict = { [key: string]: any };\n' +
        'type List = any[];\n' +
        'class Exchange {\n' +
        '    toArray (o: any): any[] { return o; }\n' +
        '    safeString (o: any, k: any, d: any = undefined): string { return o[k]; }\n' +
        '    parseX (o: Dict): Dict { return o; }\n' +
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
        '    async readRows (params: Dict = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const rows = this.toArray (response);\n' +
        '        const out = [];\n' +
        '        for (let i = 0; i < rows.length; i++) {\n' +
        '            const row = rows[i];\n' +
        '            out.push (this.parseX (row));\n' +
        '        }\n' +
        '        return out;\n' +
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
        '    async unbounded (params: Dict = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const first: Dict[] = this.toArray (response);\n' +
        '        first[0][\'type\'] = \'y\';\n' +
        '        return first;\n' +
        '    }\n' +
        '    loose (items, n: number) {\n' +
        '        for (let i = 0; i < items.length; i++) {\n' +
        '            items[i][\'type\'] = \'z\';\n' +
        '        }\n' +
        '        return items;\n' +
        '    }\n' +
        '    pickNum (arr: number[], v: number) {\n' +
        '        const length = arr.length;\n' +
        '        for (let i = 0; i < length; i++) {\n' +
        '            const current = arr[i];\n' +
        '            if (v <= current) {\n' +
        '                return current;\n' +
        '            }\n' +
        '        }\n' +
        '        return arr[length - 1];\n' +
        '    }\n' +
        '    keys (codes: string[]) {\n' +
        '        const n = codes.length;\n' +
        '        const out = [];\n' +
        '        for (let i = 0; i < n; i++) {\n' +
        '            out.push (\'x\' + codes[i]);\n' +
        '        }\n' +
        '        return out;\n' +
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
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h25g20'), { recursive: true, force: true }));
    test ('positive: the row of a bounded loop over a declared list is the plain index', () => {
        expect (out).toMatch (/if row, ok := rows\[i\]\.\(map\[string\]any\); ok && \(row != nil\) \{\n\s*row\["type"\] = "deposit"/);
        expect (out).not.toMatch (/AddElementToObject\(GetValue\(rows, i\), "type"/);
    });

    test ('negative: a list rebound inside the loop keeps GetValue', () => {
        expect (out).toMatch (/AddElementToObject\(GetValue\(other, i\), "type", "x"\)/);
    });

    test ('negative: an index outside a counting loop keeps GetValue', () => {
        expect (out).toMatch (/AddElementToObject\(GetValue\(first, 0\), "type", "y"\)/);
    });

    test ('negative: an untyped parameter list keeps GetValue', () => {
        expect (out).toMatch (/AddElementToObject\(GetValue\(items, i\), "type", "z"\)/);
    });
});

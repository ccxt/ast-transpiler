import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// `const x: Dict[] = Array.isArray (r) ? r : this.safeList (r, k, [])` prints a typed []any local filled by an if/else
// (both arms never nil), so its length and element reads are native; other shapes keep the boxed func literal.
// `const x = isArray (r) ? r : []` prints a typed []any local filled by an if/else; other shapes keep the box.
describe ('go response-or-empty-list ternary', () => {
    const root = path.join (__dirname, 'files', 'tmp-h26g22', 'ts', 'src');
    const SRC =
        'type Dict = { [key: string]: any };\n' +
        'class Exchange {\n' +
        '    parseRow (row: any): any { return row; }\n' +
        '    async publicGetRows (p: Dict = {}): Promise<any> { return p; }\n' +
        '}\n' +
        'class venue extends Exchange {\n' +
        '    async aliased (params: Dict = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const responseIsArray = Array.isArray (response);\n' +
        '        const found = (responseIsArray) ? response : [];\n' +
        '        const n = found.length;\n' +
        '        for (let j = 0; j < n; j++) {\n' +
        '            this.parseRow (found[j]);\n' +
        '        }\n' +
        '    }\n' +
        '    async annotated (params: Dict = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const rows: Dict[] = Array.isArray (response) ? response : [];\n' +
        '        for (let i = 0; i < rows.length; i++) {\n' +
        '            this.parseRow (rows[i]);\n' +
        '        }\n' +
        '    }\n' +
        '    async nilTested (params: Dict = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        let maybe = Array.isArray (response) ? response : [];\n' +
        '        if (maybe.length === 0) {\n' +
        '            maybe = undefined;\n' +
        '        }\n' +
        '        this.parseRow (maybe);\n' +
        '    }\n' +
        '    async otherList (params: Dict = {}, other: any = undefined) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const mixed = Array.isArray (other) ? response : [];\n' +
        '        for (let i = 0; i < mixed.length; i++) {\n' +
        '            this.parseRow (mixed[i]);\n' +
        '        }\n' +
        '    }\n' +
        '    async pushedRows (params: Dict = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const pushed = Array.isArray (response) ? response : [];\n' +
        '        const all: Dict[] = [];\n' +
        '        for (let i = 0; i < pushed.length; i++) {\n' +
        '            all.push (pushed[i]);\n' +
        '        }\n' +
        '        this.parseRow (all);\n' +
        '    }\n' +
        '    async nonEmpty (params: Dict = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const filled = Array.isArray (response) ? response : [ 1 ];\n' +
        '        for (let i = 0; i < filled.length; i++) {\n' +
        '            this.parseRow (filled[i]);\n' +
        '        }\n' +
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
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h26g22'), { recursive: true, force: true }));

    test ('positive: an aliased IsArray test with an empty arm prints a typed if/else', () => {
        expect (out).toMatch (/var found \[\]any\n\s*if responseIsArray \{\n\s*found = ArrayTyped\(response\)\n\s*\} else \{\n\s*found = \[\]any\{\}\n\s*\}/);
        expect (out).toMatch (/var n int = len\(found\)/);

        expect (out).not.toMatch (/var found any = func\(\) any/);
    });

    test ('positive: a Dict[] annotated inline test prints the same form', () => {
        expect (out).toMatch (/var rows \[\]any\n\s*if IsArray\(response\) \{\n\s*rows = ArrayTyped\(response\)/);
        expect (out).toMatch (/i < len\(rows\)/);
    });

    test ('negative: a let local later set to undefined keeps the box', () => {
        expect (out).toMatch (/var maybe any = func\(\) any/);
    });

    test ('negative: a list arm the condition does not test keeps the box', () => {
        expect (out).toMatch (/var mixed any = func\(\) any/);
    });

    test ('negative: an element pushed into another list keeps the box', () => {
        expect (out).toMatch (/var pushed any = func\(\) any/);
    });

    test ('negative: a non-empty literal arm is not this rule', () => {
        expect (out).not.toMatch (/var filled \[\]any\n\s*if/);
    });
});

import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// `const x: Dict[] = Array.isArray (r) ? r : this.safeList (r, k, [])` prints a typed []any local filled by an if/else
// (both arms never nil), so its length and element reads are native; other shapes keep the boxed func literal.
describe ('go response-or-safeList ternary into a Dict[] local', () => {
    const root = path.join (__dirname, 'files', 'tmp-h23x04', 'ts', 'src');
    const SRC =
        'type Dict = { [key: string]: any };\n' +
        'class Exchange {\n' +
        '    parseRow (row: any): any { return row; }\n' +
        '    safeList (o: any, k: string, d: any[] = undefined): any[] { return o[k]; }\n' +
        '    async publicGetRows (p: Dict = {}): Promise<any> { return p; }\n' +
        '}\n' +
        'class venue extends Exchange {\n' +
        '    async aliased (params: Dict = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const responseIsArray = Array.isArray (response);\n' +
        '        const found: Dict[] = (responseIsArray) ? response : this.safeList (response, \'data\', []);\n' +
        '        for (let j = 0; j < found.length; j++) {\n' +
        '            this.parseRow (found[j]);\n' +
        '        }\n' +
        '    }\n' +
        '    async inline (params: Dict = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const rows: Dict[] = Array.isArray (response) ? response : this.safeList (response, \'data\', []);\n' +
        '        const n = rows.length;\n' +
        '        for (let i = 0; i < n; i++) {\n' +
        '            this.parseRow (rows[i]);\n' +
        '        }\n' +
        '    }\n' +
        '    async nilDefault (params: Dict = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const maybe: Dict[] = Array.isArray (response) ? response : this.safeList (response, \'data\');\n' +
        '        if (maybe === undefined) {\n' +
        '            return;\n' +
        '        }\n' +
        '        for (let i = 0; i < maybe.length; i++) {\n' +
        '            this.parseRow (maybe[i]);\n' +
        '        }\n' +
        '    }\n' +
        '    async untyped (params: Dict = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const loose = Array.isArray (response) ? response : this.safeList (response, \'data\', []);\n' +
        '        for (let i = 0; i < loose.length; i++) {\n' +
        '            this.parseRow (loose[i]);\n' +
        '        }\n' +
        '    }\n' +
        '    async otherList (params: Dict = {}, other: any = undefined) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const mixed: Dict[] = Array.isArray (other) ? response : this.safeList (response, \'data\', []);\n' +
        '        for (let i = 0; i < mixed.length; i++) {\n' +
        '            this.parseRow (mixed[i]);\n' +
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
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h23x04'), { recursive: true, force: true }));

    test ('positive: an aliased IsArray test prints a typed if/else and native reads', () => {
        expect (out).toMatch (/var found \[\]any\n\s*if responseIsArray \{\n\s*found = ArrayTyped\(response\)\n\s*\} else \{\n\s*found = ArrayTyped\(this\.SafeList\(response, "data", \[\]any\{\}\)\)\n\s*\}/);
        expect (out).toMatch (/j < len\(found\)/);
        expect (out).not.toMatch (/var found any = func\(\) any/);
    });

    test ('positive: an inline IsArray test prints the same form', () => {
        expect (out).toMatch (/var rows \[\]any\n\s*if IsArray\(response\) \{\n\s*rows = ArrayTyped\(response\)/);
        expect (out).toMatch (/var n int = len\(rows\)/);
    });

    test ('negative: a safeList without a [] default can be nil and is nil-tested: keeps the box', () => {
        expect (out).toMatch (/var maybe any\n/);
    });

    test ('negative: an unannotated local keeps the box', () => {
        expect (out).toMatch (/var loose any\n/);
    });

    test ('negative: a list arm the condition does not test keeps the box', () => {
        expect (out).toMatch (/var mixed any\n/);
    });
});

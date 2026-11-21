import fs from 'fs';
import path from 'path';
import { Transpiler } from '../src/transpiler';

// a row read `this.safeDict (xs, i, {})` of a JSON-origin list at its own loop counter prints the comma-ok
// element assertion; a list that is not JSON origin, or a counter the body rebinds, keeps SafeDictMap
describe ('go JSON-origin list row read with an empty-dict default', () => {
    const root = path.join (__dirname, 'files', 'tmp-h28a09', 'ts', 'src');
    const SRC =
        'type Dict = { [key: string]: any };\n' +
        'class Exchange {\n' +
        '    request (path: any, api: any = undefined, method: any = undefined, params: any = undefined): any { return undefined; }\n' +
        '    safeList (o: any, k: any, d: any[] = undefined): any[] { return o[k]; }\n' +
        '    safeDict (o: any, k: any, d: Dict = undefined): Dict { return o[k]; }\n' +
        '    safeString (o: any, k: any, d: string = undefined): string { return o[k]; }\n' +
        '}\n' +
        'class venue extends Exchange {\n' +
        '    publicGetRows (params = {}) { return this.request (\'rows\', \'public\', \'GET\', params); }\n' +
        '    async fromJson (params = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const data = this.safeList (response, \'data\', []);\n' +
        '        const ids = [];\n' +
        '        for (let i = 0; i < data.length; i++) {\n' +
        '            const row = this.safeDict (data, i, {});\n' +
        '            row[\'seen\'] = true;\n' +
        '            ids.push (row);\n' +
        '        }\n' +
        '        return ids;\n' +
        '    }\n' +
        '    async readsOnly (params = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const rows = this.safeList (response, \'rows\', []);\n' +
        '        const ids = [];\n' +
        '        for (let k = 0; k < rows.length; k++) {\n' +
        '            const cell = this.safeDict (rows, k, {});\n' +
        '            ids.push (this.safeString (cell, \'id\'));\n' +
        '        }\n' +
        '        return ids;\n' +
        '    }\n' +
        '    fromParam (response: Dict) {\n' +
        '        const data = this.safeList (response, \'data\', []);\n' +
        '        const ids = [];\n' +
        '        for (let i = 0; i < data.length; i++) {\n' +
        '            const item = this.safeDict (data, i, {});\n' +
        '            ids.push (this.safeString (item, \'id\'));\n' +
        '        }\n' +
        '        return ids;\n' +
        '    }\n' +
        '    async skipsRows (params = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const data = this.safeList (response, \'data\', []);\n' +
        '        const ids = [];\n' +
        '        for (let i = 0; i < data.length; i++) {\n' +
        '            const entry = this.safeDict (data, i, {});\n' +
        '            ids.push (this.safeString (entry, \'id\'));\n' +
        '            i = i + 1;\n' +
        '        }\n' +
        '        return ids;\n' +
        '    }\n' +
        '}\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (root, { recursive: true });
        const file = path.join (root, 'venue.ts');
        fs.writeFileSync (file, SRC);
        const cwd = process.cwd ();
        process.chdir (path.join (root, '..', '..'));
        try {
            out = new Transpiler ({ verbose: false }).transpileGoByPath (file).content;
        } finally {
            process.chdir (cwd);
        }
    });
    afterAll (() => {
        fs.rmSync (path.join (__dirname, 'files', 'tmp-h28a09'), { recursive: true, force: true });
    });
    test ('JSON-origin row read prints the comma-ok assertion', () => {
        expect (out).toMatch (/var row, _ = data\[i\]\.\(map\[string\]any\)\n\s*if row == nil \{\n\s*row = map\[string\]any\{\}\n\s*\}/);
    });
    test ('a read-only defaulted row prints the comma-ok assertion alone', () => {
        expect (out).toMatch (/var cell, _ = rows\[k\]\.\(map\[string\]any\)\n\s*ids = append/);
    });
    test ('a list from a parameter keeps the wrap', () => {
        expect (out).not.toMatch (/var item, _ =/);
    });
    test ('a counter the body writes keeps the wrap', () => {
        expect (out).not.toMatch (/var entry, _ =/);
    });
});

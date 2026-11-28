import fs from 'fs';
import path from 'path';
import { Transpiler } from '../src/transpiler';

// a loop row of a JSON-origin list read by safe readers and then stored as a value reads through the comma-ok map
// and stores the raw element; a list from a parameter, a read after the store or a nil test keeps the boxed row
describe ('go JSON-origin loop row stored as info', () => {
    const root = path.join (__dirname, 'files', 'tmp-h29a18', 'ts', 'src');
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
        '    async stored (params = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const markets = this.safeList (response, \'data\', []);\n' +
        '        const result = [];\n' +
        '        for (let i = 0; i < markets.length; i++) {\n' +
        '            const market = markets[i];\n' +
        '            const base = this.safeDict (market, \'base_asset\');\n' +
        '            result.push ({ \'id\': this.safeString (market, \'id\'), \'base\': this.safeString (base, \'s\'), \'info\': market });\n' +
        '        }\n' +
        '        return result;\n' +
        '    }\n' +
        '    fromParam (response: Dict) {\n' +
        '        const rows = this.safeList (response, \'data\', []);\n' +
        '        const result = [];\n' +
        '        for (let i = 0; i < rows.length; i++) {\n' +
        '            const item = rows[i];\n' +
        '            const nested = this.safeDict (item, \'n\');\n' +
        '            result.push ({ \'n\': nested, \'info\': item });\n' +
        '        }\n' +
        '        return result;\n' +
        '    }\n' +
        '    async nilTest (params = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const rows = this.safeList (response, \'data\', []);\n' +
        '        const result = [];\n' +
        '        for (let i = 0; i < rows.length; i++) {\n' +
        '            const entry = rows[i];\n' +
        '            if (entry === undefined) {\n' +
        '                continue;\n' +
        '            }\n' +
        '            const nested = this.safeDict (entry, \'n\');\n' +
        '            result.push ({ \'n\': nested, \'info\': entry });\n' +
        '        }\n' +
        '        return result;\n' +
        '    }\n' +
        '    async readAfter (params = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const rows = this.safeList (response, \'data\', []);\n' +
        '        const result = [];\n' +
        '        for (let i = 0; i < rows.length; i++) {\n' +
        '            const cell = rows[i];\n' +
        '            result.push ({ \'info\': cell });\n' +
        '            result.push (this.safeDict (cell, \'n\'));\n' +
        '        }\n' +
        '        return result;\n' +
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
        fs.rmSync (path.join (__dirname, 'files', 'tmp-h29a18'), { recursive: true, force: true });
    });
    test ('the row reads through the comma-ok map and info stores the raw element', () => {
        expect (out).toMatch (/var market, _ = markets\[i\]\.\(map\[string\]any\)/);
        expect (out).toMatch (/var base, _ = market\["base_asset"\]\.\(map\[string\]any\)/);
        expect (out).toMatch (/"info": +markets\[i\]/);
    });
    test ('a list from a parameter keeps the boxed row', () => {
        expect (out).toMatch (/var item any = rows\[i\]/);
    });
    test ('a nil-tested row keeps the boxed row', () => {
        expect (out).toMatch (/var entry any = rows\[i\]/);
    });
    test ('a read after the store keeps the boxed row', () => {
        expect (out).toMatch (/var cell any = rows\[i\]/);
    });
});

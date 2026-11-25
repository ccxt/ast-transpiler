import fs from 'fs';
import path from 'path';
import { Transpiler } from '../src/transpiler';

// a loop row name reused by a sibling loop is a separate variable, so each row still reads through the comma-ok map;
// a namesake in a nested block keeps the boxed row
describe ('go JSON-origin loop rows sharing a name across sibling loops', () => {
    const root = path.join (__dirname, 'files', 'tmp-h51g46', 'ts', 'src');
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
        '    async twoLoops (params = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const markets = this.safeList (response, \'data\', []);\n' +
        '        const others = this.safeList (response, \'other\', []);\n' +
        '        const result = [];\n' +
        '        for (let i = 0; i < markets.length; i++) {\n' +
        '            const market = markets[i];\n' +
        '            const base = this.safeDict (market, \'base_asset\');\n' +
        '            result.push ({ \'id\': this.safeString (market, \'id\'), \'base\': this.safeString (base, \'s\'), \'info\': market });\n' +
        '        }\n' +
        '        for (let i = 0; i < others.length; i++) {\n' +
        '            const market = others[i];\n' +
        '            const quote = this.safeDict (market, \'quote_asset\');\n' +
        '            result.push ({ \'id\': this.safeString (market, \'id\'), \'quote\': this.safeString (quote, \'s\'), \'info\': market });\n' +
        '        }\n' +
        '        return result;\n' +
        '    }\n' +
        '    async shadowed (params = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const rows = this.safeList (response, \'data\', []);\n' +
        '        const result = [];\n' +
        '        for (let i = 0; i < rows.length; i++) {\n' +
        '            const cell = rows[i];\n' +
        '            const n = this.safeDict (cell, \'n\');\n' +
        '            result.push ({ \'n\': n, \'info\': cell });\n' +
        '            if (n !== undefined) {\n' +
        '                const cell = n;\n' +
        '                result.push (cell);\n' +
        '            }\n' +
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
        fs.rmSync (path.join (__dirname, 'files', 'tmp-h51g46'), { recursive: true, force: true });
    });
    test ('rows of two sibling loops sharing a name read through the comma-ok map', () => {
        expect (out).toMatch (/var market, _ = markets\[i\]\.\(map\[string\]any\)/);
        expect (out).toMatch (/var market, _ = others\[i\]\.\(map\[string\]any\)/);
        expect (out).toMatch (/"info": +markets\[i\]/);
        expect (out).toMatch (/"info": +others\[i\]/);
    });
    test ('a namesake in a nested block keeps the boxed row', () => {
        expect (out).toMatch (/var cell any = rows\[i\]/);
    });
});

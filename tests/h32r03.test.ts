import fs from 'fs';
import path from 'path';
import { Transpiler } from '../src/transpiler';

// a dict row read `this.safeDict (rows, i)` on a receiver printed `[]any` is the comma-ok element assertion:
// the plain index inside a loop over rows.length, an explicit bounds test elsewhere, then the `{}` default
describe ('go []any row read by integer index', () => {
    const root = path.join (__dirname, 'files', 'tmp-h32r03', 'ts', 'src');
    const SRC =
        'type Dict = { [key: string]: any };\n' +
        'class Exchange {\n' +
        '    safeList (o: any, k: any, d: any[] = undefined): any[] { return o[k]; }\n' +
        '    safeDict (o: any, k: any, d: Dict = undefined): Dict { return o[k]; }\n' +
        '    safeString (o: any, k: any, d: string = undefined): string { return o[k]; }\n' +
        '}\n' +
        'class venue extends Exchange {\n' +
        '    loopRow (response: Dict) {\n' +
        '        const rows = this.safeList (response, \'data\', []);\n' +
        '        const ids = [];\n' +
        '        for (let i = 0; i < rows.length; i++) {\n' +
        '            const row = this.safeDict (rows, i);\n' +
        '            ids.push (this.safeString (row, \'id\'));\n' +
        '        }\n' +
        '        return ids;\n' +
        '    }\n' +
        '    loopRowDefault (response: Dict) {\n' +
        '        const items = this.safeList (response, \'data\', []);\n' +
        '        const ids = [];\n' +
        '        for (let i = 0; i < items.length; i++) {\n' +
        '            const item = this.safeDict (items, i, {});\n' +
        '            ids.push (this.safeString (item, \'id\'));\n' +
        '        }\n' +
        '        return ids;\n' +
        '    }\n' +
        '    tuple (response: Dict) {\n' +
        '        const selection = this.safeList (response, \'sel\', []);\n' +
        '        const query = this.safeDict (selection, 1, {});\n' +
        '        return this.safeString (query, \'id\');\n' +
        '    }\n' +
        '    lastRow (response: Dict) {\n' +
        '        const trades = this.safeList (response, \'data\', []);\n' +
        '        const last = this.safeDict (trades, trades.length - 1, {});\n' +
        '        return this.safeString (last, \'id\');\n' +
        '    }\n' +
        '    notAList (response: Dict, k: string) {\n' +
        '        const data = this.safeDict (response, \'data\', {});\n' +
        '        const entry = this.safeDict (data, k);\n' +
        '        return this.safeString (entry, \'id\');\n' +
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
        fs.rmSync (path.join (__dirname, 'files', 'tmp-h32r03'), { recursive: true, force: true });
    });
    test ('loop row prints the comma-ok assertion', () => {
        expect (out).toMatch (/var row, _ = rows\[i\]\.\(map\[string\]any\)/);
    });
    test ('loop row with a {} default every consumer reads as nil', () => {
        expect (out).toMatch (/var item, _ = items\[i\]\.\(map\[string\]any\)/);
    });
    test ('literal index uses the bounds form', () => {
        expect (out).toMatch (/var query map\[string\]any\n\t+if 1 < len\(selection\) \{\n\t+query, _ = selection\[1\]\.\(map\[string\]any\)\n\t+\}/);
    });
    test ('last-row read prints the bounds form without recursing', () => {
        expect (out).toMatch (/var last map\[string\]any\n\t+if len\(trades\) - 1 >= 0 \{\n\t+last, _ = trades\[len\(trades\) - 1\]\.\(map\[string\]any\)\n\t+\}/);
    });
    test ('no row read keeps the wrap', () => {
        expect (out).not.toMatch (/SafeMapTyped\((rows|items|selection|trades),/);
    });
    test ('a map receiver keeps the helper', () => {
        expect (out).toMatch (/SafeMapTyped\(data, k\)|SafeDict\(data, k\)/);
    });
});

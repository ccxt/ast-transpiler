import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// a `[]`-defaulted safeList local rebound from a []any local or a base list producer prints `[]any`;
// a rebind from a boxed value, or a venue override of the producer, keeps the box.
describe ('go safeList-seeded list local rebound from a typed list', () => {
    const root = path.join (__dirname, 'files', 'tmp-h26g03', 'ts', 'src');
    const SRC =
        'type Dict = { [key: string]: any };\n' +
        'class Exchange {\n' +
        '    safeList (o: any, k: any, d: any[] = undefined): any[] { return o[k]; }\n' +
        '    safeValue (o: any, k: any, d: any = undefined): any { return o[k]; }\n' +
        '    safeString (o: any, k: any, d: string = undefined): string { return o[k]; }\n' +
        '    arrayConcat (a: any[], b: any[]): any[] { return a; }\n' +
        '    arraySlice (a: any[], b: number, c: number = undefined): any[] { return a; }\n' +
        '}\n' +
        'class venue extends Exchange {\n' +
        '    fromLocal (result: Dict, spot: boolean) {\n' +
        '        let rows: Dict[] = this.safeList (result, \'list\', []);\n' +
        '        if (spot) {\n' +
        '            const kept = [];\n' +
        '            for (let i = 0; i < rows.length; i++) {\n' +
        '                kept.push (rows[i]);\n' +
        '            }\n' +
        '            rows = kept;\n' +
        '        }\n' +
        '        return rows;\n' +
        '    }\n' +
        '    fromConcat (d: Dict, more: any[]) {\n' +
        '        let products = this.safeList (d, \'products\', []);\n' +
        '        products = this.arrayConcat (products, more);\n' +
        '        for (let i = 0; i < products.length; i++) {\n' +
        '            const p = this.safeString (products[i], \'id\');\n' +
        '        }\n' +
        '    }\n' +
        '    fromBox (d: Dict, response: any) {\n' +
        '        let boxed = this.safeList (d, \'items\', []);\n' +
        '        boxed = this.safeValue (response, \'items\');\n' +
        '        return boxed.length;\n' +
        '    }\n' +
        '}\n' +
        'class other extends Exchange {\n' +
        '    arraySlice (a: any, b: any, c: any = undefined): any { return a; }\n' +
        '    overridden (sides: Dict, limit: number) {\n' +
        '        let bids = this.safeList (sides, \'bids\', []);\n' +
        '        const n = bids.length;\n' +
        '        bids = this.arraySlice (bids, 0, limit);\n' +
        '        return [ bids, n ];\n' +
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
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h26g03'), { recursive: true, force: true }));

    test ('positive: rebound from a []any local types the local', () => {
        expect (out).toMatch (/var rows \[\]any = /);
        expect (out).toMatch (/kept = append\(kept, rows\[i\]\)/);
        expect (out).not.toMatch (/var rows any = /);
    });

    test ('positive: rebound from the base arrayConcat types the local', () => {
        expect (out).toMatch (/var products \[\]any = /);
        expect (out).toMatch (/i < len\(products\)/);
    });

    test ('negative: a rebind from a boxed value keeps the box', () => {
        expect (out).toMatch (/var boxed any = /);
    });

    test ('negative: a venue override of the producer keeps the box', () => {
        expect (out).toMatch (/var bids any = /);
    });
});

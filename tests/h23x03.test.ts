import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// A sync venue method's `Dict[]` parameter prints `[]any` when every same-file caller passes a `[]any` and every
// element read of it sits in a counting loop over its own length (the plain slice index, no guarded closure).
describe ('go sync venue Dict[] parameter read only in a bounded loop prints []any', () => {
    const root = path.join (__dirname, 'files', 'tmp-h23x03', 'ts', 'src');
    const PRELUDE =
        'type Dict = { [key: string]: any };\n' +
        'class Exchange {\n' +
        '    parseRow (row: any): any { return row; }\n' +
        '    safeString (o: any, k: string): string { return o[k]; }\n' +
        '    safeList (o: any, k: string, d: any[] = undefined): any[] { return o[k]; }\n' +
        '    async fetchRawMarketsPaged (extra: Dict = {}): Promise<Dict[]> { return []; }\n' +
        '}\n';
    const VENUE =
        'class venue extends Exchange {\n' +
        '    filterRows (rows: Dict[], id: string): Dict[] {\n' +
        '        const result: Dict[] = [];\n' +
        '        const n = rows.length;\n' +
        '        for (let i = 0; i < n; i++) {\n' +
        '            const raw = rows[i];\n' +
        '            if (this.safeString (raw, \'id\') === id) {\n' +
        '                result.push (raw);\n' +
        '            }\n' +
        '        }\n' +
        '        return result;\n' +
        '    }\n' +
        '    firstRow (picks: Dict[]): Dict {\n' +
        '        return picks[0];\n' +
        '    }\n' +
        '    nilRows (tested: Dict[]): number {\n' +
        '        if (tested === undefined) {\n' +
        '            return 0;\n' +
        '        }\n' +
        '        for (let i = 0; i < tested.length; i++) {\n' +
        '            this.parseRow (tested[i]);\n' +
        '        }\n' +
        '        return tested.length;\n' +
        '    }\n' +
        '    boxedRows (others: Dict[]): void {\n' +
        '        for (let i = 0; i < others.length; i++) {\n' +
        '            this.parseRow (others[i]);\n' +
        '        }\n' +
        '    }\n' +
        '    async run (id: string, r: any) {\n' +
        '        let rows: Dict[] = [];\n' +
        '        rows = await this.fetchRawMarketsPaged ({});\n' +
        '        rows = this.filterRows (rows, id);\n' +
        '        const count = rows.length;\n' +
        '        const picks: Dict[] = [];\n' +
        '        this.firstRow (picks);\n' +
        '        const tested: Dict[] = [];\n' +
        '        this.nilRows (tested);\n' +
        '        this.boxedRows (this.safeList (r, \'data\'));\n' +
        '        return count;\n' +
        '    }\n' +
        '}\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (root, { recursive: true });
        const file = path.join (root, 'venue.ts');
        fs.writeFileSync (file, PRELUDE + VENUE);
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async', 'asyncMapRowListCallees': [ 'FetchRawMarketsPaged' ] } });
        installCcxtGoLocalTypes (t.goTranspiler);
        out = t.transpileGoByPath (file).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h23x03'), { recursive: true, force: true }));

    test ('positive: the bounded-loop Dict[] parameter prints []any and its reads go native', () => {
        expect (out).toMatch (/func \(this \*venue\) FilterRows\(rows \[\]any, id any\) \[\]any \{/);
        expect (out).toMatch (/var n int = len\(rows\)/);
        expect (out).toMatch (/var raw any = rows\[i\]/);
        expect (out).not.toMatch (/GetValue\(rows, i\)/);
        expect (out).toMatch (/var count int = len\(rows\)/);
    });

    test ('negative: an element read outside a bounded loop keeps the box', () => {
        expect (out).toMatch (/func \(this \*venue\) FirstRow\(picks any\)/);
    });

    test ('negative: a nil-tested parameter keeps the box', () => {
        expect (out).toMatch (/func \(this \*venue\) NilRows\(tested any\)/);
    });

    test ('negative: a caller passing a boxed list keeps the box', () => {
        expect (out).toMatch (/func \(this \*venue\) BoxedRows\(others any\)/);
    });
});

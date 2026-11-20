import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// A `Dict[]` row-list local seeded `[]` and filled from a row-list channel stays `[]any` through
// `x = this.M (x, ..)` (M a sync venue method `(Dict[], ..): Dict[]` that only measures / element-reads it),
// `x = this.arrayConcat (x, y)`, `x = this.arraySlice (x, ..)` and `x = filtered` (a `Dict[]` local seeded `[]`).
describe ('go awaited row-list local passes through a Dict[] venue method and arrayConcat', () => {
    const root = path.join (__dirname, 'files', 'tmp-h22g03', 'ts', 'src');
    const PRELUDE =
        'type Dict = { [key: string]: any };\n' +
        'class Exchange {\n' +
        '    parseRow (row: any): any { return row; }\n' +
        '    arrayConcat (a: any[], b: any[]) { return a.concat (b); }\n' +
        '    arraySlice (a: any, first: any, second: any = undefined) { return a.slice (first, second); }\n' +
        '    safeList (o: any, k: string, d: any[] = undefined): any[] { return o[k]; }\n' +
        '    async fetchRawMarketsPaged (extra: Dict = {}): Promise<Dict[]> { return []; }\n' +
        '}\n';
    const VENUE =
        'class venue extends Exchange {\n' +
        '    filterRows (rows: Dict[], id: string): Dict[] {\n' +
        '        const result: Dict[] = [];\n' +
        '        for (let i = 0; i < rows.length; i++) {\n' +
        '            if (rows[i][\'id\'] === id) {\n' +
        '                result.push (rows[i]);\n' +
        '            }\n' +
        '        }\n' +
        '        return result;\n' +
        '    }\n' +
        '    keepRows (rows: Dict[], id: string): Dict[] {\n' +
        '        if (rows === undefined) {\n' +
        '            return [];\n' +
        '        }\n' +
        '        return rows;\n' +
        '    }\n' +
        '    async viaMethod (id: string) {\n' +
        '        let typedRows: Dict[] = [];\n' +
        '        typedRows = await this.fetchRawMarketsPaged ({});\n' +
        '        typedRows = this.filterRows (typedRows, id);\n' +
        '        const n = typedRows.length;\n' +
        '        for (let i = 0; i < n; i++) {\n' +
        '            this.parseRow (typedRows[i]);\n' +
        '        }\n' +
        '    }\n' +
        '    async viaConcat (r: any) {\n' +
        '        let topics: Dict[] = [];\n' +
        '        topics = await this.fetchRawMarketsPaged ({});\n' +
        '        const data = this.safeList (r, \'data\', []);\n' +
        '        topics = this.arrayConcat (topics, data);\n' +
        '        if (topics.length > 5) {\n' +
        '            topics = this.arraySlice (topics, 0, 5);\n' +
        '        }\n' +
        '        for (let i = 0; i < topics.length; i++) {\n' +
        '            this.parseRow (topics[i]);\n' +
        '        }\n' +
        '    }\n' +
        '    async viaNilTestingMethod (id: string) {\n' +
        '        let tested: Dict[] = [];\n' +
        '        tested = await this.fetchRawMarketsPaged ({});\n' +
        '        tested = this.keepRows (tested, id);\n' +
        '        for (let i = 0; i < tested.length; i++) {\n' +
        '            this.parseRow (tested[i]);\n' +
        '        }\n' +
        '    }\n' +
        '    async viaOtherArg (id: string) {\n' +
        '        let other: Dict[] = [];\n' +
        '        let spare: Dict[] = [];\n' +
        '        other = await this.fetchRawMarketsPaged ({});\n' +
        '        other = this.filterRows (spare, id);\n' +
        '        spare = other;\n' +
        '        for (let i = 0; i < other.length; i++) {\n' +
        '            this.parseRow (other[i]);\n' +
        '        }\n' +
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
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h22g03'), { recursive: true, force: true }));

    test ('positive: a write through a Dict[] venue method keeps the local []any', () => {
        expect (out).toMatch (/var typedRows \[\]any = \[\]any\{\}/);
        expect (out).toMatch (/var n int = len\(typedRows\)/);
        expect (out).toMatch (/this\.ParseRow\(typedRows\[i\]\)/);
        expect (out).not.toMatch (/GetValue\(typedRows, i\)/);
    });

    test ('positive: arrayConcat and arraySlice writes keep the local []any', () => {
        expect (out).toMatch (/var topics \[\]any = \[\]any\{\}/);
        expect (out).toMatch (/len\(topics\)/);
        expect (out).not.toMatch (/GetArrayLength\(topics\)/);
    });

    test ('negative: a method that nil-tests or returns its parameter keeps the box', () => {
        expect (out).toMatch (/var tested any = \[\]any\{\}/);
        expect (out).toMatch (/GetArrayLength\(tested\)/);
    });

    test ('negative: a write from another list or a copy out keeps the box', () => {
        expect (out).toMatch (/var other any = \[\]any\{\}/);
        expect (out).toMatch (/GetArrayLength\(other\)/);
    });
});

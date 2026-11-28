import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// A sync venue method's structure-list parameter (`Transaction[]`) read only in a bounded loop prints `[]any`.
describe ('go sync venue structure-list parameter read only in a bounded loop prints []any', () => {
    const root = path.join (__dirname, 'files', 'tmp-h52g30', 'ts', 'src');
    const PRELUDE =
        'type Dict = { [key: string]: any };\n' +
        'interface Transaction { info: any; id: string; }\n' +
        'class Exchange {\n' +
        '    safeString (o: any, k: string): string { return o[k]; }\n' +
        '    safeDict (o: any, k: string, d: Dict = undefined): Dict { return o[k]; }\n' +
        '    async fetchRawMarketsPaged (extra: Dict = {}): Promise<Dict[]> { return []; }\n' +
        '}\n';
    const VENUE =
        'class venue extends Exchange {\n' +
        '    filterTransactionsByKind (transactions: Transaction[], kind: string): Transaction[] {\n' +
        '        const result = [];\n' +
        '        for (let i = 0; i < transactions.length; i++) {\n' +
        '            const info = this.safeDict (transactions[i], \'info\');\n' +
        '            if (this.safeString (info, \'kind\') === kind) {\n' +
        '                result.push (transactions[i]);\n' +
        '            }\n' +
        '        }\n' +
        '        return result;\n' +
        '    }\n' +
        '    firstTx (picks: Transaction[]): Transaction {\n' +
        '        return picks[0];\n' +
        '    }\n' +
        '    async run (id: string) {\n' +
        '        const transactions: Dict[] = [];\n' +
        '        const t = this.filterTransactionsByKind (transactions, \'DEPOSIT\');\n' +
        '        const picks: Transaction[] = [];\n' +
        '        this.firstTx (picks);\n' +
        '        return t;\n' +
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
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h52g30'), { recursive: true, force: true }));

    test ('positive: the bounded-loop structure-list parameter prints []any and its reads go native', () => {
        expect (out).toMatch (/func \(this \*venue\) FilterTransactionsByKind\(transactions \[\]any, kind string\)/);
        expect (out).toMatch (/SafeMapTyped\(transactions\[i\], "info"\)/);
        expect (out).toMatch (/result = append\(result, transactions\[i\]\)/);
        expect (out).not.toMatch (/GetValue\(transactions, i\)/);
    });

    test ('negative: an element read outside a bounded loop keeps the box', () => {
        expect (out).toMatch (/func \(this \*venue\) FirstTx\(picks any\)/);
        expect (out).toMatch (/GetValue\(picks, 0\)/);
    });
});

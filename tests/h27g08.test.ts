import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// A `[]`-seeded list local whose every write is `[]` or `await this.M (..)` with M's channel carrying a struct
// list (`[]MarketInterface`: the receive is the `*ToList` carrier, rows are maps, nil for a nil slice) prints
// `[]any` when it is only measured and element-read.
describe ('go []-seeded list local filled from struct-list channels', () => {
    const tmp = path.join (__dirname, 'files', 'tmp-h27g08');
    const PRELUDE =
        'type Dict = { [key: string]: any };\n' +
        'type List = any[];\n' +
        'interface Market { id: string; }\n' +
        'class Exchange {\n' +
        '    parseRow (row: any): any { return row; }\n' +
        '    keep (row: any): any { return row; }\n' +
        '    async fetchMarkets (params: Dict = {}): Promise<Market[]> { return []; }\n' +
        '    async fetchSpotMarkets (params: Dict = {}): Promise<Market[]> { return []; }\n' +
        '    async fetchLoose (params: Dict = {}): Promise<any> { return []; }\n' +
        '}\n';
    function go (body: string): string {
        const dir = path.join (tmp, 'ts', 'src');
        fs.mkdirSync (dir, { 'recursive': true });
        const file = path.join (dir, 'venue.ts');
        fs.writeFileSync (file, PRELUDE + 'class venue extends Exchange {\n    async run (type: string) {\n' + body + '\n    }\n}\n');
        const transpiler: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async',
            'asyncStructRowListCallees': { 'FetchMarkets': 'MarketInterfacesToList', 'FetchSpotMarkets': 'MarketInterfacesToList' } } });
        installCcxtGoLocalTypes (transpiler.goTranspiler);
        return transpiler.transpileGoByPath (file).content;
    }
    afterAll (() => fs.rmSync (tmp, { 'recursive': true, 'force': true }));

    test ('positive: measured and element-read local prints []any with native length and index', () => {
        const out = go (
            '        let response: List = [];\n' +
            '        if (type === \'spot\') {\n' +
            '            response = await this.fetchSpotMarkets ({});\n' +
            '        } else {\n' +
            '            response = await this.fetchMarkets ({});\n' +
            '        }\n' +
            '        for (let i = 0; i < response.length; i++) {\n' +
            '            const market = response[i];\n' +
            '            this.parseRow (market);\n' +
            '        }');
        expect (out).toContain ('var response []any = []any{}');
        expect (out).toContain ('i < len(response)');
        expect (out).toContain ('response[i]');
        expect (out).not.toContain ('GetValue(response, i)');
        expect (out).not.toContain ('GetArrayLength(response)');
    });

    test ('negative: a write from an untyped producer keeps the box', () => {
        const out = go (
            '        let rows: List = [];\n' +
            '        if (type === \'spot\') {\n' +
            '            rows = await this.fetchSpotMarkets ({});\n' +
            '        } else {\n' +
            '            rows = await this.fetchLoose ({});\n' +
            '        }\n' +
            '        for (let i = 0; i < rows.length; i++) {\n' +
            '            this.parseRow (rows[i]);\n' +
            '        }');
        expect (out).toContain ('var rows any = []any{}');
    });

    test ('negative: a nil test or an argument hand-off keeps the box (typed nil would differ)', () => {
        const out = go (
            '        let listed: List = [];\n' +
            '        listed = await this.fetchMarkets ({});\n' +
            '        if (listed === undefined) {\n' +
            '            return;\n' +
            '        }\n' +
            '        this.keep (listed);\n' +
            '        for (let i = 0; i < listed.length; i++) {\n' +
            '            this.parseRow (listed[i]);\n' +
            '        }');
        expect (out).toContain ('var listed any = []any{}');
    });
});

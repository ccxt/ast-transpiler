import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// a local ts declares a list, nil-seeded and written only from `this.safeList (c, k, [])` (never nil), prints `[]any`;
// an undeclared local, a write that can be nil, or a nil-testing read keeps the box.
describe ('go nil-seeded list-declared local written from empty-default safeList', () => {
    const root = path.join (__dirname, 'files', 'tmp-h24n04', 'ts', 'src');
    const SRC =
        'type Dict = { [key: string]: any };\n' +
        'type List = any[];\n' +
        'type NullableList = any[] | undefined;\n' +
        'class Exchange {\n' +
        '    safeList (o: any, k: string, d: any[] = undefined): any[] { return o[k]; }\n' +
        '    safeDict (o: any, k: string, d: Dict = undefined): Dict { return o[k]; }\n' +
        '    safeBool (o: any, k: string, d: boolean = undefined): boolean { return o[k]; }\n' +
        '    parseOHLCVs (ohlcvs: any[], market: any = undefined): any[] { return ohlcvs; }\n' +
        '    arrayConcat (a: any[], b: any[]): any[] { return a; }\n' +
        '    async publicGetRows (p: Dict = {}): Promise<any> { return p; }\n' +
        '}\n' +
        'class venue extends Exchange {\n' +
        '    async twoArms (market: Dict, params: Dict = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        let candles: NullableList = undefined;\n' +
        '        if (this.safeBool (market, \'swap\', false)) {\n' +
        '            const data = this.safeDict (response, \'data\', {});\n' +
        '            candles = this.safeList (data, \'candles\', []);\n' +
        '        } else {\n' +
        '            candles = this.safeList (response, \'data\', []);\n' +
        '        }\n' +
        '        return this.parseOHLCVs (candles, market);\n' +
        '    }\n' +
        '    async loopRead (market: Dict, params: Dict = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        let rows: List;\n' +
        '        if (this.safeBool (market, \'swap\', false)) {\n' +
        '            rows = this.safeList (response, \'a\', []);\n' +
        '        } else {\n' +
        '            rows = this.safeList (response, \'b\', []);\n' +
        '        }\n' +
        '        const result = [];\n' +
        '        for (let i = 0; i < rows.length; i++) {\n' +
        '            result.push (rows[i]);\n' +
        '        }\n' +
        '        return result;\n' +
        '    }\n' +
        '    async undeclared (market: Dict, params: Dict = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        let loose = undefined;\n' +
        '        if (this.safeBool (market, \'swap\', false)) {\n' +
        '            loose = this.safeList (response, \'a\', []);\n' +
        '        } else {\n' +
        '            loose = this.safeList (response, \'b\', []);\n' +
        '        }\n' +
        '        return this.parseOHLCVs (loose, market);\n' +
        '    }\n' +
        '    async nilDefault (market: Dict, params: Dict = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        let maybe: NullableList = undefined;\n' +
        '        if (this.safeBool (market, \'swap\', false)) {\n' +
        '            maybe = this.safeList (response, \'a\');\n' +
        '        } else {\n' +
        '            maybe = this.safeList (response, \'b\', []);\n' +
        '        }\n' +
        '        return this.parseOHLCVs (maybe, market);\n' +
        '    }\n' +
        '    async nilTested (market: Dict, params: Dict = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        let tested: NullableList = undefined;\n' +
        '        if (this.safeBool (market, \'swap\', false)) {\n' +
        '            tested = this.safeList (response, \'a\', []);\n' +
        '        } else {\n' +
        '            tested = this.safeDict (response, \'b\', {}) as any;\n' +
        '        }\n' +
        '        if (tested === undefined) {\n' +
        '            return [];\n' +
        '        }\n' +
        '        return this.parseOHLCVs (tested, market);\n' +
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
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h24n04'), { recursive: true, force: true }));
    test ('positive: two empty-default safeList arms type the local as a slice', () => {
        expect (out).toMatch (/var candles \[\]any = nil\n/);
        expect (out).toMatch (/candles = ListTyped\(this\.SafeList\(response, "data", \[\]any\{\}\)\)/);
        expect (out).not.toMatch (/var candles any = nil/);
    });

    test ('negative: an undeclared local keeps the box', () => {
        expect (out).toMatch (/var loose any = nil/);
    });

    test ('negative: a write that can be nil keeps the box', () => {
        expect (out).toMatch (/var maybe any = nil/);
    });

    test ('negative: a write that is not a list keeps the box', () => {
        expect (out).toMatch (/var tested any = nil/);
    });
});

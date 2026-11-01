import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// An awaited list local that the printer declares `[]any` (goAwaitReceiveUnbox) reads its rows as xs[i]:
// a `this.xs` field or `{ xs: v }` key of the same name is not a use of the local, and a callee whose
// channel carries `[]map[string]any` has map rows, never a scalar box.

const PRELUDE =
    'type Dict = { [key: string]: any };\n' +
    'interface Position { symbol: string }\n' +
    'class Exchange {\n' +
    '    positions: any = undefined;\n' +
    '    parseRow (row: any): any { return row; }\n' +
    '    async fetchPositions (symbols: string[] = undefined, params: Dict = {}): Promise<Position[]> { return []; }\n' +
    '    async fetchRawMarketsPaged (extra: Dict = {}): Promise<any[]> { return []; }\n' +
    '}\n';

const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'bg-anyslice-'));

function go (body: string, callees: string[] = []): string {
    const dir = path.join (tmp, 'ts', 'src', 'pro');
    fs.mkdirSync (dir, { 'recursive': true });
    const file = path.join (dir, 'venue.ts');
    fs.writeFileSync (file, PRELUDE + 'class venue extends Exchange {\n    async run (type: string) {\n' + body + '\n    }\n}\n');
    const transpiler: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async', 'asyncMapRowListCallees': callees } });
    installCcxtGoLocalTypes (transpiler.goTranspiler);
    return transpiler.transpileGoByPath (file).content;
}

describe('awaited list locals read natively', () => {
    afterAll(() => {
        fs.rmSync (tmp, { 'recursive': true, 'force': true });
    });

    test('a same-named this.field does not keep the local boxed', () => {
        const out = go (
            '        const positions = await this.fetchPositions (undefined, { type });\n' +
            '        this.positions = new Array ();\n' +
            '        for (let i = 0; i < positions.length; i++) {\n' +
            '            const position = positions[i];\n' +
            '            this.parseRow (position);\n' +
            '        }');
        expect (out).toContain ('var positions []any = ListTyped(');
        expect (out).toContain ('var position any = positions[i]');
        expect (out).not.toContain ('GetValue(positions, i)');
    });

    test('an object-literal key of the same name does not keep the local boxed', () => {
        const out = go (
            '        const positions = await this.fetchPositions ();\n' +
            '        const request = { \'positions\': 1 };\n' +
            '        for (let i = 0; i < positions.length; i++) {\n' +
            '            this.parseRow (positions[i]);\n' +
            '        }');
        expect (out).toContain ('var positions []any = ListTyped(');
        expect (out).not.toContain ('GetValue(positions, i)');
    });

    test('a read of the local that is not a list read keeps the box', () => {
        const out = go (
            '        const positions = await this.fetchPositions ();\n' +
            '        const other = positions;\n' +
            '        this.parseRow (other);\n' +
            '        for (let i = 0; i < positions.length; i++) {\n' +
            '            this.parseRow (positions[i]);\n' +
            '        }');
        expect (out).not.toContain ('var positions []any');
        expect (out).toContain ('GetValue(positions, i)');
    });

    test('a callee the host tables as []map[string]any has map rows', () => {
        const body =
            '        const rows = await this.fetchRawMarketsPaged ({});\n' +
            '        const n = rows.length;\n' +
            '        for (let i = 0; i < rows.length; i++) {\n' +
            '            this.parseRow (rows[i]);\n' +
            '        }';
        const tabled = go (body, [ 'FetchRawMarketsPaged' ]);
        expect (tabled).toContain ('var rows []any = ListTyped(');
        expect (tabled).toContain ('this.ParseRow(rows[i])');
        expect (tabled).not.toContain ('GetValue(rows, i)');
        const untabled = go (body);
        expect (untabled).toContain ('GetValue(rows, i)');
    });

    test('a loop not bounded by the list keeps GetValue', () => {
        const out = go (
            '        const positions = await this.fetchPositions ();\n' +
            '        this.positions = 1;\n' +
            '        for (let i = 0; i < 3; i++) {\n' +
            '            this.parseRow (positions[i]);\n' +
            '        }');
        expect (out).toContain ('GetValue(positions, i)');
    });
});

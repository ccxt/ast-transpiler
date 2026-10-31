import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// RFM-G4 G21 (folded from build/hx10w5-G21.ts): a prediction-tier `list[i]` inside
// `for (let i = 0; i < list.length; i++)` where `list` is `const list = await this.fetchX (..)`
// (the printer declares it `[]any` from the receive) and the awaited TS type is an array of
// objects prints the bare element, not GetValue(list, i). Anything the AST does not prove keeps GetValue.

const PRELUDE =
    'type Dict = { [key: string]: any };\n' +
    'interface Row { id: string }\n' +
    'class Exchange {\n' +
    '    parseRow (row: any): any { return row; }\n' +
    '    async fetchOrders (outcome: string = undefined, params: Dict = {}): Promise<Row[]> { return []; }\n' +
    '    async fetchMyTrades (): Promise<string[]> { return []; }\n' +
    '    async fetchRawEventsList (params: Dict = {}): Promise<Dict[]> { return []; }\n' +
    '}\n';

const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'g21-'));

function go (body: string, tier = 'prediction'): string {
    const dir = path.join (tmp, 'ts', 'src', tier);
    fs.mkdirSync (dir, { 'recursive': true });
    const file = path.join (dir, 'venue.ts');
    fs.writeFileSync (file, PRELUDE + 'class venue extends Exchange {\n    async run (response: Dict) {\n' + body + '\n    }\n}\n');
    const transpiler: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
    installCcxtGoLocalTypes (transpiler.goTranspiler);
    return transpiler.transpileGoByPath (file).content;
}

const READ = 'GetValue(rows, i)';

describe('RFM-G4 G21 bounded reads of awaited object lists in the prediction tier', () => {
    afterAll(() => {
        fs.rmSync (tmp, { 'recursive': true, 'force': true });
    });

    test('an awaited array of objects read under `i < rows.length` is the bare element', () => {
        const out = go (
            '        const rows = await this.fetchOrders ();\n' +
            '        for (let i = 0; i < rows.length; i++) {\n' +
            '            const row = rows[i];\n' +
            '            this.parseRow (row);\n' +
            '        }');
        expect (out).toContain ('var rows []any = ListTyped(');
        expect (out).toContain ('var row any = rows[i]');
        expect (out).not.toContain (READ);
    });

    test('a Dict[] receive qualifies the same way', () => {
        const out = go (
            '        const rows = await this.fetchRawEventsList ({});\n' +
            '        for (let i = 0; i < rows.length; i++) {\n' +
            '            const row = rows[i];\n' +
            '            this.parseRow (row);\n' +
            '        }');
        expect (out).toContain ('var row any = rows[i]');
        expect (out).not.toContain (READ);
    });

    test('a loop not bounded by the list keeps GetValue', () => {
        const out = go (
            '        const rows = await this.fetchOrders ();\n' +
            '        for (let i = 0; i < 3; i++) {\n' +
            '            const row = rows[i];\n' +
            '            this.parseRow (row);\n' +
            '        }');
        expect (out).toContain (READ);
    });

    test('a rebound list keeps GetValue', () => {
        const out = go (
            '        let rows = await this.fetchOrders ();\n' +
            '        for (let i = 0; i < rows.length; i++) {\n' +
            '            rows = [];\n' +
            '            const row = rows[i];\n' +
            '            this.parseRow (row);\n' +
            '        }');
        expect (out).not.toContain ('var row any = rows[i]');
    });

    test('an awaited list of scalars keeps GetValue', () => {
        const out = go (
            '        const rows = await this.fetchMyTrades ();\n' +
            '        for (let i = 0; i < rows.length; i++) {\n' +
            '            const row = rows[i];\n' +
            '            this.parseRow (row);\n' +
            '        }');
        expect (out).toContain ('var rows []any = ListTyped(');
        expect (out).toContain (READ);
    });

    test('a venue file outside the prediction tier is out of this rule', () => {
        const out = go (
            '        const rows = await this.fetchOrders ();\n' +
            '        for (let i = 0; i < rows.length; i++) {\n' +
            '            const row = rows[i];\n' +
            '            this.parseRow (row);\n' +
            '        }', 'pro');
        expect (out).not.toContain ('var row any = rows[i]');
    });
});

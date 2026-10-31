import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

// RFM-G4 GB08: a prediction-tier `list[i]` inside `for (let i = 0; i < list.length; i++)` can never
// leave the slice, so the guard closure (`func() any { if i >= 0 && i < len(list) { return
// DerefScalar(list[i]) } return nil }()`) prints as the element itself, or as DerefScalar(list[i])
// when the elements are not provably dictionaries. Anything the AST does not prove keeps the guard.

const PRELUDE =
    'type Dict = { [key: string]: any };\n' +
    'class Exchange {\n' +
    '    safeList (d: any, k: string, def: any = undefined): any[] { return d[k] ?? def; }\n' +
    '    parseRow (row: any): any { return row; }\n' +
    '    rebuild (): any[] { return []; }\n' +
    '}\n';

const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'gb08-'));

function go (body: string, tier = 'prediction'): string {
    const dir = path.join (tmp, 'ts', 'src', tier);
    fs.mkdirSync (dir, { 'recursive': true });
    const file = path.join (dir, 'venue.ts');
    fs.writeFileSync (file, PRELUDE + 'class venue extends Exchange {\n    run (response: Dict) {\n' + body + '\n    }\n}\n');
    return new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } }).transpileGoByPath (file).content;
}

const GUARD = 'func() any {';

describe('RFM-G4 GB08 bounded list reads in the prediction tier', () => {
    afterAll(() => {
        fs.rmSync (tmp, { 'recursive': true, 'force': true });
    });

    test('a read under `i < list.length` on a SafeList unbox is the bare element', () => {
        const out = go (
            "        const rows = this.safeList (response, 'rows', []);\n" +
            '        for (let i = 0; i < rows.length; i++) {\n' +
            '            const row = rows[i];\n' +
            '            this.parseRow (row);\n' +
            '        }');
        expect (out).toContain ('var row any = rows[i]');
        expect (out).not.toContain (GUARD);
        expect (out).not.toContain ('DerefScalar(rows[i])');
    });

    test('a hoisted `const n = list.length` bound proves the read too', () => {
        const out = go (
            "        const rows = this.safeList (response, 'rows', []);\n" +
            '        const rowsLength = rows.length;\n' +
            '        for (let i = 0; i < rowsLength; i++) {\n' +
            '            const row = rows[i];\n' +
            '            this.parseRow (row);\n' +
            '        }');
        expect (out).toContain ('var row any = rows[i]');
        expect (out).not.toContain (GUARD);
    });

    test('elements that are not provably dictionaries keep the DerefScalar but lose the guard', () => {
        const out = go (
            '        const rows: any[] = [];\n' +
            "        rows.push (this.parseRow (response['x']));\n" +
            "        rows.push ('plain');\n" +
            '        for (let i = 0; i < rows.length; i++) {\n' +
            '            const row = rows[i];\n' +
            '            this.parseRow (row);\n' +
            '        }');
        expect (out).toContain ('DerefScalar(rows[i])');
        expect (out).not.toContain (GUARD);
    });

    test('a loop not bounded by the list keeps the guard', () => {
        const out = go (
            "        const rows = this.safeList (response, 'rows', []);\n" +
            '        for (let i = 0; i < 3; i++) {\n' +
            '            const row = rows[i];\n' +
            '            this.parseRow (row);\n' +
            '        }');
        expect (out).toContain (GUARD);
    });

    test('a counter that moves in the body keeps the guard', () => {
        const out = go (
            "        const rows = this.safeList (response, 'rows', []);\n" +
            '        for (let i = 0; i < rows.length; i++) {\n' +
            '            i += 2;\n' +
            '            const row = rows[i];\n' +
            '            this.parseRow (row);\n' +
            '        }');
        expect (out).toContain (GUARD);
    });

    test('a rebound list keeps the guard', () => {
        const out = go (
            "        let rows = this.safeList (response, 'rows', []);\n" +
            '        for (let i = 0; i < rows.length; i++) {\n' +
            '            rows = this.rebuild ();\n' +
            '            const row = rows[i];\n' +
            '            this.parseRow (row);\n' +
            '        }');
        expect (out).not.toContain ('rows[i]'); // no native read: the list is not proven a slice either
    });

    test('a list that shrinks inside the loop keeps the guard', () => {
        const out = go (
            "        const rows = this.safeList (response, 'rows', []);\n" +
            '        for (let i = 0; i < rows.length; i++) {\n' +
            '            rows.pop ();\n' +
            '            const row = rows[i];\n' +
            '            this.parseRow (row);\n' +
            '        }');
        expect (out).not.toContain ('rows[i]'); // no native read: the list is not proven a slice either
    });

    test('a venue file outside the prediction tier is out of this rule', () => {
        const out = go (
            "        const rows = this.safeList (response, 'rows', []);\n" +
            '        for (let i = 0; i < rows.length; i++) {\n' +
            '            const row = rows[i];\n' +
            '            this.parseRow (row);\n' +
            '        }', 'pro');
        expect (out).toContain (GUARD);
    });
});

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler.js';
import { installCcxtGoLocalTypes, installFmGo5G01 } from '../src/goTranspiler.js';

const t = () => {
    const x = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    installCcxtGoLocalTypes (x.goTranspiler);
    installFmGo5G01 (x.goTranspiler);
    return x;
};
const src = (body: string) => [
    'type Dict = { [key: string]: any };',
    'class Client { }',
    'class Base {',
    '    safeDict (a: any, b: any, c: any = undefined) { return undefined; }',
    '    safeList (a: any, b: any, c: any = undefined) { return undefined; }',
    '    safeString (a: any, b: any, c: any = undefined) { return undefined; }',
    '    handleMessage (client: Client, message: any) { }',
    '}',
    'class ex extends Base {',
    body,
    '}',
    '',
].join ('\n');
const go = (body: string) => {
    // a fresh tree per case: the sibling-file scan indexes the tree once
    const full = path.join (fs.mkdtempSync (path.join (os.tmpdir (), 'h29g24-')), 'ts/src/pro/ex.ts');
    fs.mkdirSync (path.dirname (full), { recursive: true });
    fs.writeFileSync (full, src (body));
    return t ().transpileGoByPath (full).content as string;
};
const dispatch = [
    '    override handleMessage (client: Client, message: Dict) {',
    '        const e = this.safeString (message, \'e\');',
    '        if (e === \'t\') {',
    '            this.handleTrade (client, message);',
    '        }',
    '    }',
].join ('\n');
const handler = (body: string) => '    handleTrade (client: Client, message: Dict) {\n' + body + '\n    }';
const loop = '        const rows = this.safeList (message, \'rows\');\n        const out = [];\n        for (let i = 0; i < rows.length; i++) {\n            const row = this.safeDict (rows, i);\n            out.push (this.safeString (row, \'a\'));\n        }\n';

const elem = (extra: string) => '        const data = this.safeDict (message, \'data\', {});\n        const rows = this.safeList (data, \'rows\', []);\n' + extra + '        for (let i = 0; i < rows.length; i++) {\n            const row = rows[i];\n            this.useRow (row);\n        }';
const useRow = '\n    useRow (row: any) { return row; }';

describe ('h29 G24 frame list elements need no DerefScalar', () => {
    test ('an element of a read-only frame list is the plain index (fails on the base printer)', () => {
        const out = go (dispatch + '\n' + handler (elem ('')) + useRow);
        expect (out).toContain ('var row any = rows[i]');
        expect (out).not.toContain ('DerefScalar(rows[i])');
    });
    test ('negative: a frame list that is pushed a string pointer keeps DerefScalar', () => {
        const out = go (dispatch + '\n' + handler (elem ('        rows.push (this.safeString (message, \'x\'));\n')) + useRow);
        expect (out).not.toContain ('var row any = rows[i]');
    });
    test ('negative: a handler also called with a built dict keeps DerefScalar', () => {
        const out = go (dispatch + '\n' + handler (elem ('')) + useRow
            + '\n    other (client: Client) {\n        const m: Dict = { \'data\': { \'rows\': [ this.safeString ({}, \'a\') ] } };\n        this.handleTrade (client, m);\n    }');
        expect (out).not.toContain ('var row any = rows[i]');
    });
});

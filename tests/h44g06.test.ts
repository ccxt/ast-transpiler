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
    '    balance: Dict = {};',
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
const root = fs.mkdtempSync (path.join (process.env.TMPDIR ?? os.tmpdir (), 'h44g06-'));
let seq = 0;
const go = (body: string) => {
    const full = path.join (root, 'ts/src/pro/venue' + (seq++) + '.ts');
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
const lengthBody = '        const result = this.safeList (message, \'result\', []);\n        this.balance[\'info\'] = result;\n        return result.length;';

afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

describe ('h44 G06 unannotated safeList (frame, k, []) seed', () => {
    test ('positive: a decoded frame seed prints the comma-ok read with the []any{} default', () => {
        const out = go (dispatch + '\n' + handler (lengthBody));
        expect (out).toContain ('\tvar result []any\n\tresult, _ = message["result"].([]any)\n\tif result == nil {\n\t\tresult = []any{}\n\t}');
        expect (out).not.toContain ('SafeListSlice(message');
    });
    test ('negative: a plain (non-frame) parameter keeps the SafeList seed', () => {
        const out = go ('    helper (message: Dict) {\n' + lengthBody + '\n    }');
        expect (out).not.toContain ('message["result"].([]any)');
        expect (out).toContain ('this.SafeList(message, "result", []any{})');
    });
    test ('negative: no default (nil-able) keeps the box', () => {
        const out = go (dispatch + '\n' + handler ('        const rows = this.safeList (message, \'rows\');\n        let out = undefined;\n        if (rows !== undefined) {\n            out = rows;\n        }\n        return out;'));
        expect (out).not.toContain ('rows = []any{}');
    });
    test ('negative: a variable key keeps the box', () => {
        const out = go (dispatch + '\n' + handler ('        const k = this.safeString (message, \'k\');\n        const rows = this.safeList (message, k, []);\n        return rows.length;'));
        expect (out).not.toContain ('rows = []any{}');
    });
    test ('negative: a frame written by the handler keeps the box', () => {
        const out = go (dispatch + '\n' + handler ('        message[\'rows\'] = [ 1 ];\n' + lengthBody));
        expect (out).not.toContain ('message["result"].([]any)');
    });
    test ('re-entry: a seed whose receiver is cut from another seed transpiles without recursion', () => {
        const body = '        const data = this.safeList (message, \'data\', []);\n        const first = this.safeDict (data, 0);\n        const rows = this.safeList (first, \'rows\', []);\n        let r = this.safeList (message, \'r\', []);\n        r = this.safeList (r, \'x\', []);\n        return rows.length + data.length + r.length;';
        expect (() => go (dispatch + '\n' + handler (body))).not.toThrow ();
    });
});

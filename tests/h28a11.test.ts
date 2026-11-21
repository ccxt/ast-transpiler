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
    '    safeValue (a: any, b: any, c: any = undefined) { return undefined; }',
    '    handleMessage (client: Client, message: any) { }',
    '}',
    'class ex extends Base {',
    body,
    '}',
    '',
].join ('\n');
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h28a11-'));
let seq = 0;
const go = (body: string) => {
    const full = path.join (root, 'ts/src/pro/ex' + (seq++) + '.ts');
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
const handler = (body: string) => [
    '    handleTrade (client: Client, message: Dict) {',
    body,
    '    }',
].join ('\n');

describe ('h28 A11 defaulted frame list reads', () => {
    test ('a [] defaulted frame list the printer reads as SafeListTyped is the comma-ok assertion (fails on the base printer)', () => {
        const out = go (dispatch + '\n' + handler ('        const rows = this.safeList (message, \'rows\', []);\n        for (let i = 0; i < rows.length; i++) {\n            this.safeString (rows[i], \'a\');\n        }\n        return rows.length;'));
        expect (out).toContain ('var rows, _ = message["rows"].([]any)');
        expect (out).not.toContain ('SafeListTyped(message, "rows")');
    });
    test ('negative: a [] defaulted list from a handler called with a built dict is not asserted', () => {
        const out = go (dispatch + '\n' + handler ('        const rows = this.safeList (message, \'rows\', []);\n        return rows.length;')
            + '\n    other (client: Client) {\n        const m: Dict = { \'rows\': [] };\n        this.handleTrade (client, m);\n    }');
        expect (out).not.toContain ('message["rows"].([]any)');
    });
    test ('negative: a [] defaulted list from a frame the handler writes is not asserted', () => {
        const out = go (dispatch + '\n' + handler ('        message[\'rows\'] = [];\n        const rows = this.safeList (message, \'rows\', []);\n        return rows.length;'));
        expect (out).not.toContain ('message["rows"].([]any)');
    });
    test ('negative: a non-empty default is not asserted', () => {
        const out = go (dispatch + '\n' + handler ('        const rows = this.safeList (message, \'rows\', [ 1 ]);\n        return rows.length;'));
        expect (out).not.toContain ('message["rows"].([]any)');
    });
    test ('negative: a variable key is not asserted', () => {
        const out = go (dispatch + '\n' + handler ('        const k = this.safeString (message, \'k\');\n        const rows = this.safeList (message, k, []);\n        return rows.length;'));
        expect (out).not.toContain ('].([]any)');
    });
});

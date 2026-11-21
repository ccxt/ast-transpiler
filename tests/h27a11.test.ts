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
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h27a11-'));
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

describe ('h27 A11 ws frame nested reads', () => {
    test ('a handler frame map member reads with the comma-ok assertion (fails on the base printer)', () => {
        const out = go (dispatch + '\n' + handler ('        const data = this.safeDict (message, \'data\');\n        const rows = this.safeList (data, \'rows\');\n        return [ this.safeString (data, \'a\'), rows.length ];'));
        expect (out).toContain ('var data, _ = message["data"].(map[string]any)');
        expect (out).toContain ('var rows, _ = data["rows"].([]any)');
        expect (out).not.toContain ('SafeMapTyped(message');
    });
    test ('negative: a handler called with a built dict keeps the wrap', () => {
        const out = go (dispatch + '\n' + handler ('        const data = this.safeDict (message, \'data\');\n        return this.safeString (data, \'a\');')
            + '\n    other (client: Client) {\n        const m: Dict = { \'data\': {} };\n        this.handleTrade (client, m);\n    }');
        expect (out).not.toContain ('message["data"].(map[string]any)');
    });
    test ('negative: a frame written by the handler keeps the wrap', () => {
        const out = go (dispatch + '\n' + handler ('        message[\'data\'] = { \'a\': 1 };\n        const data = this.safeDict (message, \'data\');\n        return this.safeString (data, \'a\');'));
        expect (out).not.toContain ('message["data"].(map[string]any)');
    });
    test ('negative: a variable key keeps the wrap', () => {
        const out = go (dispatch + '\n' + handler ('        const k = this.safeString (message, \'k\');\n        const data = this.safeDict (message, k);\n        return this.safeString (data, \'a\');'));
        expect (out).not.toContain ('].(map[string]any)');
    });
});
describe ('h27 A11 defaulted reads', () => {
    test ('negative: a [] default keeps its non-nil answer', () => {
        const out = go (dispatch + '\n' + handler ('        const rows = this.safeList (message, \'rows\', []);\n        return rows.length;'));
        expect (out).not.toContain ('message["rows"].([]any)');
    });
    test ('negative: a nil-tested member read from a non-frame parameter keeps the wrap', () => {
        const out = go ('    helper (client: Client, message: Dict) {\n        const data = this.safeDict (message, \'data\');\n        if (data === undefined) {\n            return 0;\n        }\n        return 1;\n    }');
        expect (out).not.toContain ('message["data"].(map[string]any)');
    });
});

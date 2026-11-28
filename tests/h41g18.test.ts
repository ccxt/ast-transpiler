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
    'type List = any[];',
    'class Client { }',
    'class Base {',
    '    safeDict (a: any, b: any, c: any = undefined) { return undefined; }',
    '    safeList (a: any, b: any, c: any = undefined): any[] | undefined { return undefined; }',
    '    safeString (a: any, b: any, c: any = undefined) { return undefined; }',
    '    safeValue (a: any, b: any, c: any = undefined): any { return undefined; }',
    '    handleMessage (client: Client, message: any) { }',
    '}',
    'class ex extends Base {',
    body,
    '}',
    '',
].join ('\n');
// one tree per case: a handler named in a sibling fixture file is vetoed as named elsewhere
const roots: string[] = [];
const go = (body: string) => {
    const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h41g18-'));
    roots.push (root);
    const full = path.join (root, 'ts/src/pro/ex.ts');
    fs.mkdirSync (path.dirname (full), { recursive: true });
    fs.writeFileSync (full, src (body));
    return t ().transpileGoByPath (full).content as string;
};
const dispatch = (write: string) => [
    '    override handleMessage (client: Client, message: Dict) {',
    '        const payload = this.safeString (message, \'o\');',
    '        if (payload === undefined) {',
    '            return;',
    '        }',
    write,
    '        const methods: Dict = {',
    '            \'t\': this.handleTrade,',
    '        };',
    '        const method = this.safeValue (methods, this.safeString (message, \'n\'));',
    '        if (method !== undefined) {',
    '            method.call (this, client, message);',
    '        }',
    '    }',
].join ('\n');
const handler = [
    '    handleTrade (client: Client, message: Dict) {',
    '        const rows = this.safeList (message, \'o\') as List;',
    '        return rows.length;',
    '    }',
].join ('\n');

describe ('H41-G18 a dispatch-table frame whose handleMessage stores only JSON.parse results', () => {
    afterAll (() => roots.forEach ((r) => fs.rmSync (r, { recursive: true, force: true })));
    test ('positive: `message[lit] = JSON.parse (x)` keeps the frame proof (fails on the base printer)', () => {
        const out = go (dispatch ('        message[\'o\'] = JSON.parse (payload);') + '\n' + handler);
        expect (out).toMatch (/rows, _ = message\["o"\]\.\(\[\]any\)/);
        expect (out).not.toContain ('SafeListTyped(message');
    });
    test ('negative: a non-JSON value stored into the frame keeps the wrap', () => {
        const out = go (dispatch ('        message[\'o\'] = JSON.parse (payload);\n        message[\'p\'] = this;') + '\n' + handler);
        expect (out).not.toContain ('message["o"].([]any)');
    });
    test ('negative: a JSON.parse write into a nested member keeps the wrap', () => {
        const out = go (dispatch ('        message[\'o\'][\'x\'] = JSON.parse (payload);') + '\n' + handler);
        expect (out).not.toContain ('message["o"].([]any)');
    });
    test ('negative: a rebound frame keeps the wrap', () => {
        const out = go (dispatch ('        message[\'o\'] = JSON.parse (payload);\n        message = {};') + '\n' + handler);
        expect (out).not.toContain ('message["o"].([]any)');
    });
});

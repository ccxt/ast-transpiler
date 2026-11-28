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
    'type NullableList = any[] | undefined;',
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
const root = fs.mkdtempSync (path.join (process.env.TMPDIR ?? os.tmpdir (), 'h48g37-'));
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
const assign = [
    '        let rows: NullableList = undefined;',
    '        const e = this.safeString (message, \'e\');',
    '        if (e === \'a\') {',
    '            rows = [];',
    '        } else {',
    '            rows = this.safeList (message, \'data\', []);',
    '        }',
    '        return rows.length;',
].join ('\n');

describe ('h48g37: []-defaulted list assigned from a ws frame', () => {
    test ('an assignment from the frame reads with the comma-ok assertion (fails on the base printer)', () => {
        const out = go (dispatch + '\n' + handler (assign));
        expect (out).toContain ('rows, _ = message["data"].([]any)\n');
        expect (out).not.toContain ('SafeListSlice(message, "data"');
    });
    test ('negative: a handler also called with a built dict keeps the wrap', () => {
        const out = go (dispatch + '\n' + handler (assign)
            + '\n    other (client: Client) {\n        const m: Dict = { \'data\': [] };\n        this.handleTrade (client, m);\n    }');
        expect (out).not.toContain ('message["data"].([]any)');
    });
    test ('negative: a frame written by the handler keeps the wrap', () => {
        const out = go (dispatch + '\n' + handler ('        message[\'data\'] = [ 1 ];\n' + assign));
        expect (out).not.toContain ('message["data"].([]any)');
    });
    test ('negative: a non-frame parameter keeps the wrap', () => {
        const out = go ('    helper (client: Client, message: Dict) {\n' + assign + '\n    }');
        expect (out).not.toContain ('message["data"].([]any)');
    });
});

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
    '    extend (a: any, b: any) { return undefined; }',
    '    handleMessage (client: Client, message: any) { }',
    '}',
    'class ex extends Base {',
    body,
    '}',
    '',
].join ('\n');
const root = fs.mkdtempSync (path.join (process.env.TMPDIR ?? os.tmpdir (), 'h29a14-'));
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

describe ('h29 A14 defaulted frame reads', () => {
    test ('a {}-defaulted frame member reads with the comma-ok assertion and the empty fallback (fails on the base printer)', () => {
        const out = go (dispatch + '\n' + handler ('        const data = this.safeDict (message, \'data\', {});\n        const m = this.extend (data, {});\n        return [ this.safeString (data, \'a\'), m ];'));
        expect (out).toContain ('\tvar data map[string]any\n\tdata, _ = message["data"].(map[string]any)\n\tif data == nil {\n\t\tdata = map[string]any{}\n\t}');
        expect (out).not.toContain ('SafeDict(message');
    });
    test ('negative: a handler called with a built dict keeps the wrap', () => {
        const out = go (dispatch + '\n' + handler ('        const data = this.safeDict (message, \'data\', {});\n        return this.safeString (data, \'a\');')
            + '\n    other (client: Client) {\n        const m: Dict = { \'data\': {} };\n        this.handleTrade (client, m);\n    }');
        expect (out).not.toContain ('message["data"].(map[string]any)');
    });
    test ('negative: a frame written by the handler keeps the wrap', () => {
        const out = go (dispatch + '\n' + handler ('        message[\'data\'] = { \'a\': 1 };\n        const data = this.safeDict (message, \'data\', {});\n        return this.safeString (data, \'a\');'));
        expect (out).not.toContain ('message["data"].(map[string]any)');
    });
    test ('negative: a non-empty default keeps the wrap', () => {
        const out = go (dispatch + '\n' + handler ('        const data = this.safeDict (message, \'data\', { \'a\': 1 });\n        return this.safeString (data, \'a\');'));
        expect (out).not.toContain ('message["data"].(map[string]any)');
    });
    test ('negative: a non-frame parameter keeps the wrap', () => {
        const out = go ('    helper (client: Client, message: Dict) {\n        const data = this.safeDict (message, \'data\', {});\n        return this.safeString (data, \'a\');\n    }');
        expect (out).not.toContain ('message["data"].(map[string]any)');
    });
});

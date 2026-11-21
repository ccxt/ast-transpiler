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
    '    parseRow (a: Dict) { return a; }',
    '    handleMessage (client: Client, message: any) { }',
    '}',
    'class ex extends Base {',
    body,
    '}',
    '',
].join ('\n');
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h29a13-'));
let seq = 0;
const go = (body: string) => {
    const full = path.join (root, String (seq++), 'ts/src/pro/ex.ts'); // one tree per case: handlers of one name in sibling files void the frame proof
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

describe ('h29 A13 frame dict reads', () => {
    test ('a two-argument safeDict on a dispatched frame handed to a Dict parameter is the comma-ok read (fails on the base printer)', () => {
        const out = go (dispatch + '\n' + handler ('        const data = this.safeDict (message, \'feed\');\n        const row = this.parseRow (data);\n        return row;'));
        expect (out).toContain ('var data, _ = message["feed"].(map[string]any)');
        expect (out).not.toContain ('SafeMapTyped(message, "feed")');
    });
    test ('a self-defaulted safeDict on a dispatched frame reads the member or falls back to the frame', () => {
        const out = go (dispatch + '\n' + handler ('        const data: Dict = this.safeDict (message, \'a\', message);\n        const rows: Dict[] = this.safeList (data, \'B\', []);\n        return rows.length;'));
        expect (out).toContain ('data, _ = message["a"].(map[string]any)');
        expect (out).toContain ('data = message');
    });
    test ('negative: a handler also called with a built dict keeps the wrap', () => {
        const out = go (dispatch + '\n' + handler ('        const data = this.safeDict (message, \'feed\');\n        return this.parseRow (data);')
            + '\n    other (client: Client) {\n        const m: Dict = { \'feed\': {} };\n        this.handleTrade (client, m);\n    }');
        expect (out).not.toContain ('message["feed"].(map[string]any)');
    });
    test ('negative: a frame written into keeps the wrap', () => {
        const out = go (dispatch + '\n' + handler ('        message[\'x\'] = 1;\n        const data = this.safeDict (message, \'feed\');\n        return this.parseRow (data);'));
        expect (out).not.toContain ('message["feed"].(map[string]any)');
    });
    test ('negative: a computed key keeps the wrap', () => {
        const out = go (dispatch + '\n' + handler ('        const k = this.safeString (message, \'k\');\n        const data = this.safeDict (message, k);\n        return this.parseRow (data);'));
        expect (out).not.toContain ('].(map[string]any)');
    });
});

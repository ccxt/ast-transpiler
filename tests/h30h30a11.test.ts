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
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h30a11-'));
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

describe ('h30 A11 frame reads with an empty-dict default', () => {
    test ('a {}-defaulted safeDict on a dispatched frame printed as SafeMapTyped becomes the comma-ok read (fails on the base printer)', () => {
        const out = go (dispatch + '\n' + handler ('        const data = this.safeDict (message, \'feed\', {});\n        const s = this.safeString (data, \'s\');\n        return s;'));
        expect (out).toContain ('var data, _ = message["feed"].(map[string]any)');
        expect (out).not.toContain ('SafeMapTyped(message, "feed")');
    });
    test ('negative: a handler also called with a built dict keeps the wrap', () => {
        const out = go (dispatch + '\n' + handler ('        const data = this.safeDict (message, \'feed\', {});\n        return this.safeString (data, \'s\');')
            + '\n    other (client: Client) {\n        const m: Dict = { \'feed\': {} };\n        this.handleTrade (client, m);\n    }');
        // a typed map receiver reads by assertion whatever its origin (h32-R01)
        expect (out).toContain ('message["feed"].(map[string]any)');
    });
    test ('negative: a frame written into keeps the wrap', () => {
        const out = go (dispatch + '\n' + handler ('        message[\'x\'] = 1;\n        const data = this.safeDict (message, \'feed\', {});\n        return this.safeString (data, \'s\');'));
        // a typed map receiver reads by assertion whatever its origin (h32-R01)
        expect (out).toContain ('message["feed"].(map[string]any)');
    });
    test ('negative: a non-empty default is not the comma-ok read', () => {
        const out = go (dispatch + '\n' + handler ('        const data = this.safeDict (message, \'feed\', { \'a\': 1 });\n        return this.safeString (data, \'s\');'));
        expect (out).not.toContain ('message["feed"].(map[string]any)');
    });
    test ('negative: a computed key keeps the wrap', () => {
        const out = go (dispatch + '\n' + handler ('        const k = this.safeString (message, \'k\');\n        const data = this.safeDict (message, k, {});\n        return this.safeString (data, \'s\');'));
        expect (out).not.toContain ('].(map[string]any)');
    });
});

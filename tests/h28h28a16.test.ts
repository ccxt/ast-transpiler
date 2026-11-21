import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler.js';
import { installCcxtGoLocalTypes, installFmGo5G01 } from '../src/goTranspiler.js';

// `this.handleDeltas (side, this.safeList (C, 'k', []))` on a JSON-origin map C hoists the comma-ok list read
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
    '    handleDeltas (bookside: any, deltas: any[]) { }',
    '    handleMessage (client: Client, message: any) { }',
    '}',
    'class ex extends Base {',
    '    override handleMessage (client: Client, message: Dict) {',
    '        const e = this.safeString (message, \'e\');',
    '        if (e === \'t\') {',
    '            this.handleBook (client, message);',
    '        }',
    '    }',
    body,
    '}',
    '',
].join ('\n');
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h28a16-'));
let seq = 0;
const go = (body: string) => {
    const full = path.join (root, 'ts/src/pro/ex' + (seq++) + '.ts');
    fs.mkdirSync (path.dirname (full), { recursive: true });
    fs.writeFileSync (full, src (body));
    return t ().transpileGoByPath (full).content as string;
};
const handler = (body: string) => '    handleBook (client: Client, message: Dict) {\n        const book: any = {};\n' + body + '\n    }';

describe ('h28 A16 handleDeltas list arguments', () => {
    test ('a frame member list is read natively with its [] default (fails on the base printer)', () => {
        const out = go (handler ('        const data = this.safeDict (message, \'data\');\n        this.handleDeltas (book, this.safeList (data, \'asks\', []));'));
        expect (out).toMatch (/\tvar deltas\d+ \[\]any\n\tdeltas\d+, _ = data\["asks"\]\.\(\[\]any\)\n\tif deltas\d+ == nil \{\n\t\tdeltas\d+ = \[\]any\{\}\n\t\}\n\tthis\.HandleDeltas\(book, deltas\d+\)/);
        expect (out).not.toContain ('SafeListSlice(data');
    });
    test ('negative: a frame written by the handler keeps the wrap', () => {
        const out = go (handler ('        message[\'data\'] = {};\n        this.handleDeltas (book, this.safeList (message, \'asks\', []));'));
        expect (out).not.toContain ('message["asks"].([]any)');
    });
    test ('negative: a non-frame parameter keeps the wrap', () => {
        const out = go (handler ('') + '\n    helper (m: Dict) {\n        this.handleDeltas ({}, this.safeList (m, \'asks\', []));\n    }');
        expect (out).not.toContain ('m["asks"].([]any)');
    });
    test ('negative: a variable key keeps the wrap', () => {
        const out = go (handler ('        const k = this.safeString (message, \'k\');\n        this.handleDeltas (book, this.safeList (message, k, []));'));
        expect (out).not.toContain ('].([]any)');
    });
});

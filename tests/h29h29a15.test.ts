import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler.js';
import { installCcxtGoLocalTypes, installFmGo5G01 } from '../src/goTranspiler.js';

// a never-written `safeDict (frame, 'lit', {})` local is a frame container for the comma-ok reads
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
    '    parseOrderBook (o: any, s: any, t: any = undefined, b: any = undefined, a: any = undefined) { return {}; }',
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
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h29a15-'));
let seq = 0;
const go = (body: string) => {
    const full = path.join (root, 'ts/src/pro/ex' + (seq++) + '.ts');
    fs.mkdirSync (path.dirname (full), { recursive: true });
    fs.writeFileSync (full, src (body));
    return t ().transpileGoByPath (full).content as string;
};
const handler = (body: string) => '    handleBook (client: Client, message: Dict) {\n        const book: any = {};\n' + body + '\n    }';

describe ('h29 A15 {}-defaulted frame sub-dict', () => {
    test ('a {}-defaulted frame sub-dict feeds the native deltas read (fails on the base printer)', () => {
        const out = go (handler ('        const data = this.safeDict (message, \'data\', {});\n        const snap = this.parseOrderBook (data, \'s\');\n        this.handleDeltas (book, this.safeList (data, \'asks\', []));'));
        expect (out).toMatch (/\tvar deltas\d+ \[\]any\n\tdeltas\d+, _ = data\["asks"\]\.\(\[\]any\)\n\tif deltas\d+ == nil \{\n\t\tdeltas\d+ = \[\]any\{\}\n\t\}\n\tthis\.HandleDeltas\(book, deltas\d+\)/);
        expect (out).not.toContain ('SafeList(data');
    });
    test ('negative: a {}-defaulted sub-dict written by the handler keeps the wrap', () => {
        const out = go (handler ('        const data = this.safeDict (message, \'data\', {});\n        data[\'x\'] = 1;\n        this.handleDeltas (book, this.safeList (data, \'asks\', []));'));
        expect (out).not.toContain ('data["asks"].([]any)');
    });
    test ('negative: a {}-defaulted sub-dict of a non-frame parameter keeps the wrap', () => {
        const out = go (handler ('') + '\n    helper (m: Dict) {\n        const data = this.safeDict (m, \'data\', {});\n        this.handleDeltas ({}, this.safeList (data, \'asks\', []));\n    }');
        expect (out).not.toContain ('data["asks"].([]any)');
    });
    test ('negative: a non-empty default keeps the wrap', () => {
        const out = go (handler ('        const data = this.safeDict (message, \'data\', { \'a\': 1 });\n        this.handleDeltas (book, this.safeList (data, \'asks\', []));'));
        expect (out).not.toContain ('data["asks"].([]any)');
    });
});

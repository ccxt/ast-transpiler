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
    '    safeString (a: any, b: any, c: any = undefined) { return undefined; }',
    '    parseAny (a, b = undefined) { return a; }',
    '    handleMessage (client: Client, message: any) { }',
    '}',
    'class ex extends Base {',
    body,
    '}',
    '',
].join ('\n');
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h30t06-'));
let seq = 0;
const go = (body: string) => {
    const full = path.join (root, String (seq++), 'ts/src/pro/ex.ts');
    fs.mkdirSync (path.dirname (full), { recursive: true });
    fs.writeFileSync (full, src (body));
    return t ().transpileGoByPath (full).content as string;
};
const dispatch = [
    '    override handleMessage (client: Client, message: Dict) {',
    '        if (this.safeString (message, \'e\') === \'t\') {',
    '            this.handleBook (client, message);',
    '        }',
    '    }',
].join ('\n');
const handler = (body: string) => '    handleBook (client: Client, message: Dict) {\n' + body + '\n    }';

describe ('h30 T06 Dict-annotated self-default frame reads', () => {
    test ('a Dict-annotated self-default safeDict handed to an any parameter is the comma-ok read with the frame fallback (fails on the base printer)', () => {
        const out = go (dispatch + '\n' + handler ('        const book: Dict = this.safeDict (message, \'depth\', message);\n        return this.parseAny (book, \'x\');'));
        expect (out).toContain ('book, _ = message["depth"].(map[string]any)');
        expect (out).toContain ('book = message');
        expect (out).not.toContain ('this.SafeDict(message, "depth", message)');
    });
    test ('negative: the local is written through', () => {
        const out = go (dispatch + '\n' + handler ('        const book: Dict = this.safeDict (message, \'depth\', message);\n        book[\'x\'] = 1;\n        return this.parseAny (book, \'x\');'));
        expect (out).not.toContain ('message["depth"].(map[string]any)');
    });
    test ('negative: the local is nil-tested', () => {
        const out = go (dispatch + '\n' + handler ('        const book: Dict = this.safeDict (message, \'depth\', message);\n        if (book === undefined) {\n            return undefined;\n        }\n        return this.parseAny (book, \'x\');'));
        expect (out).not.toContain ('message["depth"].(map[string]any)');
    });
    test ('negative: the handler is also called with a built dict', () => {
        const out = go (dispatch + '\n' + handler ('        const book: Dict = this.safeDict (message, \'depth\', message);\n        return this.parseAny (book, \'x\');')
            + '\n    other (client: Client) {\n        const m: Dict = { \'depth\': {} };\n        this.handleBook (client, m);\n    }');
        expect (out).not.toContain ('message["depth"].(map[string]any)');
    });
    test ('negative: an unannotated local is left to the existing rules', () => {
        const out = go (dispatch + '\n' + handler ('        const book = this.safeDict (message, \'depth\', message);\n        return this.parseAny (book, \'x\');'));
        expect (out).not.toContain ('message["depth"].(map[string]any)');
    });
});

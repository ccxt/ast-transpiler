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
const roots: string[] = [];
const go = (body: string) => {
    const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h42g12-'));
    roots.push (root);
    const full = path.join (root, 'ts/src/pro/ex.ts');
    fs.mkdirSync (path.dirname (full), { recursive: true });
    fs.writeFileSync (full, src (body));
    return t ().transpileGoByPath (full).content as string;
};
const dispatch = [
    '    override handleMessage (client: Client, message: Dict) {',
    '        const methods: Dict = {',
    '            \'t\': this.handleTrade,',
    '        };',
    '        const method = this.safeValue (methods, this.safeString (message, \'n\'));',
    '        if (method !== undefined) {',
    '            method.call (this, client, message);',
    '        }',
    '    }',
].join ('\n');
const keep = '    keep (x: any) { return x; }\n';
const handler = (decl: string, use = '        return rows.length;') => dispatch + '\n' + [
    '    handleTrade (client: Client, message: Dict) {',
    decl,
    use,
    '    }',
].join ('\n');

describe ('H42-G12 untyped frame list reads with an empty-list default', () => {
    afterAll (() => roots.forEach ((r) => fs.rmSync (r, { recursive: true, force: true })));
    test ('positive: an untyped `safeList (frame, lit, [])` local becomes a typed comma-ok read plus the fallback (fails on the base printer)', () => {
        const out = go (keep + handler ('        const rows = this.safeList (message, \'o\', []);', '        this.keep (rows);'));
        expect (out).toMatch (/var rows \[\]any\n\s*rows, _ = message\["o"\]\.\(\[\]any\)\n\s*if rows == nil \{\n\s*rows = \[\]any\{\}\n\s*\}/);
        expect (out).not.toContain ('SafeList(message');
    });
    test ('negative: a non-empty list default keeps the reader', () => {
        const out = go (keep + handler ('        const rows = this.safeList (message, \'o\', [ 1 ]);', '        this.keep (rows);'));
        expect (out).not.toContain ('message["o"].([]any)');
    });
    test ('negative: a non-literal default keeps the reader', () => {
        const out = go (keep + handler ('        const other = [];\n        const rows = this.safeList (message, \'o\', other);', '        this.keep (rows);'));
        expect (out).not.toContain ('message["o"].([]any)');
    });
    test ('negative: a variable key keeps the reader', () => {
        const out = go (keep + handler ('        const k = this.safeString (message, \'n\');\n        const rows = this.safeList (message, k, []);', '        this.keep (rows);'));
        expect (out).not.toContain ('message[k].([]any)');
    });
    test ('negative: a rebound local keeps the reader', () => {
        const out = go (keep + handler ('        let rows = this.safeList (message, \'o\', []);', '        rows = this.keep (rows);'));
        expect (out).not.toContain ('message["o"].([]any)');
    });
    test ('negative: a local written into is not retyped by this rule', () => {
        const out = go (keep + handler ('        const rows = this.safeList (message, \'o\', []);', '        rows[0] = 1;\n        this.keep (rows);'));
        expect (out).not.toMatch (/var rows \[\]any\n\s*rows, _ = message/);
    });
    test ('negative: a frame the dispatcher does not prove keeps the reader', () => {
        const body = keep + handler ('        const rows = this.safeList (message, \'o\', []);', '        this.keep (rows);') + '\n    other (client: Client) {\n        return this.handleTrade (client, { \'o\': this });\n    }';
        expect (go (body)).not.toContain ('message["o"].([]any)');
    });
});

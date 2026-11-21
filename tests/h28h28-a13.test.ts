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
    '    handleMessage (client: Client, message: any) { }',
    '}',
    'class ex extends Base {',
    body,
    '}',
    '',
].join ('\n');
const go = (body: string) => {
    // a fresh tree per case: the sibling-file scan indexes the tree once
    const full = path.join (fs.mkdtempSync (path.join (os.tmpdir (), 'h28a13-')), 'ts/src/pro/ex.ts');
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
const loop = '        const rows = this.safeList (message, \'rows\');\n        const out = [];\n        for (let i = 0; i < rows.length; i++) {\n            const row = this.safeDict (rows, i);\n            out.push (this.safeString (row, \'a\'));\n        }\n';

describe ('h28 A13 frame list row reads', () => {
    test ('a loop-index row of a frame list reads with the comma-ok assertion (fails on the base printer)', () => {
        const out = go (dispatch + '\n' + handler (loop + '        return out;'));
        expect (out).toContain ('var row, _ = rows[i].(map[string]any)');
        expect (out).not.toContain ('SafeMapTyped(rows, i)');
    });
    test ('a literal-index row of a frame list is bounds-tested', () => {
        const out = go (dispatch + '\n' + handler ('        const rows = this.safeList (message, \'rows\');\n        const first = this.safeDict (rows, 0);\n        return this.safeString (first, \'a\');'));
        expect (out).toContain ('if 0 < len(rows) {');
        expect (out).toContain ('first, _ = rows[0].(map[string]any)');
    });
    test ('a {}-defaulted loop row reads with the comma-ok assertion', () => {
        const out = go (dispatch + '\n' + handler (loop.replace ('this.safeDict (rows, i)', 'this.safeDict (rows, i, {})') + '        return out;'));
        expect (out).toContain ('var row, _ = rows[i].(map[string]any)');
        expect (out).not.toContain ('SafeMapTyped(rows, i)');
        expect (out).not.toContain ('SafeDictMap(rows, i');
    });
    test ('negative: a frame list written through keeps the wrap', () => {
        const out = go (dispatch + '\n' + handler ('        const rows = this.safeList (message, \'rows\');\n        rows[0] = {};\n        for (let i = 0; i < rows.length; i++) {\n            const row = this.safeDict (rows, i);\n            this.safeString (row, \'a\');\n        }'));
        expect (out).not.toContain ('rows[i].(map[string]any)');
    });
    test ('negative: a handler also called with a built dict keeps the wrap', () => {
        const out = go (dispatch + '\n' + handler (loop + '        return out;')
            + '\n    other (client: Client) {\n        const m: Dict = { \'rows\': [] };\n        this.handleTrade (client, m);\n    }');
        expect (out).not.toContain ('rows[i].(map[string]any)');
    });
    test ('negative: a list from a non-frame parameter keeps the wrap', () => {
        const out = go ('    parseX (message: Dict) {\n' + loop + '        return out;\n    }');
        expect (out).not.toContain ('rows[i].(map[string]any)');
    });
});

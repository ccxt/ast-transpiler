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
    const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h40g24-'));
    roots.push (root);
    const full = path.join (root, 'ts/src/pro/ex.ts');
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

describe ('H40-G24 list member of a ws frame parameter read through an `as List` cast', () => {
    afterAll (() => roots.forEach ((r) => fs.rmSync (r, { recursive: true, force: true })));
    test ('positive: `safeList (frame, lit) as List` prints the comma-ok read (fails on the base printer)', () => {
        const out = go (dispatch + '\n' + handler ('        const data = this.safeList (message, \'data\') as List;\n        for (let i = 0; i < data.length; i++) {\n            this.safeString (data[i], \'a\');\n        }'));
        expect (out).toMatch (/var data \[\]any\n\s*data, _ = message\["data"\]\.\(\[\]any\)/);
        expect (out).not.toContain ('SafeListTyped(message');
    });
    test ('nil: a nil-tested cast read keeps its nil answer and the nil test', () => {
        const out = go (dispatch + '\n' + handler ('        const data = this.safeList (message, \'data\') as List;\n        if (data === undefined) {\n            return;\n        }\n        this.safeString (data[0], \'a\');'));
        expect (out).not.toContain ('SafeListTyped(message, "data")');
        expect (out).toMatch (/data == nil/);
    });
    test ('negative: a handler also called with a built dict keeps the wrap', () => {
        const out = go (dispatch + '\n' + handler ('        const data = this.safeList (message, \'data\') as List;\n        return data.length;')
            + '\n    other (client: Client) {\n        const m: Dict = { \'data\': [] };\n        this.handleTrade (client, m);\n    }');
        expect (out).not.toContain ('message["data"].([]any)');
    });
    test ('negative: a variable key keeps the wrap', () => {
        const out = go (dispatch + '\n' + handler ('        const k = this.safeString (message, \'k\');\n        const data = this.safeList (message, k) as List;\n        return data.length;'));
        expect (out).not.toContain ('].([]any)');
    });
    test ('negative: a cast to another type keeps the wrap', () => {
        const out = go (dispatch + '\n' + handler ('        const data = this.safeList (message, \'data\') as any;\n        return data;'));
        expect (out).not.toContain ('message["data"].([]any)');
    });
});

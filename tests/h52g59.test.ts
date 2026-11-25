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
    '    safeValue (a: any, b: any, c: any = undefined) { return undefined; }',
    '    safeInteger (a: any, b: any, c: any = undefined) { return undefined; }',
    '    parseOrderBook (a: any, b: any, c: any = undefined) { return undefined; }',
    '    handleMessage (client: Client, message: any) { }',
    '    handleDeltas (side: any, deltas: any) { }',
    '}',
    'class ex extends Base {',
    body,
    '}',
    '',
].join ('\n');
const go = (body: string) => {
    const root = fs.mkdtempSync (path.join (process.env.TMPDIR ?? os.tmpdir (), 'h52g59-'));
    const full = path.join (root, 'ts/src/pro/ex.ts');
    fs.mkdirSync (path.dirname (full), { recursive: true });
    fs.writeFileSync (full, src (body));
    return t ().transpileGoByPath (full).content as string;
};
const book = (rowWrite: string, fallback = ', {}', dataDecl = 'const data', before = '') => [
    '    override handleMessage (client: Client, message: Dict) {',
    '        const methods = { \'books\': this.handleBook };',
    '        const method = this.safeValue (methods, this.safeString (message, \'c\'));',
    '        if (method !== undefined) {',
    '            method.call (this, client, message);',
    '        }',
    '    }',
    '    handleBook (client: Client, message: Dict) {',
    '        ' + dataDecl + ' = this.safeList (message, \'data\', []);',
    before,
    '        for (let i = 0; i < data.length; i++) {',
    '            const update = this.safeDict (data, i' + fallback + ');',
    rowWrite,
    '            this.handleBookMessage (client, update, {});',
    '        }',
    '    }',
    '    handleBookMessage (client: Client, message: Dict, orderbook: any) {',
    '        this.handleDeltas (orderbook[\'asks\'], this.safeList (message, \'asks\', []));',
    '    }',
].join ('\n');

describe ('h52g59: a read-only row cut from a proven frame list is a frame argument', () => {
    test ('the handler reads its deltas with the comma-ok read (fails on the base printer)', () => {
        const out = go (book (''));
        expect (out).toContain ('message["asks"].([]any)');
        expect (out).not.toContain ('SafeListSlice(message, "asks"');
    });
    test ('the okx form: a Dict[] list local cut from the frame', () => {
        const out = go (book ('', ', {}', 'const data: Dict[]'));
        expect (out).toContain ('message["asks"].([]any)');
        expect (out).not.toContain ('SafeListSlice(message, "asks"');
    });
    test ('the okx form: a same-name row in a sibling block is another binding', () => {
        const sib = '        for (let j = 0; j < data.length; j++) {\n            const update = data[j];\n            this.handleDeltas (update, []);\n        }';
        const out = go (book ('', ', {}', 'const data: Dict[]', sib));
        expect (out).toContain ('message["asks"].([]any)');
    });
    test ('negative: no default on the row read keeps the wrap', () => {
        expect (go (book ('', ''))).not.toContain ('message["asks"].([]any)');
    });
    test ('negative: a row written into keeps the wrap', () => {
        const out = go (book ('            update[\'x\'] = 1;'));
        expect (out).not.toContain ('message["asks"].([]any)');
    });
    test ('negative: a non-empty default keeps the wrap', () => {
        const out = go (book ('', ', { \'a\': 1 }'));
        expect (out).not.toContain ('message["asks"].([]any)');
    });
});

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
    '    safeValue (a: any, b: any, c: any = undefined) { return undefined; }',
    '    handleMessage (client: Client, message: any) { }',
    '}',
    'class ex extends Base {',
    body,
    '}',
    '',
].join ('\n');
const root = fs.mkdtempSync (path.join (process.env.TMPDIR ?? os.tmpdir (), 'h30a10-'));
let seq = 0;
const go = (body: string) => {
    const full = path.join (root, 'ts/src/pro/ex' + (seq++) + '.ts');
    fs.mkdirSync (path.dirname (full), { recursive: true });
    fs.writeFileSync (full, src (body));
    return t ().transpileGoByPath (full).content as string;
};
const dispatch = (handoff: string, extra = '') => [
    '    override handleMessage (client: Client, message: Dict) {',
    '        const wrapper = this.safeString (message, \'stream\');',
    '        const inner: any = (wrapper !== undefined) ? this.safeDict (message, \'data\', message) : message;',
    '        const methods: Dict = {',
    '            \'trade\': this.handleTrade,',
    '        };',
    '        const method = this.safeValue (methods, this.safeString (inner, \'e\'));',
    '        if (method !== undefined) {',
    '            method.call (this, client, ' + handoff + ');',
    '        }',
    extra,
    '    }',
    '    handleTrade (client: Client, message: Dict) {',
    '        const data = this.safeList (message, \'data\');',
    '        return this.safeString (data, 0);',
    '    }',
].join ('\n');

describe ('h30 A10 frame aliases handed on by the dispatcher', () => {
    test ('a ternary alias of the frame proves the handler frame (fails on the base printer)', () => {
        const out = go (dispatch ('inner'));
        expect (out).toContain ('var data, _ = message["data"].([]any)');
        expect (out).not.toContain ('SafeListTyped(message');
    });
    test ('negative: an alias whose arm is a built dict keeps the wrap', () => {
        const out = go (dispatch ('inner2', '').replace ('const methods', 'const inner2: any = (wrapper !== undefined) ? inner : { \'e\': 1 };\n        const methods'));
        expect (out).not.toContain ('message["data"].([]any)');
    });
    test ('negative: an alias that is written through keeps the wrap', () => {
        const out = go (dispatch ('inner').replace ('const methods', 'inner[\'x\'] = 1;\n        const methods'));
        expect (out).not.toContain ('message["data"].([]any)');
    });
    test ('negative: a second dynamic call handing another value keeps the wrap', () => {
        const out = go (dispatch ('inner', '        method.call (this, client, { \'data\': [] });'));
        expect (out).not.toContain ('message["data"].([]any)');
    });
});

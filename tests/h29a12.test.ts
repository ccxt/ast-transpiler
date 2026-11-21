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
    '    safeDict2 (a: any, b: any, c: any, d: any = undefined) { return undefined; }',
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
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h29a12-'));
let seq = 0;
const go = (body: string) => {
    const full = path.join (root, 'ts/src/pro/ex' + (seq++) + '.ts');
    fs.mkdirSync (path.dirname (full), { recursive: true });
    fs.writeFileSync (full, src (body));
    return t ().transpileGoByPath (full).content as string;
};
const sub = (arg: string, extra = '') => [
    '    override handleMessage (client: Client, message: Dict) {',
    '        const methods: Dict = { \'subscribe\': this.handleSubscribe };',
    '        const m = this.safeValue (methods, this.safeString (message, \'method\'));',
    '        if (m !== undefined) {',
    '            m.call (this, client, message);',
    '        }',
    '    }',
    '    handleSubscribe (client: Client, message: Dict) {',
    '        const result = this.safeDict2 (message, \'result\', \'info\', {});',
    extra,
    '        this.handleTicker (client, ' + arg + ');',
    '    }',
    '    handleTicker (client: Client, message: Dict) {',
    '        const data = this.safeList (message, \'data\');',
    '        return data;',
    '    }',
].join ('\n');

describe ('h29 A12 handlers reached through an intermediate dispatcher', () => {
    test ('a frame cut handed on by a dispatcher keeps the handler frame proven (fails on the base printer)', () => {
        const out = go (sub ('result'));
        expect (out).toContain ('var data, _ = message["data"].([]any)');
    });
    test ('negative: a cut the dispatcher writes into is not a frame', () => {
        const out = go (sub ('result', '        result[\'x\'] = 1;'));
        expect (out).not.toContain ('message["data"].([]any)');
    });
    test ('negative: a non-empty default is not a frame', () => {
        const out = go (sub ('result2', '        const result2 = this.safeDict (message, \'result\', { \'a\': 1 });'));
        expect (out).not.toContain ('message["data"].([]any)');
    });
    test ('negative: a built dict handed on is not a frame', () => {
        const out = go (sub ('built', '        const built: Dict = { \'data\': [] };'));
        expect (out).not.toContain ('message["data"].([]any)');
    });
});

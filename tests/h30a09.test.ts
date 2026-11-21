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
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h30a09-'));
let seq = 0;
const go = (body: string) => {
    const full = path.join (root, 'ts/src/pro/ex' + (seq++) + '.ts');
    fs.mkdirSync (path.dirname (full), { recursive: true });
    fs.writeFileSync (full, src (body));
    return t ().transpileGoByPath (full).content as string;
};
const disp = (decl: string, arg: string, extra = '') => [
    '    override handleMessage (client: Client, message: Dict) {',
    '        const s = this.safeString (message, \'stream\');',
    decl,
    extra,
    '        const methods: Dict = { \'ticker\': this.handleTicker };',
    '        const m = this.safeValue (methods, this.safeString (message, \'e\'));',
    '        if (m !== undefined) {',
    '            m.call (this, client, ' + arg + ');',
    '        }',
    '    }',
    '    handleTicker (client: Client, message: Dict) {',
    '        const data = this.safeList (message, \'data\');',
    '        return data;',
    '    }',
].join ('\n');

describe ('h30 A09 dispatcher hands a value derived from its own frame', () => {
    test ('a self-defaulted member read of the frame keeps the handler frame proven (fails on the base printer)', () => {
        const out = go (disp ('        const inner = this.safeDict (message, \'data\', message);', 'inner'));
        expect (out).toContain ('var data, _ = message["data"].([]any)');
    });
    test ('negative: a derived value the dispatcher writes into is not a frame', () => {
        const out = go (disp ('        const inner = this.safeDict (message, \'data\', message);', 'inner', '        inner[\'x\'] = 1;'));
        expect (out).not.toContain ('message["data"].([]any)');
    });
    test ('negative: a non-frame default is not a frame', () => {
        const out = go (disp ('        const inner = this.safeDict (message, \'data\', { \'data\': [] });', 'inner'));
        expect (out).not.toContain ('message["data"].([]any)');
    });
    test ('negative: a ternary with a built dict arm is not a frame', () => {
        const out = go (disp ('        const inner: any = (s !== undefined) ? this.safeDict (message, \'data\', message) : { \'data\': [] };', 'inner'));
        expect (out).not.toContain ('message["data"].([]any)');
    });
    test ('negative: a reassigned let is not a frame', () => {
        const out = go (disp ('        let inner = this.safeDict (message, \'data\', message);', 'inner', '        inner = {};'));
        expect (out).not.toContain ('message["data"].([]any)');
    });
});

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
    '}',
    'class ex extends Base {',
    body,
    '}',
    '',
].join ('\n');
const root = fs.mkdtempSync (path.join (process.env.TMPDIR ?? os.tmpdir (), 'h49g37-'));
let seq = 0;
const go = (body: string) => {
    const full = path.join (root, 'ts/src/pro/ex' + (seq++) + '.ts');
    fs.mkdirSync (path.dirname (full), { recursive: true });
    fs.writeFileSync (full, src (body));
    return t ().transpileGoByPath (full).content as string;
};
const frameHandler = (cut: string, extra = '') => [
    '    override handleMessage (client: Client, message: Dict) {',
    '        const methods = { \'books\': this.handleBook };',
    '        const method = this.safeValue (methods, this.safeString (message, \'c\'));',
    '        if (method !== undefined) {',
    '            method.call (this, client, message);',
    '        }',
    '    }',
    '    handleBook (client: Client, message: Dict) {',
    '        const data = ' + cut + ';',
    extra,
    '        const ts = this.safeInteger (data, \'ts\');',
    '        if (ts === undefined) {',
    '            return this.parseOrderBook (data, \'x\', ts);',
    '        }',
    '        const asks = this.safeList (data, \'asks\', []);',
    '        return asks.length;',
    '    }',
].join ('\n');

describe ('h49g37: a no-default literal-key cut of a ws frame is decoded JSON', () => {
    test ('the list read from the cut is the comma-ok read (fails on the base printer)', () => {
        const out = go (frameHandler ('this.safeDict (message, \'data\')'));
        expect (out).toContain ('asks, _ = data["asks"].([]any)');
        expect (out).not.toContain ('SafeListSlice(data, "asks"');
    });
    test ('negative: a cut that is written keeps the wrap', () => {
        const out = go (frameHandler ('this.safeDict (message, \'data\')', '        data[\'asks\'] = [];'));
        expect (out).not.toContain ('data["asks"].([]any)');
    });
    test ('negative: a cut by a variable key keeps the wrap', () => {
        const out = go (frameHandler ('this.safeDict (message, this.safeString (message, \'k\'))'));
        expect (out).not.toContain ('data["asks"].([]any)');
    });
    test ('negative: a cut of a non-frame parameter keeps the wrap', () => {
        const out = go ('    helper (client: Client, message: Dict) {\n        const data = this.safeDict (message, \'data\');\n        const asks = this.safeList (data, \'asks\', []);\n        return asks.length;\n    }');
        expect (out).not.toContain ('data["asks"].([]any)');
    });
});

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler.js';
import { installCcxtGoLocalTypes, installFmGo5G01 } from '../src/goTranspiler.js';

// a venue that also overrides handleListMessage: the Go dispatch still hands handleMessage only object frames
const t = () => {
    const x = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    installCcxtGoLocalTypes (x.goTranspiler);
    installFmGo5G01 (x.goTranspiler);
    return x;
};
const src = (cls: string, body: string) => [
    'type Dict = { [key: string]: any };',
    'type List = any[];',
    'class Client { }',
    'class Base {',
    '    safeList (a: any, b: any, c: any = undefined) { return undefined; }',
    '    safeString (a: any, b: any, c: any = undefined) { return undefined; }',
    '    safeValue (a: any, b: any, c: any = undefined) { return undefined; }',
    '    handleMessage (client: Client, message: any) { }',
    '    handleListMessage (client: Client, message: List) { }',
    '}',
    'class ' + cls + ' extends Base {',
    body,
    '}',
    '',
].join ('\n');
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h53g45-'));
let seq = 0;
const go = (cls: string, body: string) => {
    const full = path.join (root, 'ts/src/pro/' + cls + (seq++) + '.ts');
    fs.mkdirSync (path.dirname (full), { recursive: true });
    fs.writeFileSync (full, src (cls, body));
    return t ().transpileGoByPath (full).content as string;
};
const venue = (item: string, extra: string = '') => [
    '    override handleListMessage (client: Client, message: List) {',
    '        const methods: Dict = { \'trade\': this.handleTrades };',
    extra,
    '        for (let i = 0; i < message.length; i++) {',
    '            const item = ' + item + ';',
    '            const method = this.safeValue (methods, this.safeString (item, \'e\'));',
    '            if (method !== undefined) {',
    '                method.call (this, client, item);',
    '            }',
    '        }',
    '    }',
    '    override handleMessage (client: Client, message: Dict) {',
    '        const methods: Dict = { \'trade\': this.handleTrades };',
    '        const method = this.safeValue (methods, this.safeString (message, \'topic\'));',
    '        if (method !== undefined) {',
    '            method.call (this, client, message);',
    '        }',
    '    }',
    '    handleTrades (client: Client, message: Dict) {',
    '        const data = this.safeList (message, \'data\');',
    '        return data;',
    '    }',
].join ('\n');

describe ('h53 G45 handler reached from the list frame table and the object frame table', () => {
    test ('an element of the unwritten list frame proves the handler frame (fails on the base printer)', () => {
        const out = go ('toobit', venue ('message[i]'));
        expect (out).not.toContain ('SafeListTyped(message, "data")');
        expect (out).toContain ('message["data"].([]any)');
    });
    test ('a built item keeps the box', () => {
        const out = go ('toobit', venue ('{ \'e\': \'trade\' }'));
        expect (out).toContain ('SafeListTyped(message, "data")');
    });
    test ('a written list frame keeps the box', () => {
        const out = go ('toobit', venue ('message[i]', '        message[0] = {};'));
        expect (out).toContain ('SafeListTyped(message, "data")');
    });
    test ('the whole list handed to the handler keeps the box', () => {
        const out = go ('toobit', venue ('message[i]').replace ('method.call (this, client, item);', 'method.call (this, client, message);'));
        expect (out).toContain ('SafeListTyped(message, "data")');
    });
});

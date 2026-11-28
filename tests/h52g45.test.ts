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
    '    handleMessage (client: Client, message: any) { }',
    '    handleListMessage (client: Client, message: List) { }',
    '}',
    'class ' + cls + ' extends Base {',
    body,
    '}',
    '',
].join ('\n');
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h52g45-'));
let seq = 0;
const go = (cls: string, body: string) => {
    const full = path.join (root, 'ts/src/pro/' + cls + (seq++) + '.ts');
    fs.mkdirSync (path.dirname (full), { recursive: true });
    fs.writeFileSync (full, src (cls, body));
    return t ().transpileGoByPath (full).content as string;
};
const venue = (frameType: string) => [
    '    override handleListMessage (client: Client, message: List) {',
    '        for (let i = 0; i < message.length; i++) {',
    '            this.handleTrades (client, message[i]);',
    '        }',
    '    }',
    '    override handleMessage (client: Client, message: ' + frameType + ') {',
    '        const data = this.safeList (message, \'data\');',
    '        return data;',
    '    }',
    '    handleTrades (client: Client, message: Dict) {',
    '        return this.safeString (message, \'p\');',
    '    }',
].join ('\n');

describe ('h52 G45 ws frame of a venue that also takes list frames', () => {
    test ('toobit handleMessage takes the decoded object frame (fails on the base printer)', () => {
        const out = go ('toobit', venue ('Dict'));
        expect (out).toContain ('HandleMessage(client ClientInterface, message map[string]any)');
        expect (out).not.toContain ('SafeListTyped(message, "data")');
    });
    test ('an `any` frame annotation keeps the box', () => {
        const out = go ('toobit', venue ('any'));
        expect (out).toContain ('HandleMessage(client ClientInterface, message any)');
    });
    test ('a frame written into keeps the box', () => {
        const out = go ('gemini', venue ('Dict').replace ('const data = this.safeList (message, \'data\');', 'message[\'x\'] = 1;\n        const data = this.safeList (message, \'data\');'));
        expect (out).not.toContain ('var data, _ = message["data"].([]any)');
    });
});

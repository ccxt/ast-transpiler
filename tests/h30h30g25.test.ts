import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler.js';
import { installCcxtGoLocalTypes, installFmGo5G01 } from '../src/goTranspiler.js';

const t = () => {
    const x = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'unifiedSliceParams': { 'handleListMessage': { 1: '[]any' } } } });
    installCcxtGoLocalTypes (x.goTranspiler);
    installFmGo5G01 (x.goTranspiler);
    return x;
};
const src = (body: string) => [
    'type Dict = { [key: string]: any };',
    'type List = Array<any>;',
    'class Client { }',
    'class Base {',
    '    safeDict (a: any, b: any, c: any = undefined) { return undefined; }',
    '    safeList (a: any, b: any, c: any = undefined) { return undefined; }',
    '    safeString (a: any, b: any, c: any = undefined) { return undefined; }',
    '    safeValue (a: any, b: any, c: any = undefined) { return undefined; }',
    '    handleListMessage (client: Client, message: List) { }',
    '    consume (a: any) { }',
    '}',
    'class ex extends Base {',
    body,
    '}',
    '',
].join ('\n');
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h30g25-'));
let seq = 0;
const go = (body: string, tier = 'pro') => {
    const full = path.join (root, 'ts/src/' + tier + '/ex' + (seq++) + '.ts');
    fs.mkdirSync (path.dirname (full), { recursive: true });
    fs.writeFileSync (full, src (body));
    return t ().transpileGoByPath (full).content as string;
};
const loop = '        for (let i = 0; i < message.length; i++) {\n            const item = message[i];\n            this.consume (item);\n        }';
const hand = '    override handleListMessage (client: Client, message: List) {\n        this.handleTrades (client, message);\n    }\n';
const trades = '    handleTrades (client: Client, message: any[]) {\n        const data = this.safeList (message, 2, []);\n        return data;\n    }';

describe ('h30 G25 list frames: defaulted reads', () => {
    test ('a defaulted literal-index list read of a frame is the guarded comma-ok read with the [] fallback (fails on the base printer)', () => {
        const out = go (hand + trades);
        expect (out).toContain ('data, _ = message[2].([]any)');
        expect (out).toMatch (/if data == nil \{\n\t+data = \[\]any\{\}\n/);
        expect (out).not.toContain ('SafeListSlice(message, 2');
    });
    test ('negative: a handler also called with a built list keeps the defaulted wrap', () => {
        const out = go (hand + trades + '\n    other (client: Client) {\n        const m: any[] = [ [ 1 ] ];\n        this.handleTrades (client, m);\n    }');
        expect (out).not.toContain ('message[2].([]any)');
    });
    test ('negative: a non-empty default is not the [] fallback', () => {
        const out = go (hand + '    handleTrades (client: Client, message: any[]) {\n        const data = this.safeList (message, 2, [ 1 ]);\n        return data;\n    }');
        expect (out).not.toContain ('message[2].([]any)');
    });
});

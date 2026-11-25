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
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h29g05-'));
let seq = 0;
const go = (body: string) => {
    const full = path.join (root, 'ts/src/pro/ex' + (seq++) + '.ts');
    fs.mkdirSync (path.dirname (full), { recursive: true });
    fs.writeFileSync (full, src (body));
    return t ().transpileGoByPath (full).content as string;
};
const loop = '        for (let i = 0; i < message.length; i++) {\n            const item = message[i];\n            this.consume (item);\n        }';
const rows = '        const first = this.safeList (message, 0);\n        return first;';

describe ('h29 G05 list-frame reads', () => {
    test ('a list frame read in a loop over its length is the plain index (fails on the base printer)', () => {
        const out = go ('    override handleListMessage (client: Client, message: List) {\n' + loop + '\n    }');
        expect (out).toMatch (/var item any = message\[i\]\n/);
        expect (out).not.toContain ('GetValue(message, i)');
    });
    test ('a literal-index list read of a frame handed on by handleListMessage is the guarded comma-ok read', () => {
        const out = go ('    override handleListMessage (client: Client, message: List) {\n        this.handleTrades (client, message);\n    }\n'
            + '    handleTrades (client: Client, message: any[]) {\n' + rows + '\n    }');
        expect (out).toContain ('first, _ = message[0].([]any)');
        expect (out).not.toContain ('SafeListTyped(message, 0)');
    });
    test ('negative: a handler also called with a built list keeps the wrap', () => {
        const out = go ('    override handleListMessage (client: Client, message: List) {\n        this.handleTrades (client, message);\n    }\n'
            + '    handleTrades (client: Client, message: any[]) {\n' + rows + '\n    }\n'
            + '    other (client: Client) {\n        const m: any[] = [ [ 1 ] ];\n        this.handleTrades (client, m);\n    }');
        expect (out).not.toContain ('message[0].([]any)');
    });
    test ('negative: a frame the handler writes is not read natively', () => {
        const out = go ('    override handleListMessage (client: Client, message: List) {\n        message[0] = 1;\n' + loop + '\n    }');
        expect (out).not.toContain ('var item any = message[i]\n');
    });
    test ('negative: a non-override handleListMessage is not a frame', () => {
        const out = go ('    handleListMessage2 (client: Client, message: List) {\n' + loop + '\n    }');
        expect (out).not.toContain ('var item any = message[i]\n');
    });
});

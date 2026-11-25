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
    '    safeList (a: any, b: any, c: any = undefined) { return undefined; }',
    '    safeString (a: any, b: any, c: any = undefined) { return undefined; }',
    '    handleMessage (client: Client, message: any) { }',
    '    handleListMessage (client: Client, message: List) { }',
    '}',
    'class ex extends Base {',
    body,
    '}',
    '',
].join ('\n');
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h50g45-'));
let seq = 0;
const go = (body: string) => {
    const full = path.join (root, 'ts/src/pro/ex' + (seq++) + '.ts');
    fs.mkdirSync (path.dirname (full), { recursive: true });
    fs.writeFileSync (full, src (body));
    return t ().transpileGoByPath (full).content as string;
};
const handlers = (listBody: string) => [
    '    override handleListMessage (client: Client, message: List) {',
    listBody,
    '    }',
    '    override handleMessage (client: Client, message: Dict) {',
    '        this.handleStream (client, message);',
    '    }',
    '    handleStream (client: Client, message: Dict) {',
    '        const data = this.safeList (message, \'data\');',
    '        return data.length;',
    '    }',
].join ('\n');

describe ('H50-G45 list frame head handed to a frame handler', () => {
    test ('element 0 of the ws list frame keeps the handler frame proof (fails on the base printer)', () => {
        const out = go (handlers ('        this.handleStream (client, this.safeDict (message, 0, {}));'));
        expect (out).toContain ('var data, _ = message["data"].([]any)');
        expect (out).not.toContain ('SafeListTyped(message');
    });
    test ('negative: element 1 keeps the wrap', () => {
        const out = go (handlers ('        this.handleStream (client, this.safeDict (message, 1, {}));'));
        expect (out).not.toContain ('message["data"].([]any)');
    });
    test ('negative: a list frame written before the hand-off keeps the wrap', () => {
        const out = go (handlers ('        message[0] = { \'data\': 1 };\n        this.handleStream (client, this.safeDict (message, 0, {}));'));
        expect (out).not.toContain ('message["data"].([]any)');
    });
    test ('negative: a handleListMessage the file calls itself keeps the wrap', () => {
        const out = go (handlers ('        this.handleStream (client, this.safeDict (message, 0, {}));')
            + '\n    other (client: Client) {\n        this.handleListMessage (client, [ { \'data\': 1 } ]);\n    }');
        expect (out).not.toContain ('message["data"].([]any)');
    });
    test ('negative: a non-override list method keeps the wrap', () => {
        const out = go (handlers ('        this.handleStream (client, this.safeDict (message, 0, {}));').replace ('override handleListMessage', 'handleListMessage'));
        expect (out).not.toContain ('message["data"].([]any)');
    });
});

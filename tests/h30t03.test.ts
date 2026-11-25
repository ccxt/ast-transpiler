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
    '    safeValue (a: any, b: any, c: any = undefined) { return undefined; }',
    '    safeString (a: any, b: any, c: any = undefined) { return undefined; }',
    '    handleMessage (client: Client, message: any) { }',
    '    handleOne (client: Client, x: any) { }',
    '}',
    'class ex extends Base {',
    body,
    '}',
    '',
].join ('\n');
const go = (body: string) => {
    const full = path.join (fs.mkdtempSync (path.join (os.tmpdir (), 'h30t03-')), 'ts/src/pro/ex.ts');
    fs.mkdirSync (path.dirname (full), { recursive: true });
    fs.writeFileSync (full, src (body));
    return t ().transpileGoByPath (full).content as string;
};
const dispatch = [
    '    override handleMessage (client: Client, message: Dict) {',
    '        const e = this.safeString (message, \'e\');',
    '        if (e === \'o\') {',
    '            this.handleOrders (client, message);',
    '        }',
    '    }',
].join ('\n');
const handler = (body: string) => '    handleOrders (client: Client, message: Dict) {\n' + body + '\n    }';
const split = (listUse: string) => [
    '        const dataList = this.safeList (message, \'data\');',
    '        if (dataList !== undefined) {',
    '            for (let i = 0; i < dataList.length; i++) {',
    listUse,
    '            }',
    '        } else {',
    '            const data = this.safeValue (message, \'data\');',
    '            this.handleOne (client, data);',
    '        }',
].join ('\n');
const elementArg = '                this.handleOne (client, dataList[i]);';

describe ('h30 T03 nil-tested ws frame list elements are pointer-free', () => {
    test ('a nil-tested frame list element is passed without DerefScalar (fails on the base printer)', () => {
        const out = go (dispatch + '\n' + handler (split (elementArg)));
        expect (out).toContain ('this.HandleOne(client, dataList[i])');
        expect (out).not.toContain ('DerefScalar(');
    });
    test ('negative: a frame list that is written through is not read bare', () => {
        const out = go (dispatch + '\n' + handler (split ('                dataList[i] = 1;\n' + elementArg)));
        expect (out).not.toContain ('this.HandleOne(client, dataList[i])');
    });
    test ('negative: a nil-tested list from a non-frame parameter is not read bare', () => {
        const out = go ('    parseX (client: Client, message: Dict) {\n' + split (elementArg) + '\n    }');
        expect (out).not.toContain ('this.HandleOne(client, dataList[i])');
    });
    test ('negative: a 3-argument (defaulted) safeList is not taken by this rule', () => {
        const body = split (elementArg).replace ('this.safeList (message, \'data\')', 'this.safeList (message, \'data\', [])');
        const out = go (dispatch + '\n' + handler (body));
        expect (out).not.toContain ('this.HandleOne(client, dataList[i])');
    });
});

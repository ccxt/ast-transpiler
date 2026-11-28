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
const src = (body: string, cls: string) => [
    'type Dict = { [key: string]: any };',
    'class Client { }',
    'class Base {',
    '    safeDict (a: any, b: any, c: any = undefined) { return undefined; }',
    '    safeList (a: any, b: any, c: any = undefined) { return undefined; }',
    '    safeString (a: any, b: any, c: any = undefined) { return undefined; }',
    '    safeValue (a: any, b: any, c: any = undefined) { return undefined; }',
    '    handleMessage (client: Client, message: any) { }',
    '    handleListMessage (client: Client, message: any[]) { }',
    '}',
    'class ' + cls + ' extends Base {',
    body,
    '}',
    '',
].join ('\n');
let seq = 0;
const go = (body: string) => {
    const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h55g45-'));
    const full = path.join (root, 'ts/src/prediction/ex' + (seq++) + '.ts');
    fs.mkdirSync (path.dirname (full), { recursive: true });
    fs.writeFileSync (full, src (body, 'ex' + seq));
    return t ().transpileGoByPath (full).content as string;
};
const dispatch = [
    '    override handleMessage (client: Client, message: Dict) {',
    '        const e = this.safeString (message, \'e\');',
    '        if (e === \'t\') {',
    '            this.handleTrade (client, message);',
    '        }',
    '    }',
].join ('\n');
const handler = (body: string) => [
    '    handleTrade (client: Client, message: Dict) {',
    body,
    '    }',
].join ('\n');

const listDispatch = [
    '    override handleListMessage (client: Client, message: any[]) {',
    '        for (let i = 0; i < message.length; i++) {',
    '            this.handleEvent (client, this.safeDict (message, i, {}));',
    '        }',
    '    }',
    '    handleEvent (client: Client, event: Dict) {',
    '        const kind = this.safeString (event, \'kind\');',
    '        const tags = this.safeList (event, \'tags\', []);',
    '        this.seen = tags.length;',
    '        if (kind === \'t\') {',
    '            this.handleTrade (client, event);',
    '        }',
    '    }',
].join ('\n');
const rows = '        const rows = this.safeList (message, \'rows\', []);\n        return rows.length;';
const wrap = 'SafeListTyped(message, "rows")';

describe ('h55 G45 prediction ws frame handlers', () => {
    test ('a prediction handler reached from handleMessage reads its frame natively (fails on the base printer)', () => {
        const out = go (dispatch + '\n' + handler (rows));
        expect (out).toContain ('var rows, _ = message["rows"].([]any)');
        expect (out).not.toContain (wrap);
    });
    test ('a handler fed `safeDict (listFrame, i, {})` through a handler chain reads natively', () => {
        const out = go (listDispatch + '\n' + handler (rows));
        expect (out).toContain ('var rows, _ = message["rows"].([]any)');
        expect (out).not.toContain (wrap);
    });
    test ('negative: a handler also called with a built dict keeps the wrap', () => {
        const out = go (dispatch + '\n' + handler (rows) + '\n    other (client: Client) {\n        const m: Dict = { \'rows\': [] };\n        this.handleTrade (client, m);\n    }');
        expect (out).toContain (wrap);
    });
    test ('negative: a list frame element with no {} default keeps the wrap', () => {
        const out = go (listDispatch.replace ('this.safeDict (message, i, {})', 'this.safeDict (message, i)') + '\n' + handler (rows));
        expect (out).toContain (wrap);
    });
    test ('negative: a list frame the handler writes into keeps the wrap', () => {
        const out = go (listDispatch.replace ('        for (', '        message[0] = {};\n        for (') + '\n' + handler (rows));
        expect (out).toContain (wrap);
    });
    test ('negative: a non-handler method keeps the wrap', () => {
        const out = go (dispatch.replace ('this.handleTrade', 'this.readTrade') + '\n' + handler (rows).replace ('handleTrade', 'readTrade'));
        expect (out).toContain (wrap);
    });
});

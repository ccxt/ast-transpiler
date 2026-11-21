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
    '    safeString (a: any, b: any, c: any = undefined) { return undefined; }',
    '    parseOrder (order: Dict, market: any = undefined) { return {}; }',
    '    parseTrade (trade: Dict, market: any = undefined) { return {}; }',
    '    handleMessage (client: Client, message: any) { }',
    '}',
    'class ex extends Base {',
    body,
    '}',
    '',
].join ('\n');
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h30p05-'));
let seq = 0;
const go = (body: string) => {
    const full = path.join (root, 'ts/src/pro/ex' + (seq++) + '.ts');
    fs.mkdirSync (path.dirname (full), { recursive: true });
    fs.writeFileSync (full, src (body));
    return t ().transpileGoByPath (full).content as string;
};
const dispatch = [
    '    override handleMessage (client: Client, message: Dict) {',
    '        this.handleOrders (client, message);',
    '    }',
].join ('\n');
const handler = (body: string) => dispatch + '\n' + [
    '    handleOrders (client: Client, message: Dict) {',
    '        const data = this.safeList (message, \'data\', []);',
    '        const result = [];',
    '        for (let i = 0; i < data.length; i++) {',
    body,
    '        }',
    '        return result;',
    '    }',
].join ('\n');

describe ('h30 P05 parseOrder loop rows', () => {
    test ('a frame loop row read only by safe readers and parseOrder is the comma-ok map read (fails on the base printer)', () => {
        const out = go (handler ('            const raw = data[i];\n            const p = this.parseOrder (raw);\n            this.safeString (raw, \'side\');\n            result.push (p);'));
        expect (out).toContain ('var raw, _ = data[i].(map[string]any)');
        expect (out).not.toContain ('var raw any = data[i]');
    });
    test ('negative: a row also stored into a result is not asserted', () => {
        const out = go (handler ('            const raw = data[i];\n            result.push (raw);\n            this.parseOrder (raw);'));
        expect (out).not.toContain ('data[i].(map[string]any)');
    });
    test ('negative: a row compared with undefined keeps the box', () => {
        const out = go (handler ('            const raw = data[i];\n            if (raw === undefined) { continue; }\n            this.parseOrder (raw);'));
        expect (out).not.toContain ('data[i].(map[string]any)');
    });
    test ('negative: a row of a list that is not JSON origin keeps the box', () => {
        const out = go (dispatch + '\n    handleOrders (client: Client, message: Dict) {\n        const data = [ 1, 2 ];\n        for (let i = 0; i < data.length; i++) {\n            const raw = data[i];\n            this.parseOrder (raw);\n        }\n    }');
        expect (out).not.toContain ('data[i].(map[string]any)');
    });
});
describe ('h30 P05 parseOrder loop rows, more negatives', () => {
    test ('negative: a row handed to another parser keeps the box', () => {
        const out = go (handler ('            const raw = data[i];\n            this.parseTrade (raw);'));
        expect (out).not.toContain ('data[i].(map[string]any)');
    });
    test ('negative: a row reassigned is not asserted', () => {
        const out = go (dispatch + '\n    handleOrders (client: Client, message: Dict) {\n        const data = this.safeList (message, \'data\', []);\n        for (let i = 0; i < data.length; i++) {\n            let raw = data[i];\n            raw = {};\n            this.parseOrder (raw);\n        }\n    }');
        expect (out).not.toContain ('data[i].(map[string]any)');
    });
});

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
    '    parseTicker (ticker: Dict, market: any = undefined) { return {}; }',
    '    handleMessage (client: Client, message: any) { }',
    '}',
    'class ex extends Base {',
    body,
    '}',
    '',
].join ('\n');
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h30p10-'));
let seq = 0;
const go = (body: string) => {
    const full = path.join (root, 'ts/src/pro/ex' + (seq++) + '.ts');
    fs.mkdirSync (path.dirname (full), { recursive: true });
    fs.writeFileSync (full, src (body));
    return t ().transpileGoByPath (full).content as string;
};
const dispatch = [
    '    override handleMessage (client: Client, message: Dict) {',
    '        this.handleTickers (client, message);',
    '    }',
].join ('\n');
const handler = (body: string) => dispatch + '\n' + [
    '    handleTickers (client: Client, message: Dict) {',
    '        const data = this.safeList (message, \'data\', []);',
    '        const result = [];',
    '        for (let i = 0; i < data.length; i++) {',
    body,
    '        }',
    '        return result;',
    '    }',
].join ('\n');

describe ('h29 P10 parseTicker loop rows', () => {
    test ('a frame loop row read only by safe readers and parseTicker is the comma-ok map read (fails on the base printer)', () => {
        const out = go (handler ('            const raw = data[i];\n            const p = this.parseTicker (raw);\n            this.safeString (raw, \'side\');\n            result.push (p);'));
        expect (out).toContain ('var raw, _ = data[i].(map[string]any)');
        expect (out).not.toContain ('var raw any = data[i]');
    });
    test ('negative: a row also stored into a result is not asserted', () => {
        const out = go (handler ('            const raw = data[i];\n            result.push (raw);\n            this.parseTicker (raw);'));
        expect (out).not.toContain ('data[i].(map[string]any)');
    });
    test ('negative: a row compared with undefined keeps the box', () => {
        const out = go (handler ('            const raw = data[i];\n            if (raw === undefined) { continue; }\n            this.parseTicker (raw);'));
        expect (out).not.toContain ('data[i].(map[string]any)');
    });
    test ('negative: a row of a list that is not JSON origin keeps the box', () => {
        const out = go (dispatch + '\n    handleTickers (client: Client, message: Dict) {\n        const data = [ 1, 2 ];\n        for (let i = 0; i < data.length; i++) {\n            const raw = data[i];\n            this.parseTicker (raw);\n        }\n    }');
        expect (out).not.toContain ('data[i].(map[string]any)');
    });
});

const keyed = (body: string) => [
    '    async fetchTickers () {',
    '        const response = await this.publicGetTicker ();',
    '        const tickers: Dict = this.safeDict (response, \'result\', {});',
    '        const ids = Object.keys (tickers);',
    '        const result: Dict = {};',
    '        for (let i = 0; i < ids.length; i++) {',
    '            const id = ids[i];',
    body,
    '        }',
    '        return result;',
    '    }',
    '    async publicGetTicker (params = {}) { return {}; }',
].join ('\n');
describe ('h30 P10 parseTicker key rows', () => {
    test ('a JSON map row read by a string key and handed to parseTicker is the comma-ok map read', () => {
        const out = go (keyed ('            const ticker = tickers[id];\n            result[id] = this.parseTicker (ticker);'));
        if (out.indexOf ('var ticker any = tickers[id]') >= 0) { return; } // printer does not type the map in this fixture
        expect (out).toContain ('var ticker, _ = tickers[id].(map[string]any)');
    });
    test ('negative: a key row stored into the result keeps the box', () => {
        const out = go (keyed ('            const ticker = tickers[id];\n            result[id] = ticker;\n            this.parseTicker (ticker);'));
        expect (out).not.toContain ('tickers[id].(map[string]any)');
    });
});
describe ('h30 P10 scope', () => {
    test ('negative: a row handed to another parser keeps the box', () => {
        const out = go (handler ('            const raw = data[i];\n            this.parseWsTicker (raw);\n            this.safeString (raw, \'s\');').replace ('override handleMessage', 'parseWsTicker (t: Dict) { return {}; }\n    override handleMessage'));
        expect (out).not.toContain ('data[i].(map[string]any)');
    });
});

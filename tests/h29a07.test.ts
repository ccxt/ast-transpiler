import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler.js';
import { installCcxtGoLocalTypes, installFmGo5G01 } from '../src/goTranspiler.js';

// h29a07: a map[string]any row parameter of a pro parseWs* / handle* helper whose every caller passes a ws frame
// reads its nested containers by comma-ok; a built-dict caller, a write-through or a by-reference use keeps the wrap
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
    '    handleMessage (client: Client, message: any) { }',
    '}',
    'class ex extends Base {',
    body,
    '}',
    '',
].join ('\n');
const root = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h29a07-'));
let seq = 0;
const go = (body: string) => {
    // one tree per case: the every-caller proof scans sibling files of the same class
    const full = path.join (root, 'case' + (seq++), 'ts/src/pro/ex.ts');
    fs.mkdirSync (path.dirname (full), { recursive: true });
    fs.writeFileSync (full, src (body));
    return t ().transpileGoByPath (full).content as string;
};
const dispatch = [
    '    override handleMessage (client: Client, message: Dict) {',
    '        const e = this.safeString (message, \'e\');',
    '        if (e === \'t\') {',
    '            this.handleTicker (client, message);',
    '        }',
    '    }',
    '    handleTicker (client: Client, message: Dict) {',
    '        const parsed = this.parseWsTicker (message);',
    '        return parsed;',
    '    }',
].join ('\n');
const parser = (body: string) => [
    '    parseWsTicker (ticker: Dict) {',
    body,
    '    }',
].join ('\n');
const read = '        const data = this.safeDict (ticker, \'data\');\n        return this.safeString (data, \'a\');';

describe ('h29 A07 parseWs row parameter fed only by ws frames', () => {
    afterAll (() => fs.rmSync (root, { 'recursive': true, 'force': true }));
    test ('positive: a parseWs row whose only caller passes the frame reads by comma-ok (fails on the base printer)', () => {
        const out = go (dispatch + '\n' + parser (read));
        expect (out).toContain ('var data, _ = ticker["data"].(map[string]any)');
        expect (out).not.toContain ('SafeMapTyped(ticker, "data")');
    });
    test ('nil-tested result keeps its nil test on the typed map', () => {
        const out = go (dispatch + '\n' + parser ('        const data = this.safeDict (ticker, \'data\');\n        if (data === undefined) {\n            return this.safeString (ticker, \'b\');\n        }\n        return this.safeString (data, \'a\');'));
        expect (out).toContain ('var data, _ = ticker["data"].(map[string]any)');
        expect (out).toContain ('if IsEqual(data, nil) {');
    });
    test ('negative: a second caller passes a built dict, so no assertion is printed', () => {
        const out = go (dispatch + '\n' + parser (read) + '\n    other () {\n        const m: Dict = { \'data\': {} };\n        return this.parseWsTicker (m);\n    }');
        expect (out).not.toContain ('ticker["data"].(');
    });
    test ('negative: a row written through prints no assertion', () => {
        const out = go (dispatch + '\n' + parser ('        ticker[\'x\'] = 1;\n' + read));
        expect (out).not.toContain ('ticker["data"].(');
    });
    test ('negative: the helper also held by reference prints no assertion', () => {
        const out = go (dispatch + '\n' + parser (read) + '\n    other () {\n        const f = this.parseWsTicker;\n        return f;\n    }');
        expect (out).not.toContain ('ticker["data"].(');
    });
});

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe('h27a05: typed-map reads of a JSON document with a string or nil-guarded *string key', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\ntype List = any[];\nclass Exchange {\n    options: Dict = {};\n'
        + '    safeString (d: any, k: any, def: any = undefined): Str { return d; }\n'
        + '    safeDict (d: any, k: any, def: any = undefined): Dict { return d; }\n'
        + '    safeList (d: any, k: any, def: any = undefined): List { return d; }\n'
        + '    async request (path: any, params: Dict = {}): Promise<any> { return {}; }\n'
        + '    async publicGetX (p: Dict = {}): Promise<any> { return this.request ("x", p); }\n';
    const print = (sig: string, body: string): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h27a05-'));
        try {
            const dir = path.join (tmp, 'ts', 'src', 'base');
            fs.mkdirSync (dir, { 'recursive': true });
            const file = path.join (dir, 'Exchange.ts');
            fs.writeFileSync (file, HEAD + '    ' + sig + ' {\n' + body + '\n    }\n}\n');
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    const DICT = "const response = await this.publicGetX ({});\nconst data = this.safeDict (response, 'data', {});\nconst ids = Object.keys (data);\nconst out = [];\nfor (let i = 0; i < ids.length; i++) {\n    const code: Str = ids[i];\n    const entry = this.safeDict (data, KEY);\n    out.push (this.safeString (entry, 'x'));\n}\nreturn out;";
    test('a string key reads the member with the comma-ok assertion (fails on the base printer)', () => {
        const out = print ('async handle ()', DICT.replace ('KEY', 'code'));
        expect (out).toContain ('var entry, _ = data[code].(map[string]any)');
        expect (out).not.toContain ('SafeMapTyped(data, code)');
    });
    test('a key that is not a proven Go string keeps the wrap', () => {
        const out = print ('async handle (k: any)', DICT.replace ('KEY', 'k'));
        expect (out).toContain ('SafeMapTyped(data, k)');
        expect (out).not.toContain ('data[k].(map[string]any)');
    });
    test('a container written through keeps the wrap', () => {
        const body = DICT.replace ('KEY', 'code').replace ("const ids", "data['y'] = 1;\nconst ids");
        const out = print ('async handle ()', body);
        expect (out).not.toContain ('data[code].(map[string]any)');
    });
    test('a container that is a parameter (not a decoded response) keeps the wrap', () => {
        const out = print ('async handle (data: Dict)', "const ids = Object.keys (data);\nconst out = [];\nfor (let i = 0; i < ids.length; i++) {\n    const code: Str = ids[i];\n    const entry = this.safeDict (data, code);\n    out.push (this.safeString (entry, 'x'));\n}\nreturn out;");
        expect (out).not.toContain ('data[code].(map[string]any)');
    });
    test('a list member with a string key reads with the comma-ok list assertion', () => {
        const out = print ('async handle ()', DICT.replace ('KEY', 'code').replace ("const entry = this.safeDict (data, code);\n    out.push (this.safeString (entry, 'x'));", "const rows = this.safeList (data, code);\n    out.push (rows.length);"));
        expect (out).toContain ('var rows, _ = data[code].([]any)');
    });
});

describe('typed map receiver: dict read keyed on the static map[string]any type alone', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n'
        + '    safeString (d: any, k: any, def: any = undefined): Str { return d; }\n'
        + '    safeDict (d: any, k: any, def: any = undefined): Dict { return d; }\n';
    const print = (sig: string, body: string): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'typedmap-'));
        try {
            const dir = path.join (tmp, 'ts', 'src', 'base');
            fs.mkdirSync (dir, { 'recursive': true });
            const file = path.join (dir, 'Exchange.ts');
            fs.writeFileSync (file, HEAD + '    ' + sig + ' {\n' + body + '\n    }\n}\n');
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    test('a written map local with a literal key reads by comma-ok (fails on the base printer)', () => {
        const out = print ('parse (k: string)', "const market: Dict = {};\nmarket['x'] = 1;\nconst precision = this.safeDict (market, 'precision');\nreturn this.safeString (precision, 'amount');");
        expect (out).toContain ('var precision, _ = market["precision"].(map[string]any)');
        expect (out).not.toContain ('SafeMapTyped(market');
    });
    test('the {} default is restored after the read when the read is nil (missing key, nil map, wrong kind)', () => {
        const out = print ('parse (k: string)', "const market: Dict = {};\nmarket['x'] = 1;\nconst info = this.safeDict (market, 'info', {});\nreturn info;");
        expect (out).toContain ('var info map[string]any\n\tinfo, _ = market["info"].(map[string]any)\n\tif info == nil {\n\t\tinfo = map[string]any{}\n\t}');
    });
    test('a local written through a cast or stored into another dict keeps its own rules', () => {
        const out = print ('parse (k: string)', "const market: Dict = {};\nmarket['x'] = 1;\nconst o = this.safeDict (market, 'o');\n(o as Dict)['y'] = 1;\nconst f = this.safeDict (market, 'f');\nmarket['z'] = f;\nreturn o;");
        expect (out).not.toContain ('var o, _ = market["o"].(map[string]any)');
        expect (out).not.toContain ('var f, _ = market["f"].(map[string]any)');
    });
    test('an untyped receiver keeps the helper', () => {
        const out = print ('parse (market: any, k: any)', "const precision = this.safeDict (market, 'precision');\nreturn this.safeString (precision, 'amount');");
        expect (out).not.toContain ('market["precision"].(map[string]any)');
    });
    test('a key that is not a Go string keeps the helper', () => {
        const out = print ('parse (k: any)', "const market: Dict = {};\nmarket['x'] = 1;\nconst precision = this.safeDict (market, k);\nreturn this.safeString (precision, 'amount');");
        expect (out).not.toContain ('market[k].(map[string]any)');
    });
});

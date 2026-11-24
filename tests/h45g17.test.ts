import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

const src = (body: string) => [
    'type Dict = { [key: string]: any };',
    'type Str = string | undefined;',
    'class Base {',
    '    options: Dict = {};',
    '    safeString (a: any, b: any, c: any = undefined): Str { return undefined; }',
    '    safeInteger (a: any, b: any, c: any = undefined): any { return undefined; }',
    '    extend (a: any, b: any): Dict { return {}; }',
    '    delay (t: any, f: any, ...a: any[]): void { }',
    '    async putKey (r: Dict): Promise<any> { return undefined; }',
    '    async postKey (r: Dict): Promise<any> { return undefined; }',
    '}',
    'class ex extends Base {',
    body,
    '}',
    '',
].join ('\n');
const root = fs.mkdtempSync (path.join (process.env.TMPDIR ?? os.tmpdir (), 'h45g17-'));
let seq = 0;
const go = (body: string) => {
    const full = path.join (root, 'ts/src/pro/venue' + (seq++) + '.ts');
    fs.mkdirSync (path.dirname (full), { recursive: true });
    fs.writeFileSync (full, src (body));
    const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
    installCcxtGoHooks (t.goTranspiler);
    return t.transpileGoByPath (full).content as string;
};
const auth = (arg: string) => [
    '    async authenticate (params: Dict = {}) {',
    '        const response = await this.postKey (params);',
    '        const listenKey = this.safeString (response, \'listenKey\');',
    '        this.delay (1000, this.keepAlive, ' + arg + ', params);',
    '        return listenKey;',
    '    }',
].join ('\n');
const keepAlive = [
    '    async keepAlive (listenKey: Str, params: Dict = {}) {',
    '        if (listenKey === undefined) {',
    '            return;',
    '        }',
    '        const request: Dict = {',
    '            \'listenKey\': listenKey,',
    '        };',
    '        await this.putKey (this.extend (request, params));',
    '        this.delay (1000, this.keepAlive, listenKey, params);',
    '    }',
].join ('\n');

afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

describe ('h45 G17 a Str parameter reached only through delay runners', () => {
    test ('positive: every delay passes a *string, so the parameter prints *string', () => {
        const out = go (auth ('listenKey') + '\n' + keepAlive);
        expect (out).toContain ('KeepAliveAsync(listenKey *string, optionalArgs ...any)');
        expect (out).toContain ('keepAliveBody(ch chan any, listenKey *string, optionalArgs ...any)');
        expect (out).toContain ('if listenKey == nil {');
        expect (out).not.toContain ('IsEqual(listenKey, nil)');
    });
    test ('negative: a delay passing a plain literal keeps the untyped slot', () => {
        const out = go (auth ('\'k\'') + '\n' + keepAlive);
        expect (out).toContain ('KeepAliveAsync(listenKey any, optionalArgs ...any)');
    });
    test ('negative: a delay passing an untyped value keeps the untyped slot', () => {
        const out = go (auth ('response') + '\n' + keepAlive);
        expect (out).toContain ('KeepAliveAsync(listenKey any, optionalArgs ...any)');
    });
    test ('negative: a bare method reference outside a runner keeps the untyped slot', () => {
        const out = go (auth ('listenKey') + '\n' + keepAlive + '\n    other () { const f = this.keepAlive; return f; }');
        expect (out).toContain ('KeepAliveAsync(listenKey any, optionalArgs ...any)');
    });
});

import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const HEAD = 'class Exchange {\n'
    + '    watch (h: any): any { return h; }\n'
    + '}\nexport default Exchange;\n';
const TYPES = 'type Str = string | undefined;\ntype Dict = { [key: string]: any };\ntype NullableDict = Dict | undefined;\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h18g03-'));
    try {
        fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
        const file = path.join (dir, 'ts', 'src', 'x.ts');
        fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), TYPES + HEAD);
        fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\n' + TYPES + 'export default class X extends Exchange {\n' + body + '\n}\n');
        const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
        const t = new Transpiler (config);
        installCcxtGoLocalTypes (t.goTranspiler);
        return t.transpileGoByPath (file).content;
    } finally {
        fs.rmSync (dir, { 'recursive': true, 'force': true });
    }
};

const SIGN = '    sign (path: string, apiName = \'public\', method = \'GET\', params = {}, headers: any = undefined, body: any = undefined) {\n'
    + '        const privateHeaders: Dict = {};\n'
    + '        if (apiName === \'private\') {\n'
    + '            privateHeaders[\'k\'] = path;\n'
    + '        }\n'
    + '        const requestHeaders: NullableDict = (apiName === \'private\') ? privateHeaders : undefined;\n'
    + '        return { \'url\': path, \'method\': method, \'body\': body, \'headers\': requestHeaders };\n'
    + '    }';

const variant = (from: string, to: string): string => SIGN.replace (from, to);

describe ('go ternary declaration with a nil arm beside a map arm', () => {
    test ('sign() headers ternary prints a typed if/else map local', () => {
        const out = print (SIGN);
        expect (out).toContain ('var requestHeaders map[string]any\n');
        expect (out).toContain ('requestHeaders = privateHeaders\n');
        expect (out).toContain ('requestHeaders = nil\n');
        expect (out).not.toContain ('var requestHeaders any = func() any {');
    });
    test ('a nil arm read by a nil test still types the local', () => {
        const out = print (variant ('return {', 'if (requestHeaders === undefined) {\n            return {};\n        }\n        return {'));
        expect (out).toContain ('var requestHeaders map[string]any\n');
    });
    test ('a nilable value handed to a call keeps the box', () => {
        const out = print (variant ('return {', 'this.watch (requestHeaders);\n        return {'));
        expect (out).toContain ('var requestHeaders any = func() any {');
    });
    test ('a later write keeps the box', () => {
        const out = print (variant ('return {', 'requestHeaders = undefined;\n        return {'));
        expect (out).not.toContain ('var requestHeaders map[string]any');
    });
    test ('outside sign() a dict slot keeps the box', () => {
        const out = print (SIGN.replace ('sign (', 'other ('));
        expect (out).toContain ('var requestHeaders any = func() any {');
    });
    test ('an undeclared local keeps the box', () => {
        const out = print (variant ('const requestHeaders: NullableDict =', 'const requestHeaders ='));
        expect (out).toContain ('var requestHeaders map[string]any\n');
    });
});

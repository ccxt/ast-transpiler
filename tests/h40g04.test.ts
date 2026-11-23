import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoDictParams } from '../src/transpiler';

describe ('go base *string params: handleErrors requestBody', () => {
    const root = path.join (__dirname, 'files', 'tmp-h40g04', 'ts', 'src');
    const BASE =
        'type Str = string | undefined;\n' +
        'type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    handleErrors (code: number, reason: string, url: string, method: string, headers: Dict, body: string, response: any, requestHeaders: any, requestBody: Str) {\n' +
        '        return undefined;\n' +
        '    }\n' +
        '}\n';
    const VENUE = (bodyType: string, extra: string) =>
        "import { Exchange } from './base/Exchange';\n" +
        'type Str = string | undefined;\n' +
        'type Dict = { [key: string]: any };\n' +
        'export class ex extends Exchange {\n' +
        '    handleErrors (code: number, reason: string, url: string, method: string, headers: Dict, body: string, response: any, requestHeaders: any, requestBody: ' + bodyType + ') {\n' +
        extra +
        '        return undefined;\n' +
        '    }\n' +
        '    run (x: any) {\n' +
        "        this.handleErrors (1, '', '', '', {}, '', x, {}, undefined);\n" +
        '    }\n' +
        '}\n';
    const print = (file: string, bodyType = 'Str', extra = '', install = true): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'ex.ts'), VENUE (bodyType, extra));
        const t = new Transpiler ({ verbose: false, go: {} });
        if (install) { installCcxtGoDictParams (t.goTranspiler); }
        return t.transpileGoByPath (path.join (root, file)).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h40g04'), { recursive: true, force: true }));

    test ('the base prints *string (boxed without the table)', () => {
        expect (print ('base/Exchange.ts')).toMatch (/requestHeaders \S+, requestBody \*string\)/);
        expect (print ('base/Exchange.ts', 'Str', '', false)).toMatch (/requestBody any\)/);
    });
    test ('the venue override follows the base and an undefined argument prints nil', () => {
        const out = print ('ex.ts');
        expect (out).toMatch (/requestBody \*string\)/);
        expect (out).toMatch (/HandleErrors\([^\n]*, nil\)/);
    });
    test ('an override that nil-tests the body keeps *string', () => {
        expect (print ('ex.ts', 'Str', '        if (requestBody === undefined) { return 1; }\n')).toMatch (/requestBody \*string\)/);
    });
    test ('an override declaring another kind fails the build', () => {
        expect (() => print ('ex.ts', 'any')).toThrow (/handleErrors\(requestBody\)/);
        expect (() => print ('ex.ts', 'Str', '        requestBody = 5 as any;\n')).toThrow (/handleErrors\(requestBody\)/);
    });
});

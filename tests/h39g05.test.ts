import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoDictParams } from '../src/transpiler';

describe ('go dict params: handleErrors header maps', () => {
    const root = path.join (__dirname, 'files', 'tmp-h39g05', 'ts', 'src');
    const BASE = (above: string, below: string) =>
        'type Dict = { [key: string]: any };\n' +
        'type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        '    handleRest (response: any, requestHeaders: any) {\n' + above + '    }\n' +
        '    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
        '    run (x: any) {\n' + below + '    }\n' +
        '    handleErrors (code: number, reason: string, url: string, method: string, headers: Dict, body: string, response: any, requestHeaders: any, requestBody: Str) {\n' +
        '        return undefined;\n' +
        '    }\n' +
        '}\n';
    const VENUE =
        "import { Exchange } from './base/Exchange';\n" +
        'type Dict = { [key: string]: any };\n' +
        'type Str = string | undefined;\n' +
        'export class ex extends Exchange {\n' +
        '    handleErrors (code: number, reason: string, url: string, method: string, headers: Dict, body: string, response: any, requestHeaders: any, requestBody: Str) {\n' +
        "        const id = this.safeString (headers, 'X-Id');\n" +
        '        return id;\n' +
        '    }\n' +
        '    safeString (d: any, k: any): any { return undefined; }\n' +
        '}\n';
    const print = (file: string, above: string, below: string, install = true): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE (above, below));
        fs.writeFileSync (path.join (root, 'ex.ts'), VENUE);
        const t = new Transpiler ({ verbose: false, go: {} });
        if (install) { installCcxtGoDictParams (t.goTranspiler); }
        return t.transpileGoByPath (path.join (root, file)).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h39g05'), { recursive: true, force: true }));
    const handWritten = "        this.handleErrors (1, '', '', '', response, '', undefined, requestHeaders, undefined);\n";
    const literal = "        this.handleErrors (1, '', '', '', {}, '', x, {}, undefined);\n";

    test ('a call above the transpile delimiter does not keep the header maps boxed', () => {
        const typed = print ('base/Exchange.ts', handWritten, literal);
        expect (typed).toContain ('headers map[string]any, body any, response any, requestHeaders map[string]any, requestBody *string');
        const boxed = print ('base/Exchange.ts', handWritten, literal, false);
        expect (boxed).toContain ('headers any, body any, response any, requestHeaders any');
    });
    test ('the venue override follows the base', () => {
        expect (print ('ex.ts', handWritten, literal)).toContain ('headers map[string]any, body any, response any, requestHeaders map[string]any');
    });
    test ('an untyped call below the delimiter keeps the box (nil and wrong kind stay boxed)', () => {
        const below = "        this.handleErrors (1, '', '', '', x, '', x, undefined, undefined);\n";
        const boxed = print ('base/Exchange.ts', handWritten, below);
        expect (boxed).toContain ('headers any, body any, response any, requestHeaders any');
    });
});

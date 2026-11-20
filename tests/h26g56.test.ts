import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go string-list local joined natively', () => {
    const root = path.join (__dirname, 'files', 'tmp-h26g56', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        "    id: string = 'x';\n" +
        '    safeList (o: any, k: any, d: any = undefined): any { return o; }\n' +
        '    safeString (o: any, k: any, d: any = undefined): Str { return o; }\n' +
        '}\n';
    const print = (body: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE + 'export default Exchange;\n');
        fs.writeFileSync (path.join (root, 'venue.ts'), "import Exchange from './base/Exchange.js';\n" +
            'export default class venue extends Exchange {\n    m (ids: string[], n: number): any {\n' + body + '\n    }\n}\n');
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'venue.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h26g56'), { recursive: true, force: true }));

    const loop = (reset: string) => "        const request: any = {};\n        const len = ids.length;\n        let chunk: string[] = [];\n" +
        "        for (let i = 0; i < len; i++) {\n            chunk.push (ids[i]);\n            request['a'] = chunk.join (',');\n            chunk = " + reset + ";\n        }\n        return request;";

    test ('positive: an empty-literal reset keeps the string[] local typed and joins natively', () => {
        const out = print (loop ('[]'));
        expect (out).toContain ('var chunk []string = []string{}');
        expect (out).toContain ('chunk = []string{}');
        expect (out).toContain ('request["a"] = strings.Join(chunk, ",")');
        expect (out).not.toContain ('Join(chunk, ",")\n'.replace ('\n', '') + 'X');
        expect (out).not.toContain ('= Join(chunk');
    });

    test ('positive: a string-literal list reset is printed as []string', () => {
        const out = print (loop ("[ 'a', 'b' ]"));
        expect (out).toContain ('chunk = []string{"a", "b"}');
        expect (out).toContain ('strings.Join(chunk, ",")');
    });

    test ('negative: a reset to a list holding a non-string keeps the box', () => {
        const out = print (loop ('[ n ]'));
        expect (out).toContain ('var chunk []any = []any{}');
        expect (out).toContain ('= Join(chunk, ",")');
        expect (out).not.toContain ('strings.Join(chunk');
    });

    test ('negative: a reset to a list of a nullable Str element keeps the box', () => {
        const out = print ("        const request: any = {};\n        const maybe = this.safeString (request, 'x');\n        let chunk: string[] = [];\n" +
            "        for (let i = 0; i < ids.length; i++) {\n            chunk.push (ids[i]);\n            request['a'] = chunk.join (',');\n            chunk = [ maybe ];\n        }\n" +
            "        if (chunk[0] === undefined) {\n            return undefined;\n        }\n        return request;");
        expect (out).not.toContain ('chunk = []string{');
        expect (out).not.toContain ('strings.Join(chunk');
    });
});

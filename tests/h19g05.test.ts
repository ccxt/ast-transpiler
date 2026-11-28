import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go optional Str parameter as the nil-guarded needle of a string method', () => {
    const root = path.join (__dirname, 'files', 'tmp-h19g05', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        "    id: string = 'x';\n" +
        '}\n';
    const VENUE = (sig: string, body: string) =>
        "import Exchange from './base/Exchange.js';\n" +
        "import type { Str } from './base/Exchange.js';\n" +
        'export default class venue extends Exchange {\n' +
        '    m (' + sig + '): any {\n' + body + '\n    }\n' +
        '}\n';
    const print = (sig: string, body: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE + 'export default Exchange;\n');
        fs.writeFileSync (path.join (root, 'venue.ts'), VENUE (sig, body));
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'venue.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h19g05'), { recursive: true, force: true }));

    test ('positive: `d !== undefined && d !== \'\'` guard, split by the needle natively', () => {
        const out = print ('id: Str = undefined, market: any = undefined, delimiter: Str = undefined',
            "        if (id !== undefined) {\n            if (delimiter !== undefined && delimiter !== '') {\n                const parts = id.split (delimiter);\n                return parts.length;\n            }\n        }\n        return undefined;");
        expect (out).toContain ('var delimiter *string = GetArgStringPtr(optionalArgs, 2, nil)');
        expect (out).toContain ('strings.Split(*id, *delimiter)');
        expect (out).not.toContain ('Split(id, delimiter)');
    });

    test ('positive: exiting guard, indexOf by the needle natively', () => {
        const out = print ('s: string, flag: boolean = false, needle: Str = undefined',
            "        if (needle === undefined) {\n            return -1;\n        }\n        return 'abc'.indexOf (needle);");
        expect (out).toContain ('GetArgStringPtr(optionalArgs, 1, nil)');
        expect (out).toContain ('strings.Index("abc", *needle)');
    });

    test ('negative: unguarded needle keeps the box and the helper', () => {
        const out = print ('s: string, flag: boolean = false, needle: Str = undefined',
            '        return s.indexOf (needle as string);');
        expect (out).not.toContain ('GetArgStringPtr(optionalArgs, 1');
        expect (out).not.toContain ('*needle');
    });

    test ('negative: an `any`-declared needle with a non-string write keeps the box', () => {
        const out = print ('s: string, flag: boolean = false, needle: any = undefined',
            "        needle = 3;\n        if (needle !== undefined) {\n            return s.indexOf (needle);\n        }\n        return -1;");
        expect (out).not.toContain ('GetArgStringPtr(optionalArgs, 1');
        expect (out).not.toContain ('*needle');
    });

    test ('negative: a guarded needle also stored into a list a consumer nil-tests keeps the box', () => {
        const out = print ('s: string, flag: boolean = false, needle: Str = undefined',
            "        const xs = [ needle ];\n        if (xs[0] === undefined) {\n            return -1;\n        }\n        if (needle !== undefined) {\n            return s.indexOf (needle);\n        }\n        return -1;");
        expect (out).not.toContain ('GetArgStringPtr(optionalArgs, 1');
    });
});

import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go optional Str parameter bound with GetArgStringPtr under a nil guard', () => {
    const root = path.join (__dirname, 'files', 'tmp-h18g05', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        "    id: string = 'x';\n" +
        '}\n';
    const VENUE = (sig: string, body: string) =>
        "import Exchange from './base/Exchange.js';\n" +
        "import type { Str } from './base/Exchange.js';\n" +
        'export default class venue extends Exchange {\n' +
        '    m (' + sig + '): Str {\n' + body + '\n    }\n' +
        '}\n';
    const print = (sig: string, body: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE + 'export default Exchange;\n');
        fs.writeFileSync (path.join (root, 'venue.ts'), VENUE (sig, body));
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'venue.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h18g05'), { recursive: true, force: true }));

    test ('positive: enclosing guard binds *string and upper-cases natively', () => {
        const out = print ('flag: boolean = false, mode: Str = undefined',
            "        let t: Str = 'SPOT';\n        if (mode !== undefined) {\n            t = mode.toUpperCase ();\n        }\n        return t;");
        expect (out).toContain ('GetArgStringPtr(optionalArgs, 1, nil)');
        expect (out).toContain ('strings.ToUpper(*mode)');
        expect (out).not.toContain ('ToUpper(mode)');
    });

    test ('positive: exiting guard, replace natively', () => {
        const out = print ('flag: boolean = false, url: Str = undefined',
            "        if (url === undefined) {\n            return undefined;\n        }\n        return url.replace ('https://', '');");
        expect (out).toContain ('GetArgStringPtr(optionalArgs, 1, nil)');
        expect (out).not.toContain ('Replace(url,');
    });

    test ('negative: unguarded use keeps the box', () => {
        const out = print ('flag: boolean = false, mode: Str = undefined', '        return mode.toUpperCase ();');
        expect (out).not.toContain ('GetArgStringPtr');
        expect (out).toContain ('ToUpper(mode)');
    });

    test ('negative: a non-string write keeps the box', () => {
        const out = print ('flag: boolean = false, mode: any = undefined',
            "        if (mode !== undefined) {\n            return mode.toUpperCase ();\n        }\n        mode = 5;\n        return undefined;");
        expect (out).not.toContain ('GetArgStringPtr');
    });

    test ('negative: value handed on into a list whose element is nil-tested keeps the box', () => {
        const out = print ('flag: boolean = false, mode: Str = undefined',
            "        if (mode !== undefined) {\n            return mode.toUpperCase ();\n        }\n        const r: any[] = [ mode ];\n        return (r[0] === undefined) ? 'none' : 'some';");
        expect (out).not.toContain ('GetArgStringPtr');
    });
});

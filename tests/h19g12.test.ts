import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('go nil-tested safeDict locals handed to a callee that reads a nil map as nil', () => {
    const HEAD = 'type Dict = { [key: string]: any };\n'
        + 'class Exchange {\n'
        + '    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o[k] ?? d; }\n'
        + '    safeString (o: any, k: any, d: string = undefined): string | undefined { return o[k] ?? d; }\n'
        + '    safeList (o: any, k: any, d: any[] = undefined): any[] | undefined { return o[k] ?? d; }\n'
        + '    keep (x: any): any { return x; }\n';
    const print = (body: string, extra = ''): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h19g12-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD + '}\nexport default Exchange;\n');
            fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\nclass x extends Exchange {\n    f (response: any, id: string) {\n'
                + body + '        return 1;\n    }\n' + extra + '}\n');
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
            return new Transpiler (config).transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const local = '        const s = this.safeDict (response, id);\n        if (s !== undefined) {\n            this.safeString (s, \'id\');\n        }\n';
    const readsOnly = '    clean (sub: Dict | undefined) {\n        const t = this.safeString (sub, \'topic\');\n        const l = this.safeList (sub, \'symbols\', []);\n        return [ t, l ];\n    }\n';
    const forwards = '    unsub (client: any, sub: Dict | undefined) {\n        const h = this.safeList (sub, \'hashes\', []);\n        this.clean (sub);\n        return h;\n    }\n';

    test ('a nil-tested local handed to a parameter read only through safe readers is typed', () => {
        const out = print (local + '        this.clean (s);\n', readsOnly);
        expect (out).toContain ('var s map[string]any = this.SafeDictMap(response, id)');
        const fwd = print (local + '        this.unsub (1, s);\n', readsOnly + forwards);
        expect (fwd).toContain ('var s map[string]any = this.SafeDictMap(response, id)');
    });

    test ('negatives keep the box', () => {
        // the callee nil-tests its parameter: a nil map inside `any` is not nil there
        expect (print (local + '        this.g (s);\n', '    g (sub: Dict | undefined) {\n        if (sub === undefined) {\n            return 0;\n        }\n        return 1;\n    }\n'))
            .toContain ('var s any = this.SafeDict(');
        // the callee stores its parameter into another value
        expect (print (local + '        this.g (s);\n', '    g (sub: Dict | undefined) {\n        const o = this.keep (sub);\n        return o;\n    }\n'))
            .toContain ('var s any = this.SafeDict(');
        // the callee writes a value of another type to the parameter
        expect (print (local + '        this.g (s);\n', '    g (sub: any) {\n        sub = 1;\n        return this.safeString (sub, \'x\');\n    }\n'))
            .toContain ('var s any = this.SafeDict(');
        // an optional parameter binds through GetArg
        expect (print (local + '        this.g (s);\n', '    g (sub: Dict = undefined) {\n        return this.safeString (sub, \'x\');\n    }\n'))
            .toContain ('var s any = this.SafeDict(');
    });
});

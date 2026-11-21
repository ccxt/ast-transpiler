import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('go safeDict locals whose default is a never-nil safeDict const local', () => {
    const HEAD = 'type Dict = { [key: string]: any };\n'
        + 'class Exchange {\n'
        + '    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o[k] ?? d; }\n'
        + '    safeString (o: any, k: any, d: string = undefined): string | undefined { return o[k] ?? d; }\n'
        + '    safeList (o: any, k: any, d: any[] = undefined): any[] | undefined { return o[k] ?? d; }\n'
        + '    keep (x: any): any { return x; }\n';
    const print = (body: string, extra = ''): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h20g14-'));
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
    test ('a const never-nil safeDict local as the default types the read', () => {
        const out = print ('        const d = this.safeDict (response, \'d\', {});\n        const k = this.safeDict (d, \'k\', d);\n        this.keep (k);\n');
        expect (out).toContain ('var k map[string]any = this.SafeDictMap(d, "k", d)');
    });

    test ('negatives keep the box', () => {
        // the default local may be nil (no default)
        expect (print ('        const d = this.safeDict (response, \'d\');\n        const k = this.safeDict (d, \'k\', d);\n        if (k !== undefined) {\n            this.safeString (k, \'i\');\n        }\n'))
            .toContain ('var k any = this.SafeDict(');
        // the default local is rebindable
        expect (print ('        let d = this.safeDict (response, \'d\', {});\n        d = response;\n        const k = this.safeDict (d, \'k\', d);\n        if (k !== undefined) {\n            this.safeString (k, \'i\');\n        }\n'))
            .toContain ('var k any = this.SafeDict(');
        // the default is a parameter
        expect (print ('        const k = this.safeDict (response, \'k\', response);\n        if (k !== undefined) {\n            this.safeString (k, \'i\');\n        }\n'))
            .toContain ('var k any = this.SafeDict(');
    });
});

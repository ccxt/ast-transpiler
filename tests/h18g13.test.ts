import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('go nil-tested safeDict locals redeclared in a sibling block', () => {
    const HEAD = 'type Dict = { [key: string]: any };\n'
        + 'class Exchange {\n'
        + '    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o[k] ?? d; }\n'
        + '    safeString (o: any, k: any, d: string = undefined): string | undefined { return o[k] ?? d; }\n'
        + '    keep (x: any): any { return x; }\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h18g13-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD + '}\nexport default Exchange;\n');
            fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\nclass x extends Exchange {\n    f (response: any, ids: string[]) {\n'
                + '        const out = [];\n' + body + '        return out;\n    }\n}\n');
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
            return new Transpiler (config).transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const guarded = '        for (let j = 0; j < ids.length; j++) {\n            const t = this.safeDict (response, ids[j]);\n'
        + '            if (t !== undefined) {\n                out.push (this.safeString (t, \'id\'));\n            }\n        }\n';

    test ('a guarded local typed although a sibling block declares the name again', () => {
        const out = print (guarded + '        for (let j = 0; j < ids.length; j++) {\n            const t = this.keep (ids[j]);\n            out.push (t);\n        }\n');
        expect (out).toContain ('var t map[string]any = this.SafeDictMap(response, ids[j])');
        expect (out).toContain ('var t any = this.Keep(');
    });

    test ('negatives keep the box', () => {
        // the nil value escapes into an any slot outside the guard
        expect (print ('        for (let j = 0; j < ids.length; j++) {\n            const t = this.safeDict (response, ids[j]);\n            out.push (t);\n        }\n'
            + '        for (let j = 0; j < ids.length; j++) {\n            const t = this.keep (ids[j]);\n            out.push (t);\n        }\n')).toContain ('var t any = this.SafeDict(');
        // a function-scoped var redeclared: the names do not resolve to separate locals
        expect (print ('        for (let j = 0; j < ids.length; j++) {\n            var t = this.safeDict (response, ids[j]);\n'
            + '            if (t !== undefined) {\n                out.push (this.safeString (t, \'id\'));\n            }\n        }\n'
            + '        for (let j = 0; j < ids.length; j++) {\n            var t = this.keep (ids[j]);\n            out.push (t);\n        }\n')).not.toContain ('var t map[string]any');
        // a write of another type to the guarded declaration
        expect (print ('        for (let j = 0; j < ids.length; j++) {\n            let t = this.safeDict (response, ids[j]);\n'
            + '            if (t !== undefined) {\n                t = this.keep (1);\n            }\n        }\n'
            + '        for (let j = 0; j < ids.length; j++) {\n            const t = this.keep (ids[j]);\n            out.push (t);\n        }\n')).not.toContain ('var t map[string]any');
    });
});

import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

// a safeStringList local (string or string list by API contract) prints as the []string SafeStringList returns
describe ('h28t02: safeStringList locals are []string', () => {
    const PRELUDE = 'type Dict = { [key: string]: any };\ntype Strings = string[] | undefined;\nexport class Exchange {\n'
        + '    safeStringList (a: any, ks: any[]): Strings { return a; }\n    safeString (a: any, k: any): string { return a; }\n';
    const run = (members: string): string => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h28t02-'));
        try {
            const src = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (src, { recursive: true });
            const file = path.join (src, 'x.ts');
            fs.writeFileSync (file, PRELUDE + members + '}\n');
            return new Transpiler ({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 } } }).transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { recursive: true, force: true });
        }
    };
    test ('nil-tested, length-looped and stored under a non-nil guard', () => {
        const out = run ('    f (params: Dict): Dict {\n        const request: Dict = {};\n        const ids = this.safeStringList (params, [ "a", "b" ]);\n'
            + '        if (ids !== undefined) {\n            for (let i = 0; i < ids.length; i++) {\n                request[ids[i]] = this.safeString (ids, i);\n            }\n'
            + '            request["ids"] = ids;\n        }\n        return request;\n    }\n');
        expect (out).toContain ('var ids []string = this.SafeStringList(params, []any{"a", "b"})');
        expect (out).toContain ('len(ids)');
    });
    test ('a store without a non-nil guard keeps the box (typed nil into any)', () => {
        const out = run ('    f (params: Dict): Dict {\n        const request: Dict = {};\n        const ids = this.safeStringList (params, [ "a" ]);\n'
            + '        request["ids"] = ids;\n        return request;\n    }\n');
        expect (out).not.toContain ('var ids []string');
    });
    test ('an index read outside a length-bounded loop keeps the box', () => {
        const out = run ('    f (params: Dict): any {\n        const ids = this.safeStringList (params, [ "a" ]);\n'
            + '        if (ids !== undefined) {\n            return ids[0];\n        }\n        return undefined;\n    }\n');
        expect (out).not.toContain ('var ids []string');
    });
});

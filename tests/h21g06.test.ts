import fs from 'fs';
import path from 'path';
import * as os from 'os';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const HEAD =
    'type Dict = { [key: string]: any };\n' +
    'type Int = number | undefined;\n' +
    'type IndexType = number | string;\n' +
    'export class ex {\n' +
    '    arraySlice (array: any, first: any, second: Int = undefined) { return array; }\n' +
    '    g (r: any, limit: Int = undefined) { return r; }\n' +
    '    safeFloat (o: any, k: IndexType, d: any = undefined): number { return 0; }\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h21g06-'));
    fs.mkdirSync (path.join (dir, 'ts', 'src'), { recursive: true });
    fs.writeFileSync (path.join (dir, 'ts', 'src', 'ex.ts'), HEAD + body + '}\n');
    const cwd = process.cwd ();
    try {
        process.chdir (dir);
        const x = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        installCcxtGoLocalTypes (x.goTranspiler);
        return x.transpileGoByPath ('ts/src/ex.ts').content;
    } finally {
        process.chdir (cwd);
        fs.rmSync (dir, { recursive: true, force: true });
    }
};
const FBL =
    '    filterByLimit (array: any[], limit: Int = undefined, key: IndexType = "timestamp", fromStart: boolean = false): any[] {\n' +
    '        if (limit !== undefined && limit !== null) {\n' +
    '            const arrayLength = array.length;\n' +
    '            if (arrayLength > 0) {\n' +
    '                let ascending = true;\n' +
    '                if (fromStart) {\n' +
    '                    const limitResolved: Int = (limit > arrayLength) ? arrayLength : limit;\n' +
    '                    if (ascending) {\n' +
    '                        return this.arraySlice (array, 0, limitResolved);\n' +
    '                    }\n' +
    '                    return this.arraySlice (array, -limitResolved);\n' +
    '                }\n' +
    '                if (ascending) {\n' +
    '                    return this.arraySlice (array, -limit);\n' +
    '                }\n' +
    '                return this.arraySlice (array, 0, limit);\n' +
    '            }\n' +
    '        }\n' +
    '        return array;\n' +
    '    }\n';

const fn = (b: string, guard = 'limit !== undefined'): string =>
    '    f (array: any[], limit: Int = undefined): any[] {\n        if (' + guard + ') {\n' + b + '        }\n        return array;\n    }\n';

describe ('h21-g06: Int limit negated under a nil guard binds *int64 (the build pass then prints OpNeg of it natively)', () => {
    test ('filterByLimit binds GetArgInt64Ptr with native compare and negation', () => {
        const out = print (FBL);
        expect (out).toContain ('var limit *int64 = GetArgInt64Ptr(optionalArgs, 0, nil)');
        expect (out).toContain ('if limit != nil && *limit > int64(arrayLength) {');
        expect (out).not.toContain ('IsGreaterThan(limit');
    });
    test ('a bare negation binds the limit as *int64', () => {
        const out = print (fn ('            return this.arraySlice (array, -limit);\n'));
        expect (out).toContain ('var limit *int64 = GetArgInt64Ptr(optionalArgs, 0, nil)');
    });
    test ('an unguarded negation keeps OpNeg, which derefScalars the pointer', () => {
        const out = print (fn ('            return array;\n        }\n        if (array.length > 0) {\n            return this.arraySlice (array, -limit);\n'));
        expect (out).toContain ('OpNeg(limit)');
    });
    test ('negative: a non-Int write keeps the box', () => {
        const out = print (fn ('            limit = "x" as any;\n            return this.arraySlice (array, -limit);\n'));
        expect (out).toContain ('limit := GetArg(optionalArgs, 0, nil)');
        expect (out).not.toContain ('-*limit');
    });
    test ('negative: the limit handed on as any (a nil test downstream) keeps the box', () => {
        const out = print (fn ('            return [ limit, -limit ];\n'));
        expect (out).toContain ('limit := GetArg(optionalArgs, 0, nil)');
    });
});

const dflt = (b: string, def = '1000'): string => '    h (symbol: string, limit: Int = ' + def + ', params = {}) {\n' + b + '    }\n';

describe ('h21-g06: Int with a numeric default binds int64 and its nil tests print their constant', () => {
    test ('a nil-guarded store binds GetArgInt64 and prints min natively', () => {
        const out = print (dflt ('        const request: Dict = {};\n        if (limit !== undefined) {\n            request["size"] = Math.min (limit, 2000);\n        }\n        return request;\n'));
        expect (out).toContain ('var limit int64 = GetArgInt64(optionalArgs, 0, 1000)');
        expect (out).toContain ('if true {');
        expect (out).toContain ('request["size"] = min(limit, 2000)');
        expect (out).not.toContain ('limit != nil');
    });
    test ('an equality nil test prints false', () => {
        const out = print (dflt ('        return (limit === undefined) ? 10000 : Math.min (limit, 10000);\n', '100'));
        expect (out).toContain ('var limit int64 = GetArgInt64(optionalArgs, 0, 100)');
        expect (out).not.toContain ('limit == nil');
    });
    test ('negative: an undefined default keeps the nil test', () => {
        const out = print (dflt ('        const request: Dict = {};\n        if (limit !== undefined) {\n            request["size"] = limit;\n        }\n        return request;\n', 'undefined'));
        expect (out).not.toContain ('if true {');
        expect (out).toContain ('limit != nil');
    });
    test ('negative: a non-Int write keeps the box and the nil test', () => {
        const out = print (dflt ('        limit = "x" as any;\n        if (limit !== undefined) {\n            return limit;\n        }\n        return 0;\n'));
        expect (out).not.toContain ('GetArgInt64(');
        expect (out).not.toContain ('if true {');
    });
    test ('negative: a local that can be nil keeps its nil test', () => {
        const out = print (dflt ('        let other: Int = undefined;\n        if (other !== undefined) {\n            return other;\n        }\n        return limit;\n'));
        expect (out).not.toContain ('if true {');
    });
});

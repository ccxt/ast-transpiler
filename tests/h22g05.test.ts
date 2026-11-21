import fs from 'fs';
import path from 'path';
import * as os from 'os';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const HEAD =
    'type Dict = { [key: string]: any };\n' +
    'type Int = number | undefined;\n' +
    'type Str = string | undefined;\n' +
    'class base {\n' +
    '    parseToInt (v: any): number { return 0; }\n' +
    '    extend (a: any, b: any = {}): any { return a; }\n' +
    '    async get (r: any): Promise<any> { return r; }\n' +
    '    async fa (since: Int = undefined, limit: Int = undefined, params: Dict = {}): Promise<any> { return undefined; }\n' +
    '    async fb (since: Int = undefined, limit: Int = undefined, params: Dict = {}): Promise<any> { return undefined; }\n' +
    '}\n' +
    'export class ex extends base {\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h22g05-'));
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
const CLAMP =
    '    clampPerPage (limit: Int): Int {\n' +
    '        if (limit === undefined) {\n' +
    '            return limit;\n' +
    '        }\n' +
    '        const requested = this.parseToInt (limit);\n' +
    '        if (requested >= 100) {\n' +
    '            return 100;\n' +
    '        }\n' +
    '        return limit;\n' +
    '    }\n';
const caller = (name: string, guard = 'limit !== undefined'): string =>
    '    override async ' + name + ' (since: Int = undefined, limit: Int = undefined, params: Dict = {}): Promise<any> {\n' +
    '        const request: Dict = {};\n' +
    '        if (' + guard + ') {\n' +
    '            request[\'perPage\'] = this.clampPerPage (limit);\n' +
    '        }\n' +
    '        return await this.get (this.extend (request, params));\n' +
    '    }\n';

describe ('h22-g05: a non-defaulted Int clamp helper prints *int64 end to end', () => {
    test ('the clamp signature and its callers bind *int64', () => {
        const out = print (CLAMP + caller ('fa') + caller ('fb'));
        expect (out).toContain ('ClampPerPage(limit *int64) *int64 {');
        expect (out).toContain ('var limit *int64 = GetArgInt64Ptr(optionalArgs, 1, nil)');
        expect (out).not.toContain ('IsEqual(limit, nil)');
        expect (out).toContain ('resultValue := int64(100)');
    });
    test ('negative: an unguarded caller keeps the box (a nil *int64 would be stored in the request)', () => {
        const out = print (CLAMP + caller ('fa') + caller ('fb', 'true'));
        expect (out).not.toContain ('ClampPerPage(limit *int64) *int64 {');
    });
});

const WHEAD =
    'type Dict = { [key: string]: any };\n' +
    'type Int = number | undefined;\n' +
    'class base {\n' +
    '    async sub (a: any, b: any): Promise<any> { return a; }\n' +
    '    async w (symbol: string, limit: Int = undefined, params: Dict = {}): Promise<any> { return undefined; }\n' +
    '}\n' +
    'export class ex extends base {\n';
const wprint = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h22g05w-'));
    fs.mkdirSync (path.join (dir, 'ts', 'src'), { recursive: true });
    fs.writeFileSync (path.join (dir, 'ts', 'src', 'ex.ts'), WHEAD + body + '}\n');
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
const watch = (decl: string): string =>
    '    override async w (symbol: string, limit: Int = undefined, params: Dict = {}): Promise<any> {\n' +
    '        ' + decl + '\n' +
    '        const req = [ symbol, limitValue ];\n' +
    '        return await this.sub (req, params);\n' +
    '    }\n';

describe ('h22-g05: a const Int literal-default join of the limit binds the limit as *int64', () => {
    test ('the join prints int64 and the limit binds GetArgInt64Ptr', () => {
        const out = wprint (watch ('const limitValue: Int = (limit === undefined) ? 10 : limit;'));
        expect (out).toContain ('var limit *int64 = GetArgInt64Ptr(optionalArgs, 0, nil)');
        expect (out).toContain ('var limitValue int64');
        expect (out).not.toContain ('var limitValue any = func() any {');
    });
    test ('negative: an unannotated let join keeps the box', () => {
        const out = wprint (watch ('let limitValue = (limit === undefined) ? 10 : limit;'));
        expect (out).toContain ('limit := GetArg(optionalArgs, 0, nil)');
    });
    test ('negative: a non-literal default keeps the box', () => {
        const out = wprint (watch ('const limitValue: Int = (limit === undefined) ? symbol.length : limit;'));
        expect (out).toContain ('limit := GetArg(optionalArgs, 0, nil)');
    });
});

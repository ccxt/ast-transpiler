import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go: a []string slice stored into a map is boxed as []any', () => {
    const root = path.join (__dirname, 'files', 'tmp-h33p02', 'ts', 'src');
    const BASE =
        'export type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    keep (t: any): any {\n' +
        '        return t;\n' +
        '    }\n' +
        '}\n';
    const VENUE =
        "import { Exchange, Dict } from './base/Exchange.js';\n" +
        'class v extends Exchange {\n' +
        '    cancelMany (ids: string[]) {\n' +
        '        const request: Dict = {};\n' +
        "        request['orderidlist'] = ids;\n" +
        "        const lit: Dict = { 'orders': ids };\n" +
        '        return [ request, lit ];\n' +
        '    }\n' +
        '    untouched (rows: any[], n: number) {\n' +
        '        const request: Dict = {};\n' +
        "        request['rows'] = rows;\n" +
        "        request['n'] = n;\n" +
        "        const lit: Dict = { 'rows': rows, 'name': 'x' };\n" +
        '        return [ request, lit ];\n' +
        '    }\n' +
        '}\n' +
        'export default v;\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'v.ts'), VENUE);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        out = t.transpileGoByPath (path.join (root, 'v.ts')).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h33p02'), { recursive: true, force: true }));

    test ('positive: a keyed store and a map literal entry box the []string', () => {
        expect (out).toMatch (/"orderidlist", StringSliceToList\(ids\)\)|\["orderidlist"\] = StringSliceToList\(ids\)/);
        expect (out).toMatch (/"orders": +StringSliceToList\(ids\)/);
    });

    test ('negative: an any list, a scalar and a literal value are stored as they are', () => {
        expect (out).not.toMatch (/StringSliceToList\(rows\)/);
        expect (out).not.toMatch (/StringSliceToList\(n\)/);
        expect (out).not.toMatch (/StringSliceToList\("x"\)/);
    });
});

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe('go guarded list-element read without DerefScalar on a pointer-free list', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\ntype List = any[];\nclass Exchange {\n    options: Dict = {};\n'
        + '    safeString (d: any, k: any, def: any = undefined): Str { return d; }\n'
        + '    safeValue (d: any, k: any, def: any = undefined): any { return d; }\n';
    const print = (body: string): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h25g18-'));
        try {
            const dir = path.join (tmp, 'ts', 'src', 'base');
            fs.mkdirSync (dir, { 'recursive': true });
            const file = path.join (dir, 'Exchange.ts');
            fs.writeFileSync (file, HEAD + '    handle (response: Dict, hashes: string[]) {\n' + body + '\n    }\n}\n');
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    const LOOP = 'const out = [];\nfor (let i = 0; i < hashes.length; i++) {\n    out.push (topics[i]);\n}\nreturn out;';
    test('a list built only from dict literals reads its element bare inside the guard (fails on the base printer)', () => {
        const out = print ("const topics: List = [];\nfor (let j = 0; j < hashes.length; j++) {\n    topics.push ({ 'channel': hashes[j] });\n}\n" + LOOP);
        expect (out).toMatch (/if i >= 0 && i < len\(topics\) \{\n\s*return topics\[i\]\n/);
        expect (out).not.toContain ('DerefScalar(topics[i])');
    });
    test('a list that may hold a string pointer keeps DerefScalar', () => {
        const out = print ("const topics: List = [];\ntopics.push (this.safeString (response, 'a'));\n" + LOOP);
        expect (out).toContain ('DerefScalar(topics[i])');
    });
    test('a list rebound from an untyped value keeps DerefScalar', () => {
        const out = print ("let topics: List = [];\ntopics = this.safeValue (response, 'a');\n" + LOOP);
        expect (out).not.toMatch (/return topics\[i\]\n/);
    });
});

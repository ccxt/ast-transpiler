import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// `xs[K]` on a split `[]string` local under an enclosing `n > K` test or behind an exiting `n !== M` (M > K) guard is
// the plain slice index; a too-small guard, an unguarded read, a rebound list or a `*string` target keeps the old form.
describe ('go guarded literal read on a split string list', () => {
    const root = path.join (__dirname, 'files', 'tmp-h27g33', 'ts', 'src');
    const SRC =
        'type Dict = { [key: string]: any };\n' +
        'type Str = string | undefined;\n' +
        'class Exchange {\n' +
        '    safeString (o: any, k: any, d: any = undefined): Str { return o[k]; }\n' +
        '    market (s: string): Dict { return {}; }\n' +
        '}\n' +
        'class venue extends Exchange {\n' +
        '    exiting (s: string) {\n' +
        '        const ep = s.split (\'-\');\n' +
        '        const epLength = ep.length;\n' +
        '        if (epLength !== 4) {\n' +
        '            throw new Error (\'x\');\n' +
        '        }\n' +
        '        return this.market (ep[3]);\n' +
        '    }\n' +
        '    enclosing (o: Dict) {\n' +
        '        const txid = this.safeString (o, \'txid\', \'\');\n' +
        '        let address = undefined;\n' +
        '        const tp = txid.split (\'@\');\n' +
        '        const numTp = tp.length;\n' +
        '        if (numTp > 1) {\n' +
        '            address = tp[1];\n' +
        '        }\n' +
        '        return address;\n' +
        '    }\n' +
        '    tooSmall (s: string) {\n' +
        '        const sp = s.split (\'_\');\n' +
        '        const n = sp.length;\n' +
        '        if (n !== 2) {\n' +
        '            throw new Error (\'x\');\n' +
        '        }\n' +
        '        return this.market (sp[2]);\n' +
        '    }\n' +
        '    unguarded (s: string) {\n' +
        '        const up = s.split (\'_\');\n' +
        '        return this.market (up[1]);\n' +
        '    }\n' +
        '    rebound (s: string, t: string) {\n' +
        '        let rp = s.split (\'_\');\n' +
        '        if (rp.length > 1) {\n' +
        '            rp = t.split (\'_\');\n' +
        '            return this.market (rp[1]);\n' +
        '        }\n' +
        '        return undefined;\n' +
        '    }\n' +
        '    pointerTarget (s: string) {\n' +
        '        const pt = s.split (\'-\');\n' +
        '        const ptLength = pt.length;\n' +
        '        if (ptLength !== 4) {\n' +
        '            throw new Error (\'x\');\n' +
        '        }\n' +
        '        const pair = pt[0];\n' +
        '        return pair.split (\'/\');\n' +
        '    }\n' +
        '}\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (root, { recursive: true });
        const file = path.join (root, 'venue.ts');
        fs.writeFileSync (file, SRC);
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoLocalTypes (t.goTranspiler);
        out = t.transpileGoByPath (file).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h27g33'), { recursive: true, force: true }));
    test ('positive: an exiting length !== 4 guard proves index 3', () => {
        expect (out).toMatch (/this\.Market\(ep\[3\]\)/);
    });
    test ('positive: an enclosing n > 1 test proves index 1 on a []string', () => {
        expect (out).toMatch (/address = tp\[1\]\n/);
    });
    test ('negative: length !== 2 does not prove index 2', () => {
        expect (out).toMatch (/this\.Market\(GetValue\(sp, 2\)\)/);
    });
    test ('negative: an unguarded read keeps the helper', () => {
        expect (out).toMatch (/this\.Market\(GetValue\(up, 1\)\)/);
    });
    test ('negative: a list rebound after the guard keeps the helper', () => {
        expect (out).toMatch (/this\.Market\(GetValue\(rp, 1\)\)/);
    });
    test ('negative: a *string target keeps its pointer form', () => {
        expect (out).not.toMatch (/pair \*string = SafeStringPtr\(pt\[0\]\)/);
    });
});

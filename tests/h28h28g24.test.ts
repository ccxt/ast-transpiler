import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// index 0 of a split of a proven string, and `xs[0]` behind an if/else whose arms all exit or end in an exiting length
// guard, print the plain slice index; a non-literal separator, a maybe-undefined receiver or an arm that falls through keep the guard.
describe ('go literal read proofs: split index 0 and if/else exits', () => {
    const root = path.join (__dirname, 'files', 'tmp-h28g24', 'ts', 'src');
    const SRC =
        'type Dict = { [key: string]: any };\n' +
        'type Str = string | undefined;\n' +
        'type Strings = string[] | undefined;\n' +
        'class Exchange {\n' +
        '    id: string = "";\n' +
        '    safeString (o: any, k: any, d: any = undefined): Str { return o[k]; }\n' +
        '    market (s: string): Dict { return {}; }\n' +
        '}\n' +
        'class venue extends Exchange {\n' +
        '    splitHead (o: Dict) {\n' +
        '        let side: Str = undefined;\n' +
        '        let t = this.safeString (o, \'type\');\n' +
        '        if (t !== undefined) {\n' +
        '            const hp = t.split (\'-\');\n' +
        '            side = hp[0];\n' +
        '            t = hp[1];\n' +
        '        }\n' +
        '        return [ side, t ];\n' +
        '    }\n' +
        '    splitAnyHead (u: any) {\n' +
        '        const ap = u.split (\'_\');\n' +
        '        const s = ap[0];\n' +
        '        return s;\n' +
        '    }\n' +
        '    splitEmptySep (s: string) {\n' +
        '        const ep = s.split (\'\');\n' +
        '        const x = ep[0];\n' +
        '        return x;\n' +
        '    }\n' +
        '    elseExit (symbols: Strings = undefined) {\n' +
        '        if (symbols === undefined) {\n' +
        '            throw new Error (\'x\');\n' +
        '        } else {\n' +
        '            const symbolsLength = symbols.length;\n' +
        '            if (symbolsLength !== 1) {\n' +
        '                throw new Error (\'y\');\n' +
        '            }\n' +
        '        }\n' +
        '        return this.market (symbols[0]);\n' +
        '    }\n' +
        '    elseFalls (symbols: Strings = undefined) {\n' +
        '        if (symbols === undefined) {\n' +
        '            throw new Error (\'x\');\n' +
        '        } else {\n' +
        '            const n = symbols.length;\n' +
        '        }\n' +
        '        return this.market (symbols[0]);\n' +
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
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h28g24'), { recursive: true, force: true }));
    test ('positive: index 0 of a split of a nil-tested string local is the slice index', () => {
        expect (out).toMatch (/\tside = hp\[0\]\n/);
    });
    test ('positive: an if/else whose arms throw or end in an exiting length guard proves symbols[0]', () => {
        expect (out).toMatch (/return this\.Market\(symbols\[0\]\)\n\t\}\n\tfunc \(this \*venue\) ElseFalls|ElseExit[\s\S]*return this\.Market\(symbols\[0\]\)\n[\s\S]*ElseFalls/);
    });
    test ('negative: index 1 of a split is not proven by the split alone', () => {
        expect (out).not.toMatch (/\tt = hp\[1\]/);
    });
    test ('negative: a split of an untyped `any` receiver keeps its guard', () => {
        expect (out).not.toMatch (/s any = ap\[0\]/);
    });
    test ('negative: an empty separator is not proven', () => {
        expect (out).not.toMatch (/ep\[0\]\)?\n/);
    });
    test ('negative: an else arm that falls through proves nothing', () => {
        expect (out).not.toMatch (/ElseFalls[\s\S]*Market\(symbols\[0\]\)/);
    });
});

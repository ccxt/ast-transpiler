import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// A loop bound seeded `let n = 0` and only ever set to `xs.length` (xs never written) proves `xs[i]` in range, also through
// `(xs as string[])[i]`; a bound written with anything else, or a list written in between, keeps GetValue.
describe ('go loop bound through a length alias local', () => {
    const root = path.join (__dirname, 'files', 'tmp-h29g28', 'ts', 'src');
    const SRC =
        'type Dict = { [key: string]: any };\n' +
        'type Strings = string[] | undefined;\n' +
        'class Exchange {\n' +
        '    marketSymbols (s: Strings): Strings { return s; }\n' +
        '    market (s: string): Dict { return {}; }\n' +
        '}\n' +
        'class venue extends Exchange {\n' +
        '    aliased (symbols: Strings) {\n' +
        '        const symbolsNormalized: Strings = this.marketSymbols (symbols);\n' +
        '        let symbolsLength = 0;\n' +
        '        if (symbolsNormalized !== undefined) {\n' +
        '            symbolsLength = symbolsNormalized.length;\n' +
        '        }\n' +
        '        const out: string[] = [];\n' +
        '        for (let i = 0; i < symbolsLength; i++) {\n' +
        '            out.push (\'x.\' + (symbolsNormalized as string[])[i]);\n' +
        '        }\n' +
        '        return out;\n' +
        '    }\n' +
        '    otherWrite (names: string[], extra: number) {\n' +
        '        let n = 0;\n' +
        '        n = names.length;\n' +
        '        n = extra;\n' +
        '        const out: string[] = [];\n' +
        '        for (let j = 0; j < n; j++) {\n' +
        '            out.push (\'y.\' + names[j]);\n' +
        '        }\n' +
        '        return out;\n' +
        '    }\n' +
        '    listWritten (names: string[]) {\n' +
        '        let k = 0;\n' +
        '        k = names.length;\n' +
        '        names.pop ();\n' +
        '        const out: string[] = [];\n' +
        '        for (let q = 0; q < k; q++) {\n' +
        '            out.push (\'z.\' + names[q]);\n' +
        '        }\n' +
        '        return out;\n' +
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
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h29g28'), { recursive: true, force: true }));
    test ('positive: aliased bound reads the slice natively', () => {
        expect (out).toContain ('out = append(out, Add("x.", symbolsNormalized[i]))');
        expect (out).not.toContain ('GetValue(symbolsNormalized, i)');
    });
    test ('negative: a bound also written with another value keeps GetValue', () => {
        expect (out).not.toContain ('names[j]');
        expect (out).toContain ('GetValue(names, j)');
    });
    test ('negative: a list shrunk after the length was taken keeps GetValue', () => {
        expect (out).not.toContain ('names[q]');
        expect (out).toContain ('GetValue(names, q)');
    });
});

import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// `const x = (y === undefined) ? [] : y` over a `[]string` y prints a typed []string local filled by an
// if/else (never nil); arms that are not a nil-tested []string, or a let local, keep the boxed literal.
describe ('go nil-default ternary over a string list', () => {
    const root = path.join (__dirname, 'files', 'tmp-h27g32', 'ts', 'src');
    const SRC =
        'type Dict = { [key: string]: any };\n' +
        'type Strings = string[] | undefined;\n' +
        'class Exchange {\n' +
        '    ids: string[] = undefined;\n' +
        '    marketSymbols (symbols: Strings = undefined): string[] { return symbols; }\n' +
        '    inArray (x: any, xs: any): boolean { return false; }\n' +
        '    takeRows (rows: any): any { return rows; }\n' +
        '}\n' +
        'class venue extends Exchange {\n' +
        '    fieldDefault (fromId: string) {\n' +
        '        const exchangeIds = (this.ids === undefined) ? [] : this.ids;\n' +
        '        return this.inArray (fromId, exchangeIds);\n' +
        '    }\n' +
        '    localDefault (symbols: Strings = undefined) {\n' +
        '        const symbolsNormalized = this.marketSymbols (symbols);\n' +
        '        const symbolsList: string[] = (symbolsNormalized === undefined) ? [] : symbolsNormalized;\n' +
        '        return this.takeRows ({ \'symbols\': symbolsList });\n' +
        '    }\n' +
        '    reversedDefault (symbols: Strings = undefined) {\n' +
        '        const normalized = this.marketSymbols (symbols);\n' +
        '        const listed = (normalized !== undefined) ? normalized : [];\n' +
        '        return this.takeRows (listed);\n' +
        '    }\n' +
        '    boxedArm (raw: any = undefined) {\n' +
        '        const rows = (raw === undefined) ? [] : raw;\n' +
        '        return this.takeRows (rows);\n' +
        '    }\n' +
        '    letLocal (symbols: Strings = undefined) {\n' +
        '        const n = this.marketSymbols (symbols);\n' +
        '        let mutable = (n === undefined) ? [] : n;\n' +
        '        if (mutable.length === 0) {\n' +
        '            mutable = undefined;\n' +
        '        }\n' +
        '        return this.takeRows (mutable);\n' +
        '    }\n' +
        '    wrongTest (symbols: Strings = undefined, other: any = undefined) {\n' +
        '        const m = this.marketSymbols (symbols);\n' +
        '        const picked = (other === undefined) ? [] : m;\n' +
        '        return this.takeRows (picked);\n' +
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
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h27g32'), { recursive: true, force: true }));

    test ('positive: a []string field with a nil test prints a typed if/else', () => {
        expect (out).toMatch (/var exchangeIds \[\]string\n\s*if [^\n]*this\.Ids, nil\)? \{\n\s*exchangeIds = \[\]string\{\}\n\s*\} else \{\n\s*exchangeIds = this\.Ids\n\s*\}/);
        expect (out).not.toMatch (/var exchangeIds any = func\(\) any/);
    });

    test ('positive: an annotated []string local prints the same form', () => {
        expect (out).toMatch (/var symbolsList \[\]string\n\s*if symbolsNormalized == nil \{\n\s*symbolsList = \[\]string\{\}/);
    });

    test ('positive: the mirrored arm order', () => {
        expect (out).toMatch (/var listed \[\]string\n\s*if normalized != nil \{\n\s*listed = normalized\n\s*\} else \{\n\s*listed = \[\]string\{\}/);
    });

    test ('negative: a boxed arm keeps the literal', () => {
        expect (out).not.toMatch (/var rows \[\]string/);
    });

    test ('negative: a let local later set to undefined is not this rule', () => {
        expect (out).not.toMatch (/var mutable \[\]string\n\s*if/);
    });

    test ('negative: a condition that does not test the list arm keeps the box', () => {
        expect (out).not.toMatch (/var picked \[\]string/);
    });
});

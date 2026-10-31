import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

// hx10w10 GP24: `x.toString()` prints the native op when the receiver's Go type is one the
// helper reproduces exactly — int (Itoa), int64 and a non-nil `*int64` (FormatInt), bool
// (FormatBool), []string (bracket-join) — and the helper call otherwise. The generated
// base-class files take the same arms only once a writer installs the stdlib import seam.

const PRELUDE =
    'type Dict = { [key: string]: any };\n' +
    'type Int = number | undefined;\n' +
    'class Exchange {\n' +
    '    take (x: any): any { return x; }\n' +
    '    safeInteger (o: Dict, k: string, d: Int = undefined): Int { return undefined; }\n' +
    '}\n';

const config = () => ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });

function go (body: string): string {
    const ts = PRELUDE + 'class ex extends Exchange {\n' + body + '}\n';
    return new Transpiler(config()).transpileGo(ts).content;
}

describe('hx10w10 GP24 printToStringCall native arms', () => {
    test('an int local prints strconv.Itoa', () => {
        const out = go(
            '    run (a: any): string {\n' +
            '        const keys = Object.keys (a);\n' +
            '        const n = keys.length;\n' +
            '        return n.toString ();\n' +
            '    }\n');
        expect(out).toContain('var n int = len(keys)');
        expect(out).toContain('return strconv.Itoa(n)');
        expect(out).toContain('import "strconv"');
    });

    test('a nil-guarded *int64 local prints FormatInt of the pointee', () => {
        const out = go(
            '    run (o: Dict): string {\n' +
            '        const id = this.safeInteger (o, "id");\n' +
            '        if (id !== undefined) {\n' +
            '            return id.toString ();\n' +
            '        }\n' +
            '        return "";\n' +
            '    }\n');
        expect(out).toContain('var id *int64 = this.SafeInteger(o, "id")');
        expect(out).toContain('return strconv.FormatInt(*id, 10)');
    });

    test('an unguarded *int64 keeps the helper', () => {
        const out = go(
            '    run (o: Dict): string {\n' +
            '        const id = this.safeInteger (o, "id");\n' +
            '        return id.toString ();\n' +
            '    }\n');
        expect(out).toContain('return ToString(id)');
        expect(out).not.toContain('FormatInt');
    });

    test('a bool local prints FormatBool', () => {
        const ts =
            'function f (x: string): string {\n' +
            '    const b = x === "y";\n' +
            '    return b.toString ();\n' +
            '}\n';
        const out = new Transpiler(config()).transpileGo(ts).content;
        expect(out).toContain('var b bool = (x == "y")');
        expect(out).toContain('return strconv.FormatBool(b)');
    });

    test('a []string local prints the bracket-join form', () => {
        const out = go(
            '    run (a: any): string {\n' +
            '        const s: string = "a-b";\n' +
            '        const parts = s.split ("-");\n' +
            '        return parts.toString ();\n' +
            '    }\n');
        expect(out).toContain('var parts []string = strings.Split(s, "-")');
        expect(out).toContain('return "[" + strings.Join(parts, ", ") + "]"');
        expect(out).toContain('import "strings"');
    });

    test('an any or float64 receiver keeps the helper', () => {
        const anyOut = go(
            '    run (o: Dict): string {\n' +
            '        const x = this.take (o);\n' +
            '        return x.toString ();\n' +
            '    }\n');
        expect(anyOut).toContain('ToString(x)');
        const floatOut = go(
            '    run (a: any): string {\n' +
            '        const x = Math.floor (a);\n' +
            '        return x.toString ();\n' +
            '    }\n');
        expect(floatOut).toContain('ToString(x)');
    });

    test('a string receiver stays the identity and a proven *string derefs', () => {
        const out = go(
            '    run (a: any): string {\n' +
            '        const s = "x";\n' +
            '        const t = this.take (a);\n' +
            '        const x = s.toString ();\n' +
            '        return x;\n' +
            '    }\n');
        expect(out).toContain('var x string = s');
        expect(out).not.toContain('ToString(');
    });

    // The base-class writers splice the transpiled body into a file they assemble themselves,
    // so the printer may only emit a stdlib call there once that writer declares the import.
    test('a generated base file emits the native arm only under the import seam', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hx10w10-GP24-'));
        try {
            const src = path.join(tmp, 'ts', 'src');
            fs.mkdirSync(path.join(src, 'base'), { recursive: true });
            const file = path.join(src, 'base', 'Exchange.ts');
            fs.writeFileSync(file,
                'type Dict = { [key: string]: any };\n' +
                'export class Exchange {\n' +
                '    total (xs: any[]): string {\n' +
                '        const n = xs.length;\n' +
                '        return n.toString ();\n' +
                '    }\n' +
                '}\n');
            const plain = new Transpiler(config()).transpileGoByPath(file).content;
            expect(plain).toContain('ToString(n)');
            expect(plain).not.toContain('import "strconv"');
            const seamed = new Transpiler(config());
            seamed.goTranspiler.goBaseFileStdlibImportSeamPaths = /base\/Exchange\.ts$/;
            const out = seamed.transpileGoByPath(file).content;
            expect(out).toContain('return strconv.Itoa(n)');
            expect(out).toContain('import "strconv"');
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });

    // the seam is a path predicate: a sliced writer's source (the ws cache tests) keeps the helper
    test('a source outside the seam paths keeps the helper', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hx10w10-GP24-cache-'));
        try {
            const src = path.join(tmp, 'ts', 'src');
            fs.mkdirSync(path.join(src, 'base'), { recursive: true });
            const file = path.join(src, 'base', 'test.cache.ts');
            fs.writeFileSync(file,
                'type Dict = { [key: string]: any };\n' +
                'export class TestCache {\n' +
                '    total (xs: any[]): string {\n' +
                '        const n = xs.length;\n' +
                '        return n.toString ();\n' +
                '    }\n' +
                '}\n');
            const seamed = new Transpiler(config());
            seamed.goTranspiler.goBaseFileStdlibImportSeamPaths = /base\/Exchange\.ts$/;
            const out = seamed.transpileGoByPath(file).content;
            expect(out).toContain('ToString(n)');
            expect(out).not.toContain('strconv.Itoa');
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });
});

// hx11 RFM-G1 GP24: the printer answers which stdlib packages a file's native emissions call, so a
// writer that splices the printed body into a file it assembles declares exactly those
// (ITranspiledFile.stdlibImports), and a span the writer cuts out never records an import.
describe('hx11 GP24 stdlib imports the printer recorded', () => {
    const SRC =
        'type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    total (xs: any[]): string {\n' +
        '        const n = xs.length;\n' +
        '        const s: string = \'a-b\';\n' +
        '        const ids = s.split (\'-\');\n' +
        '        const text = ids.join (\',\');\n' +
        '        // @SKIP_START_GO\n' +
        '        const m = xs.length;\n' +
        '        const skipped = m.toString ();\n' +
        '        // @SKIP_END_GO\n' +
        '        const rest = xs.length;\n' +
        '        return n.toString () + text + rest.toString ();\n' +
        '    }\n' +
        '}\n';
    const run = (config: any) => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hx11-GP24-'));
        try {
            const src = path.join(tmp, 'ts', 'src', 'base');
            fs.mkdirSync(src, { recursive: true });
            const file = path.join(src, 'Exchange.ts');
            fs.writeFileSync(file, SRC);
            return new Transpiler({ 'verbose': false, 'go': Object.assign({ 'parser': { 'NUM_LINES_END_FILE': 0 } }, config) }).transpileGoByPath(file);
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    };

    test('the transpiled file lists the packages its native calls need, sorted', () => {
        const res = run({ 'baseFileStdlibImportSeamPaths': 'base/Exchange\\.ts$' });
        expect(res.stdlibImports).toEqual(['strconv', 'strings']);
        expect(res.content).toContain('strconv.Itoa(n)');
        expect(res.content).toContain('strings.Join(ids, ",")');
    });

    test('a file the writer does not declare imports for lists none and keeps the helper', () => {
        const res = run({});
        expect(res.stdlibImports).toEqual([]);
        expect(res.content).toContain('ToString(n)');
    });

    test('a statement inside a cut span keeps the helper call and records no import for it', () => {
        const markers = run({ 'baseFileStdlibImportSeamPaths': 'base/Exchange\\.ts$', 'excisedSpanMarkers': ['@SKIP_START_GO', '@SKIP_END_GO'] });
        expect(markers.content).toContain('ToString(m)');
        expect(markers.content).not.toContain('strconv.Itoa(m)');
        expect(markers.content).toContain('strconv.Itoa(rest)');
        const plain = run({ 'baseFileStdlibImportSeamPaths': 'base/Exchange\\.ts$' });
        expect(plain.content).toContain('strconv.Itoa(m)');
    });
});

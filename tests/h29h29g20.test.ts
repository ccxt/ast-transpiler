import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// a closed `number[]` producer that only pushes loop counters prints `[]any`, and `xs[0]` on its const result after an
// exiting length guard (break / return, also inside a loop body) prints the plain index; other shapes keep the box.
describe ('go number[] producer and loop-body guarded index', () => {
    const tmp = fs.mkdtempSync (path.join (process.env.TMPDIR || os.tmpdir (), 'h29g20-'));
    const root = path.join (tmp, 'ts', 'src');
    const SRC =
        'class Exchange {\n' +
        '    has (c: string): boolean { return c === \'x\'; }\n' +
        '}\n' +
        'class Venue extends Exchange {\n' +
        '    missingOf (channels: string[]): number[] {\n' +
        '        const result: number[] = [];\n' +
        '        for (let i = 0; i < channels.length; i++) {\n' +
        '            if (this.has (channels[i])) {\n' +
        '                result.push (i);\n' +
        '            }\n' +
        '        }\n' +
        '        return result;\n' +
        '    }\n' +
        '    maybeOf (channels: string[]): number[] {\n' +
        '        if (channels.length === 0) {\n' +
        '            return undefined;\n' +
        '        }\n' +
        '        const result: number[] = [];\n' +
        '        return result;\n' +
        '    }\n' +
        '    useLoop (channels: string[]) {\n' +
        '        for (let a = 0; a < 3; a++) {\n' +
        '            const pending = this.missingOf (channels);\n' +
        '            const pendingLength = pending.length;\n' +
        '            if (pendingLength < 2) {\n' +
        '                break;\n' +
        '            }\n' +
        '            const first = pending[0];\n' +
        '            this.has (channels[first]);\n' +
        '        }\n' +
        '        const missing = this.missingOf (channels);\n' +
        '        const missingLength = missing.length;\n' +
        '        if (missingLength === 0) {\n' +
        '            return 0;\n' +
        '        }\n' +
        '        const index = missing[0];\n' +
        '        return index;\n' +
        '    }\n' +
        '    useNoGuard (channels: string[]) {\n' +
        '        for (let a = 0; a < 3; a++) {\n' +
        '            const unguarded = this.missingOf (channels);\n' +
        '            const u0 = unguarded[0];\n' +
        '            this.has (channels[u0]);\n' +
        '        }\n' +
        '    }\n' +
        '    boxOf (v: any): any { return v; }\n' +
        '    anyOf (channels: string[]): number[] {\n' +
        '        const result: number[] = [];\n' +
        '        result.push (this.boxOf (channels));\n' +
        '        return result;\n' +
        '    }\n' +
        '    useAny (channels: string[]) {\n' +
        '        const boxed = this.anyOf (channels);\n' +
        '        const boxedLength = boxed.length;\n' +
        '        if (boxedLength === 0) {\n' +
        '            return undefined;\n' +
        '        }\n' +
        '        const b0 = boxed[0];\n' +
        '        return b0;\n' +
        '    }\n' +
        '    useMaybe (channels: string[]) {\n' +
        '        const maybe = this.maybeOf (channels);\n' +
        '        const maybeLength = maybe.length;\n' +
        '        return maybeLength;\n' +
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
    afterAll (() => fs.rmSync (tmp, { recursive: true, force: true }));
    test ('positive: the producer returns []any and its caller counts with len', () => {
        expect (out).toMatch (/MissingOf\(channels (?:any|\[\]string)\) \[\]any \{/);
        expect (out).toMatch (/var pendingLength int = len\(pending\)/);
    });
    test ('positive: index 0 after a break guard inside a loop body is a plain read', () => {
        expect (out).toMatch (/var first any = pending\[0\]/);
    });
    test ('positive: index 0 after an exiting return guard is a plain read', () => {
        expect (out).toMatch (/var index any = missing\[0\]/);
    });
    test ('negative: no length guard keeps the bounds check', () => {
        expect (out).not.toMatch (/u0 any = unguarded\[0\]/);
        expect (out).toMatch (/0 < len\(unguarded\)/);
    });
    test ('negative: a pushed value of unknown type keeps DerefScalar on the read', () => {
        expect (out).not.toMatch (/var b0 any = boxed\[0\]/);
    });
    test ('negative: a producer with an undefined return keeps the helper at its caller', () => {
        expect (out).not.toMatch (/len\(maybe\)/);
    });
    test ('negative: no DerefScalar closure appears for the proven reads', () => {
        expect (out).not.toMatch (/DerefScalar\(pending\[0\]\)|DerefScalar\(missing\[0\]\)/);
    });
});

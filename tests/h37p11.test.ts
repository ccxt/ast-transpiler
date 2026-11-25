import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// a string local seeded with a literal and rebound from the string overload of a tuple option reader
describe ('h37p11: a literal-seeded string local rebound from a string option slot stays a Go string', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n'
        + '    handleOptionStringAndParams (params: Dict, m: string, o: string, d: string): [string, Dict];\n'
        + '    handleOptionStringAndParams (params: Dict, m: string, o: string, d?: Str): [Str, Dict];\n'
        + '    handleOptionStringAndParams (params: Dict, m: string, o: string, d: Str = undefined): [Str, Dict] { return [ d, params ]; }\n'
        + '    handleOptionStringAndParams2 (params: Dict, m: string, a: string, b: string, d: string): [string, Dict];\n'
        + '    handleOptionStringAndParams2 (params: Dict, m: string, a: string, b: string, d?: Str): [Str, Dict];\n'
        + '    handleOptionStringAndParams2 (params: Dict, m: string, a: string, b: string, d: Str = undefined): [Str, Dict] { return [ d, params ]; }\n'
        + '    note (h: any) { return h; }\n}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h37p11-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\nclass x extends Exchange {\n    w (flag: boolean, params: Dict = {}) {\n' + body + '    }\n}\n');
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
            const cwd = process.cwd ();
            process.chdir (dir);
            try {
                const t = new Transpiler (config);
                installCcxtGoLocalTypes (t.goTranspiler);
                return t.transpileGoByPath (file).content;
            } finally {
                process.chdir (cwd);
            }
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const seeded = (seed: string, call: string) => '        let mode' + seed + ';\n        let rest: Dict = undefined;\n        [ mode, rest ] = ' + call + ';\n        return mode + \':\' + this.note (rest);\n';
    test ('a literal seed passed back as the default makes the local a Go string and the concat native', () => {
        const out = print (seeded (' = \'unified\'', 'this.handleOptionStringAndParams (params, \'w\', \'mode\', mode)'));
        expect (out).toContain ('var mode string = "unified"');
        expect (out).toContain ('mode = *modePtr');
        expect (out).toContain ('Add(mode+":", ');
    });
    test ('the two-name reader with a literal default inside a branch', () => {
        const out = print ('        let mode: string = \'LAST\';\n        let rest: Dict = params;\n        if (flag) {\n            [ mode, rest ] = this.handleOptionStringAndParams2 (params, \'w\', \'a\', \'b\', \'MARK\');\n        }\n        const c: string = \'k_\' + mode;\n        return c + this.note (rest);\n');
        expect (out).toContain ('var mode string = "LAST"');
        expect (out).toContain ('var c string = "k_" + mode');
    });
    test ('no default (nil when absent) keeps the box', () => {
        const out = print (seeded (' = \'unified\'', 'this.handleOptionStringAndParams (params, \'w\', \'mode\')'));
        expect (out).toContain ('var mode any = "unified"');
        expect (out).toContain ('mode = nil');
    });
    test ('a Str-typed default keeps the box', () => {
        const out = print ('        const d: Str = this.note (params);\n' + seeded (' = \'unified\'', 'this.handleOptionStringAndParams (params, \'w\', \'mode\', d)'));
        expect (out).toContain ('var mode any = "unified"');
    });
    test ('a nil seed keeps the box', () => {
        const out = print (seeded (': Str = undefined', 'this.handleOptionStringAndParams (params, \'w\', \'mode\', \'x\')'));
        expect (out).not.toContain ('var mode string');
    });
});

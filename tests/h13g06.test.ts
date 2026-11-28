import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

describe ('go safeDict locals with a non-literal default', () => {
    const root = path.join (__dirname, 'files', 'tmp-h13g06', 'ts', 'src');
    const print = (body: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'),
            'export class Exchange {\n' +
            '    safeDict (d: any, k: any, def: any = undefined): any { return def; }\n' +
            '    take (d: any): any { return d; }\n' +
            '    run (message: any, data: any) {\n' + body + '    }\n' +
            '}\n');
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoLocalTypes (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h13g06'), { recursive: true, force: true }));

    test ('a safeDict-defaulted local read by a literal in prints the native comma-ok', () => {
        const out = print ("        const raw = this.safeDict (data, 0, this.safeDict (message, 'data'));\n" +
            "        if (raw === undefined) {\n            return;\n        }\n" +
            "        let k = 'asks';\n        if ('a' in raw) {\n            k = 'a';\n        }\n        return this.take (raw);\n");
        expect (out).toContain ('var raw map[string]any = this.SafeDictMap(data, 0, this.SafeDict(message, "data"))');
        expect (out).toContain ('if _, ok := raw["a"]; ok {');
        expect (out).not.toContain ('InOp(raw');
    });

    test ('an identifier-defaulted local read by Object.keys is typed', () => {
        const out = print ("        const m = this.safeDict (message, 'data', message);\n        const keys = Object.keys (m);\n        return keys;\n");
        expect (out).toContain ('var m map[string]any = this.SafeDictMap(message, "data", message)');
        expect (out).not.toContain ('ObjectKeys(m)');
    });

    test ('negatives keep the box', () => {
        // an identifier default may be a non-dict value: a nil test would change its answer
        const nilTest = print ("        const m = this.safeDict (message, 'data', message);\n        if (m === undefined) {\n            return;\n        }\n        return Object.keys (m);\n");
        expect (nilTest).toContain ('var m any = this.SafeDict(message, "data", message)');
        // a value hand-off with no exit guard
        const handOff = print ("        const raw = this.safeDict (data, 0, this.safeDict (message, 'data'));\n        return this.take (raw);\n");
        expect (handOff).toContain ('var raw any = this.SafeDict(');
        // a non-literal key `in`
        const dynKey = print ("        const raw = this.safeDict (data, 0, this.safeDict (message, 'data'));\n        if (raw === undefined) {\n            return;\n        }\n        if (data in raw) {\n            return 1;\n        }\n");
        expect (dynKey).toContain ('var raw any = this.SafeDict(');
    });
});

describe ('go safeDict identifier default: numeric key keeps the box', () => {
    const root = path.join (__dirname, 'files', 'tmp-h13g06b', 'ts', 'src');
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h13g06b'), { recursive: true, force: true }));
    test ('numeric index', () => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'),
            'export class Exchange {\n    safeDict (d: any, k: any, def: any = undefined): any { return def; }\n' +
            "    run (message: any) {\n        const m = this.safeDict (message, 'data', message);\n        return m[0];\n    }\n}\n");
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoLocalTypes (t.goTranspiler);
        expect (t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content).toContain ('var m any = this.SafeDict(message, "data", message)');
    });
});

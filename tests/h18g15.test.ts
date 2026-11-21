import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('go handleMarginModeAndParams with a string-literal default', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n'
        + '    handleMarginModeAndParams (m: string, params: Dict, d: string): [string, Dict];\n'
        + '    handleMarginModeAndParams (m: string, params?: Dict, d?: Str): [Str, Dict];\n'
        + '    handleMarginModeAndParams (m: string, params: Dict = {}, d: Str = undefined): [Str, Dict] { return [ d, params ]; }\n'
        + '    note (h: any) { return h; }\n}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h18g15-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'pro'), { 'recursive': true });
            const file = path.join (dir, 'ts', 'src', 'pro', 'x.ts');
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (file, 'import Exchange from \'../base/Exchange.js\';\nclass x extends Exchange {\n    async w (params = {}) {\n' + body + '    }\n}\n');
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'guardedStringTupleCalls': [ 'handleMarginModeAndParams' ] } };
            return new Transpiler (config).transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    test ('a literal default slot concatenates natively without a guard', () => {
        const out = print ('        const [ marginMode, p ] = this.handleMarginModeAndParams (\'w\', params, \'cross\');\n        this.note (marginMode + \':positions\');\n        return p;\n');
        expect (out).toContain ('this.Note(*marginMode + ":positions")');
        expect (out).not.toContain ('Add(marginMode');
    });
    test ('no default keeps Add (the slot can be nil)', () => {
        const out = print ('        const [ marginMode, p ] = this.handleMarginModeAndParams (\'w\', params);\n        this.note (marginMode + \':positions\');\n        return p;\n');
        expect (out).toContain ('Add(marginMode, ":positions")');
    });
    test ('a non-literal default keeps Add', () => {
        const out = print ('        const d: Str = this.note (1);\n        const [ marginMode, p ] = this.handleMarginModeAndParams (\'w\', params, d);\n        this.note (marginMode + \':positions\');\n        return p;\n');
        expect (out).toContain ('Add(marginMode, ":positions")');
    });
    test ('a let slot written another value keeps Add', () => {
        const out = print ('        let [ marginMode, p ] = this.handleMarginModeAndParams (\'w\', params, \'cross\');\n        marginMode = this.note (p);\n        this.note (marginMode + \':positions\');\n        return p;\n');
        expect (out).toContain ('Add(marginMode, ":positions")');
    });
});

import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

describe ('go Symbol() string return', () => {
    const HEAD = 'class Exchange {\n'
        + '    symbol (symbol: string): string { return symbol; }\n'
        + '    safeSymbol (id: string): string | undefined { return id; }\n'
        + '    market (s: string): any { return {}; }\n'
        + '}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h16g03-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\nexport default class X extends Exchange {\n' + body + '\n}\n');
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
            const t = new Transpiler (config);
            installCcxtGoLocalTypes (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    test ('a local fed by this.symbol() is a Go string', () => {
        const out = print ('    f (symbol: string) {\n        const s = this.symbol (symbol);\n        return s;\n    }');
        expect (out).toContain ('var s string = this.Symbol(symbol)');
    });
    test ('a nilable string producer keeps its pointer / box type', () => {
        const out = print ('    f (id: string) {\n        const s = this.safeSymbol (id);\n        return s;\n    }');
        expect (out).not.toContain ('var s string =');
    });
    test ('a local also written with a non-string value keeps the box', () => {
        const out = print ('    f (symbol: string) {\n        let s = this.symbol (symbol);\n        s = this.market (symbol);\n        return s;\n    }');
        expect (out).not.toContain ('var s string =');
    });
    test ('a nil-tested conditional symbol stays nilable', () => {
        const out = print ('    f (symbol: string = undefined) {\n        const s = (symbol !== undefined) ? this.symbol (symbol) : symbol;\n        if (s === undefined) {\n            return 1;\n        }\n        return s;\n    }');
        expect (out).not.toContain ('var s string =');
    });
});

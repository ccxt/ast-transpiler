import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const HEAD = 'class Exchange {\n'
    + '    symbol (symbol: string): string { return symbol; }\n'
    + '    safeString (o: any, k: string, d: Str = undefined): Str { return d; }\n'
    + '    market (s: string): any { return {}; }\n'
    + '    filterBySymbolSinceLimit (a: any, symbol: Str = undefined, since: Int = undefined, limit: Int = undefined, tail = false): any { return a; }\n'
    + '    watch (h: any): any { return h; }\n'
    + '}\nexport default Exchange;\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h17g05-'));
    try {
        fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
        const file = path.join (dir, 'ts', 'src', 'x.ts');
        fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), 'type Str = string | undefined;\ntype Int = number | undefined;\n' + HEAD);
        fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\ntype Str = string | undefined;\ntype Int = number | undefined;\nexport default class X extends Exchange {\n' + body + '\n}\n');
        const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
        const t = new Transpiler (config);
        installCcxtGoLocalTypes (t.goTranspiler);
        return t.transpileGoByPath (file).content;
    } finally {
        fs.rmSync (dir, { 'recursive': true, 'force': true });
    }
};

const WOO = '    f (symbol: Str = undefined, since: Int = undefined, limit: Int = undefined) {\n'
    + '        let messageHash = \'orders\';\n'
    + '        let symbolResolved: Str = undefined;\n'
    + '        if (symbol !== undefined) {\n'
    + '            symbolResolved = this.symbol (symbol);\n'
    + '            messageHash = \'orders\' + \':\' + symbolResolved;\n'
    + '        }\n'
    + '        const orders = this.watch (messageHash);\n'
    + '        return this.filterBySymbolSinceLimit (orders, symbolResolved, since, limit, true);\n'
    + '    }';

const variant = (from: string, to: string): string => WOO.replace (from, to);

describe ('go nil-seeded Str local written with strings', () => {
    test ('a Str local seeded nil and written with this.symbol() prints *string', () => {
        const out = print (WOO);
        expect (out).toContain ('var symbolResolved *string = nil');
        expect (out).toContain ('symbolResolved = &symbolText');
        expect (out).toContain ('"orders" + ":" + *symbolResolved');
    });
    test ('a write that is not a string keeps the box', () => {
        const out = print (variant ('symbolResolved = this.symbol (symbol);', 'symbolResolved = this.watch (symbol);'));
        expect (out).toContain ('var symbolResolved any = nil');
    });
    test ('a nilable value stored into a dict keeps the box', () => {
        const out = print (variant ('const orders = this.watch (messageHash);', 'const orders = this.watch ({ \'s\': symbolResolved });'));
        expect (out).toContain ('var symbolResolved any = nil');
    });
    test ('a nilable value returned keeps the box', () => {
        const out = print (variant ('return this.filterBySymbolSinceLimit (orders, symbolResolved, since, limit, true);', 'return symbolResolved;'));
        expect (out).toContain ('var symbolResolved any = nil');
    });
    test ('a literal-written Str local is left to the literal join', () => {
        const out = print (variant ('symbolResolved = this.symbol (symbol);', 'symbolResolved = \'spot\';'));
        expect (out).not.toContain ('var symbolResolved *string');
    });
    test ('an undeclared local is not this rule', () => {
        const out = print (variant ('let symbolResolved: Str = undefined;', 'let symbolResolved = undefined;'));
        expect (out).not.toContain ('var symbolResolved *string');
    });
});

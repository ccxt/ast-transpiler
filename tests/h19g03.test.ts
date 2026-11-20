import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const HEAD = 'class Exchange {\n'
    + '    watch (h: any): any { return h; }\n'
    + '}\nexport default Exchange;\n';
const TYPES = 'type Str = string | undefined;\ntype Dict = { [key: string]: any };\ntype NullableDict = Dict | undefined;\n';
const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h19g03-'));
    try {
        fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
        const file = path.join (dir, 'ts', 'src', 'x.ts');
        fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), TYPES + HEAD);
        fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\n' + TYPES + 'export default class X extends Exchange {\n' + body + '\n}\n');
        const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
        const t = new Transpiler (config);
        installCcxtGoLocalTypes (t.goTranspiler);
        return t.transpileGoByPath (file).content;
    } finally {
        fs.rmSync (dir, { 'recursive': true, 'force': true });
    }
};

// okx shape: a nil-seeded private header map, filled in one branch, joined through a nil-arm ternary
const SIGN = '    sign (path: string, apiName = \'public\', method = \'GET\', params = {}, headers: any = undefined, body: any = undefined) {\n'
    + '        let privateHeaders: NullableDict = undefined;\n'
    + '        if (apiName === \'private\') {\n'
    + '            privateHeaders = {\n'
    + '                \'k\': path,\n'
    + '            };\n'
    + '            privateHeaders[\'s\'] = method;\n'
    + '        }\n'
    + '        const requestHeaders: NullableDict = (apiName === \'private\') ? privateHeaders : undefined;\n'
    + '        return { \'url\': path, \'method\': method, \'body\': body, \'headers\': requestHeaders };\n'
    + '    }';

const variant = (from: string, to: string): string => SIGN.replace (from, to);

describe ('go nil-seeded map read as the map arm of a nil-arm ternary', () => {
    test ('seed and ternary local both print typed maps', () => {
        const out = print (SIGN);
        expect (out).toContain ('var privateHeaders map[string]any = nil\n');
        expect (out).toContain ('var requestHeaders map[string]any\n');
        expect (out).not.toContain ('var requestHeaders any = func() any {');
    });
    test ('a seed written with a non-map keeps both boxes', () => {
        const out = print (variant ('privateHeaders[\'s\'] = method;', 'privateHeaders = [] as any;'));
        expect (out).toContain ('var privateHeaders any = nil');
        expect (out).not.toContain ('var requestHeaders map[string]any');
    });
    test ('a ternary local handed to a call keeps the box (nil arm can reach it)', () => {
        const out = print (variant ('return {', 'this.watch (requestHeaders);\n        return {'));
        expect (out).toContain ('var requestHeaders any = func() any {');
        expect (out).toContain ('var privateHeaders any = nil');
    });
    test ('outside sign() the seed keeps its box', () => {
        const out = print (SIGN.replace ('sign (', 'other ('));
        expect (out).toContain ('var privateHeaders any = nil');
    });
});

const BACKPACK = '    sign (path: string, apiName = \'public\', method = \'GET\', params = {}, headers: any = undefined, body: any = undefined) {\n'
    + '        let headersSigned: Dict = {};\n'
    + '        if (apiName === \'private\') {\n'
    + '            headersSigned = { \'k\': path };\n'
    + '        }\n'
    + '        const headersResolved = (apiName === \'private\') ? headersSigned : undefined;\n'
    + '        return { \'url\': path, \'method\': method, \'body\': body, \'headers\': headersResolved };\n'
    + '    }';

describe ('go unannotated const nil-arm ternary over a Dict local', () => {
    test ('prints a typed if/else map local', () => {
        const out = print (BACKPACK);
        expect (out).toContain ('var headersResolved map[string]any\n');
        expect (out).not.toContain ('var headersResolved any = func() any {');
    });
    test ('a let binding keeps the box', () => {
        const out = print (BACKPACK.replace ('const headersResolved', 'let headersResolved'));
        expect (out).not.toContain ('var headersResolved map[string]any');
    });
    test ('a call argument read keeps the box', () => {
        const out = print (BACKPACK.replace ('return {', 'this.watch (headersResolved);\n        return {'));
        expect (out).toContain ('var headersResolved any = func() any {');
    });
});

const WATCH = '    symbol (s: string): string { return s; }\n'
    + '    filterBySymbolSinceLimit (xs: any, symbol: Str = undefined, since: any = undefined, limit: any = undefined, tail = false): any { return xs; }\n'
    + '    async getUrlByMarketType (symbol: Str = undefined, isPrivate = false): Promise<string> { return \'u\'; }\n'
    + '    async watchOrders (symbol: Str = undefined, since: any = undefined, limit: any = undefined, params = {}): Promise<any> {\n'
    + '        let messageHash = \'orders\';\n'
    + '        const symbolResolved: Str = (symbol !== undefined) ? this.symbol (symbol) : symbol;\n'
    + '        if (symbolResolved !== undefined) {\n'
    + '            messageHash = \'orders:\' + symbolResolved;\n'
    + '        }\n'
    + '        const url = await this.getUrlByMarketType (symbolResolved, true);\n'
    + '        const orders: any = this.watch (url + messageHash);\n'
    + '        return this.filterBySymbolSinceLimit (orders, symbolResolved, since, limit, true);\n'
    + '    }';

describe ('go *string symbol join read by nil-safe callee slots', () => {
    test ('prints a typed *string local with an addressed string arm', () => {
        const out = print (WATCH);
        expect (out).toContain ('var symbolResolved *string\n');
        expect (out).toContain ('symbolResolved = &symbolResolvedValue\n');
        expect (out).not.toContain ('var symbolResolved any = func() any {');
    });
    test ('a slot of a callee that is not proven nil-safe keeps the box', () => {
        const out = print (WATCH.replace ('return this.filterBySymbolSinceLimit (orders, symbolResolved', 'return this.watch (symbolResolved) || this.filterBySymbolSinceLimit (orders, symbolResolved'));
        expect (out).toContain ('var symbolResolved any = func() any {');
    });
    test ('a value stored into a list keeps the box', () => {
        const out = print (WATCH.replace ('const url =', 'const hashes = [ symbolResolved ];\n        const url ='));
        expect (out).toContain ('var symbolResolved any = func() any {');
    });
    test ('a non-Str first parameter keeps the box', () => {
        const out = print (WATCH.replace ('getUrlByMarketType (symbol: Str = undefined', 'getUrlByMarketType (symbol: any = undefined'));
        expect (out).toContain ('var symbolResolved any\n');
    });
});

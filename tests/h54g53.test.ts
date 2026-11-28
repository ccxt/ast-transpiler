import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('h54g53 const string-default copy of an optional Str parameter', () => {
    const BASE = [
        'type Str = string | undefined;',
        'type Dict = {[key: string]: any};',
        'export class Exchange {',
        '    extend (a, b?): any { return {}; }',
        '    async createOrder (symbol: string, type: string, side: string, amount: number, price: number = undefined, params: Dict = {}): Promise<any> { return {}; }',
        '    async closePosition (symbol: string, side: Str = undefined, params: Dict = {}): Promise<any> { return {}; }',
        '}',
        '',
    ].join ('\n');
    const HEADER = 'import { Exchange } from \'./base/Exchange\';\ntype Dict = {[key: string]: any};\ntype Str = string | undefined;\ntype OrderSide = \'buy\' | \'sell\' | string;\n';
    const tmpRoot = path.join (process.env.TMPDIR || os.tmpdir ());
    const print = (body: string): string => {
        const tmp = fs.mkdtempSync (path.join (tmpRoot, 'h54g53-'));
        try {
            const src = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (path.join (src, 'base'), { 'recursive': true });
            fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE);
            fs.writeFileSync (path.join (src, 'ex.ts'), HEADER + 'export class ex extends Exchange {\n' + body + '}\n');
            const t: any = new Transpiler ({ 'verbose': false, 'go': { 'unifiedStringParams': { 'createOrder': [ 1, 2 ] } } });
            installCcxtGoHooks (t.goTranspiler);
            return t.transpileGoByPath (path.join (src, 'ex.ts')).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    const M = (inner: string) => '    async closePosition (symbol: string, side: Str = undefined, params: Dict = {}): Promise<any> {\n'
        + '        const request: Dict = { \'close\': true };\n'
        + '        const paramsExtended: Dict = this.extend (request, params);\n'
        + inner
        + '        return await this.createOrder (symbol, \'market\', sideResolved, 0, undefined, paramsExtended);\n'
        + '    }\n';
    test ('a const string-default copy of an optional Str binds *string and passes the plain string (fails on the base printer)', () => {
        const out = print (M ('        const sideResolved: OrderSide = (side === undefined) ? \'\' : side;\n'));
        expect (out).toContain ('var side *string = GetArgStringPtr(optionalArgs, 0, nil)');
        expect (out).toContain ('var sideResolved string');
        expect (out).toContain ('sideResolved = *side');
        expect (out).toContain ('this.CreateOrder(symbol, "market", sideResolved, 0, nil, paramsExtended)');
        expect (out).not.toContain ('StringArg(');
    });
    test ('negative: an untyped copy keeps the box', () => {
        const out = print (M ('        const sideResolved = (side === undefined) ? \'\' : side;\n'));
        expect (out).not.toContain ('var sideResolved string');
    });
    test ('negative: a let copy keeps the box', () => {
        const out = print (M ('        let sideResolved: string = \'\';\n        if (side !== undefined) {\n            sideResolved = side;\n        }\n'));
        expect (out).toContain ('StringArg(sideResolved)');
        expect (out).not.toContain ('GetArgStringPtr(optionalArgs, 0');
    });
});

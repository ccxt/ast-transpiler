import fs from 'fs';
import path from 'path';
import {
    Transpiler,
    installCcxtGoHooks,
    installCcxtGoLocalTypes,
    installCcxtGoIndexableTypes,
    installCcxtGoParamTypes,
    installCcxtGoDictParams,
} from '../src/transpiler';

const tmp = path.join (__dirname, 'files', 'tmp-h56r5q-' + (process.env.JEST_WORKER_ID || '0'));

describe ('h56r5q: Go unifiedNullableStringParams virtual calls, class-qualified slots, defaulted []string elements, widenedSites recursion/undefined, test wrap', () => {
    afterAll (() => fs.rmSync (tmp, { recursive: true, force: true }));

    test ('Go: virtual callInternal and defaulted []string element pass &symbol and &symbols[i] to unifiedNullableStringParams', () => {
        const root = path.join (tmp, 'virtual', 'ts', 'src');
        fs.mkdirSync (root, { recursive: true });
        const file = path.join (root, 'demo.ts');
        fs.writeFileSync (file, `
type Str = string | undefined;
type Strings = string[] | undefined;
export class Demo {
    market (symbol: Str): any { return symbol; }
    async callVirtual (symbol: string, symbols: Strings = undefined): Promise<any> {
        const out = [ this.market (symbol) ];
        if (symbols !== undefined) {
            for (let i = 0; i < symbols.length; i++) {
                out.push (this.market (symbols[i]));
            }
        }
        return out;
    }
}
`);
        const t = new Transpiler ({
            go: {
                useTypeScriptChecker: true,
                wrapThisCalls: true,
                unifiedStringParams: { callVirtual: [ 0 ] },
                unifiedNullableStringParams: { market: [ 0 ] },
            },
        });
        installCcxtGoLocalTypes (t.goTranspiler);
        installCcxtGoIndexableTypes (t.goTranspiler);
        installCcxtGoParamTypes (t.goTranspiler, { unifiedStringParams: { callVirtual: [ 0 ] } });
        installCcxtGoDictParams (t.goTranspiler);
        installCcxtGoHooks (t.goTranspiler);
        const out = t.transpileGoByPath (file).content;
        expect (out).toContain ('Market(symbol *string)');
        expect (out).toContain ('<-this.callInternal("market", &symbol)');
        expect (out).toContain ('<-this.callInternal("market", &symbols[i])');
        expect (out).not.toContain ('SafeStringPtr(');
    });

    test ('Go: class-qualified unifiedNullableStringParams applies to the class and derived subclasses', () => {
        const root = path.join (tmp, 'class-qual', 'ts', 'src', 'pro');
        fs.mkdirSync (root, { recursive: true });
        const baseFile = path.join (root, 'okx.ts');
        fs.writeFileSync (baseFile, `
type Str = string | undefined;
export default class okx {
    subscribe (access: string, messageHash: string, channel: string, symbol: Str): any {
        return symbol;
    }
    watchOne (sym: string): any {
        return this.subscribe ('public', 'h', 'c', sym);
    }
}
`);
        const subFile = path.join (root, 'myokx.ts');
        fs.writeFileSync (subFile, `
import okx from './okx.js';
export default class myokx extends okx {
    watchSub (sym: string): any {
        return this.subscribe ('public', 'h', 'c', sym);
    }
}
`);
        const t = new Transpiler ({
            go: {
                useTypeScriptChecker: true,
                unifiedStringParams: { watchOne: [ 0 ], watchSub: [ 0 ] },
                unifiedNullableStringParams: { 'okx.subscribe': [ 3 ] },
            },
        });
        installCcxtGoLocalTypes (t.goTranspiler);
        installCcxtGoIndexableTypes (t.goTranspiler);
        installCcxtGoParamTypes (t.goTranspiler, { unifiedStringParams: { watchOne: [ 0 ], watchSub: [ 0 ] } });
        installCcxtGoDictParams (t.goTranspiler);
        installCcxtGoHooks (t.goTranspiler);
        const baseOut = t.transpileGoByPath (baseFile).content;
        const subOut = t.transpileGoByPath (subFile).content;
        expect (baseOut).toContain ('Subscribe(access any, messageHash any, channel any, symbol *string)');
        expect (baseOut).toContain ('this.Subscribe("public", "h", "c", &sym)');
        expect (subOut).toContain ('this.Subscribe("public", "h", "c", &sym)');
    });

    test ('Go: widenedSites accepts undefined and self-recursive passthrough for *string parameter', () => {
        const root = path.join (tmp, 'widened', 'ts', 'src');
        fs.mkdirSync (root, { recursive: true });
        const file = path.join (root, 'demo.ts');
        fs.writeFileSync (file, `
type Str = string | undefined;
class Base {
    safeString (d: any, k: Str): Str { return undefined; }
}
export class Demo extends Base {
    helper (symbol: Str, depth: number): any {
        if (depth > 0) {
            return this.helper (symbol, 0);
        }
        return this.safeString ({}, symbol);
    }
    entry (sym: string): any {
        const a = this.helper (undefined, 0);
        const b = this.helper (sym, 1);
        return [ a, b ];
    }
}
`);
        const t = new Transpiler ({
            go: {
                useTypeScriptChecker: true,
                unifiedStringParams: { entry: [ 0 ] },
            },
        });
        installCcxtGoLocalTypes (t.goTranspiler);
        installCcxtGoIndexableTypes (t.goTranspiler);
        installCcxtGoParamTypes (t.goTranspiler, { unifiedStringParams: { entry: [ 0 ] } });
        installCcxtGoDictParams (t.goTranspiler);
        installCcxtGoHooks (t.goTranspiler);
        const out = t.transpileGoByPath (file).content;
        expect (out).toContain ('Helper(symbol *string,');
        expect (out).toContain ('this.Helper(symbol, 0)');
        expect (out).toContain ('this.Helper(&sym, 1)');
    });

    test ('Go: ts/src/test/ files wrap untyped unifiedNullableStringParams args with SafeStringPtr while library files do not', () => {
        const testDir = path.join (tmp, 'testwrap', 'ts', 'src', 'test', 'Exchange');
        const libDir = path.join (tmp, 'testwrap', 'ts', 'src');
        fs.mkdirSync (testDir, { recursive: true });
        const testFile = path.join (testDir, 'test.sample.ts');
        fs.writeFileSync (testFile, `
export function runTest (exchange: any, sym: any): any {
    return exchange.market (sym);
}
`);
        const libFile = path.join (libDir, 'lib.ts');
        fs.writeFileSync (libFile, `
type Str = string | undefined;
export class Lib {
    market (symbol: Str): any { return symbol; }
    run (sym: any): any {
        return this.market (sym);
    }
}
`);
        const t = new Transpiler ({
            go: {
                useTypeScriptChecker: true,
                unifiedNullableStringParams: { market: [ 0 ] },
            },
        });
        installCcxtGoLocalTypes (t.goTranspiler);
        installCcxtGoIndexableTypes (t.goTranspiler);
        installCcxtGoParamTypes (t.goTranspiler, {});
        installCcxtGoDictParams (t.goTranspiler);
        installCcxtGoHooks (t.goTranspiler);
        const testOut = t.transpileGoByPath (testFile).content;
        const libOut = t.transpileGoByPath (libFile).content;
        expect (testOut).toContain ('exchange.Market(SafeStringPtr(sym))');
        expect (libOut).toContain ('this.Market(sym)');
        expect (libOut).not.toContain ('SafeStringPtr(');
    });
});

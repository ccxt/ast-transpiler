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

const tmp = path.join (__dirname, 'files', 'tmp-h56r5c-' + (process.env.JEST_WORKER_ID || '0'));

describe ('h56r5c: unifiedNullableStringParams and native string ordered comparison', () => {
    afterAll (() => fs.rmSync (tmp, { recursive: true, force: true }));

    test ('Go: unifiedNullableStringParams types Str param as *string, emits strings.ToLower(*slug), and passes &local for string callers; string < string emits native <', () => {
        const root = path.join (tmp, 'go', 'ts', 'src');
        fs.mkdirSync (root, { recursive: true });
        const file = path.join (root, 'demo.ts');
        fs.writeFileSync (file, `
type Str = string | undefined;
export class Demo {
    safeString (d: any, k: string): Str { return undefined; }
    shortenSlug (slug: Str): string {
        const lower = (slug === undefined) ? '' : slug.toLowerCase ();
        return lower;
    }
    rlpEncodeBytes (hex: string): string {
        if (hex < '80') {
            return hex;
        }
        return '81' + hex;
    }
    dynamicCompare (x: any): boolean {
        return x < '80';
    }
    caller (d: any, name: string, optSlug: Str = undefined): string {
        const ptr = this.safeString (d, 'slug');
        const a = this.shortenSlug (ptr);
        const b = this.shortenSlug (name);
        const c = this.shortenSlug (optSlug);
        return a + b + c;
    }
}
`);
        const t = new Transpiler ({
            go: {
                useTypeScriptChecker: true,
                unifiedStringParams: { rlpEncodeBytes: [ 0 ], caller: [ 1 ] },
                unifiedNullableStringParams: { shortenSlug: [ 0 ] },
            },
        });
        installCcxtGoLocalTypes (t.goTranspiler);
        installCcxtGoIndexableTypes (t.goTranspiler);
        installCcxtGoParamTypes (t.goTranspiler, { unifiedStringParams: { rlpEncodeBytes: [ 0 ], caller: [ 1 ] } });
        installCcxtGoDictParams (t.goTranspiler);
        installCcxtGoHooks (t.goTranspiler);
        const out = t.transpileGoByPath (file).content;
        expect (out).toContain ('func (this *Demo) ShortenSlug(slug *string)');
        expect (out).toContain ('strings.ToLower(*slug)');
        expect (out).not.toContain ('ToLower(slug)');
        expect (out).toContain ('this.ShortenSlug(ptr)');
        expect (out).toContain ('this.ShortenSlug(&name)');
        expect (out).toContain ('GetArgStringPtr(optionalArgs, 0, nil)');
        expect (out).toContain ('this.ShortenSlug(optSlug)');
        expect (out).not.toContain ('SafeStringPtr(');
        expect (out).toContain ('if hex < "80"');
        expect (out).not.toContain ('IsLessThan(hex');
        expect (out).toContain ('IsLessThan(x, "80")');
    });

    test ('C#: non-null string < string emits string.CompareOrdinal; nullable string? keeps isLessThan', () => {
        const root = path.join (tmp, 'cs', 'ts', 'src');
        fs.mkdirSync (root, { recursive: true });
        const file = path.join (root, 'demo.ts');
        fs.writeFileSync (file, `
type Str = string | undefined;
export class Demo {
    safeString (d: any, k: string): Str { return undefined; }
    rlpEncodeBytes (hex: string): string {
        if (hex < '80') {
            return hex;
        }
        return '81' + hex;
    }
    nullableCompare (d: any): boolean {
        const s = this.safeString (d, 'k');
        return s < '80';
    }
    caller (): string {
        return this.rlpEncodeBytes ('7f');
    }
}
`);
        const t = new Transpiler ({
            csharp: {
                useTypeScriptChecker: true,
                stringParams: { rlpEncodeBytes: [ 0 ] },
            },
        });
        const out = t.transpileCSharpByPath (file).content;
        expect (out).toContain ('string.CompareOrdinal(hex, "80") < 0');
        expect (out).not.toContain ('isLessThan(hex');
        expect (out).toContain ('isLessThan(s, "80")');
    });
});

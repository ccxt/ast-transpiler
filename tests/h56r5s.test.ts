import fs from 'fs';
import path from 'path';
import {
    Transpiler,
    installCcxtGoHooks,
    installCcxtGoLocalTypes,
    installCcxtGoIndexableTypes,
    installCcxtGoParamTypes,
    installCcxtGoDictParams,
    installFmGo5OG02,
} from '../src/transpiler';

const tmp = path.join (__dirname, 'files', 'tmp-h56r5s-' + (process.env.JEST_WORKER_ID || '0'));

function makeTranspiler (extraGo: Record<string, any> = {}) {
    const t = new Transpiler ({
        go: {
            useTypeScriptChecker: true,
            ...extraGo,
        },
    });
    installCcxtGoLocalTypes (t.goTranspiler);
    installCcxtGoIndexableTypes (t.goTranspiler);
    installCcxtGoParamTypes (t.goTranspiler, extraGo);
    installCcxtGoDictParams (t.goTranspiler);
    installCcxtGoHooks (t.goTranspiler);
    installFmGo5OG02 (t.goTranspiler);
    return t;
}

describe ('h56r5s: Go GetIndexOf removal typing rules and copy-component cache safety', () => {
    afterAll (() => fs.rmSync (tmp, { recursive: true, force: true }));

    test ('Go: NormalizeTagKey string return, last_http_response *string local, and guarded indexOf emit native strings.Index', () => {
        const root = path.join (tmp, 'indexof', 'ts', 'src');
        fs.mkdirSync (root, { recursive: true });
        const file = path.join (root, 'demo.ts');
        fs.writeFileSync (file, `
type Str = string | undefined;
class BaseExchange {
    last_http_response: Str;
    normalizeTagKey (s: string): string { return s; }
    handleOptionStringAndParams (params: any, method: string, opt: string, dflt: Str = undefined): any[] { return [ params, dflt ]; }
}
export class Demo extends BaseExchange {
    checkTag (raw: string): number {
        const tagKey = this.normalizeTagKey (raw);
        return tagKey.indexOf ('foo');
    }
    checkLastResponse (): number {
        const lastHttpResponse: Str = this.last_http_response;
        if ((lastHttpResponse !== undefined) && (lastHttpResponse !== '')) {
            if (lastHttpResponse.indexOf ('ERR') >= 0) {
                return 1;
            }
        }
        return 0;
    }
    checkOption (params: any): number {
        let opt: Str = undefined;
        [ opt, params ] = this.handleOptionStringAndParams (params, 'm', 'k', 'x');
        if ((opt !== undefined) && (opt.indexOf ('y') >= 0)) {
            return 1;
        }
        return 0;
    }
}
`);
        const t = makeTranspiler ({ unifiedStringParams: { checkTag: [ 0 ] } });
        const out = t.transpileGoByPath (file).content;
        expect (out).toContain ('var tagKey string = this.NormalizeTagKey(raw)');
        expect (out).toContain ('strings.Index(tagKey, "foo")');
        expect (out).toContain ('var lastHttpResponse *string = this.GetLast_http_response()');
        expect (out).toContain ('strings.Index(*lastHttpResponse, "ERR")');
        expect (out).toContain ('strings.Index(*opt, "y")');
        expect (out).not.toContain ('GetIndexOf(');
    });

    test ('Go: NIL_DECLARED_SAFE_ARG_SLOTS accepts nil-init Str locals passed to SafeCurrencyCode and Throw*MatchedException', () => {
        const root = path.join (tmp, 'nil-slots', 'ts', 'src');
        fs.mkdirSync (root, { recursive: true });
        const file = path.join (root, 'demo.ts');
        fs.writeFileSync (file, `
type Str = string | undefined;
class Base {
    safeString (d: any, k: string): Str { return undefined; }
    safeCurrencyCode (id: Str): Str { return id; }
    throwExactlyMatchedException (exact: any, str: Str, message: string): void {}
    throwBroadlyMatchedException (broad: any, str: Str, message: string): void {}
}
export class Demo extends Base {
    run (d: any, flag: boolean): Str {
        let cid: Str = undefined;
        if (flag) {
            cid = this.safeString (d, 'a');
        } else {
            cid = this.safeString (d, 'b');
        }
        let msg: Str = undefined;
        if (flag) {
            msg = this.safeString (d, 'err');
        } else {
            msg = this.safeString (d, 'type');
        }
        this.throwExactlyMatchedException (d, msg, 'fb');
        this.throwBroadlyMatchedException (d, msg, 'fb');
        return this.safeCurrencyCode (cid);
    }
}
`);
        const t = makeTranspiler ({
            unifiedNullableStringParams: {
                safeCurrencyCode: [ 0 ],
                throwBroadlyMatchedException: [ 1 ],
            },
        });
        const out = t.transpileGoByPath (file).content;
        expect (out).toContain ('var cid *string = nil');
        expect (out).toContain ('var msg *string = nil');
        expect (out).not.toContain ('var cid any = nil');
        expect (out).not.toContain ('var msg any = nil');
    });

    test ('Go: failed ccxtGo93CopyComponentJoin must not poison goNilInitLocalTypeCache for copy targets', () => {
        const root = path.join (tmp, 'copy-cache', 'ts', 'src');
        fs.mkdirSync (root, { recursive: true });
        const file = path.join (root, 'demo.ts');
        fs.writeFileSync (file, `
type Str = string | undefined;
class Base {
    safeString (d: any, k: string): Str { return undefined; }
    safeCurrencyCode (id: Str): Str { return id; }
}
export class Demo extends Base {
    parse (d: any, flag: boolean): any {
        let baseId: Str = undefined;
        let quoteId: Str = undefined;
        let settleId: Str = undefined;
        if (flag) {
            baseId = this.safeString (d, 'base');
            quoteId = this.safeString (d, 'quote');
            settleId = baseId;
        } else {
            baseId = this.safeString (d, 'base');
            quoteId = 'USD';
            settleId = quoteId;
        }
        const s = this.safeCurrencyCode (settleId);
        return { 'baseId': baseId, 'quoteId': quoteId, 'settleId': settleId, 's': s };
    }
}
`);
        const t = makeTranspiler ({
            unifiedNullableStringParams: { safeCurrencyCode: [ 0 ] },
        });
        const out = t.transpileGoByPath (file).content;
        // baseId and quoteId stay any (rejected by copy component); settleId must NOT cache *string from assumed component
        expect (out).toContain ('var baseId any = nil');
        expect (out).toContain ('var quoteId any = nil');
        expect (out).toContain ('var settleId any = nil');
        expect (out).not.toContain ('var settleId *string = nil');
    });

    test ('Go: nil-guarded this.last_http_response.indexOf emits strings.Index without local copy', () => {
        const root = path.join (tmp, 'this-field-indexof', 'ts', 'src');
        fs.mkdirSync (root, { recursive: true });
        const file = path.join (root, 'demo.ts');
        fs.writeFileSync (file, `
type Str = string | undefined;
class Base {
    last_http_response: Str = undefined;
}
export class Demo extends Base {
    guarded (): boolean {
        if ((this.last_http_response !== undefined) && (this.last_http_response !== '')) {
            return this.last_http_response.indexOf ('ERR') >= 0;
        }
        return false;
    }
    unguarded (): boolean {
        return this.last_http_response.indexOf ('ERR') >= 0;
    }
    mutated (): boolean {
        if (this.last_http_response !== undefined) {
            this.last_http_response = undefined;
            return this.last_http_response.indexOf ('ERR') >= 0;
        }
        return false;
    }
}
`);
        const t = makeTranspiler ();
        const out = t.transpileGoByPath (file).content;
        const guardedBody = out.slice (out.indexOf ('func (this *Demo) Guarded'), out.indexOf ('func (this *Demo) Unguarded'));
        const unguardedBody = out.slice (out.indexOf ('func (this *Demo) Unguarded'), out.indexOf ('func (this *Demo) Mutated'));
        const mutatedBody = out.slice (out.indexOf ('func (this *Demo) Mutated'));
        expect (guardedBody).toContain ('strings.Index(*this.Last_http_response, "ERR")');
        expect (guardedBody).not.toContain ('GetIndexOf');
        expect (unguardedBody).toContain ('GetIndexOf');
        expect (mutatedBody).toContain ('GetIndexOf');
    });
});

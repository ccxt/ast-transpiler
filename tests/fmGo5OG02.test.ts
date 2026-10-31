import { Transpiler, installFmGo5OG02 } from '../src/transpiler';

// FM-GO5 OG02: request id / nonce counters and the last-response fields are owned by the request book; every rule is
// keyed on the checker-resolved declaration (a member of the base `BaseExchange` class), not on printed text.
const t = (install = true) => {
    const x = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    if (install) { installFmGo5OG02 (x.goTranspiler); }
    return x;
};
const BASE = [
    'class BaseExchange {',
    '    options: any = {};',
    '    last_http_response: string | undefined = undefined;',
    '    last_response_headers: any = undefined;',
    '    last_request_headers: any = undefined;',
    '    sum (a: any, b: any) { return a + b; }',
    '    safeInteger (d: any, k: string, dflt: any = undefined) { return d[k] ?? dflt; }',
    '    lockId () { return undefined; }',
    '    unlockId () { return undefined; }',
    '    lockLastNonce () { return undefined; }',
    '    unlockLastNonce () { return undefined; }',
    '    nonce (): number { return 1; }',
    '    cleanRestData () {',
    '        this.last_http_response = undefined;',
    '        // this.last_json_response = undefined; // not unified prop',
    '        this.last_response_headers = undefined;',
    '        this.last_request_headers = undefined;',
    '    }',
    '    incrementingNonce (): number {',
    '        const currentNonce = this.nonce ();',
    '        this.lockLastNonce ();',
    '        const lastNonce = this.safeInteger (this.options, \'lastNonce\', 0);',
    '        const result = (currentNonce > lastNonce) ? currentNonce : lastNonce + 1;',
    '        this.options[\'lastNonce\'] = result;',
    '        this.unlockLastNonce ();',
    '        return result;',
    '    }',
    '}',
    '',
].join ('\n');
const venue = (body: string, other = '') => BASE + 'class venue extends BaseExchange {\n' + body + other + '}\n';
const DIRECT = '    requestId (): number {\n        this.lockId ();\n        const requestId = this.sum (this.safeInteger (this.options, \'requestId\', 0), 1);\n        this.options[\'requestId\'] = requestId;\n        this.unlockId ();\n        return requestId;\n    }\n';
const CHAINED = '    requestId (): number {\n        this.lockId ();\n        const previous = this.safeInteger (this.options, \'reqid\', 0);\n        const next = this.sum (previous, 1);\n        this.options[\'reqid\'] = next;\n        this.unlockId ();\n        return next;\n    }\n';

describe('FM-GO5 OG02 request book', () => {
    test('a direct counter span hands the increment to the owner', () => {
        const out = t ().transpileGo (venue (DIRECT)).content;
        expect (out).toContain ('var requestId int64 = this.NextRequestId("requestId")');
        expect (out).not.toContain ('this.LockId()');
        expect (out).not.toContain ('this.UnlockId()');
        expect (out).not.toContain ('this.Options["requestId"] =');
    });
    test('a seeded counter span drops the seed local', () => {
        const out = t ().transpileGo (venue (CHAINED)).content;
        expect (out).toContain ('var next int64 = this.NextRequestId("reqid")');
        expect (out).not.toContain ('previous');
        expect (out).not.toContain ('this.LockId()');
    });
    test('an unproven span keeps its lock pair', () => {
        const out = t ().transpileGo (venue ('    other (): number {\n        this.lockId ();\n        const x = this.sum (1, 2);\n        this.unlockId ();\n        return x;\n    }\n')).content;
        expect (out).toContain ('this.LockId()');
        expect (out).not.toContain ('NextRequestId');
    });
    test('a lock pair on a foreign class is untouched', () => {
        const src = 'class Other {\n    options: any = {};\n    lockId () {}\n    unlockId () {}\n    sum (a: any, b: any) { return a + b; }\n    safeInteger (d: any, k: string, f: any) { return f; }\n' + DIRECT + '}\n';
        const out = t ().transpileGo (src).content;
        expect (out).toContain ('this.LockId()');
        expect (out).not.toContain ('NextRequestId');
    });
    test('the base incrementingNonce hands its compare to the owner as int64', () => {
        const out = t ().transpileGo (BASE).content;
        expect (out).toContain ('func (this *BaseExchange) IncrementingNonce() int64 {\n\tvar currentNonce int64 = this.Nonce()\n\tvar result int64 = this.nextNonce(currentNonce)\n\treturn result\n}');
        expect (out).not.toContain ('this.LockLastNonce()');
        expect (out).not.toContain ('"lastNonce"');
    });
    test('cleanRestData resets the last-response fields through the owner', () => {
        const out = t ().transpileGo (BASE).content;
        expect (out).toContain ('\tthis.handOffRequestBook(requestBookOp{kind: requestBookReset})\n\t// this.last_json_response = undefined; // not unified prop\n}');
        expect (out).not.toContain ('this.Last_response_headers = nil');
        expect (out).not.toContain ('this.Last_request_headers = nil');
        expect (out).not.toContain ('this.Last_http_response = nil');
    });
    test('a read of last_http_response through this is the snapshot accessor', () => {
        const out = t ().transpileGo (venue ('    m (): any {\n        if ((this.last_http_response !== undefined) && (this.last_http_response !== \'\')) {\n            return this.last_http_response.indexOf (\'x\');\n        }\n        return undefined;\n    }\n')).content;
        expect (out).toContain ('this.GetLast_http_response()');
        expect (out).not.toContain ('this.Last_http_response');
    });
    test('the same field name on an unrelated class is untouched', () => {
        const out = t ().transpileGo ('class Other {\n    last_http_response: any = undefined;\n    m () {\n        return this.last_http_response;\n    }\n}\n').content;
        expect (out).toContain ('this.Last_http_response');
        expect (out).not.toContain ('GetLast_http_response');
    });
    test('fails without the hook (the printer keeps the lock pair and the field writes)', () => {
        const out = t (false).transpileGo (venue (DIRECT)).content;
        expect (out).toContain ('this.LockId()');
        expect (out).not.toContain ('NextRequestId');
        const base = t (false).transpileGo (BASE).content;
        expect (base).toContain ('this.Last_http_response = nil');
        expect (base).toContain ('this.LockLastNonce()');
    });
});

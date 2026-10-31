import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

// RD-JAVA-1: owner-store counters (lockId/unlockId, incrementingNonce), Object.values on a declared Map local and
// catch-variable instanceof are printer rules keyed on checker-resolved declarations.
const mk = () => new Transpiler({ 'verbose': false, 'java': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
const BASE = [
    'class BaseExchange {',
    '    options: any = {};',
    '    sum (a: any, b: any) { return a + b; }',
    '    safeInteger (d: any, k: string, dflt: any = undefined) { return d[k] ?? dflt; }',
    '    lockId () { return undefined; }',
    '    unlockId () { return undefined; }',
    '    lockLastNonce () { return undefined; }',
    '    unlockLastNonce () { return undefined; }',
    '    nonce (): number { return 1; }',
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
const venue = (body: string) => BASE + 'class venue extends BaseExchange {\n' + body + '}\n';
const DIRECT = '    requestId (): number {\n        this.lockId ();\n        const requestId = this.sum (this.safeInteger (this.options, \'requestId\', 0), 1);\n        this.options[\'requestId\'] = requestId;\n        this.unlockId ();\n        return requestId;\n    }\n';
const CHAINED = '    requestId (): number {\n        this.lockId ();\n        const previous = this.safeInteger (this.options, \'reqid\', 0);\n        const next = this.sum (previous, 1);\n        this.options[\'reqid\'] = next;\n        this.unlockId ();\n        return next;\n    }\n';

describe('RD-JAVA-1 owner-store counters', () => {
    test('a direct counter span is one owner hand-off', () => {
        const out = mk ().transpileJava (venue (DIRECT)).content;
        expect (out).toContain ('Long requestId = this.nextCounter("requestId", 1L);');
        expect (out).not.toContain ('synchronized');
        expect (out).not.toContain ('this.lockId(');
        expect (out).not.toContain ('this.options.put');
    });
    test('a seeded counter span drops the seed local', () => {
        const out = mk ().transpileJava (venue (CHAINED)).content;
        expect (out).toContain ('Long next = this.nextCounter("reqid", 1L);');
        expect (out).not.toContain ('previous');
    });
    test('a seed read elsewhere keeps the lock pair', () => {
        const out = mk ().transpileJava (venue (CHAINED.replace ('return next;', 'return previous + next;'))).content;
        expect (out).not.toContain ('this.nextCounter(');
    });
    test('a different step keeps the lock pair', () => {
        const out = mk ().transpileJava (venue (DIRECT.replace (', 1);', ', 2);'))).content;
        expect (out).not.toContain ('this.nextCounter(');
    });
    test('a read key that differs from the written key keeps the lock pair', () => {
        const out = mk ().transpileJava (venue (DIRECT.replace ('this.options[\'requestId\'] =', 'this.options[\'other\'] ='))).content;
        expect (out).not.toContain ('this.nextCounter(');
    });
    test('a lock pair on a foreign class is untouched', () => {
        const src = 'class Other {\n    options: any = {};\n    lockId () {}\n    unlockId () {}\n    sum (a: any, b: any) { return a + b; }\n    safeInteger (d: any, k: string, f: any) { return f; }\n' + DIRECT + '}\n';
        const out = mk ().transpileJava (src).content;
        expect (out).not.toContain ('this.nextCounter(');
    });
    test('a commented span keeps the lock pair', () => {
        const out = mk ().transpileJava (venue (DIRECT.replace ('        const requestId', '        // why\n        const requestId'))).content;
        expect (out).not.toContain ('this.nextCounter(');
    });
    test('the base incrementingNonce is one owner hand-off above the clock floor', () => {
        const out = mk ().transpileJava (BASE).content;
        expect (out).toContain ('Long result = this.nextCounterAbove("lastNonce", 1L, currentNonce);');
        expect (out).not.toContain ('lockLastNonce();');
        expect (out).not.toContain ('this.options.put');
    });
});

describe('RD-JAVA-1 Object.values and catch instanceof', () => {
    const TMP = path.join (__dirname, 'files', 'tmp-rd-java-1');
    const BASE_FILE = path.join (TMP, 'ts', 'src', 'base', 'Exchange.ts');
    const ERRORS = path.join (TMP, 'ts', 'src', 'base', 'errors.ts');
    const TYPES = path.join (TMP, 'ts', 'src', 'base', 'types.ts');
    const VENUE = path.join (TMP, 'ts', 'src', 'venuerd.ts');
    const body =
        'import { Exchange } from \'./base/Exchange.js\';\n' +
        'import { AuthenticationError } from \'./base/errors.js\';\n' +
        'import type { Dict } from \'./base/types.js\';\n' +
        'export class venuerd extends Exchange {\n' +
        '    v1 (response: any) {\n' +
        '        const data: Dict = this.safeDict (response, \'a\', {});\n' +
        '        return Object.values (data);\n' +
        '    }\n' +
        '    v2 (response: any) {\n' +
        '        let data: Dict = this.safeDict (response, \'a\', {});\n' +
        '        data = this.safeDict (response, \'b\', {});\n' +
        '        return Object.values (data);\n' +
        '    }\n' +
        '    v3 (data: Dict) {\n' +
        '        return Object.values (data);\n' +
        '    }\n' +
        '    e1 (message: any): boolean {\n' +
        '        try {\n' +
        '            this.throwExactlyMatchedException (this.exceptions, this.safeString (message, \'code\'), this.json (message));\n' +
        '        } catch (e) {\n' +
        '            if (e instanceof AuthenticationError) {\n' +
        '                return false;\n' +
        '            }\n' +
        '        }\n' +
        '        return true;\n' +
        '    }\n' +
        '    e2 (message: any): boolean {\n' +
        '        try {\n' +
        '            this.throwExactlyMatchedException (this.exceptions, this.safeString (message, \'code\'), this.reflect (message));\n' +
        '        } catch (e) {\n' +
        '            if (e instanceof AuthenticationError) {\n' +
        '                return false;\n' +
        '            }\n' +
        '        }\n' +
        '        return true;\n' +
        '    }\n' +
        '    reflect (message: any) { return message; }\n' +
        '}\n';
    let out: string;
    let outBare: string;

    beforeAll (() => {
        fs.mkdirSync (path.dirname (BASE_FILE), { recursive: true });
        fs.writeFileSync (TYPES, 'export interface Dictionary<T> {\n    [key: string]: T;\n}\nexport type Dict = Dictionary<any>;\n');
        fs.writeFileSync (ERRORS, 'class BaseError extends Error {\n}\nexport class AuthenticationError extends BaseError {\n}\n');
        fs.writeFileSync (BASE_FILE,
            'import type { Dict } from \'./types.js\';\n' +
            'export class Exchange {\n' +
            '    exceptions: Dict = {};\n' +
            '    safeDict (d: any, k: any, f: Dict = undefined): Dict { return f; }\n' +
            '    safeString (d: any, k: any): string | undefined { return undefined; }\n' +
            '    json (d: any): string { return \'\'; }\n' +
            '    throwExactlyMatchedException (a: Dict, s: string | undefined, m: string | undefined) {}\n' +
            '}\n');
        fs.writeFileSync (VENUE, body);
        const make = (declare: boolean) => {
            const t: any = mk ();
            if (declare) {
                t.javaTranspiler.javaDeclaredLocalTypeResolver = (d: any) => (d?.name?.text === 'data' ? 'Map<String, Object>' : undefined);
            }
            return t.transpileJavaByPath (VENUE).content;
        };
        out = make (true);
        outBare = make (false);
    });

    afterAll (() => {
        fs.rmSync (TMP, { recursive: true, force: true });
    });

    test('Object.values on a never-rewritten declared Map local is the value copy', () => {
        expect (out).toContain ('return new java.util.ArrayList<Object>(data.values());');
    });
    test('a rewritten local, a parameter and an undeclared local keep the helper', () => {
        expect (out.match (/Helpers\.objectValues\(data\)/g)?.length).toBe (2);
        expect (outBare).not.toContain ('data.values()');
    });
    test('instanceof on a catch variable whose try is only sync base calls is native', () => {
        expect (out).toContain ('(e instanceof AuthenticationError)');
    });
    test('a try that calls a venue method keeps Helpers.isInstance', () => {
        expect (out.match (/Helpers\.isInstance\(e, AuthenticationError\.class\)/g)?.length).toBe (1);
    });
});

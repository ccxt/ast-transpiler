import { Transpiler } from '../src/transpiler';
import fs from 'fs';
import path from 'path';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

// a catch variable tested against ccxt error classes is unwrapped once per catch block; the tests print as native instanceof
describe('java catch variable instanceof ccxt error class', () => {
    const TMP = path.join(__dirname, 'files', 'tmp-h57j03-catch-cause');
    let out: string;
    beforeAll(() => {
        fs.mkdirSync(path.join(TMP, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'errors.ts'),
            'class BaseError extends Error {\n}\nclass BadSymbol extends BaseError {\n}\nclass RateLimitExceeded extends BaseError {\n}\n' +
            'export { BaseError, BadSymbol, RateLimitExceeded };\n');
        fs.writeFileSync(path.join(TMP, 'ts', 'src', 'base', 'Exchange.ts'),
            'export default class Exchange {\n' +
            '    async fetchRow (id: string): Promise<any> {\n        return id;\n    }\n' +
            '    safeValue (d: any, k: string): any {\n        return d[k];\n    }\n' +
            '}\n');
        const venue = path.join(TMP, 'ts', 'src', 'venuecause.ts');
        fs.writeFileSync(venue,
            "import Exchange from './base/Exchange';\n" +
            "import { BadSymbol, RateLimitExceeded } from './base/errors';\n" +
            'class Local extends Error {\n}\n' +
            'class Venue extends Exchange {\n' +
            '    async one (id: string): Promise<any> {\n' +
            '        try {\n            return await this.fetchRow (id);\n        } catch (e) {\n' +
            '            if (!(e instanceof BadSymbol)) {\n                throw e;\n            }\n        }\n' +
            '        return undefined;\n    }\n' +
            '    async two (id: string): Promise<any> {\n' +
            '        try {\n            return await this.fetchRow (id);\n        } catch (err) {\n' +
            '            if ((err instanceof RateLimitExceeded) || (err instanceof BadSymbol)) {\n                throw err;\n            }\n        }\n' +
            '        return undefined;\n    }\n' +
            '    sync (d: any): any {\n' +
            "        try {\n            return this.safeValue (d, 'a');\n        } catch (e) {\n" +
            '            if (e instanceof BadSymbol) {\n                return 1;\n            }\n        }\n' +
            '        return undefined;\n    }\n' +
            '    async foreign (id: string): Promise<any> {\n' +
            '        try {\n            return await this.fetchRow (id);\n        } catch (e) {\n' +
            '            if (e instanceof Local) {\n                return 1;\n            }\n        }\n' +
            '        return undefined;\n    }\n' +
            '    async notCatch (id: string, x: any): Promise<any> {\n' +
            '        try {\n            return await this.fetchRow (id);\n        } catch (e) {\n' +
            '            if (x instanceof BadSymbol) {\n                return 1;\n            }\n        }\n' +
            '        return undefined;\n    }\n' +
            '    async untested (id: string): Promise<any> {\n' +
            '        try {\n            return await this.fetchRow (id);\n        } catch (e) {\n' +
            '            return 2;\n        }\n    }\n' +
            '}\n');
        const t = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
        out = t.transpileJavaByPath(venue).content;
    });
    afterAll(() => { fs.rmSync(TMP, { recursive: true, force: true }); });

    const method = (name: string) => { const at = out.indexOf(' ' + name + '('); const next = out.indexOf('\n    public ', at + 1); return out.slice(at, next < 0 ? undefined : next); };

    test('an awaited try block unwraps once and tests the cause natively', () => {
        const one = method('one');
        expect(one).toMatch(/catch\(Exception e\)\s*\{\n\s*Throwable eCause = \(e instanceof java\.util\.concurrent\.CompletionException && e\.getCause\(\) != null\) \? e\.getCause\(\) : e;\n/);
        expect(one).not.toContain('(e instanceof BadSymbol)');
        expect(one).toContain('(eCause instanceof BadSymbol)');
        expect(one).not.toContain('Helpers.isInstance(');
    });
    test('two tests in one catch block share one unwrap', () => {
        const two = method('two');
        expect(two.split('Throwable errCause = ').length - 1).toBe(1);
        expect(two).toContain('(errCause instanceof RateLimitExceeded)');
        expect(two).toContain('(errCause instanceof BadSymbol)');
        expect(two).not.toContain('Helpers.isInstance(');
    });
    test('a try block that cannot raise a wrapped error keeps the direct test and adds no local', () => {
        const sync = method('sync');
        expect(sync).toContain('(e instanceof BadSymbol)');
        expect(sync).not.toContain('eCause');
    });
    test('a class outside base/errors.ts keeps the helper and adds no local', () => {
        const foreign = method('foreign');
        expect(foreign).toContain('Helpers.isInstance(e, Local.class)');
        expect(foreign).not.toContain('eCause');
    });
    test('an operand that is not the catch variable keeps the helper', () => {
        const notCatch = method('notCatch');
        expect(notCatch).toContain('Helpers.isInstance(x, BadSymbol.class)');
        expect(notCatch).not.toContain('Cause');
    });
    test('a catch block with no class test is unchanged', () => {
        expect(method('untested')).not.toContain('Cause');
    });
});

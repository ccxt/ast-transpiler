import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({ __esModule: true, default: jest.fn() }));

let transpiler: Transpiler;

beforeAll(() => {
    transpiler = new Transpiler({ verbose: false, java: { parser: { NUM_LINES_END_FILE: 0 } } });
});

const java = (body: string, extra = ''): string => transpiler.transpileJava(
    `class NotSupported {}\nclass T {\n${extra}    async m(code: string): Promise<any> {\n${body}\n    }\n}`
).content;

describe('java async body that only throws', () => {
    test('prints CompletableFuture.failedFuture, no supplier lambda', () => {
        const out = java('        throw new NotSupported("m is not supported yet");');
        expect(out).toContain('return java.util.concurrent.CompletableFuture.failedFuture(new NotSupported(');
        expect(out).not.toContain('supplyAsync');
        expect(out).not.toContain('throw new');
    });

    test('a body with another statement keeps the supplier lambda', () => {
        const out = java('        if (code === undefined) {\n            throw new NotSupported("x");\n        }\n        return code;');
        expect(out).toContain('supplyAsync(() -> {');
        expect(out).not.toContain('failedFuture');
    });

    test('a rethrown identifier keeps the supplier lambda', () => {
        const out = transpiler.transpileJava('class T {\n    async m(e: any): Promise<any> {\n        throw e;\n    }\n}').content;
        expect(out).toContain('supplyAsync(() -> {');
        expect(out).not.toContain('failedFuture');
    });

    test('a sync method keeps the plain throw', () => {
        const out = transpiler.transpileJava('class NotSupported {}\nclass T {\n    m(): any {\n        throw new NotSupported("x");\n    }\n}').content;
        expect(out).toContain('throw new NotSupported');
        expect(out).not.toContain('failedFuture');
    });
});

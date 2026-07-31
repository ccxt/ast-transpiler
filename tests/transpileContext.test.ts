import { Transpiler } from '../src/transpiler';

const config = {
    'verbose': false,
    'python': {
        'parser': {
            'NUM_LINES_END_FILE': 0
        }
    }
};

describe('transpile context isolation', () => {
    test('does not write the typescript state to process globals', () => {
        const transpiler = new Transpiler(config);
        transpiler.transpilePython("const x = 1;");

        expect((global as any).src).toBeUndefined();
        expect((global as any).checker).toBeUndefined();
        expect((global as any).program).toBeUndefined();
    });

    test('two instances keep their own context', () => {
        const a = new Transpiler(config);
        const b = new Transpiler(config);

        // interleave: b creates its own program between a's program creation and a's
        // printing, which used to clobber a's source file through the process globals
        const aContext = (a as any).createProgramInMemoryAndSetContext("const alpha = 1;");
        const bContext = (b as any).createProgramInMemoryAndSetContext("const beta = 2;");

        expect(aContext.src).not.toBe(bContext.src);
        expect((a as any).getContext().src).toBe(aContext.src);
        expect((b as any).getContext().src).toBe(bContext.src);
        expect((a as any).pythonTranspiler.getSrc()).toBe(aContext.src);
        expect((b as any).pythonTranspiler.getSrc()).toBe(bContext.src);

        expect(a.transpilePython("const alpha = 1;").content).toBe("alpha = 1");
        expect(b.transpilePython("const beta = 2;").content).toBe("beta = 2");
    });

    test('every language printer shares the context of its transpiler', () => {
        const transpiler = new Transpiler(config);
        const context = (transpiler as any).createProgramInMemoryAndSetContext("const x = 1;");

        const printers = [ 'pythonTranspiler', 'phpTranspiler', 'csharpTranspiler', 'goTranspiler', 'javaTranspiler', 'rustTranspiler' ];
        printers.forEach((printer) => {
            expect((transpiler as any)[printer].getContext()).toBe(context);
            expect((transpiler as any)[printer].getChecker()).toBe(context.checker);
            expect((transpiler as any)[printer].getProgram()).toBe(context.program);
        });
    });

    test('printing without a context throws instead of reading stale state', () => {
        const transpiler = new Transpiler(config);
        expect(() => (transpiler as any).getContext()).toThrow(/No transpilation context set/);
        expect(() => (transpiler as any).goTranspiler.getChecker()).toThrow(/No transpilation context set/);
    });

    test('sequential transpilations of different sources do not leak into each other', () => {
        const transpiler = new Transpiler(config);

        const first = transpiler.transpilePython("const first = 1;").content;
        const second = transpiler.transpilePython("const second = 2;").content;

        expect(first).toBe("first = 1");
        expect(second).toBe("second = 2");
    });
});

import { Transpiler } from '../src/transpiler';

const config = {
    'verbose': false,
    'python': {
        'parser': {
            'NUM_LINES_END_FILE': 0
        }
    }
};

describe('shared program cache', () => {
    test('instances given the same cache share it, instances without one do not', () => {
        const cache = Transpiler.createProgramCache();
        const a = new Transpiler(config, cache);
        const b = new Transpiler(config, cache);
        const isolated = new Transpiler(config);

        expect(a.getProgramCache()).toBe(cache);
        expect(b.getProgramCache()).toBe(cache);
        expect(isolated.getProgramCache()).not.toBe(cache);
    });

    test('cloneSharingProgramCache shares the cache but not the transpile context', () => {
        const a = new Transpiler(config);
        const b = a.cloneSharingProgramCache();

        expect(b).not.toBe(a);
        expect(b.getProgramCache()).toBe(a.getProgramCache());

        // both are driven independently: b creates its program between a's program
        // creation and a's printing, which must not disturb a
        const aContext = (a as any).createProgramInMemoryAndSetContext("const alpha = 1;");
        const bContext = (b as any).createProgramInMemoryAndSetContext("const beta = 2;");

        expect(aContext.src).not.toBe(bContext.src);
        expect((a as any).context.src).toBe(aContext.src);
        expect((b as any).context.src).toBe(bContext.src);
        expect(a.transpilePython("const alpha = 1;").content).toBe("alpha = 1");
        expect(b.transpilePython("const beta = 2;").content).toBe("beta = 2");
    });

    test('a shared cache reuses parsed lib SourceFiles across instances', () => {
        const cache = Transpiler.createProgramCache();
        const a = new Transpiler(config, cache);
        a.transpilePython("const x = 1;");
        const parsedAfterFirst = cache.sourceFiles.size;
        expect(parsedAfterFirst).toBeGreaterThan(0);

        // a second instance on the same cache must not re-parse the lib chain
        const b = new Transpiler(config, cache);
        const bContext = (b as any).createProgramInMemoryAndSetContext("const y = 2;");
        expect(cache.sourceFiles.size).toBe(parsedAfterFirst);

        const libName = [ ...cache.sourceFiles.keys() ].find((f) => f.includes("lib.esnext"));
        expect(libName).toBeDefined();
        expect(bContext.program.getSourceFile(libName)).toBe(cache.sourceFiles.get(libName).sourceFile);
    });

    test('sharing a cache does not change transpilation output', () => {
        const source = "const x = 1;\nconst y = 'a';";
        const isolated = new Transpiler(config).transpilePython(source).content;

        const cache = Transpiler.createProgramCache();
        const first = new Transpiler(config, cache);
        const second = new Transpiler(config, cache);
        // interleave two live instances over one cache
        first.transpilePython("const noise = 0;");
        expect(second.transpilePython(source).content).toBe(isolated);
        expect(first.transpilePython(source).content).toBe(isolated);
    });

    test('interleaved transpiles over one cache keep each instance on its own program', () => {
        const cache = Transpiler.createProgramCache();
        const a = new Transpiler(config, cache);
        const b = new Transpiler(config, cache);

        const aContext = (a as any).createProgramInMemoryAndSetContext("const alpha: string = 'a'; alpha;");
        const bContext = (b as any).createProgramInMemoryAndSetContext("const beta: number = 1; beta;");

        expect(aContext.program).not.toBe(bContext.program);
        // a's checker must still resolve a's types after b built a program from the
        // same cache (typescript's oldProgram reuse must not invalidate it)
        const aExpr = (aContext.src.statements[1] as any).expression;
        const bExpr = (bContext.src.statements[1] as any).expression;
        expect(aContext.checker.typeToString(aContext.checker.getTypeAtLocation(aExpr))).toBe("string");
        expect(bContext.checker.typeToString(bContext.checker.getTypeAtLocation(bExpr))).toBe("number");
    });

    test('concurrent async transpiles over one shared cache all produce correct output', async () => {
        const cache = Transpiler.createProgramCache();
        const sources = [ "const a = 1;", "const b = 2;", "const c = 3;", "const d = 4;" ];
        const expected = [ "a = 1", "b = 2", "c = 3", "d = 4" ];

        // one instance per unit of work, all sharing the parsed lib chain
        const results = await Promise.all(sources.map(async (source) => {
            const transpiler = new Transpiler(config, cache);
            return transpiler.transpilePython(source).content;
        }));

        expect(results).toEqual(expected);
    });
});

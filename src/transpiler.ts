import { ScriptTarget, SyntaxKind, type Node, type SourceFile } from "typescript/unstable/ast";
import { API, CheckFlags, ElementFlags, IndexKind, ObjectFlags, SignatureKind, SymbolFlags, TypeFlags, TypeFormatFlags, type Checker, type CompilerOptions, type Program, type Snapshot } from "typescript/unstable/sync";
import currentPath from "./dirname.cjs";
import { PythonTranspiler } from './pythonTranspiler.js';
import { PhpTranspiler } from './phpTranspiler.js';
import { CSharpTranspiler } from './csharpTranspiler.js';
import * as path from "path";
import * as fs from "fs";
import { Logger } from './logger.js';
import { Languages, TranspilationMode, IFileExport, IFileImport, ITranspiledFile, IInput, ITranspileContext, ITranspileProgramCache } from './types.js';
import { GoTranspiler, alignGoTrailingComments } from './goTranspiler.js';
import { JavaTranspiler } from './javaTranspiler.js';
import { RustTranspiler, RUST_DECLARED_DICT_LOCALS } from './rustTranspiler.js';
import type { RustDeclaredDictLocalEntry } from './rustTranspiler.js';
import { CppTranspiler } from './cppTranspiler.js';

const __dirname_mock = currentPath;

// minimal type environment: skip the auto-included @types/* packages (with empty
// options typescript scans node_modules/@types and pulls every package it finds —
// 160+ extra files) and replace the default es5+dom lib (lib.dom.d.ts alone is ~8MB)
// with the es-only lib chain. Neither dom nor @types globals affect transpilation
// output, but they dominate program creation time (~10x) and make the type
// environment depend on whatever @types happen to be installed in the host project.
const fastCompilerOptions: CompilerOptions = {
    target: ScriptTarget.Latest,
    lib: ["lib.esnext.d.ts"],
    types: [],
};

// the host globals (console, Buffer, setTimeout, ...) previously came from the
// auto-included @types packages; declare them here so references to them neither
// produce "Cannot find name" diagnostics nor trigger typescript's (very expensive)
// spelling-suggestion scans while computing those diagnostics
const globalsShim = `
declare var require: any;
declare var module: any;
declare var exports: any;
declare var console: any;
declare var process: any;
declare var Buffer: any;
declare var __dirname: string;
declare var __filename: string;
declare var setTimeout: any;
declare var clearTimeout: any;
declare var setInterval: any;
declare var clearInterval: any;
declare var setImmediate: any;
declare var fetch: any;
declare var URL: any;
declare var URLSearchParams: any;
declare var TextEncoder: any;
declare var TextDecoder: any;
declare var crypto: any;
declare var performance: any;
declare var AbortController: any;
declare var WebSocket: any;
declare var atob: any;
declare var btoa: any;
`;
const globalsShimPath = path.resolve(path.join(__dirname_mock, "__globals-shim.d.ts"));

// transpiling one file to several languages queries the checker repeatedly for the
// same nodes (identifiers, binary operands, conditions). Types and symbols are
// deterministic per (checker, node), so memoize the two hot lookups on the checker
// instance itself — the caches die with the checker when a new program is created
const UNDEFINED_SENTINEL = Symbol("undefined");
// unary checker queries keyed by a snapshot object (node / type / symbol / signature);
// the API returns registry-interned objects, so object identity is a stable key
const MEMOIZED_UNARY_CHECKER_METHODS = [
    "getTypeAtLocation", "getSymbolAtLocation", "getResolvedSignature", "getContextualType",
    "getSignaturesOfType", "getSymbolOfType", "getReturnTypeOfSignature", "getSignatureFromDeclaration",
    "isArrayType", "isArrayLikeType", "isTupleType", "getTypeArguments", "getTypeFromTypeNode",
    "getDeclaredTypeOfSymbol", "getTypeOfSymbol", "getAliasedSymbol", "getBaseTypeOfLiteralType",
    "getApparentType", "getPropertiesOfType", "getNonNullableType", "getIndexInfosOfType",
];
function memoizeCheckerCalls(checker: Checker): void {
    if ((checker as any).__astTranspilerMemoized) {
        return;
    }
    (checker as any).__astTranspilerMemoized = true;
    for (const name of MEMOIZED_UNARY_CHECKER_METHODS) {
        memoizeUnaryMethod(checker, name);
    }
    // typeToString(type) with no extra args is the only form worth caching
    memoizeUnaryMethod(checker, "typeToString");
    // (type, kind) pairs: a WeakMap per kind
    memoizeBinaryKindMethod(checker, "getSignaturesOfType");
    memoizeBinaryKindMethod(checker, "getIndexTypeOfType");
    memoizeBinaryKindMethod(checker, "getIndexInfoOfType");
    memoizePairMethod(checker, "getTypeOfSymbolAtLocation");
}

// (object, object) pairs, e.g. getTypeOfSymbolAtLocation(symbol, node); seed2 fills it from a prefetch
function memoizePairMethod(owner: object, name: string): void {
    const original = owner[name];
    if (typeof original !== "function") {
        return;
    }
    const cache = new WeakMap<object, WeakMap<object, unknown>>();
    const seed2 = (a: object, b: object, value: unknown) => {
        let inner = cache.get(a);
        if (inner === undefined) {
            cache.set(a, inner = new WeakMap());
        }
        inner.set(b, value === undefined ? UNDEFINED_SENTINEL : value);
    };
    const wrapped = function (this: unknown, ...args: unknown[]) {
        const [a, b] = args;
        if (args.length !== 2 || a === null || typeof a !== "object" || b === null || typeof b !== "object") {
            return original.apply(owner, args);
        }
        const cached = cache.get(a as object)?.get(b as object);
        if (cached !== undefined) {
            return cached === UNDEFINED_SENTINEL ? undefined : cached;
        }
        const result = original.call(owner, a, b);
        seed2(a as object, b as object, result);
        return result;
    };
    (wrapped as any).gen = (original as any).gen;
    (wrapped as any).original = original;
    (wrapped as any).seed2 = seed2;
    Object.defineProperty(owner, name, { configurable: true, value: wrapped });
}

// the TS7 checker exposes its methods as prototype getters: shadow them on the instance.
// Only single-object-argument calls are cached; anything else goes straight through.
function memoizeUnaryMethod(owner: object, name: string): void {
    const original = owner[name];
    if (typeof original !== "function") {
        return;
    }
    const cache = new WeakMap<object, unknown>();
    const wrapped = function (this: unknown, ...args: unknown[]) {
        const key = args[0];
        if (args.length !== 1 || key === null || typeof key !== "object" || Array.isArray(key)) {
            return original.apply(owner, args);
        }
        const cached = cache.get(key);
        if (cached !== undefined) {
            return cached === UNDEFINED_SENTINEL ? undefined : cached;
        }
        const result = original.call(owner, key);
        cache.set(key, result === undefined ? UNDEFINED_SENTINEL : result);
        return result;
    };
    (wrapped as any).gen = (original as any).gen;
    (wrapped as any).original = original;
    // prefetch support: seed(key, value) fills the cache; has(key) tells whether it is filled
    (wrapped as any).seed = (key: object, value: unknown) => cache.set(key, value === undefined ? UNDEFINED_SENTINEL : value);
    (wrapped as any).has = (key: object) => cache.has(key);
    Object.defineProperty(owner, name, { configurable: true, value: wrapped });
}

function memoizeBinaryKindMethod(owner: object, name: string): void {
    const unary = owner[name];
    const original = (unary as any)?.original ?? unary;
    if (typeof original !== "function") {
        return;
    }
    const caches = new Map<unknown, WeakMap<object, unknown>>();
    const wrapped = function (this: unknown, ...args: unknown[]) {
        const key = args[0];
        if (args.length === 1) {
            return unary.call(owner, key);
        }
        if (args.length !== 2 || key === null || typeof key !== "object" || typeof args[1] !== "number") {
            return original.apply(owner, args);
        }
        let cache = caches.get(args[1]);
        if (cache === undefined) {
            caches.set(args[1], cache = new WeakMap());
        }
        const cached = cache.get(key);
        if (cached !== undefined) {
            return cached === UNDEFINED_SENTINEL ? undefined : cached;
        }
        const result = original.call(owner, key, args[1]);
        cache.set(key, result === undefined ? UNDEFINED_SENTINEL : result);
        return result;
    };
    (wrapped as any).gen = (original as any).gen;
    Object.defineProperty(owner, name, { configurable: true, value: wrapped });
}

// Batch pre-resolve: walk `root` once and resolve, in one round trip per method, the
// types/symbols of the node kinds the printers ask about, seeding the memo caches above.
// Results are identical to per-node calls; nodes the printers never ask about only cost payload.
const PREFETCH_TYPE_KINDS = new Set<SyntaxKind>([
    SyntaxKind.Identifier, SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression,
    SyntaxKind.CallExpression, SyntaxKind.BinaryExpression, SyntaxKind.StringLiteral, SyntaxKind.TypeReference,
    SyntaxKind.MethodDeclaration, SyntaxKind.AnyKeyword, SyntaxKind.StringKeyword, SyntaxKind.NumberKeyword,
    SyntaxKind.ArrayType, SyntaxKind.NumericLiteral,
]);
const PREFETCH_BATCH = 4096;
function prefetchChecker(checker: Checker, root: Node, options: { types?: boolean, symbols?: boolean, signatures?: boolean } = {}): void {
    const wantTypes = options.types ?? true, wantSymbols = options.symbols ?? true, wantSignatures = options.signatures ?? true;
    const getType = checker.getTypeAtLocation as any, getSymbol = checker.getSymbolAtLocation as any, getSig = checker.getResolvedSignature as any;
    const typeNodes: Node[] = [], symbolNodes: Node[] = [], callNodes: Node[] = [];
    const visit = (node: Node) => {
        const kind = node.kind;
        if (wantTypes && PREFETCH_TYPE_KINDS.has(kind) && !getType.has?.(node)) typeNodes.push(node);
        if (wantSymbols && kind === SyntaxKind.Identifier && !getSymbol.has?.(node)) symbolNodes.push(node);
        if (wantSignatures && kind === SyntaxKind.CallExpression && !getSig.has?.(node)) callNodes.push(node);
        node.forEachChild(visit);
    };
    visit(root);
    const run = (nodes: Node[], fn: any) => {
        if (fn?.seed === undefined || fn.original === undefined) return;
        for (let i = 0; i < nodes.length; i += PREFETCH_BATCH) {
            const chunk = nodes.slice(i, i + PREFETCH_BATCH);
            let results: unknown[];
            try {
                results = fn.original(chunk);
            } catch {
                continue; // leave this chunk to the lazy per-node path
            }
            chunk.forEach((n, j) => fn.seed(n, results[j]));
        }
    };
    run(typeNodes, getType);
    run(symbolNodes, getSymbol);
    // no bulk getResolvedSignature: pipeline the per-call requests through api.batch
    const api = (checker as any).__astTranspilerApi as API | undefined;
    if (callNodes.length > 0 && getSig?.seed !== undefined && api !== undefined && getSig.original?.gen !== undefined) {
        for (let i = 0; i < callNodes.length; i += PREFETCH_BATCH) {
            const chunk = callNodes.slice(i, i + PREFETCH_BATCH);
            const gens = chunk.map((n) => {
                const g = getSig.original.gen(n);
                // a call the checker cannot resolve must not fail the whole batch
                return (function* () { try { return yield* g; } catch { return PREFETCH_FAILED; } })();
            });
            const results = api.batch(...gens) as unknown[];
            chunk.forEach((n, j) => { if (results[j] !== PREFETCH_FAILED) getSig.seed(n, results[j]); });
        }
    }
    if (wantSignatures && api !== undefined) {
        prefetchDeclarationSignatures(checker, api, root);
    }
}

// Warm the per-declaration chains baseTranspiler walks for every method/function
// (getFunctionType, getReturnTypeFromMethod) in one pipelined batch per level
function prefetchDeclarationSignatures(checker: Checker, api: API, root: Node): void {
    const getSigDecl = checker.getSignatureFromDeclaration as any;
    const getTypeOfSymbolAtLocation = (checker as any).getTypeOfSymbolAtLocation;
    if (getSigDecl?.seed === undefined || getSigDecl.original?.gen === undefined) return;
    const decls: Node[] = [];
    const visit = (node: Node) => {
        if (node.kind === SyntaxKind.MethodDeclaration || node.kind === SyntaxKind.FunctionDeclaration) decls.push(node);
        node.forEachChild(visit);
    };
    visit(root);
    const safe = (g: Generator<any, any, any>) => (function* () { try { return yield* g; } catch { return PREFETCH_FAILED; } })();
    for (let i = 0; i < decls.length; i += PREFETCH_BATCH) {
        const chunk = decls.slice(i, i + PREFETCH_BATCH);
        api.batch(...chunk.map((decl) => safe((function* () {
            const sig = getSigDecl.has(decl) ? getSigDecl(decl) : yield* getSigDecl.original.gen(decl);
            getSigDecl.seed(decl, sig);
            if (sig !== undefined) yield* sig.getReturnType.gen();
        })())));
        // getReturnTypeFromMethod: type -> symbol -> type of symbol at its declaration -> call signatures
        api.batch(...chunk.map((decl) => safe((function* () {
            const type = checker.getTypeAtLocation(decl) as any;
            const symbol = type?.getSymbol?.gen !== undefined ? yield* type.getSymbol.gen() : undefined;
            const location = symbol?.valueDeclaration?.resolve();
            if (location === undefined || getTypeOfSymbolAtLocation?.seed2 === undefined) return;
            const symbolType = yield* getTypeOfSymbolAtLocation.original.gen(symbol, location);
            getTypeOfSymbolAtLocation.seed2(symbol, location, symbolType);
            yield* symbolType.getCallSignatures.gen();
        })())));
    }
}
const PREFETCH_FAILED = Symbol("prefetchFailed");
const prefetchedFiles = new WeakSet<SourceFile>();

// program-wide diagnostics are identical for every file of a program: fetch them once
type ProgramWideDiagnostics = { program: readonly { text: string }[], global: readonly { text: string }[] };
const programDiagnosticsCache = new WeakMap<Program, ProgramWideDiagnostics>();
function getProgramWideDiagnostics(program: Program): ProgramWideDiagnostics {
    let diagnostics = programDiagnosticsCache.get(program);
    if (diagnostics === undefined) {
        diagnostics = { program: program.getProgramDiagnostics(), global: program.getGlobalDiagnostics() };
        programDiagnosticsCache.set(program, diagnostics);
    }
    return diagnostics;
}

// one TS7 API server per isolate unless a cache brings its own
let processApi: API | undefined;
function getApi(cache: ITranspileProgramCache): API {
    cache.api ??= (processApi ??= new API({ cwd: process.cwd() }));
    return cache.api;
}

// a snapshot with one synthetic program over rootFiles; `files` overlays virtual file contents
function createSnapshotProgram(cache: ITranspileProgramCache, rootFiles: string[], files: Record<string, string>): [Snapshot, Program, Checker] {
    const snapshot = getApi(cache).createSnapshot({
        fileSystem: { kind: "layer", files },
        createPrograms: [{ rootFiles: rootFiles.map((f) => path.resolve(f)), compilerOptions: fastCompilerOptions }],
    });
    const program = snapshot.operation.createdPrograms[0];
    const checker = snapshot.getProjects().find((p) => p.program === program).checker;
    memoizeCheckerCalls(checker);
    (checker as any).__astTranspilerApi = getApi(cache);
    return [snapshot, program, checker];
}

export default class Transpiler {
    config;
    pythonTranspiler: PythonTranspiler;
    phpTranspiler: PhpTranspiler;
    csharpTranspiler: CSharpTranspiler;
    goTranspiler: GoTranspiler;
    javaTranspiler: JavaTranspiler;
    rustTranspiler: RustTranspiler;
    cppTranspiler: CppTranspiler;
    // ByPath transpilation cache: parsed SourceFiles (libs + the whole import graph)
    // are reused across createProgram calls — without this every transpile*ByPath call
    // re-parses the full import closure of the target file (~1s+ per file on big repos).
    // Lives in a standalone object so several Transpiler instances on the same thread
    // can be pointed at one cache (see Transpiler.createProgramCache).
    private programCache: ITranspileProgramCache;
    // typescript state of the transpilation in flight, shared with the language printers
    private context: ITranspileContext | undefined;
    // the snapshot behind the current single-file context
    private snapshot: Snapshot | undefined;
    // batch pre-resolve each source file's checker queries before printing it (config.prefetch=false disables)
    prefetch: boolean;

    // batch pre-resolve for callers that query the checker themselves (build hooks):
    // one round trip per method for every relevant node under `root`
    static prefetchChecker(checker: Checker, root: Node, options?: { types?: boolean, symbols?: boolean, signatures?: boolean }): void {
        prefetchChecker(checker, root, options);
    }

    // A program cache holds parsed typescript SourceFiles and the last program built
    // from them. Hand the same cache to several Transpiler instances to reuse one
    // parse/typecheck of the es lib chain and of every shared import across all of
    // them. Callers that need isolation simply omit it and get a private cache.
    //
    // Same-thread only: these are live V8 objects, so a cache cannot be posted to a
    // worker_threads isolate — give each worker its own long-lived cache instead.
    static createProgramCache(): ITranspileProgramCache {
        return {};
    }

    constructor(config = {}, programCache?: ITranspileProgramCache) {
        this.config = config;
        this.programCache = programCache ?? Transpiler.createProgramCache();
        this.prefetch = config["prefetch"] ?? true;
        const phpConfig = config["php"] || {};
        const pythonConfig = config["python"] || {};
        const csharpConfig = config["csharp"] || {};
        const goConfig = config["go"] || {};
        const javaConfig = config["java"] || {};
        const rustConfig = config["rust"] || {};
        const cppConfig = config["cpp"] || {};

        if ("verbose" in config) {
            Logger.setVerboseMode(Boolean(config['verbose']));
        }

        this.pythonTranspiler = new PythonTranspiler(pythonConfig);
        this.phpTranspiler = new PhpTranspiler(phpConfig);
        this.csharpTranspiler = new CSharpTranspiler(csharpConfig);
        this.goTranspiler = new GoTranspiler(goConfig);
        this.javaTranspiler = new JavaTranspiler(javaConfig);
        this.rustTranspiler = new RustTranspiler(rustConfig);
        this.cppTranspiler = new CppTranspiler(cppConfig);
    }

    setVerboseMode(verbose: boolean) {
        Logger.setVerboseMode(verbose);
    }

    // the cache this instance parses into, to hand to further Transpiler instances
    // that should reuse this one's parsed SourceFiles
    getProgramCache(): ITranspileProgramCache {
        return this.programCache;
    }

    // a second Transpiler over the same parsed typescript state, with its own
    // printers and its own transpile context, so both can be driven independently
    // on this thread without either clobbering the other's program
    cloneSharingProgramCache(config = this.config): Transpiler {
        return new Transpiler(config, this.programCache);
    }

    // single-file snapshots are released when the next one replaces them; batches own theirs
    private setSnapshotContext(snapshot: Snapshot, program: Program, checker: Checker, fileName: string): ITranspileContext {
        const src = program.getSourceFile(fileName) ?? program.getSourceFile(path.resolve(fileName));
        const previous = this.snapshot;
        this.snapshot = snapshot;
        previous?.dispose();
        return this.setContext({ src, checker, program });
    }

    createProgramInMemoryAndSetContext(content): ITranspileContext {
        const inMemoryFilePath = path.resolve(path.join(__dirname_mock, "__dummy-file.ts"));
        const [snapshot, program, checker] = createSnapshotProgram(this.programCache, [inMemoryFilePath, globalsShimPath], {
            [inMemoryFilePath]: content,
            [globalsShimPath]: globalsShim,
        });
        return this.setSnapshotContext(snapshot, program, checker, inMemoryFilePath);
    }

    createProgramByPathAndSetContext(filePath): ITranspileContext {
        const shared = this.findSharedProgramFile(filePath);
        if (shared !== undefined) {
            return this.setContext(shared);
        }
        const [snapshot, program, checker] = createSnapshotProgram(this.programCache, [filePath, globalsShimPath], { [globalsShimPath]: globalsShim });
        return this.setSnapshotContext(snapshot, program, checker, filePath);
    }

    // One snapshot/program for a whole run: later ByPath transpiles of any root (or
    // imported file) of `paths` reuse it instead of building a program per file, as
    // long as the file's text on disk still equals the snapshot's. Replaces any
    // previous shared program; pass [] to drop it.
    setSharedProgram(paths: string[]): void {
        this.programCache.shared?.snapshot.dispose();
        this.programCache.shared = undefined;
        if (paths.length === 0) {
            return;
        }
        const [snapshot, program, checker] = createSnapshotProgram(this.programCache, [...paths, globalsShimPath], { [globalsShimPath]: globalsShim });
        this.programCache.shared = { snapshot, program, checker };
    }

    private findSharedProgramFile(filePath: string): ITranspileContext | undefined {
        const shared = this.programCache.shared;
        if (shared === undefined) {
            return undefined;
        }
        const src = shared.program.getSourceFile(path.resolve(filePath));
        if (src === undefined || !fs.existsSync(filePath) || fs.readFileSync(filePath, "utf8") !== src.text) {
            return undefined;
        }
        return { src, checker: shared.checker, program: shared.program };
    }

    // One program over N root files, so the bind/check work behind the diagnostics
    // pass is paid once for the whole set; files importing each other are fine as
    // separate roots. The batch owns its snapshot until dispose().
    createProgramBatch(paths: string[]): TranspileProgramBatch {
        const [snapshot, program, checker] = createSnapshotProgram(this.programCache, [...paths, globalsShimPath], { [globalsShimPath]: globalsShim });
        return new TranspileProgramBatch(this, snapshot, program, checker);
    }

    // the language printers read the typescript state (source file, checker, program)
    // off the context handed to them here, so two Transpiler instances never share
    // state and a nested transpile can restore whatever its caller was working on
    setContext(context: ITranspileContext): ITranspileContext {
        this.context = context;
        this.pythonTranspiler.setContext(context);
        this.phpTranspiler.setContext(context);
        this.csharpTranspiler.setContext(context);
        this.goTranspiler.setContext(context);
        this.javaTranspiler.setContext(context);
        this.rustTranspiler.setContext(context);
        this.cppTranspiler.setContext(context);
        return context;
    }

    /** @deprecated renamed to createProgramInMemoryAndSetContext */
    createProgramInMemoryAndSetGlobals(content): ITranspileContext {
        return this.createProgramInMemoryAndSetContext(content);
    }

    /** @deprecated renamed to createProgramByPathAndSetContext */
    createProgramByPathAndSetGlobals(path): ITranspileContext {
        return this.createProgramByPathAndSetContext(path);
    }

    checkFileDiagnostics(context: ITranspileContext = this.context) {
        // the pass only produces a Logger warning; on TS7 getGlobalDiagnostics forces a
        // whole-program check in tsgo, so skip it when nothing would be printed
        if (!Logger.verbose) {
            return;
        }
        const fileName = context.src.fileName;
        const programWide = getProgramWideDiagnostics(context.program);
        const diagnostics = [
            ...programWide.program,
            ...context.program.getSyntacticDiagnostics(fileName), ...programWide.global,
            ...context.program.getSemanticDiagnostics(fileName),
        ];
        if (diagnostics.length > 0) {
            let errorMessage = "Errors found in the typescript code. Transpilation might produce invalid results:\n";
            diagnostics.forEach( msg => {
                errorMessage+= "  - " + msg.text + "\n";
            });
            Logger.warning(errorMessage);
        }
    }

    transpile(lang: Languages, mode: TranspilationMode, file: string, sync = false, createContext = true, handleImports = true): ITranspiledFile {
        // improve this logic later
        if (createContext) {
            if (mode === TranspilationMode.ByPath) {
                this.createProgramByPathAndSetContext(file);
            } else {
                this.createProgramInMemoryAndSetContext(file);
            }

            // check for warnings and errors
            this.checkFileDiagnostics();
        }

        const src = this.context.src;
        if (this.prefetch && !prefetchedFiles.has(src)) {
            prefetchedFiles.add(src);
            prefetchChecker(this.context.checker, src);
        }

        let transpiledContent = undefined;
        switch(lang) {
        case Languages.Python:
            this.pythonTranspiler.asyncTranspiling = !sync;
            transpiledContent = this.pythonTranspiler.printNode(src, -1);
            this.pythonTranspiler.asyncTranspiling = true; // reset to default
            break;
        case Languages.Php:
            this.phpTranspiler.asyncTranspiling = !sync;
            transpiledContent = this.phpTranspiler.printNode(src, -1);
            this.phpTranspiler.asyncTranspiling = true; // reset to default
            break;
        case Languages.CSharp:
            transpiledContent = this.csharpTranspiler.printNode(src, -1);
            break;
        case Languages.Go:
            // gofmt aligns trailing `//` comments through its tabwriter; the printer has to do
            // that itself so the emitted Go is already gofmt-clean (see alignGoTrailingComments)
            transpiledContent = alignGoTrailingComments (this.goTranspiler.printNode(src, -1));
            break;
        case Languages.Java:
            transpiledContent = this.javaTranspiler.printNode(src, -1);
            break;
        case Languages.Rust:
            transpiledContent = this.rustTranspiler.printNode(src, -1);
            break;
        case Languages.Cpp:
            transpiledContent = this.cppTranspiler.printNode(src, -1);
            break;
        }
        let imports = [];
        let exports = [];

        if (handleImports) {
            imports = this.pythonTranspiler.getFileImports(src);
            exports = this.pythonTranspiler.getFileExports(src);
        }

        const methodsTypes = this.pythonTranspiler.getMethodTypes(src);
        Logger.success("transpilation finished successfully");

        return {
            content: transpiledContent,
            imports,
            exports,
            methodsTypes
        };
    }

    transpileDifferentLanguagesGeneric(mode: TranspilationMode, input: IInput[], content: string): ITranspiledFile[] {
        let context: ITranspileContext;
        if (mode === TranspilationMode.ByPath) {
            context = this.createProgramByPathAndSetContext(content);
        } else {
            context = this.createProgramInMemoryAndSetContext(content);
        }

        // check for warnings and errors
        this.checkFileDiagnostics(context);

        const files = [];
        input.forEach( (inp) => {
            const async = inp.async;

            files.push({
                content: this.transpile(inp.language, mode, content, !async, false, false).content
            });
        });

        const methodsTypes = this.pythonTranspiler.getMethodTypes(context.src);

        const imports = this.pythonTranspiler.getFileImports(context.src);
        const exports = this.pythonTranspiler.getFileExports(context.src);

        const output =  files.map( (file) => {
            return {
                content: file.content,
                imports,
                exports,
                methodsTypes
            };
        });

        return output;
    }

    transpileDifferentLanguages(input: any[], content: string): ITranspiledFile[] {
        const config = input.map( (inp) => {
            return {
                language: this.convertStringToLanguageEnum(inp.language),
                async: inp.async
            };
        } );
        return this.transpileDifferentLanguagesGeneric(TranspilationMode.ByContent, config, content);
    }

    transpileDifferentLanguagesByPath(input: any[], content: string): ITranspiledFile[] {
        const config = input.map( (inp) => {
            return {
                language: this.convertStringToLanguageEnum(inp.language),
                async: inp.async
            };
        } );
        return this.transpileDifferentLanguagesGeneric(TranspilationMode.ByPath, config, content);
    }

    transpilePython(content): ITranspiledFile {
        return this.transpile(Languages.Python, TranspilationMode.ByContent, content, !this.pythonTranspiler.asyncTranspiling);
    }

    transpilePythonByPath(path): ITranspiledFile {
        return this.transpile(Languages.Python, TranspilationMode.ByPath, path, !this.pythonTranspiler.asyncTranspiling);
    }

    transpilePhp(content): ITranspiledFile {
        return this.transpile(Languages.Php, TranspilationMode.ByContent, content, !this.phpTranspiler.asyncTranspiling);
    }

    transpilePhpByPath(path): ITranspiledFile {
        return this.transpile(Languages.Php, TranspilationMode.ByPath, path, !this.phpTranspiler.asyncTranspiling);
    }

    transpileCSharp(content): ITranspiledFile {
        return this.transpile(Languages.CSharp, TranspilationMode.ByContent, content);
    }

    transpileCSharpByPath(path): ITranspiledFile {
        return this.transpile(Languages.CSharp, TranspilationMode.ByPath, path);
    }

    transpileJava(content): ITranspiledFile {
        return this.transpile(Languages.Java, TranspilationMode.ByContent, content);
    }

    transpileJavaByPath(path): ITranspiledFile {
        return this.transpile(Languages.Java, TranspilationMode.ByPath, path);
    }

    transpileGoByPath(path): ITranspiledFile {
        return this.transpile(Languages.Go, TranspilationMode.ByPath, path);
    }

    transpileGo(content): ITranspiledFile {
        return this.transpile(Languages.Go, TranspilationMode.ByContent, content);
    }

    transpileRust(content): ITranspiledFile {
        return this.transpile(Languages.Rust, TranspilationMode.ByContent, content);
    }

    transpileRustByPath(path): ITranspiledFile {
        return this.transpile(Languages.Rust, TranspilationMode.ByPath, path);
    }

    transpileCpp(content): ITranspiledFile {
        return this.transpile(Languages.Cpp, TranspilationMode.ByContent, content);
    }

    transpileCppByPath(path): ITranspiledFile {
        return this.transpile(Languages.Cpp, TranspilationMode.ByPath, path);
    }


    getFileImports(content: string): IFileImport[] {
        const context = this.createProgramInMemoryAndSetContext(content);
        return this.phpTranspiler.getFileImports(context.src);
    }

    getFileExports(content: string): IFileExport[] {
        const context = this.createProgramInMemoryAndSetContext(content);
        return this.phpTranspiler.getFileExports(context.src);
    }

    setPHPPropResolution(props: string[]) {
        this.phpTranspiler.propRequiresScopeResolutionOperator = props;
    }

    setPhpUncamelCaseIdentifiers(uncamelCase: boolean) {
        this.phpTranspiler.uncamelcaseIdentifiers = uncamelCase;
    }

    setPythonUncamelCaseIdentifiers(uncamelCase: boolean) {
        this.pythonTranspiler.uncamelcaseIdentifiers = uncamelCase;
    }

    setPhpAsyncTranspiling(async: boolean) {
        this.phpTranspiler.asyncTranspiling = async;
    }

    setPythonAsyncTranspiling(async: boolean) {
        this.pythonTranspiler.asyncTranspiling = async;
    }

    setPythonStringLiteralReplacements(replacements): void {
        this.pythonTranspiler.StringLiteralReplacements = replacements;
    }

    convertStringToLanguageEnum(lang: string): Languages {
        switch(lang) {
        case "python":
            return Languages.Python;
        case "php":
            return Languages.Php;
        case "csharp":
            return Languages.CSharp;
        case "go":
            return Languages.Go;
        case "java":
            return Languages.Java;
        case "rust":
            return Languages.Rust;
        case "cpp":
            return Languages.Cpp;
        }
    }
}

// A set of root files compiled as one typescript program, transpiled one at a time.
// Obtained from Transpiler.createProgramBatch; mirrors the transpile*ByPath methods
// of the Transpiler it came from, so a caller batches by replacing
//     for (const f of files) transpiler.transpileGoByPath(f)
// with
//     const batch = transpiler.createProgramBatch(files);
//     for (const f of files) batch.transpileGoByPath(f)
//
// A failing file throws out of its own call and leaves the batch usable: the context
// is rebuilt from the program on every call, so the caller can try/catch per file and
// keep going. The batch borrows the Transpiler's printers and context, so do not
// drive that Transpiler through another path while a batch loop is in flight — use
// cloneSharingProgramCache() for a second, independent driver.
class TranspileProgramBatch {
    private readonly transpiler: Transpiler;
    private readonly snapshot: Snapshot;
    private readonly program: Program;
    private readonly checker: Checker;

    constructor(transpiler: Transpiler, snapshot: Snapshot, program: Program, checker: Checker) {
        this.transpiler = transpiler;
        this.snapshot = snapshot;
        this.program = program;
        this.checker = checker;
    }

    // releases the batch's snapshot on the TS7 server; the batch is unusable afterwards
    dispose(): void {
        this.snapshot.dispose();
    }

    getProgram(): Program {
        return this.program;
    }

    // point the owning Transpiler at one file of this batch, then run the same
    // diagnostics pass the single-file path runs
    setContextForPath(filePath: string): ITranspileContext {
        const src = this.program.getSourceFile(filePath) ?? this.program.getSourceFile(path.resolve(filePath));
        if (src === undefined) {
            throw new Error(`ast-transpiler: "${filePath}" is not a file of this program batch`);
        }
        const context = this.transpiler.setContext({ src, checker: this.checker, program: this.program });
        this.transpiler.checkFileDiagnostics(context);
        return context;
    }

    transpileByPath(lang: Languages, filePath: string, sync = false): ITranspiledFile {
        this.setContextForPath(filePath);
        return this.transpiler.transpile(lang, TranspilationMode.ByPath, filePath, sync, false);
    }

    transpilePythonByPath(filePath: string): ITranspiledFile {
        return this.transpileByPath(Languages.Python, filePath, !this.transpiler.pythonTranspiler.asyncTranspiling);
    }

    transpilePhpByPath(filePath: string): ITranspiledFile {
        return this.transpileByPath(Languages.Php, filePath, !this.transpiler.phpTranspiler.asyncTranspiling);
    }

    transpileCSharpByPath(filePath: string): ITranspiledFile {
        return this.transpileByPath(Languages.CSharp, filePath);
    }

    transpileGoByPath(filePath: string): ITranspiledFile {
        return this.transpileByPath(Languages.Go, filePath);
    }

    transpileJavaByPath(filePath: string): ITranspiledFile {
        return this.transpileByPath(Languages.Java, filePath);
    }

    transpileRustByPath(filePath: string): ITranspiledFile {
        return this.transpileByPath(Languages.Rust, filePath);
    }

    transpileCppByPath(filePath: string): ITranspiledFile {
        return this.transpileByPath(Languages.Cpp, filePath);
    }
}

export {
    Transpiler,
    TranspileProgramBatch,
    // the TS7 flag enums of the typescript the generator runs on, for consumer hooks whose
    // own `typescript` resolution may be an older 7.x lacking them
    CheckFlags, ElementFlags, IndexKind, ObjectFlags, SignatureKind, SymbolFlags, TypeFlags, TypeFormatFlags,
    SyntaxKind,
    // the trailing-comment alignment pass, so a consumer that assembles its own Go files
    // (ccxt build/goTranspiler.ts) can run it on the assembled text as well
    alignGoTrailingComments,
    // the rust declared-Dict locals vocabulary + entry shape (rust-25), so the
    // helper-removal consumers can import them from the package entry
    RUST_DECLARED_DICT_LOCALS,
};
export type { RustDeclaredDictLocalEntry };

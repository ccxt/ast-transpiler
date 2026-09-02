import ts from 'typescript';
import currentPath from "./dirname.cjs";
import { PythonTranspiler } from './pythonTranspiler.js';
import { PhpTranspiler } from './phpTranspiler.js';
import { CSharpTranspiler } from './csharpTranspiler.js';
import * as path from "path";
import * as fs from "fs";
import { Logger } from './logger.js';
import { Languages, TranspilationMode, IFileExport, IFileImport, ITranspiledFile, IInput, ITranspileContext, ITranspileProgramCache } from './types.js';
import { GoTranspiler } from './goTranspiler.js';
import { JavaTranspiler } from './javaTranspiler.js';
import { RustTranspiler } from './rustTranspiler.js';
import { CppTranspiler } from './cppTranspiler.js';

const __dirname_mock = currentPath;

// minimal type environment: skip the auto-included @types/* packages (with empty
// options typescript scans node_modules/@types and pulls every package it finds —
// 160+ extra files) and replace the default es5+dom lib (lib.dom.d.ts alone is ~8MB)
// with the es-only lib chain. Neither dom nor @types globals affect transpilation
// output, but they dominate program creation time (~10x) and make the type
// environment depend on whatever @types happen to be installed in the host project.
const fastCompilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.Latest,
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

function overrideHostForVirtualFiles(host: ts.CompilerHost, files: Map<string, ts.SourceFile>) {
    const originalGetSourceFile = host.getSourceFile.bind(host);
    const originalReadFile = host.readFile.bind(host);
    const originalFileExists = host.fileExists.bind(host);
    // resolve paths because typescript will normalize them
    // to forward slashes on windows
    host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
        const virtual = files.get(path.resolve(fileName));
        return virtual !== undefined ? virtual : originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
    };
    host.readFile = (fileName: string) => {
        const virtual = files.get(path.resolve(fileName));
        return virtual !== undefined ? virtual.text : originalReadFile(fileName);
    };
    host.fileExists = (fileName: string) => {
        return files.has(path.resolve(fileName)) || originalFileExists(fileName);
    };
}

// transpiling one file to several languages queries the checker repeatedly for the
// same nodes (identifiers, binary operands, conditions). Types and symbols are
// deterministic per (checker, node), so memoize the two hot lookups on the checker
// instance itself — the caches die with the checker when a new program is created
const NO_SYMBOL_SENTINEL = Symbol("noSymbol");
function memoizeCheckerCalls(checker: ts.TypeChecker): void {
    if ((checker as any).__astTranspilerMemoized) {
        return;
    }
    (checker as any).__astTranspilerMemoized = true;

    const typeCache = new WeakMap<ts.Node, ts.Type>();
    const originalGetTypeAtLocation = checker.getTypeAtLocation.bind(checker);
    checker.getTypeAtLocation = (node: ts.Node): ts.Type => {
        let type = typeCache.get(node);
        if (type === undefined) {
            type = originalGetTypeAtLocation(node);
            typeCache.set(node, type);
        }
        return type;
    };

    const symbolCache = new WeakMap<ts.Node, ts.Symbol | typeof NO_SYMBOL_SENTINEL>();
    const originalGetSymbolAtLocation = checker.getSymbolAtLocation.bind(checker);
    checker.getSymbolAtLocation = (node: ts.Node): ts.Symbol | undefined => {
        const cached = symbolCache.get(node);
        if (cached !== undefined) {
            return cached === NO_SYMBOL_SENTINEL ? undefined : cached;
        }
        const symbol = originalGetSymbolAtLocation(node);
        symbolCache.set(node, symbol === undefined ? NO_SYMBOL_SENTINEL : symbol);
        return symbol;
    };
}

function getProgramAndTypeCheckerFromMemory (rootDir: string, text: string, options: any = {}, cache?: ITranspileProgramCache): [any,any,any]  {
    options = options || ts.getDefaultCompilerOptions();
    const inMemoryFilePath = path.resolve(path.join(rootDir, "__dummy-file.ts"));
    const textAst = ts.createSourceFile(inMemoryFilePath, text, options.target || ts.ScriptTarget.Latest);
    const shimAst = ts.createSourceFile(globalsShimPath, globalsShim, options.target || ts.ScriptTarget.Latest);
    const host = ts.createCompilerHost(options, true);

    overrideHostForVirtualFiles(host, new Map([
        [inMemoryFilePath, textAst],
        [globalsShimPath, shimAst],
    ]));

    if (cache !== undefined) {
        // the dummy file changes every call, but the es lib chain behind it does not:
        // serve those from the shared cache so they are parsed once per cache
        const originalGetSourceFile = host.getSourceFile.bind(host);
        host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
            const resolved = path.resolve(fileName);
            if (resolved === inMemoryFilePath) {
                return textAst;
            }
            const cached = cache.sourceFiles.get(resolved);
            if (cached !== undefined && !shouldCreateNewSourceFile) {
                return cached.sourceFile;
            }
            const sourceFile = originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
            if (sourceFile !== undefined) {
                cache.sourceFiles.set(resolved, { mtimeMs: 0, sourceFile });
            }
            return sourceFile;
        };
    }

    const program = ts.createProgram({
        options,
        rootNames: [inMemoryFilePath, globalsShimPath],
        host,
        oldProgram: cache?.memoryOldProgram,
    });
    if (cache !== undefined) {
        cache.memoryOldProgram = program;
    }

    const typeChecker = program.getTypeChecker();
    memoizeCheckerCalls(typeChecker);
    const sourceFile = program.getSourceFile(inMemoryFilePath);

    return [ program, typeChecker, sourceFile];
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

    // A program cache holds parsed typescript SourceFiles and the last program built
    // from them. Hand the same cache to several Transpiler instances to reuse one
    // parse/typecheck of the es lib chain and of every shared import across all of
    // them. Callers that need isolation simply omit it and get a private cache.
    //
    // Same-thread only: these are live V8 objects, so a cache cannot be posted to a
    // worker_threads isolate — give each worker its own long-lived cache instead.
    static createProgramCache(): ITranspileProgramCache {
        return { sourceFiles: new Map() };
    }

    constructor(config = {}, programCache?: ITranspileProgramCache) {
        this.config = config;
        this.programCache = programCache ?? Transpiler.createProgramCache();
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

    createProgramInMemoryAndSetContext(content): ITranspileContext {
        const [ memProgram, memType, memSource] = getProgramAndTypeCheckerFromMemory(__dirname_mock, content, fastCompilerOptions, this.programCache);
        return this.setContext({
            src: memSource,
            checker: memType as ts.TypeChecker,
            program: memProgram,
        });
    }

    getByPathCompilerHost(options: ts.CompilerOptions): ts.CompilerHost {
        if (this.programCache.byPathHost === undefined) {
            const host = ts.createCompilerHost(options, true);
            const originalGetSourceFile = host.getSourceFile.bind(host);
            const cache = this.programCache.sourceFiles;
            host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
                let mtimeMs = 0;
                try {
                    mtimeMs = fs.statSync(fileName).mtimeMs;
                } catch (e) {
                    // e.g. synthetic lib paths — fall through with mtime 0
                }
                const cached = cache.get(fileName);
                if (cached && cached.mtimeMs === mtimeMs && !shouldCreateNewSourceFile) {
                    return cached.sourceFile;
                }
                const sourceFile = originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
                if (sourceFile !== undefined) {
                    cache.set(fileName, { mtimeMs, sourceFile });
                }
                return sourceFile;
            };
            const shimAst = ts.createSourceFile(globalsShimPath, globalsShim, ts.ScriptTarget.Latest);
            overrideHostForVirtualFiles(host, new Map([[globalsShimPath, shimAst]]));
            this.programCache.byPathHost = host;
        }
        return this.programCache.byPathHost;
    }

    createProgramByPathAndSetContext(path): ITranspileContext {
        const options: ts.CompilerOptions = fastCompilerOptions;
        const host = this.getByPathCompilerHost(options);
        // passing the previous program lets typescript reuse its internal state where
        // possible; the cached host makes every already-seen dependency parse-free
        const program = ts.createProgram([path, globalsShimPath], options, host, this.programCache.byPathOldProgram);
        this.programCache.byPathOldProgram = program;
        const sourceFile = program.getSourceFile(path);
        const typeChecker = program.getTypeChecker();
        memoizeCheckerCalls(typeChecker);

        return this.setContext({
            src: sourceFile,
            checker: typeChecker,
            program,
        });
    }

    // One program over N root files, instead of one program per file. Every
    // transpile*ByPath call pays for a full program: even with the SourceFile cache
    // making the ~340-file import closure parse-free, the binder/checker work behind
    // getPreEmitDiagnostics is redone per file. Batching N files into one program
    // pays it once for the whole set.
    //
    // Files that import each other (a derived exchange and its parent) are fine in
    // one batch — they are separate root files of the same program, exactly as
    // typescript would compile a project.
    //
    // The batch deliberately does not become the cache's byPathOldProgram: an N-file
    // program never structurally reuses a program built from a different root set, so
    // there is nothing to gain, and keeping the previous chunk's checker alive while
    // the next one is built would double peak memory — the opposite of why callers
    // chunk. The cross-batch saving comes from the shared host + SourceFile cache.
    createProgramBatch(paths: string[]): TranspileProgramBatch {
        const options: ts.CompilerOptions = fastCompilerOptions;
        const host = this.getByPathCompilerHost(options);
        const program = ts.createProgram([...paths, globalsShimPath], options, host);
        const checker = program.getTypeChecker();
        memoizeCheckerCalls(checker);
        return new TranspileProgramBatch(this, program, checker);
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
        const diagnostics = ts.getPreEmitDiagnostics(context.program, context.src);
        if (diagnostics.length > 0) {
            let errorMessage = "Errors found in the typescript code. Transpilation might produce invalid results:\n";
            diagnostics.forEach( msg => {
                errorMessage+= "  - " + msg.messageText + "\n";
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
            transpiledContent = this.goTranspiler.printNode(src, -1);
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
    private readonly program: ts.Program;
    private readonly checker: ts.TypeChecker;

    constructor(transpiler: Transpiler, program: ts.Program, checker: ts.TypeChecker) {
        this.transpiler = transpiler;
        this.program = program;
        this.checker = checker;
    }

    getProgram(): ts.Program {
        return this.program;
    }

    // point the owning Transpiler at one file of this batch, then run the same
    // diagnostics pass the single-file path runs — the printers read checker state
    // back from it, so it is not optional
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
    TranspileProgramBatch
};

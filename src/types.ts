import ts from 'typescript';

interface IInput {
    language: Languages;
    async: boolean;
}

// per-transpile typescript state. Holding it in an explicit object (owned by the
// Transpiler instance and handed to the language printers) instead of process
// globals keeps concurrent/nested transpilations from clobbering each other.
interface ITranspileContext {
    src: ts.SourceFile;
    checker: ts.TypeChecker;
    program: ts.Program;
}

// Parsed SourceFiles (the es lib chain plus the import closure of everything
// transpiled so far) and the last program built from them, so the next program
// reuses that work instead of re-parsing it. Shareable between Transpiler
// instances running on the same thread; these are plain V8 heap objects, so a
// worker_threads isolate cannot receive one and needs a cache of its own.
interface ITranspileProgramCache {
    sourceFiles: Map<string, { mtimeMs: number, sourceFile: ts.SourceFile }>;
    byPathHost?: ts.CompilerHost;
    byPathOldProgram?: ts.Program;
    memoryOldProgram?: ts.Program;
}


interface IParameterType {
    name: string;
    type: string;
    isOptional: boolean;
    initializer?: string;
}

interface IMethodType {
    async: boolean;
    name: string;
    returnType: string;
    parameters: IParameterType[];
}

interface IFileImport {
    name: string;
    path: string;
    isDefault: boolean;
}

interface IFileExport {
    name: string;
    isDefault: boolean;
}

interface ITranspiledFile {
    content: string;
    imports: IFileImport[];
    exports: IFileExport[];
    methodsTypes?: IMethodType[];
}

enum Languages {
    Python,
    Php,
    CSharp,
    Go,
    Java,
    Rust
}

enum TranspilationMode {
    ByPath,
    ByContent
}

// const TranspilingError = (message) => ({
//     error: new Error(message),
//     code: 'TRANSPILING ERROR'
// });

class TranspilationError extends Error {
    constructor (id, message, nodeText, start, end) {
        const parsedMessage = `Lang: ${id} Error: ${message} at ${start}:${end} node: "${nodeText}"`;
        super (parsedMessage);
        this.name = 'TranspilationError';

    }
}

// class FunctionReturnTypeError extends TranspilationError {
//     constructor (message) {
//         super (message);
//         this.name = 'FuctionReturnTypeError';
//     }
// }

// class FunctionArgumentTypeError extends TranspilationError {
//     constructor (message) {
//         super (message);
//         this.name = 'FunctionArgumentTypeError';
//     }
// }

export {
    Languages,
    TranspilationMode,
    IFileImport,
    ITranspiledFile,
    IFileExport,
    ITranspileContext,
    ITranspileProgramCache,
    TranspilationError,
    // FunctionReturnTypeError,
    // FunctionArgumentTypeError,
    IInput,
    IMethodType,
    IParameterType
};
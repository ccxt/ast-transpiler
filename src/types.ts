import { type SourceFile } from "typescript/unstable/ast";
import { type API, type Checker, type Program, type Snapshot } from "typescript/unstable/sync";

interface IInput {
    language: Languages;
    async: boolean;
}

// per-transpile typescript state. Holding it in an explicit object (owned by the
// Transpiler instance and handed to the language printers) instead of process
// globals keeps concurrent/nested transpilations from clobbering each other.
interface ITranspileContext {
    src: SourceFile;
    checker: Checker;
    program: Program;
}

// The TS7 API server the programs are created on. Shareable between Transpiler
// instances on the same thread; a worker_threads isolate needs its own.
interface ITranspileProgramCache {
    api?: API;
    // the run-wide program set by Transpiler.setSharedProgram
    shared?: { snapshot: Snapshot, program: Program, checker: Checker };
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
    Rust,
    Cpp
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

interface IInput {
    language: Languages;
    async: boolean;
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
    TranspilationError,
    // FunctionReturnTypeError,
    // FunctionArgumentTypeError,
    IInput,
    IMethodType,
    IParameterType
};
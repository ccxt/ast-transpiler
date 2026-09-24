import { type SourceFile } from "typescript/unstable/ast";
import { type API, type Checker, type Program } from "typescript/unstable/sync";
interface IInput {
    language: Languages;
    async: boolean;
}
interface ITranspileContext {
    src: SourceFile;
    checker: Checker;
    program: Program;
}
interface ITranspileProgramCache {
    api?: API;
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
declare enum Languages {
    Python = 0,
    Php = 1,
    CSharp = 2,
    Go = 3,
    Java = 4,
    Rust = 5,
    Cpp = 6
}
declare enum TranspilationMode {
    ByPath = 0,
    ByContent = 1
}
declare class TranspilationError extends Error {
    constructor(id: any, message: any, nodeText: any, start: any, end: any);
}
export { Languages, TranspilationMode, IFileImport, ITranspiledFile, IFileExport, ITranspileContext, ITranspileProgramCache, TranspilationError, IInput, IMethodType, IParameterType };

import ts from 'typescript';
import currentPath from "./dirname.cjs";
import { PythonTranspiler } from './pythonTranspiler.js';
import { PhpTranspiler } from './phpTranspiler.js';
import { CSharpTranspiler } from './csharpTranspiler.js';
import * as path from "path";
import { Logger } from './logger.js';
import { Languages, TranspilationMode, IFileExport, IFileImport, ITranspiledFile, IInput } from './types.js';

const __dirname_mock = currentPath;

function getProgramAndTypeCheckerFromMemory (rootDir: string, text: string, options: any = {}): [any,any,any]  {
    options = options || ts.getDefaultCompilerOptions();
    const inMemoryFilePath = path.resolve(path.join(rootDir, "__dummy-file.ts"));
    const textAst = ts.createSourceFile(inMemoryFilePath, text, options.target || ts.ScriptTarget.Latest);
    const host = ts.createCompilerHost(options, true);
    function overrideIfInMemoryFile(methodName: keyof ts.CompilerHost, inMemoryValue: any) {
        const originalMethod = host[methodName] as Function; // eslint-disable-line
        host[methodName] = (...args: unknown[]) => {
            // resolve the path because typescript will normalize it
            // to forward slashes on windows
            const filePath = path.resolve(args[0] as string);
            if (filePath === inMemoryFilePath)
                return inMemoryValue;
            return originalMethod.apply(host, args);
        };
    }

    overrideIfInMemoryFile("getSourceFile", textAst);
    overrideIfInMemoryFile("readFile", text);
    overrideIfInMemoryFile("fileExists", true);

    const program = ts.createProgram({
        options,
        rootNames: [inMemoryFilePath],
        host
    });

    const typeChecker = program.getTypeChecker();
    const sourceFile = program.getSourceFile(inMemoryFilePath);

    return [ program, typeChecker, sourceFile];
}

export default class Transpiler {
    config;
    pythonTranspiler: PythonTranspiler;
    phpTranspiler: PhpTranspiler;
    csharpTranspiler: CSharpTranspiler;
    constructor(config = {}) {
        this.config = config;
        const phpConfig = config["php"] || {};
        const pythonConfig = config["python"] || {};
        const csharpConfig = config["csharp"] || {};

        if ("verbose" in config) {
            Logger.setVerboseMode(config['verbose']);
        }

        this.pythonTranspiler = new PythonTranspiler(pythonConfig);
        this.phpTranspiler = new PhpTranspiler(phpConfig);
        this.csharpTranspiler = new CSharpTranspiler(csharpConfig);
    }

    setVerboseMode(verbose: boolean) {
        Logger.setVerboseMode(verbose);
    }

    createProgramInMemoryAndSetGlobals(content) {
        const [ memProgram, memType, memSource] = getProgramAndTypeCheckerFromMemory(__dirname_mock, content);
        global.src = memSource;
        global.checker = memType as ts.TypeChecker;
        global.program = memProgram;
    }

    createProgramByPathAndSetGlobals(path) {
        const program = ts.createProgram([path], {});
        const sourceFile = program.getSourceFile(path);
        const typeChecker = program.getTypeChecker();

        global.src = sourceFile;
        global.checker = typeChecker;
        global.program = program;
    }

    checkFileDiagnostics() {
        const diagnostics = ts.getPreEmitDiagnostics(global.program, global.src);
        if (diagnostics.length > 0) {
            let errorMessage = "Errors found in the typescript code. Transpilation might produce invalid results:\n";
            diagnostics.forEach( msg => {
                errorMessage+= "  - " + msg.messageText + "\n";
            });
            Logger.warning(errorMessage);
        }
    }

    transpile(lang: Languages, mode: TranspilationMode, file: string, sync = false, setGlobals = true, handleImports = true): ITranspiledFile {
        // improve this logic later
        if (setGlobals) {
            if (mode === TranspilationMode.ByPath) {
                this.createProgramByPathAndSetGlobals(file);
            } else {
                this.createProgramInMemoryAndSetGlobals(file);
            }

            // check for warnings and errors
            this.checkFileDiagnostics();
        }

        let transpiledContent = undefined;
        switch(lang) {
        case Languages.Python:
            this.pythonTranspiler.asyncTranspiling = !sync;
            transpiledContent = this.pythonTranspiler.printNode(global.src, -1);
            this.pythonTranspiler.asyncTranspiling = true; // reset to default
            break;
        case Languages.Php:
            this.phpTranspiler.asyncTranspiling = !sync;
            transpiledContent = this.phpTranspiler.printNode(global.src, -1);
            this.phpTranspiler.asyncTranspiling = true; // reset to default
            break;
        case Languages.CSharp:
            transpiledContent = this.csharpTranspiler.printNode(global.src, -1);
        }
        let imports = [];
        let exports = [];

        if (handleImports) {
            imports = this.pythonTranspiler.getFileImports(global.src);
            exports = this.pythonTranspiler.getFileExports(global.src);
        }

        const methodsTypes = this.pythonTranspiler.getMethodTypes(global.src);
        Logger.success("transpilation finished successfully");

        return {
            content: transpiledContent,
            imports,
            exports,
            methodsTypes
        };
    }

    transpileDifferentLanguagesGeneric(mode: TranspilationMode, input: IInput[], content: string): ITranspiledFile[] {
        if (mode === TranspilationMode.ByPath) {
            this.createProgramByPathAndSetGlobals(content);
        } else {
            this.createProgramInMemoryAndSetGlobals(content);
        }

        // check for warnings and errors
        this.checkFileDiagnostics();

        const files = [];
        input.forEach( (inp) => {
            const async = inp.async;

            files.push({
                content: this.transpile(inp.language, mode, content, !async, false, false).content
            });
        });

        const methodsTypes = this.pythonTranspiler.getMethodTypes(global.src);

        const imports = this.pythonTranspiler.getFileImports(global.src);
        const exports = this.pythonTranspiler.getFileExports(global.src);

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

    getFileImports(content: string): IFileImport[] {
        this.createProgramInMemoryAndSetGlobals(content);
        return this.phpTranspiler.getFileImports(global.src);
    }

    getFileExports(content: string): IFileExport[] {
        this.createProgramInMemoryAndSetGlobals(content);
        return this.phpTranspiler.getFileExports(global.src);
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
        }
    }
}

export {
    Transpiler
};

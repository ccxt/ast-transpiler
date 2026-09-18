import ts, { BinaryExpression, CallExpression } from 'typescript';

interface IInput {
    language: Languages;
    async: boolean;
}
interface ITranspileContext {
    src: ts.SourceFile;
    checker: ts.TypeChecker;
    program: ts.Program;
}
interface ITranspileProgramCache {
    sourceFiles: Map<string, {
        mtimeMs: number;
        sourceFile: ts.SourceFile;
    }>;
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

declare class BaseTranspiler {
    NUM_LINES_BETWEEN_CLASS_MEMBERS: number;
    LINES_BETWEEN_FILE_MEMBERS: number;
    NUM_LINES_END_FILE: number;
    SPACE_DEFAULT_PARAM: string;
    BLOCK_OPENING_TOKEN: string;
    BLOCK_CLOSING_TOKEN: string;
    SPACE_BEFORE_BLOCK_OPENING: string;
    CONDITION_OPENING: string;
    CONDITION_CLOSE: string;
    DEFAULT_IDENTATION: string;
    STRING_QUOTE_TOKEN: string;
    UNDEFINED_TOKEN: string;
    NULL_TOKEN: string;
    IF_TOKEN: string;
    ELSE_TOKEN: string;
    ELSEIF_TOKEN: string;
    THIS_TOKEN: string;
    SLASH_TOKEN: string;
    ASTERISK_TOKEN: string;
    PLUS_TOKEN: string;
    MINUS_TOKEN: string;
    EQUALS_TOKEN: string;
    EQUALS_EQUALS_TOKEN: string;
    EXCLAMATION_EQUALS_TOKEN: string;
    EXCLAMATION_EQUALS_EQUALS_TOKEN: string;
    EQUALS_EQUALS_EQUALS_TOKEN: string;
    AMPERSTAND_APERSAND_TOKEN: string;
    PLUS_EQUALS: string;
    BAR_BAR_TOKEN: string;
    PERCENT_TOKEN: string;
    RETURN_TOKEN: string;
    OBJECT_OPENING: string;
    OBJECT_CLOSING: string;
    LEFT_PARENTHESIS: string;
    RIGHT_PARENTHESIS: string;
    ARRAY_OPENING_TOKEN: string;
    ARRAY_CLOSING_TOKEN: string;
    TRUE_KEYWORD: string;
    FALSE_KEYWORD: string;
    NEW_CORRESPODENT: string;
    THROW_TOKEN: string;
    AWAIT_TOKEN: string;
    STATIC_TOKEN: string;
    CONTINUE_TOKEN: string;
    EXTENDS_TOKEN: string;
    NOT_TOKEN: string;
    SUPER_TOKEN: string;
    PROPERTY_ACCESS_TOKEN: string;
    TRY_TOKEN: string;
    CATCH_TOKEN: string;
    CATCH_DECLARATION: string;
    BREAK_TOKEN: string;
    IN_TOKEN: string;
    LESS_THAN_TOKEN: string;
    GREATER_THAN_TOKEN: string;
    GREATER_THAN_EQUALS_TOKEN: string;
    LESS_THAN_EQUALS_TOKEN: string;
    PLUS_PLUS_TOKEN: string;
    MINUS_MINUS_TOKEN: string;
    CONSTRUCTOR_TOKEN: string;
    SUPER_CALL_TOKEN: string;
    WHILE_TOKEN: string;
    FOR_TOKEN: string;
    VAR_TOKEN: string;
    METHOD_DEFAULT_ACCESS: string;
    PROPERTY_ASSIGNMENT_TOKEN: string;
    PROPERTY_ASSIGNMENT_OPEN: string;
    PROPERTY_ASSIGNMENT_CLOSE: string;
    LINE_TERMINATOR: string;
    FUNCTION_TOKEN: string;
    METHOD_TOKEN: string;
    ASYNC_TOKEN: string;
    PROMISE_TYPE_KEYWORD: string;
    NEW_TOKEN: string;
    STRING_LITERAL_KEYWORD: string;
    STRING_KEYWORD: string;
    NUMBER_KEYWORD: string;
    PUBLIC_KEYWORD: string;
    PRIVATE_KEYWORD: string;
    VOID_KEYWORD: string;
    BOOLEAN_KEYWORD: string;
    ARRAY_KEYWORD: string;
    OBJECT_KEYWORD: string;
    INTEGER_KEYWORD: string;
    DEFAULT_RETURN_TYPE: string;
    DEFAULT_PARAMETER_TYPE: string;
    DEFAULT_TYPE: string;
    FALSY_WRAPPER_OPEN: string;
    FALSY_WRAPPER_CLOSE: string;
    ELEMENT_ACCESS_WRAPPER_OPEN: string;
    ELEMENT_ACCESS_WRAPPER_CLOSE: string;
    COMPARISON_WRAPPER_OPEN: string;
    COMPARISON_WRAPPER_CLOSE: string;
    UKNOWN_PROP_WRAPPER_OPEN: string;
    UNKOWN_PROP_WRAPPER_CLOSE: string;
    UKNOWN_PROP_ASYNC_WRAPPER_OPEN: string;
    UNKOWN_PROP_ASYNC_WRAPPER_CLOSE: string;
    EQUALS_EQUALS_WRAPPER_OPEN: string;
    EQUALS_EQUALS_WRAPPER_CLOSE: string;
    DIFFERENT_WRAPPER_OPEN: string;
    DIFFERENT_WRAPPER_CLOSE: string;
    GREATER_THAN_WRAPPER_OPEN: string;
    GREATER_THAN_WRAPPER_CLOSE: string;
    LESS_THAN_WRAPPER_OPEN: string;
    LESS_THAN_WRAPPER_CLOSE: string;
    GREATER_THAN_EQUALS_WRAPPER_OPEN: string;
    GREATER_THAN_EQUALS_WRAPPER_CLOSE: string;
    LESS_THAN_EQUALS_WRAPPER_OPEN: string;
    LESS_THAN_EQUALS_WRAPPER_CLOSE: string;
    DIVIDE_WRAPPER_OPEN: string;
    DIVIDE_WRAPPER_CLOSE: string;
    PLUS_WRAPPER_OPEN: string;
    PLUS_WRAPPER_CLOSE: string;
    MINUS_WRAPPER_OPEN: string;
    MINUS_WRAPPER_CLOSE: string;
    MOD_WRAPPER_OPEN: string;
    MOD_WRAPPER_CLOSE: string;
    ARRAY_LENGTH_WRAPPER_OPEN: string;
    ARRAY_LENGTH_WRAPPER_CLOSE: string;
    MULTIPLY_WRAPPER_OPEN: string;
    MULTIPLY_WRAPPER_CLOSE: string;
    INDEXOF_WRAPPER_OPEN: string;
    INDEXOF_WRAPPER_CLOSE: string;
    PARSEINT_WRAPPER_OPEN: string;
    PARSEINT_WRAPPER_CLOSE: string;
    DYNAMIC_CALL_OPEN: string;
    SPREAD_TOKEN: string;
    INFER_VAR_TYPE: boolean;
    INFER_ARG_TYPE: boolean;
    SupportedKindNames: {};
    PostFixOperators: {};
    PrefixFixOperators: {};
    FunctionDefSupportedKindNames: {};
    LeftPropertyAccessReplacements: {};
    RightPropertyAccessReplacements: {};
    FullPropertyAccessReplacements: {};
    StringLiteralReplacements: {};
    CallExpressionReplacements: {};
    ReservedKeywordsReplacements: {};
    ReassignedVars: {};
    PropertyAccessRequiresParenthesisRemoval: any[];
    VariableTypeReplacements: {};
    ArgTypeReplacements: {};
    FuncModifiers: {};
    defaultPropertyAccess: string;
    currentClassName: string;
    className: string;
    uncamelcaseIdentifiers: any;
    asyncTranspiling: any;
    implicitAsyncTranspiling: any;
    requiresReturnType: any;
    requiresParameterType: any;
    supportsFalsyOrTruthyValues: any;
    requiresCallExpressionCast: any;
    removeVariableDeclarationForFunctionExpression: any;
    includeFunctionNameInFunctionExpressionDeclaration: any;
    id: any;
    context: ITranspileContext | undefined;
    constructor(config: any);
    setContext(context: ITranspileContext | undefined): void;
    getSrc(): ts.SourceFile;
    getChecker(): ts.TypeChecker;
    getProgram(): ts.Program;
    initOperators(): void;
    capitalize(str: string): string;
    applyUserOverrides(config: any): void;
    getLineAndCharacterOfNode(node: any): [number, number];
    isComment(line: string): boolean;
    isStringType(flags: ts.TypeFlags): flags is ts.TypeFlags.String | ts.TypeFlags.StringLiteral;
    isAnyType(flags: ts.TypeFlags): flags is ts.TypeFlags.Any;
    warnIfAnyType(node: any, flags: any, variable: any, target: any): void;
    warn(node: any, target: any, message: any): void;
    hasAsyncModifier(node: any): any;
    isPromiseType(type: any): boolean;
    isImplicitAsyncFunction(node: any): boolean;
    isAsyncFunction(node: any): any;
    getMethodOverride(node: ts.Node): ts.Node;
    getIden(num: any): string;
    getBlockOpen(identation: any): string;
    getBlockClose(identation: any, chainBlock?: boolean): string;
    startsWithUpperCase(str: any): boolean;
    unCamelCaseIfNeeded(name: string): string;
    transformIdentifier(node: any, identifier: any): string;
    transformCallExpressionName(name: string, nameNode?: any): string;
    transformPropertyAccessExpressionName(name: string, nameNode?: any): string;
    printIdentifier(node: any): string;
    shouldRemoveParenthesisFromCallExpression(node: any): boolean;
    printInstanceOfExpression(node: any, identation: any): string;
    getCustomOperatorIfAny(left: any, right: any, operator: any): any;
    printCustomBinaryExpressionIfAny(node: any, identation: any): any;
    printBinaryExpression(node: any, identation: any): any;
    getBinaryExpressionPrefixes(node: any, identation: any): any;
    transformPropertyAcessExpressionIfNeeded(node: any): any;
    transformPropertyAcessRightIdentifierIfNeeded(name: string): string;
    getExceptionalAccessTokenIfAny(node: any): any;
    printLengthProperty(node: any, identation: any, name?: any): any;
    printPropertyAccessExpression(node: any, identation: any): any;
    printCustomDefaultValueIfNeeded(node: any): any;
    printParameteCustomName(node: any, name: any, defaultValue?: boolean): any;
    printParameter(node: any, defaultValue?: boolean): string;
    printModifiers(node: any): any;
    transformLeadingComment(comment: any): any;
    transformTrailingComment(comment: any): any;
    printLeadingComments(node: any, identation: any): string;
    printTraillingComment(node: any, identation: any): string;
    printNodeCommentsIfAny(node: any, identation: any, parsedNode: any): string;
    getType(node: any): any;
    getTypeFromRawType(type: any): string;
    getFunctionType(node: any, async?: boolean): any;
    printFunctionBody(node: any, identation: any): string;
    printParameterType(node: any): any;
    printFunctionType(node: any): any;
    printFunctionDefinition(node: any, identation: any): string;
    transformFunctionNameIfNeeded(name: any): string;
    printFunctionDeclaration(node: any, identation: any): string;
    printMethodParameters(node: any): any;
    transformMethodNameIfNeeded(name: string): string;
    printMethodDefinition(node: any, identation: any): string;
    printMethodDeclaration(node: any, identation: any): string;
    printStringLiteral(node: any): any;
    printNumericLiteral(node: any): any;
    printArrayLiteralExpression(node: any, identation: any): string;
    printVariableDeclarationList(node: any, identation: any): string;
    printVariableStatement(node: any, identation: any): string;
    printOutOfOrderCallExpressionIfAny(node: any, identation: any): any;
    printSuperCallInsideConstructor(node: any, identation: any): string;
    isBuiltInFunctionCall(node: any): boolean;
    getTypesFromCallExpressionParameters(node: any): any[];
    printArgsForCallExpression(node: any, identation: any): any;
    printArrayIsArrayCall(node: any, identation: any, parsedArg?: any): any;
    printObjectKeysCall(node: any, identation: any, parsedArg?: any): any;
    printObjectValuesCall(node: any, identation: any, parsedArg?: any): any;
    printJsonParseCall(node: any, identation: any, parsedArg?: any): any;
    printJsonStringifyCall(node: any, identation: any, parsedArg?: any): any;
    printPromiseAllCall(node: any, identation: any, parsedArg?: any): any;
    printMathFloorCall(node: any, identation: any, parsedArg?: any): any;
    printMathRoundCall(node: any, identation: any, parsedArg?: any): any;
    printMathCeilCall(node: any, identation: any, parsedArg?: any): any;
    printNumberIsIntegerCall(node: any, identation: any, parsedArg?: any): any;
    printArrayPushCall(node: any, identation: any, name?: any, parsedArg?: any): any;
    printIncludesCall(node: any, identation: any, name?: any, parsedArg?: any): any;
    printIndexOfCall(node: any, identation: any, name?: any, parsedArg?: any): any;
    printStartsWithCall(node: any, identation: any, name?: any, parsedArg?: any): any;
    printEndsWithCall(node: any, identation: any, name?: any, parsedArg?: any): any;
    printPadEndCall(node: any, identation: any, name: any, parsedArg: any, parsedArg2: any): any;
    printPadStartCall(node: any, identation: any, name: any, parsedArg: any, parsedArg2: any): any;
    printTrimCall(node: any, identation: any, name?: any): any;
    printJoinCall(node: any, identation: any, name?: any, parsedArg?: any): any;
    printSplitCall(node: any, identation: any, name?: any, parsedArg?: any): any;
    printConcatCall(node: any, identation: any, name?: any, parsedArg?: any): any;
    printToFixedCall(node: any, identation: any, name?: any, parsedArg?: any): any;
    printSearchCall(node: any, identation: any, name?: any, parsedArg?: any): any;
    printSliceCall(node: any, identation: any, name?: any, parsedArg?: any, parsedArg2?: any): any;
    printReplaceCall(node: any, identation: any, name?: any, parsedArg?: any, parsedArg2?: any): any;
    printReplaceAllCall(node: any, identation: any, name?: any, parsedArg?: any, parsedArg2?: any): any;
    printToStringCall(node: any, identation: any, name?: any): any;
    printToUpperCaseCall(node: any, identation: any, name?: any): any;
    printToLowerCaseCall(node: any, identation: any, name?: any): any;
    printShiftCall(node: any, identation: any, name?: any): any;
    printReverseCall(node: any, identation: any, name?: any): any;
    printPopCall(node: any, identation: any, name?: any): any;
    printAssertCall(node: any, identation: any, parsedArgs: any): string;
    printDateNowCall(node: any, identation: any): any;
    printCallExpression(node: any, identation: any): any;
    printClassBody(node: any, identation: any): string;
    getCustomClassName(node: any): any;
    getClassModifier(node: any): string;
    printClassDefinition(node: any, identation: any): string;
    printClass(node: any, identation: any): string;
    printConstructorDeclaration(node: any, identation: any): string;
    printWhileStatement(node: any, identation: any): string;
    printForStatement(node: any, identation: any): string;
    printBreakStatement(node: any, identation: any): string;
    printPostFixUnaryExpression(node: any, identation: any): string;
    printPrefixUnaryExpression(node: any, identation: any): any;
    printObjectLiteralBody(node: any, identation: any): any;
    printObjectLiteralExpression(node: any, identation: any): string;
    printCustomRightSidePropertyAssignment(node: any, identation: any): string;
    printPropertyAssignment(node: any, identation: any): string;
    printElementAccessExpressionExceptionIfAny(node: any): any;
    printElementAccessExpression(node: any, identation: any): any;
    printCondition(node: any, identation: any): any;
    printIfStatement(node: any, identation: any): string;
    printParenthesizedExpression(node: any, identation: any): string;
    printBooleanLiteral(node: any): string;
    printTryStatement(node: any, identation: any): string;
    printNewExpression(node: any, identation: any): string;
    printThrowStatement(node: any, identation: any): string;
    printAwaitExpression(node: any, identation: any): string;
    wrapSyntheticNode(synthetic: any, original: any): any;
    wrapImplicitReturnAwait(node: any): any;
    printConditionalExpression(node: any, identation: any): string;
    printAsExpression(node: any, identation: any): string;
    getFunctionNodeFromReturn(node: any): any;
    printReturnStatement(node: any, identation: any): string;
    printArrayBindingPattern(node: any, identation: any): string;
    printBlock(node: any, identation: any, chainBlock?: boolean): string;
    printExpressionStatement(node: any, identation: any): string;
    getExpressionStatementPrefixesIfAny(node: any, identation: any): any;
    printPropertyDeclaration(node: any, identation: any): string;
    printPropertyAccessModifiers(node: any): any;
    printSpreadElement(node: any, identation: any): string;
    printNullKeyword(node: any, identation: any): string;
    printContinueStatement(node: any, identation: any): string;
    printDeleteExpression(node: any, identation: any): any;
    printThisKeyword(node: any, identation: any): string;
    printNode(node: any, identation?: number): string;
    getFileESMImports(node: any): IFileImport[];
    isCJSRequireStatement(node: any): boolean;
    isCJSModuleExportsExpressionStatement(node: any): boolean;
    getCJSImports(node: any): IFileImport[];
    getFileImports(node: any): IFileImport[];
    getESMExports(node: any): IFileExport[];
    getCJSExports(node: any): IFileExport[];
    getExportDeclarations(node: any): IFileExport[];
    getFileExports(node: any): IFileExport[];
    getReturnTypeFromMethod(node: any): string;
    getParameterType(node: any): IParameterType;
    getMethodTypes(file: any): IMethodType[];
}

declare class PythonTranspiler extends BaseTranspiler {
    constructor(config?: {});
    initConfig(): void;
    printArrayIsArrayCall(node: any, identation: any, parsedArg?: any): string;
    printObjectKeysCall(node: any, identation: any, parsedArg?: any): string;
    printObjectValuesCall(node: any, identation: any, parsedArg?: any): string;
    printPromiseAllCall(node: any, identation: any, parsedArg: any): string;
    printMathFloorCall(node: any, identation: any, parsedArg?: any): string;
    printMathCeilCall(node: any, identation: any, parsedArg?: any): string;
    printNumberIsIntegerCall(node: any, identation: any, parsedArg?: any): string;
    printMathRoundCall(node: any, identation: any, parsedArg?: any): string;
    printIncludesCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printJoinCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printSplitCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printConcatCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printPopCall(node: any, identation: any, name?: any): string;
    printShiftCall(node: any, identation: any, name?: any): string;
    printReverseCall(node: any, identation: any, name?: any): string;
    printArrayPushCall(node: any, identation: any, name: any, parsedArg: any): string;
    printToStringCall(node: any, identation: any, name?: any): string;
    printIndexOfCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printSearchCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printStartsWithCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printEndsWithCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printPadEndCall(node: any, identation: any, name: any, parsedArg: any, parsedArg2: any): string;
    printPadStartCall(node: any, identation: any, name: any, parsedArg: any, parsedArg2: any): string;
    printTrimCall(node: any, identation: any, name?: any): string;
    printToUpperCaseCall(node: any, identation: any, name?: any): string;
    printToLowerCaseCall(node: any, identation: any, name?: any): string;
    printJsonParseCall(node: any, identation: any, parsedArg?: any): string;
    printJsonStringifyCall(node: any, identation: any, parsedArg?: any): string;
    printReplaceCall(node: any, identation: any, name?: any, parsedArg?: any, parsedArg2?: any): string;
    printReplaceAllCall(node: any, identation: any, name?: any, parsedArg?: any, parsedArg2?: any): string;
    printElementAccessExpressionExceptionIfAny(node: any): string;
    printAssertCall(node: any, identation: any, parsedArgs: any): string;
    printDateNowCall(node: any, identation: any): string;
    printForStatement(node: any, identation: any): string;
    printPropertyAccessModifiers(node: any): string;
    transformLeadingComment(comment: any): string;
    transformTrailingComment(comment: any): string;
    transformPropertyAcessExpressionIfNeeded(node: any): any;
    printClassDefinition(node: any, identation: any): string;
    isFunctionOutSideClass(node: any): boolean;
    printMethodParameters(node: any): any;
    printInstanceOfExpression(node: any, identation: any): string;
    handleTypeOfInsideBinaryExpression(node: any, identation: any): string;
    printCustomBinaryExpressionIfAny(node: any, identation: any): string;
    printConditionalExpression(node: any, identation: any): string;
    printDeleteExpression(node: any, identation: any): string;
    getCustomOperatorIfAny(left: any, right: any, operator: any): "is" | "is not";
}

declare class PhpTranspiler extends BaseTranspiler {
    awaitWrapper: any;
    propRequiresScopeResolutionOperator: string[];
    AWAIT_WRAPPER_OPEN: any;
    AWAIT_WRAPPER_CLOSE: any;
    ASYNC_FUNCTION_WRAPPER_OPEN: string;
    constructor(config?: {});
    printAwaitExpression(node: any, identation: any): string;
    transformIdentifier(node: any, identifier: any): any;
    getCustomOperatorIfAny(left: any, right: any, operator: any): "." | ".=";
    printLengthProperty(node: any, identation: any, name?: any): string;
    printPopCall(node: any, identation: any, name?: any): string;
    printReverseCall(node: any, identation: any, name?: any): string;
    printShiftCall(node: any, identation: any, name?: any): string;
    printToLowerCaseCall(node: any, identation: any, name?: any): string;
    printToUpperCaseCall(node: any, identation: any, name?: any): string;
    printToStringCall(node: any, identation: any, name?: any): string;
    printArrayIsArrayCall(node: any, identation: any, parsedArg?: any): string;
    printObjectKeysCall(node: any, identation: any, parsedArg?: any): string;
    printObjectValuesCall(node: any, identation: any, parsedArg?: any): string;
    printJsonParseCall(node: any, identation: any, parsedArg?: any): string;
    printJsonStringifyCall(node: any, identation: any, parsedArg?: any): string;
    printArrayPushCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printPromiseAllCall(node: any, identation: any, parsedArg?: any): string;
    printMathCeilCall(node: any, identation: any, parsedArg?: any): string;
    printNumberIsIntegerCall(node: any, identation: any, parsedArg?: any): string;
    printMathRoundCall(node: any, identation: any, parsedArg?: any): string;
    printMathFloorCall(node: any, identation: any, parsedArg?: any): string;
    printReplaceCall(node: any, identation: any, name?: any, parsedArg?: any, parsedArg2?: any): string;
    printReplaceAllCall(node: any, identation: any, name?: any, parsedArg?: any, parsedArg2?: any): string;
    printIncludesCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printIndexOfCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printSearchCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printStartsWithCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printEndsWithCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printTrimCall(node: any, identation: any, name?: any): string;
    printJoinCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printSplitCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printConcatCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printPadEndCall(node: any, identation: any, name: any, parsedArg: any, parsedArg2: any): string;
    printPadStartCall(node: any, identation: any, name: any, parsedArg: any, parsedArg2: any): string;
    printDateNowCall(node: any, identation: any): string;
    printInstanceOfExpression(node: any, identation: any): string;
    printDeleteExpression(node: any, identation: any): string;
    printNewExpression(node: any, identation: any): string;
    getExceptionalAccessTokenIfAny(node: any): string;
    handleTypeOfInsideBinaryExpression(node: any, identation: any): string;
    printCustomBinaryExpressionIfAny(node: any, identation: any): string;
    printFunctionDeclaration(node: any, identation: any): string;
    printFunctionBody(node: any, identation: any): string;
    printPropertyAccessModifiers(node: any): any;
    transformLeadingComment(comment: any): string;
    initConfig(): void;
}

declare class CSharpTranspiler extends BaseTranspiler {
    binaryExpressionsWrappers: any;
    csharpBooleanReturnTypes: WeakMap<ts.Node, string>;
    csharpLocalTypes: WeakMap<ts.Node, string>;
    csharpGuardIndex: WeakMap<ts.Node, Map<string, any[]>>;
    csharpExpressionTypeResolver?: (node: any) => string | undefined;
    csharpTypedLocals: WeakMap<ts.Node, string>;
    constructor(config?: {});
    initConfig(): void;
    getBlockOpen(identation: any): string;
    printSuperCallInsideConstructor(node: any, identation: any): string;
    printIdentifier(node: any): string;
    printConstructorDeclaration(node: any, identation: any): string;
    printThisElementAccesssIfNeeded(node: any, identation: any): string;
    printDynamicCall(node: any, identation: any): string;
    printElementAccessExpressionExceptionIfAny(node: any): void;
    printElementAccessExpression(node: any, identation: any): any;
    csharpNativeElementAccess(node: any): string | undefined;
    csharpKeyPresenceGuarded(node: any, expression: any, key: any): boolean;
    csharpGuardAdmitsRead(guard: any, read: any): boolean;
    csharpInGuardsOf(func: any): Map<string, any[]>;
    csharpLiteralDeclaresKey(node: any, expression: any, key: any, isNumberKey: any): boolean;
    csharpObjectLiteralDeclaresKey(literal: any, key: any): boolean;
    csharpReceiverIsDictionaryLike(expression: any, key: any): boolean;
    csharpReceiverIsRewritten(func: any, expression: any): boolean;
    csharpHasKeyRemoval(func: any, expression: any, key: any): boolean;
    csharpGuardIsNegated(guard: any): boolean;
    csharpAlwaysExits(statement: any): boolean;
    csharpContains(outer: any, inner: any): boolean;
    printWrappedUnknownThisProperty(node: any): string;
    printOutOfOrderCallExpressionIfAny(node: any, identation: any): string;
    handleTypeOfInsideBinaryExpression(node: any, identation: any): string;
    csharpEqualityOperandType(node: any): string | undefined;
    csharpNumericLiteralKind(node: any): string | undefined;
    csharpDeclaredTypeOfBinding(node: any): string | undefined;
    csharpValueEqualityKind(csharpType: any): string | undefined;
    csharpIsNullComparableType(csharpType: any): boolean;
    csharpOperandIsValueTyped(node: any): boolean;
    csharpTypeHasValueScalar(type: any): boolean;
    printInlineEquality(left: any, right: any, leftText: string, rightText: string, isEquality: boolean): string | undefined;
    csharpNullComparison(text: string, isEquality: boolean): string;
    csharpExpressionTypeOf(node: any): string | undefined;
    csharpOperandsAreNumbers(node: any): boolean;
    csharpNativeNumericComparison(node: any, identation: any): string | undefined;
    csharpNativeReceiver(node: any): {
        text: string;
        type: string;
    } | undefined;
    csharpTypeIsNative(csharpType: string): boolean;
    csharpTypedLocalType(node: any): string | undefined;
    csharpNativeStringKey(key: any): string | undefined;
    csharpIsDictionaryType(type: any): boolean;
    csharpIsArrayType(type: any): boolean;
    csharpNativeInExpression(key: any, obj: any): string | undefined;
    csharpNativeLengthExpression(expression: any): string | undefined;
    printCustomBinaryExpressionIfAny(node: any, identation: any): string;
    csharpCallReturnType(initializer: any): string | undefined;
    csharpCalleeResolves(node: any): boolean;
    csharpTypeOfInitializer(initializer: any): string | undefined;
    csharpEnclosingFunction(node: any): any;
    csharpTypeNameIsShadowed(scope: any, csharpType: string): boolean;
    csharpLocalIsSafeToType(scope: any, declaration: any, varName: string, csharpType: string, safeAccessor?: boolean): boolean;
    getCSharpLocalType(declaration: any): string;
    csharpIsSafeAccessorCall(initializer: any): boolean;
    csharpTypeIsList(csharpType: string): boolean;
    csharpTypeIsStringType(csharpType: string): boolean;
    csharpIsClassThrowArgument(node: any): boolean;
    csharpIsDeleteKey(node: any): boolean;
    csharpIsLeftPlusOperand(node: any): boolean;
    printVariableDeclarationList(node: any, identation: any): string;
    transformPropertyAcessExpressionIfNeeded(node: any): any;
    printCustomDefaultValueIfNeeded(node: any): string;
    printFunctionBody(node: any, identation: any): string;
    printInstanceOfExpression(node: any, identation: any): string;
    printAsExpression(node: any, identation: any): string;
    printParameter(node: any, defaultValue?: boolean): string;
    printArrayLiteralExpression(node: any): string;
    csharpBooleanReturnType(node: any): string | undefined;
    printFunctionType(node: any): any;
    printReturnStatement(node: any, identation: any): string;
    printMethodDefinition(node: any, identation: any): string;
    printArgsForCallExpression(node: any, identation: any): any;
    printArrayIsArrayCall(node: any, identation: any, parsedArg?: any): string;
    printObjectKeysCall(node: any, identation: any, parsedArg?: any): string;
    printObjectValuesCall(node: any, identation: any, parsedArg?: any): string;
    printJsonParseCall(node: any, identation: any, parsedArg?: any): string;
    printJsonStringifyCall(node: any, identation: any, parsedArg?: any): string;
    printPromiseAllCall(node: any, identation: any, parsedArg?: any): string;
    printMathFloorCall(node: any, identation: any, parsedArg?: any): string;
    printMathRoundCall(node: any, identation: any, parsedArg?: any): string;
    printMathCeilCall(node: any, identation: any, parsedArg?: any): string;
    printNumberIsIntegerCall(node: any, identation: any, parsedArg?: any): string;
    printArrayPushCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printIncludesCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printIndexOfCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printSearchCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printStartsWithCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printEndsWithCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printTrimCall(node: any, identation: any, name?: any): string;
    printJoinCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printSplitCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printConcatCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printToFixedCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printToStringCall(node: any, identation: any, name?: any): string;
    printToUpperCaseCall(node: any, identation: any, name?: any): string;
    printToLowerCaseCall(node: any, identation: any, name?: any): string;
    printShiftCall(node: any, identation: any, name?: any): string;
    printReverseCall(node: any, identation: any, name?: any): string;
    printPopCall(node: any, identation: any, name?: any): string;
    printAssertCall(node: any, identation: any, parsedArgs: any): string;
    printSliceCall(node: any, identation: any, name?: any, parsedArg?: any, parsedArg2?: any): string;
    printReplaceCall(node: any, identation: any, name?: any, parsedArg?: any, parsedArg2?: any): string;
    printReplaceAllCall(node: any, identation: any, name?: any, parsedArg?: any, parsedArg2?: any): string;
    printPadEndCall(node: any, identation: any, name: any, parsedArg: any, parsedArg2: any): string;
    printPadStartCall(node: any, identation: any, name: any, parsedArg: any, parsedArg2: any): string;
    printDateNowCall(node: any, identation: any): string;
    printLengthProperty(node: any, identation: any, name?: any): string;
    printPostFixUnaryExpression(node: any, identation: any): string;
    printPrefixUnaryExpression(node: any, identation: any): any;
    csharpConditionPrintsBool(node: any): boolean;
    csharpBinaryExpressionPrintsBool(node: any): boolean;
    csharpIsCheckedBoolean(node: any): boolean;
    csharpIdentifierPrintsBool(node: any): boolean;
    csharpCallPrintsBool(node: any): boolean;
    printCondition(node: any, identation: any): any;
    csharpConditionParensIfNeeded(node: any, printed: string): string;
    printConditionalExpression(node: any, identation: any): string;
    printDeleteExpression(node: any, identation: any): string;
    printNewExpression(node: any, identation: any): string;
    printThrowStatement(node: any, identation: any): string;
    csModifiers: {};
    printPropertyAccessModifiers(node: any): string;
}

declare function alignGoTrailingComments(content: string): string;

declare class GoTranspiler extends BaseTranspiler {
    binaryExpressionsWrappers: any;
    wrapThisCalls: boolean;
    wrapCallMethods: string[];
    goLocalTypeResolution: Set<any>;
    asyncMethodSuffix: string;
    classNameMap: {
        [key: string]: string;
    };
    DEFAULT_RETURN_TYPE: string;
    ASYNC_BODY_SUFFIX: string;
    DEFAULT_IDENTATION: string;
    constructor(config?: {});
    initConfig(): void;
    printSuperCallInsideConstructor(node: any, identation: any): string;
    printStringLiteral(node: any): any;
    transformFunctionNameIfNeeded(name: any): string;
    getStructFieldCells(node: any): string[];
    printPropertyDeclaration(node: any, identation: any): string;
    printStruct(node: any, indentation: any): string;
    printNewStructMethod(node: any): string;
    printClass(node: any, identation: any): string;
    /**
     * gofmt's declaration-list rule (go/printer nodes.go `declList`): a top-level
     * declaration that carries a doc comment is separated from the previous declaration
     * by exactly one blank line (`min = 2` linebreaks), while a declaration without one
     * keeps the source's own separation (the printer emits members adjacent to the
     * closing brace above them). `printClass` used to join every member with a bare
     * "\n", so a method whose leading `/** ... *` + `/` comment follows the previous
     * method's closing brace came out as `}\n/**` and gofmt re-inserted the blank line.
     */
    joinTopLevelDecls(decls: string[]): string;
    /**
     * True when the emitted declaration text opens with its doc comment - the comment
     * group gofmt attaches to the declaration (`getDoc(d) != nil` in go/printer).
     */
    startsWithComment(decl: string): boolean;
    /**
     * Indent every non-blank line of `lines` by `identation` levels. gofmt trims trailing
     * whitespace, so an indented *blank* line (only the indentation of a blank source
     * line) must stay empty instead of becoming whitespace-only text.
     */
    indentLines(lines: string[], identation: number): string[];
    printPropertyAccessModifiers(node: any): string;
    printSpreadElement(node: any, identation: any): string;
    printMethodDeclaration(node: any, identation: any): string;
    printFunctionDeclaration(node: any, identation: any): string;
    /**
     * Name of the sibling *body* method/function an async core hands its work to.
     *
     * `FetchTicker` -> `fetchTickerBody`. Deliberately UNEXPORTED: the body is an
     * implementation detail of the trampoline, so it must not show up on the generated
     * interfaces (ICoreExchange) nor on the typed `*_wrapper.go` facades, and it stays
     * invisible to the reflection based `callInternal`/`callDynamically` dispatch.
     *
     * If that name is already taken by a real declaration (a hand written
     * `fetchTickerBody`), a numeric suffix is appended instead of silently clobbering it.
     */
    getAsyncBodyName(node: any, goName: string): string;
    /**
     * Parameter list of the body: the channel it must fill, then the original parameters
     * verbatim (including the `optionalArgs ...any` tail), so the trampoline can forward
     * its own arguments unchanged.
     */
    printAsyncBodyParameters(node: any): string;
    /**
     * Arguments the trampoline forwards to its body, matching printMethodParameters:
     * the declared parameters in order, plus the variadic `optionalArgs...` tail when
     * the function has any defaulted parameter.
     */
    printAsyncTrampolineArgs(node: any): string;
    /**
     * The trampoline: an async core hands back a *hot handle*.
     *
     *     func (this *Exchange) FetchTicker(symbol any) <-chan any {
     *         ch := make(chan any, 1)
     *         go this.fetchTickerBody(ch, symbol)
     *         return ch
     *     }
     *
     *   - `ch` is buffered (cap 1): the body's single `ch <- value` never blocks, so a
     *     result nobody ever receives still lets the goroutine finish and run
     *     `defer close(ch)` (no leak for abandoned calls).
     *   - the body runs on its own goroutine, so the call expression returns immediately
     *     with work already in flight. That is what makes
     *     `const a = this.fetchA (); const b = this.fetchB (); await Promise.all([a,b])`
     *     overlap, exactly like the C#/Java ports, with no call-site wrapper.
     *   - the result stays UNNAMED (`<-chan any`): `return ch` is the trampoline's only
     *     statement and it always runs, because the recover (`defer ReturnPanicError(ch)`)
     *     lives on the body, not here.
     */
    printAsyncTrampolineBlock(node: any, identation: any, callee: string): string;
    /**
     * Go name of an async (channel returning) declaration: `fetchTicker` -> `FetchTickerAsync`.
     * Empty `asyncMethodSuffix` (the default) keeps the plain name, so the suffix is opt-in.
     */
    printAsyncDeclarationName(node: any, goName: string): string;
    /**
     * Resolve the declaration a call/property access refers to and append `asyncMethodSuffix`
     * when it is an async function. Uses the checker, so `this.x()`, `super.x()`, `obj.x()` and
     * bare `x()` all agree with the declaration site. Unresolvable or non-function symbols
     * (properties, `any` receivers, JS builtins) keep the plain name.
     */
    applyAsyncSuffixToCallee(nameNode: any, goName: string): string;
    printMethodDefinition(node: any, identation: any): string;
    printFunctionDefinition(node: any, identation: any): string;
    printMethodParameters(node: any): any;
    printParameter(node: any, defaultValue?: boolean): string;
    printParameterType(node: any): any;
    printFunctionType(node: any): any;
    isWholePrintedCall(value: string, open: number): boolean;
    goTypeOfInitializer(initializer: any, printedValue: string): string | undefined;
    goUnwrapPrintedParens(printedText: string): string;
    goLocalStaticType(node: any): string | undefined;
    goStringFieldStaticType(node: any, printedText: string): string | undefined;
    goOperandStaticType(node: any, printedText: string): string | undefined;
    goStringCallStaticType(node: any, printedText: string): string | undefined;
    isNonZeroIntegerLiteral(node: any): boolean;
    goNativeIntResultType(op: any, leftType: string, rightType: string, rightNode: any): string | undefined;
    goNativeOperandText(node: any, printedText: string): string;
    goNativeArithmetic(node: any, leftText?: any, rightText?: any): {
        goType: string;
        text: string;
    } | undefined;
    goNativeBinaryText(node: any, symbol: string, leftText: string, rightText: string): string;
    goNativeCompoundAssignment(op: any, leftNode: any, leftText: string, rightNode: any, rightText: string): string | undefined;
    goEnclosingFunction(node: any): any;
    goTypeNameIsShadowed(scope: any, goType: string): boolean;
    goLocalIsSafeToType(scope: any, declaration: any, varName: string, goType: string): boolean;
    getGoLocalType(declaration: any, parsedValue: string): string;
    printVariableDeclarationList(node: any, identation: any): string;
    printObjectLiteralBody(node: any, identation: any): any;
    alignGoCompositeEntries(entries: any): any;
    parseGoCompositeEntry(entry: any): {
        indent: string;
        key: string;
        size: number;
        singleLine: boolean;
        value: any;
        comment: any;
    };
    findGoTrailingCommentStart(line: any): number;
    getGoCompositePaddings(parsedEntries: any): any;
    renderGoCompositeEntry(entry: any, parsed: any, padding: any): string;
    appendGoTrailingComma(entry: any): string;
    getGoRuneLength(text: any): number;
    getGoByteLength(text: any): number;
    printConstructorDeclaration(node: any, identation: any): string;
    printThisElementAccesssIfNeeded(node: any, identation: any): string;
    printDynamicCall(node: any, identation: any): string;
    printElementAccessExpressionExceptionIfAny(node: any): string;
    printWrappedUnknownThisProperty(node: any, identation?: number): string;
    transformMethodNameIfNeeded(name: string): string;
    transformCallExpressionName(name: string, nameNode?: any): string;
    transformPropertyAccessExpressionName(name: string, nameNode?: any): string;
    printOutOfOrderCallExpressionIfAny(node: any, identation: any): string;
    handleTypeOfInsideBinaryExpression(node: any, identation: any): string;
    printCustomBinaryExpressionIfAny(node: any, identation: any): string;
    goScalarFamily(node: any): string | undefined;
    goScalarFamilyWithNil(node: any): string | undefined;
    goPrintedCallee(printedValue: string): string | undefined;
    goIsAnyBoxExpression(node: any, printedText: string): boolean;
    goAnyLocalHoldsPointerCache: Map<any, boolean>;
    goAnyLocalHoldsPointer(decl: any): boolean;
    goScalarFamilyOfType(type: any, allowNil?: boolean): string | undefined;
    goDeclaredTypeCache: Map<any, string>;
    goDeclaredTypeInProgress: Set<any>;
    goDeclaredTypeOfIdentifier(node: any): string | undefined;
    goIsPointerIdentifier(node: any): boolean;
    goPointerTypeOfExpression(node: any, printedText: string): string | undefined;
    goElementAssignmentContainerType(node: any, printedText: string): string | undefined;
    goIsStringKeyExpression(node: any): boolean;
    goSliceIndexProvablyInRange(node: any, indexNode: any): boolean;
    goLocalIsRebound(scope: any, nameNode: any): boolean;
    goRebindingTargetOf(identifier: any): any;
    printNativeElementAssignment(containerNode: any, containerStr: string, keyNode: any, keyStr: string, valueStr: string): string | undefined;
    goPrintedTypeOfExpression(node: any, printedText: string): string | undefined;
    sliceLengthTypes: string[];
    printInlineArrayLength(expression: any, printedText: string): string | undefined;
    printInlineTernary(condition: string, whenTrue: string, whenFalse: string, resultType?: string): string | undefined;
    goTernaryArmType(node: any, printedText: string): string | undefined;
    goTernaryResultType(whenTrueNode: any, whenTrue: string, whenFalseNode: any, whenFalse: string): string | undefined;
    goStripControlClauseParens(text: string): string;
    goPrintTernaryBranch(node: any, levels: number): string;
    printInlineInOp(dictNode: any, keyNode: any, dictText: string, keyText: string): string | undefined;
    comparisonHelpers: string[];
    printInlineOpNeg(node: any, printedText: string): string | undefined;
    printInlineTruthy(node: any): string | undefined;
    goNativeCondition(node: any): string | undefined;
    goControlClauseParens(node: any, expression: string): string;
    goEnclosedExpression(text: string): string | undefined;
    goIsControlClauseCondition(node: any): boolean;
    goHasTypeNameCompositeLiteral(text: string): boolean;
    goCompositeLitHasTypeName(text: string, braceIndex: number): boolean;
    goSkipBalanced(text: string, start: number, open: string, close: string): number;
    goSkipQuoted(text: string, start: number): number;
    printLeadingComments(node: any, identation: any): string;
    goStatementLevel: number;
    printSourceFileStatements(node: any, identation: any): string;
    printNode(node: any, identation?: number): string;
    printObjectLiteralExpression(node: any, identation: any): string;
    printCondition(node: any, identation: any): any;
    goDerefComparableWith(ptrNode: any, ptrText: string, otherNode: any): boolean;
    printInlineEquality(left: any, right: any, leftText: string, rightText: string, isEq: boolean): string | undefined;
    goOperandNumericKind(node: any, printedText: string): string | undefined;
    goLiteralTypedLocalKind(node: any): string | undefined;
    goNumericLiteralKind(node: any): string | undefined;
    goLiteralFitsKind(node: any, kind: string): boolean;
    goComparisonKind(left: any, leftKind: string, right: any, rightKind: string): string | undefined;
    printInlineOrderedComparison(left: any, right: any, leftText: string, rightText: string, op: any): string | undefined;
    printParenthesizedExpression(node: any, identation: any): string;
    goIsParenthesizedExpression(printed: string): boolean;
    goSkipGoLiteral(text: string, start: number): number;
    transformPropertyAcessExpressionIfNeeded(node: any): any;
    printCustomDefaultValueIfNeeded(node: any): any;
    printFunctionBody(node: any, identation: any, wrapInChannel?: boolean): string;
    printAwaitExpression(node: any, identation: any): string;
    printInstanceOfExpression(node: BinaryExpression, identation: number): string;
    getRandomNameSuffix(): string;
    getLineBasedSuffix(node: any): string;
    printExpressionStatement(node: any, identation: any): string;
    isInsideAsyncFunction(returnStatementNode: any): any;
    /**
     * Statement that terminates an async (channel returning) function body.
     *
     * The body is the trampoline's sibling method (`go this.fetchTickerBody(ch, ...)`),
     * and the synthetic try/catch closures nest inside it: in both cases `return` leaves
     * a function whose result is a plain `any`, never the channel. The trampoline itself
     * owns the single `return ch`, emitted by printFunctionBody.
     */
    getAsyncReturnStatement(node: any): string;
    printReturnStatement(node: any, identation: any): string;
    printAsExpression(node: any, identation: any): string;
    printArrayLiteralExpression(node: any, identation?: number): string;
    printArgsForCallExpression(node: any, identation: any): any;
    printArrayIsArrayCall(node: any, identation: any, parsedArg?: any): string;
    printObjectKeysCall(node: any, identation: any, parsedArg?: any): string;
    printObjectValuesCall(node: any, identation: any, parsedArg?: any): string;
    printJsonParseCall(node: any, identation: any, parsedArg?: any): string;
    printJsonStringifyCall(node: any, identation: any, parsedArg?: any): string;
    printPromiseAllCall(node: any, identation: any, parsedArg?: any): string;
    printMathFloorCall(node: any, identation: any, parsedArg?: any): string;
    printMathRoundCall(node: any, identation: any, parsedArg?: any): string;
    printMathCeilCall(node: any, identation: any, parsedArg?: any): string;
    printNumberIsIntegerCall(node: any, identation: any, parsedArg?: any): string;
    goPrintCallArgument(argument: any, printedText: string | undefined): string | undefined;
    printArrayPushCall(node: CallExpression, identation: number, name?: string | undefined, parsedArg?: string | undefined): string;
    printIncludesCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printIndexOfCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printStartsWithCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printEndsWithCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printTrimCall(node: any, identation: any, name?: any): string;
    printJoinCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printSplitCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printToFixedCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printToStringCall(node: any, identation: any, name?: any): string;
    printConcatCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printToUpperCaseCall(node: any, identation: any, name?: any): string;
    printToLowerCaseCall(node: any, identation: any, name?: any): string;
    printShiftCall(node: any, identation: any, name?: any): string;
    printReverseCall(node: any, identation: any, name?: any): string;
    printPopCall(node: any, identation: any, name?: any): string;
    printAssertCall(node: any, identation: any, parsedArgs: any): string;
    printSliceCall(node: any, identation: any, name?: any, parsedArg?: any, parsedArg2?: any): string;
    printReplaceCall(node: any, identation: any, name?: any, parsedArg?: any, parsedArg2?: any): string;
    printReplaceAllCall(node: any, identation: any, name?: any, parsedArg?: any, parsedArg2?: any): string;
    printPadEndCall(node: any, identation: any, name: any, parsedArg: any, parsedArg2: any): string;
    printPadStartCall(node: any, identation: any, name: any, parsedArg: any, parsedArg2: any): string;
    printDateNowCall(node: any, identation: any): string;
    printLengthProperty(node: any, identation: any, name?: any): string;
    printConditionalExpression(node: any, identation: any): string;
    printDeleteExpression(node: any, identation: any): string;
    printThrowStatement(node: any, identation: any): string;
    goExprDepth: number;
    goWithExprDepth<T>(depth: number, callback: () => T): T;
    goOperatorPrecedence(operator: string): number;
    goNativeBinaryOperator(node: any): string | undefined;
    goWalkBinary(operator: string, left: any, right: any, rightText: string): {
        has4: boolean;
        has5: boolean;
        maxProblem: number;
    };
    goBinarySeparator(operator: string, rightText: string, left: any, right: any): string;
    printBinaryExpression(node: any, identation: any): string;
    goDropRedundantNilGuard(leftVar: string, rightVar: string): string | undefined;
    printTryStatement(node: any, identation: number): string;
    /**
     * Strip the printer's own leading indentation from every line of a printed
     * statement block so the caller can re-place it at an explicit level. Only the
     * common prefix goes away: relative nesting (one tab per level) is preserved.
     */
    dedentBlock(block: string): string;
    /**
     * Re-place a printed statement block at `level` (a run of tabs): the block's own
     * leading indentation is dropped and every non-blank line is prefixed with `level`,
     * so relative nesting (one tab per level) survives the move.
     */
    indentBlock(block: string, level: string): string;
    /**
     * gofmt writes blank lines with no whitespace at all. A multi-line statement template
     * opens on a fresh line, so the inherited `getIden(identation) + <statement>` prefix
     * lands on a line that carries nothing else: drop that prefix instead of leaving a
     * whitespace-only line behind. Only blank lines are touched, never printed content.
     */
    stripWhitespaceOnlyLines(block: string): string;
    printPrefixUnaryExpression(node: any, identation: any): string;
    printNewExpression(node: any, identation: any): string;
    /**
     * Override the default element-access printer with a version that walks the
     * entire `x[y][z]` chain and builds a properly nested sequence of helper
     * calls.  This removes the root cause of the unbalanced-parenthesis bug
     * without any post-processing or regex hacks.
     */
    goIndexableTypeOf(node: any, printed: string): string | undefined;
    goElementAccessChain(containerStr: string, keyStrs: string[]): string;
    goKeyIsString(node: any, printed: string): boolean;
    isGoThisPropertyAccessExpression(node: any): boolean;
    isGoElementAccessAssignmentTarget(node: any): boolean;
    printElementAccessExpression(node: any, identation: any): string;
    isInsideVoidFunction(node: ts.Node): boolean;
    /**
     * Check if a block or statement contains a return statement or throws an error
     */
    hasReturnInBlock(statement: ts.Statement): boolean;
    /**
     * Check if the last statement in a block is a conditional with returns in all branches
     */
    blockEndsWithConditionalReturn(statements: ts.NodeArray<ts.Statement>): boolean;
}

declare class JavaTranspiler extends BaseTranspiler {
    countRequiredParameters(declaration: any): number;
    printArgsForCallExpression(node: any, identation: any): string;
    binaryExpressionsWrappers: any;
    varListFromObjectLiterals: {};
    javaBooleanOperators: ts.SyntaxKind[];
    usageToFinalName: WeakMap<ts.Node, string>;
    finalVarScopeStack: Array<Set<string>>;
    finalVarMutations: Array<{
        node: any;
        escapedText: any;
        ownGetFullText: boolean;
        getFullText: any;
    }>;
    asyncExecutor: string;
    asyncSupplier: string;
    constructor(config?: {});
    initConfig(): void;
    getBlockOpen(identation: any): string;
    getCustomClassName(node: any): string;
    getClassModifier(node: any): string;
    printSuperCallInsideConstructor(_node: any, _identation: any): string;
    printNumericLiteral(node: any): any;
    printIdentifier(node: any): string;
    printConstructorDeclaration(node: any, identation: any): string;
    injectLeadingInBody(body: any, firstLine: any): any;
    printDynamicCall(node: any, identation: any): string;
    getExpressionStatementPrefixesIfAny(node: any, identation: any): string;
    printWrappedUnknownThisProperty(node: any): string;
    printOutOfOrderCallExpressionIfAny(node: any, identation: any): string;
    handleTypeOfInsideBinaryExpression(node: any, _identation: any): string;
    getVarMethodIfAny(node: any): string;
    getVarClassIfAny(node: any): string;
    getVarKey(node: any): string;
    equalityOperandFamily(type: any): string | undefined;
    isNullishLiteral(node: any): boolean;
    printNativeEqualityIfProvable(node: any, leftText: string, rightText: string): string | undefined;
    elementWriteTargetsMap(container: any, base: any, keys: any): boolean;
    isDictionaryType(node: any): boolean;
    isDictionaryTsType(type: any, checker: any, depth: number): boolean;
    javaIntegerLiteralKind(node: any): "int" | "long";
    isVarargsArrayReference(node: any, depth?: number): any;
    isJavaListType(type: any): boolean;
    javaLengthKind(expression: any): "List" | "String";
    printJavaLength(expression: any, leftSide: any): string;
    isJavaPrimitiveForCounter(node: any): boolean;
    javaPrimitiveOperandKind(node: any): "int" | "long";
    isJavaMapType(type: any): boolean;
    isJavaStringType(type: any): any;
    printCustomBinaryExpressionIfAny(node: any, identation: any): string;
    isJavaMapStructureType(type: any): boolean;
    isJavaListStructureType(type: any): boolean;
    tupleRequiredElementCount(type: any): number;
    isLeftSideOfAssignment(node: any): boolean;
    printCheckerTypedElementAccessRead(node: any): string;
    printElementAccessExpression(node: any, identation: any): any;
    javaScalarFamily(node: any): string | undefined;
    javaProvableString(node: any): boolean;
    javaNativeConcat(node: any): boolean;
    javaProvableNumericKind(node: any): string | undefined;
    javaNativeArithmeticKind(node: any): string | undefined;
    javaPrintOperandAsLong(node: any, text: any): any;
    printInlineHelperArithmetic(left: any, right: any, leftText: any, rightText: any, op: any): string;
    getObjectLiteralFromCallExpressionArguments(node: any): any[];
    collectCapturingObjectLiterals(node: any): any[];
    getBinaryExpressionPrefixes(node: any, identation: any): string;
    getFinalVarName(varName: string): string;
    getOriginalVarName(name: string): string;
    private getAsyncParamWrapperNames;
    private isAssignmentOperator;
    private isIncDecOperator;
    analyzeFinalVars(fnBody: ts.Node): void;
    private finalNameInAncestorScope;
    buildFinalVarDeclarations(pairs: Array<{
        orig: string;
        final: string;
    }>, identation: number): string;
    getObjectLiteralId(node: any): string;
    recordFinalVarMutation(node: any): void;
    restoreFinalVarMutations(): void;
    printNode(node: any, identation?: number): string;
    createNewNodeForFinalVar(originalName: string): ts.Identifier;
    getVarListFromObjectLiteralAndUpdateInPlace(node: any): Array<{
        orig: string;
        final: string;
    }>;
    printVariableDeclarationList(node: any, identation: any): string;
    printThisKeyword(node: any, identation: any): string;
    transformPropertyAcessExpressionIfNeeded(node: any): any;
    printCustomDefaultValueIfNeeded(node: any): string;
    printOptionalArgInit(paramName: any, index: any, initializer: any): string;
    isPureInitializer(node: any): any;
    printFunctionBody(node: any, identation: any): string;
    printBlock(node: any, identation: any, chainBlock?: boolean): string;
    printInstanceOfExpression(node: any, identation: any): string;
    printAwaitExpression(node: any, identation: any): string;
    printAsExpression(node: any, identation: any): string;
    printParameter(node: any, defaultValue?: boolean): string;
    printMethodParameters(node: any): any;
    printArrayLiteralExpression(node: any): string;
    printFinalOutsideMethodVariableWrappersIfAny(node: any, identation: any): string;
    printInsideMethodVariableWrappersIfAny(node: any, identation: any): string;
    printMethodDeclaration(node: any, identation: any): string;
    printMethodDefinition(node: any, identation: any): string;
    printArrayIsArrayCall(_node: any, _identation: any, parsedArg?: any): string;
    printObjectKeysCall(_node: any, _identation: any, parsedArg?: any): string;
    printObjectValuesCall(_node: any, _identation: any, parsedArg?: any): string;
    printJsonParseCall(_node: any, _identation: any, parsedArg?: any): string;
    printJsonStringifyCall(_node: any, _identation: any, parsedArg?: any): string;
    printPromiseAllCall(_node: any, _identation: any, parsedArg?: any): string;
    printMathFloorCall(_node: any, _identation: any, parsedArg?: any): string;
    printMathRoundCall(_node: any, _identation: any, parsedArg?: any): string;
    printMathCeilCall(_node: any, _identation: any, parsedArg?: any): string;
    printNumberIsIntegerCall(_node: any, _identation: any, parsedArg?: any): string;
    printArrayPushCall(_node: any, _identation: any, name?: any, parsedArg?: any): string;
    printIncludesCall(_node: any, _identation: any, name?: any, parsedArg?: any): string;
    printIndexOfCall(_node: any, _identation: any, name?: any, parsedArg?: any): string;
    printSearchCall(_node: any, _identation: any, name?: any, parsedArg?: any): string;
    printStartsWithCall(_node: any, _identation: any, name?: any, parsedArg?: any): string;
    printEndsWithCall(_node: any, _identation: any, name?: any, parsedArg?: any): string;
    printTrimCall(_node: any, _identation: any, name?: any): string;
    printJoinCall(_node: any, _identation: any, name?: any, parsedArg?: any): string;
    printSplitCall(_node: any, _identation: any, name?: any, parsedArg?: any): string;
    printConcatCall(_node: any, _identation: any, name?: any, parsedArg?: any): string;
    printToFixedCall(_node: any, _identation: any, name?: any, parsedArg?: any): string;
    printToStringCall(_node: any, _identation: any, name?: any): string;
    printToUpperCaseCall(_node: any, _identation: any, name?: any): string;
    printToLowerCaseCall(_node: any, _identation: any, name?: any): string;
    printShiftCall(_node: any, _identation: any, name?: any): string;
    printReverseCall(_node: any, _identation: any, name?: any): string;
    printPopCall(_node: any, _identation: any, name?: any): string;
    printAssertCall(_node: any, _identation: any, parsedArgs: any): string;
    printSliceCall(_node: any, _identation: any, name?: any, parsedArg?: any, parsedArg2?: any): string;
    printReplaceCall(_node: any, _identation: any, name?: any, parsedArg?: any, parsedArg2?: any): string;
    printReplaceAllCall(node: any, identation: any, name?: any, parsedArg?: any, parsedArg2?: any): string;
    stringLiteralArgument(argument: any): string;
    sideEffectFreeReceiver(expression: any): any;
    printPadEndCall(_node: any, _identation: any, name: any, parsedArg: any, parsedArg2: any): string;
    printPadStartCall(_node: any, _identation: any, name: any, parsedArg: any, parsedArg2: any): string;
    printDateNowCall(_node: any, _identation: any): string;
    printLengthProperty(node: any, _identation: any, _name?: any): string;
    printPostFixUnaryExpression(node: any, identation: any): string;
    printPrefixUnaryExpression(node: any, identation: any): any;
    javaBooleanCondition(node: any): any;
    javaConditionPrintsBoolean(node: any): boolean;
    printCondition(node: any, identation: any): any;
    printConditionalExpression(node: any, _identation: any): string;
    printDeleteExpression(node: any, _identation: any): string;
    printThrowStatement(node: any, identation: any): string;
    csModifiers: {};
    printPropertyAccessModifiers(node: any): string;
    printModifiers(node: any): any;
    printObjectLiteralExpression(node: any, identation: any): string;
    printObjectLiteralBody(node: any, identation: any): any;
    printForStatement(node: any, identation: any): string;
    printReturnStatement(node: any, identation: any): string;
    private allBranchesTerminate;
}

declare class RustTranspiler extends BaseTranspiler {
    binaryExpressionsWrappers: any;
    methodSignatures: Record<string, {
        requiredCount: number;
    }>;
    forLoopCounter: number;
    constructor(config?: {});
    initConfig(): void;
    capitalize(str: string): string;
    quotedStringLiteral(text: string): string;
    printStringLiteral(node: any): any;
    printNumericLiteral(node: any): string;
    printBooleanLiteral(node: any): "Value::Bool(true)" | "Value::Bool(false)";
    printNullKeyword(node: any, identation: any): string;
    private static readonly BOOL_PRODUCING_OPERATORS;
    private static readonly BOOL_PRODUCING_CALLS;
    private static readonly PAYLOAD_ACCESSORS;
    primitiveKindOfType(type: any): string;
    literalKindOfNode(node: any): string;
    printsValueExpression(node: any): boolean;
    callExpressionName(node: any): string;
    stringLiteralCoercesToNumber(node: any): boolean;
    numericLiteralF64Text(node: any): string;
    printNativeEqualityComparison(left: any, right: any, op: any): string;
    typeOfNodeIfAny(node: ts.Node): ts.Type | undefined;
    isValueLengthType(type: ts.Type | undefined): boolean;
    printArrayLength(node: any, identation: any, leftExpr?: any): string;
    isDictShapedType(type: ts.Type | undefined): boolean;
    printNativeInOperator(key: any, obj: any): string;
    foldNegateLiteral(operandText: string): string | undefined;
    ensureRef(expr: string): string;
    isNumberTyped(node: any): boolean;
    isBooleanPosition(node: any): boolean;
    printNativeNumericComparison(node: any, operator: any, leftText: any, rightText: any): string;
    isNumberLikeType(type: any): boolean;
    isStringLikeType(type: any): boolean;
    printNativeAssignmentArithmetic(op: any, left: any, right: any, leftText: any, rightText: any): string | undefined;
    printNativeArithmetic(op: any, left: any, right: any, leftText: any, rightText: any): string | undefined;
    printNativeStringConcat(leftText: string, rightText: string): string;
    printNativeNumeric(op: any, leftText: string, rightText: string): string;
    printCustomBinaryExpressionIfAny(node: any, identation: any): string;
    printBinaryExpression(node: any, identation: any): any;
    printDateNowCall(node: any, identation: any): string;
    printPadStartCall(node: any, identation: any, name: any, parsedArg: any, parsedArg2: any): string;
    printPadEndCall(node: any, identation: any, name: any, parsedArg: any, parsedArg2: any): string;
    printVariableDeclarationList(node: any, identation: any): string;
    private static readonly RUST_BOOL_RESULT_HELPERS;
    peelValueBoolBox(printedValue: string): string | undefined;
    stripOuterParens(printedValue: string): string;
    printedBoolHelperCall(printedValue: string): boolean;
    rustNodeIsBoolExpression(node: any): boolean;
    rustTypeIsBoolean(node: any): boolean;
    rustEnclosingFunction(node: any): any;
    rustBindsName(node: any, name: string): boolean;
    rustIdentifierUseIsCondition(node: any): boolean;
    rustLocalUsesAcceptBool(declaration: any, sourceName: string): boolean;
    getRustBoolLocalInitializer(declaration: any, printedValue: string): string | undefined;
    printPropertyDeclaration(node: any, identation: any): string;
    getStructFields(node: any): Array<{
        name: string;
        init: string;
    }>;
    printStruct(node: any, identation: any): string;
    printNewMethod(node: any, identation: any): string;
    printClass(node: any, identation: any): string;
    printMethodDefinition(node: any, identation: any): string;
    printRustFunctionType(node: any): string;
    printMethodDeclaration(node: any, identation: any): string;
    printFunctionDefinition(node: any, identation: any): string;
    printFunctionDeclaration(node: any, identation: any): string;
    printOutOfOrderCallExpressionIfAny(node: any, identation: any): string;
    printCallExpression(node: any, identation: any): any;
    printThisKeyword(node: any, identation: any): string;
    printNewExpression(node: any, identation: any): any;
    printPropertyAccessExpression(node: any, identation: any): any;
    /** Methods whose Rust counterpart takes `&mut self`: a `self.<field>` read in
     *  their args must keep the `get_value(...)` shape the ccxt post-pass hoists. */
    static readonly MUT_SELF_METHODS: Set<string>;
    toSnakeCaseName(name: string): string;
    escapeRustStringLiteral(text: string): string;
    getCheckedTypeOf(node: any): ts.Type | undefined;
    typeSymbolOf(type: ts.Type): ts.Symbol | undefined;
    /** Types declared outside ts/src (Date, Response, Array, Promise, …) are never
     *  backed by a plain `Value` map in the rust port. */
    isLibDeclaredType(type: ts.Type): boolean;
    isClassInstanceType(type: ts.Type): boolean;
    hasCallableShape(type: ts.Type): boolean;
    isProvenListType(type: ts.Type): boolean;
    /** True only for object types the rust port represents as `Value::Dict`
     *  (plain interfaces / index-signature / literal types — never classes). */
    isProvenMapType(type: ts.Type): boolean;
    isProvenMapExpression(node: ts.Node): boolean;
    isProvenListExpression(node: ts.Node): boolean;
    /** Native list-index read of a generator temp (`__destr_tmp.as_array()…`). */
    printNativeListIndex(receiverText: string, index: number): string;
    /** Native read for one chain level, or undefined to keep `get_value`. */
    printNativeContainerAccess(receiverText: string, receiverNode: ts.Node, keyNode: ts.Node): string | undefined;
    printNativeMapAccess(receiverText: string, receiverNode: ts.Node, keyText: string): string | undefined;
    isNodeInsideNode(node: ts.Node, container: ts.Node): boolean;
    /** Root place of an access chain (`x` for `x['a']['b']`, `this.balance` for
     *  `this.balance['usdt']`), or undefined for a temporary. */
    rootPlaceText(node: ts.Node): string | undefined;
    /** The ccxt post-passes hoist `get_value(...)` reads out of `&mut` calls by
     *  matching their text; the native form is invisible to them, so it is only
     *  emitted where no such hoist is needed. */
    isNativeAccessPositionSafe(node: ts.Node): boolean;
    /** Receiver shapes whose printed text is a single `Value` place (`x`, `this.x`). */
    isShallowValueReceiver(node: ts.Node): boolean;
    transformPropertyAcessExpressionIfNeeded(node: any): string;
    staticKeyLookup(node: any, container: any): string | undefined;
    printElementAccessExpression(node: any, identation: any): any;
    printForStatement(node: any, identation: any): string;
    private static readonly COMPARISON_OPS;
    private static readonly NATIVE_COMPARISON_OPERATORS;
    printCondition(node: any, identation: any): any;
    printComparisonInBooleanContext(node: any, identation: any): string;
    nativeEqualityText(node: any): string;
    unwrapParens(node: any): any;
    hasNativeComparisonOperand(node: any): any;
    printLogicalInBooleanContext(node: any): string;
    printWhileStatement(node: any, identation: any): string;
    printIfStatement(node: any, identation: any): string;
    printPostFixUnaryExpression(node: any, identation: any): string;
    printNativeIncrement(op: any, operand: any, operandText: string): string | undefined;
    printPrefixUnaryExpression(node: any, identation: any): any;
    printObjectLiteralExpression(node: any, identation: any): string;
    printArrayLiteralExpression(node: any, identation: any): string;
    printDeleteExpression(node: any, identation: any): string;
    printInstanceOfExpression(node: any, identation: any): string;
    printConditionalExpression(node: any, identation: any): string;
    private static readonly BOOL_VALUE_PREFIXES;
    private static isBoolValueExpression;
    printTernaryArm(node: any, identation?: number): string;
    printArrayIsArrayCall(node: any, identation: any, parsedArg?: any): string;
    printObjectKeysCall(node: any, identation: any, parsedArg?: any): string;
    printObjectValuesCall(node: any, identation: any, parsedArg?: any): string;
    printJsonParseCall(node: any, identation: any, parsedArg?: any): string;
    printJsonStringifyCall(node: any, identation: any, parsedArg?: any): string;
    printMathFloorCall(node: any, identation: any, parsedArg?: any): string;
    printPromiseAllCall(node: any, identation: any, parsedArg?: any): string;
    printAwaitExpression(node: any, identation: any): string;
    printMathRoundCall(node: any, identation: any, parsedArg?: any): string;
    printMathCeilCall(node: any, identation: any, parsedArg?: any): string;
    printNumberIsIntegerCall(node: any, identation: any, parsedArg?: any): string;
    printArrayPushCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printIncludesCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printIndexOfCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printStartsWithCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printEndsWithCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printTrimCall(node: any, identation: any, name?: any): string;
    printJoinCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printSplitCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printConcatCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printToFixedCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printToStringCall(node: any, identation: any, name?: any): string;
    printToUpperCaseCall(node: any, identation: any, name?: any): string;
    printToLowerCaseCall(node: any, identation: any, name?: any): string;
    printShiftCall(node: any, identation: any, name?: any): string;
    printReverseCall(node: any, identation: any, name?: any): string;
    printPopCall(node: any, identation: any, name?: any): string;
    printSliceCall(node: any, identation: any, name?: any, parsedArg?: any, parsedArg2?: any): string;
    printReplaceCall(node: any, identation: any, name?: any, parsedArg?: any, parsedArg2?: any): string;
    printReplaceAllCall(node: any, identation: any, name?: any, parsedArg?: any, parsedArg2?: any): string;
    printThrowStatement(node: any, identation: any): string;
    printTryStatement(node: any, identation: any): string;
    printReturnStatement(node: any, identation: any): string;
    printBreakStatement(node: any, identation: any): string;
    printContinueStatement(node: any, identation: any): string;
    printConstructorDeclaration(node: any, identation: any): string;
    printSpreadElement(node: any, identation: any): string;
}

declare class CppTranspiler extends BaseTranspiler {
    binaryExpressionsWrappers: any;
    constructor(config?: {});
    initConfig(): void;
    getBlockOpen(identation: any): string;
    printSuperCallInsideConstructor(node: any, identation: any): string;
    printStringLiteral(node: any): string;
    printClass(node: any, identation: any): string;
    printClassDefinition(node: any, identation: any): string;
    printConstructorDeclaration(node: any, identation: any): string;
    printThisElementAccesssIfNeeded(node: any, identation: any): any;
    printDynamicCall(node: any, identation: any): any;
    printAwaitExpression(node: any, identation: any): string;
    printReturnStatement(node: any, identation: any): string;
    printFunctionBody(node: any, identation: any): string;
    printWrappedUnknownThisProperty(node: any): any;
    printOutOfOrderCallExpressionIfAny(node: any, identation: any): string;
    handleTypeOfInsideBinaryExpression(node: any, identation: any): string;
    printCustomBinaryExpressionIfAny(node: any, identation: any): string;
    printVariableDeclarationList(node: any, identation: any): string;
    printFunctionDefinition(node: any, identation: any): string;
    printInstanceOfExpression(node: any, identation: any): string;
    printAsExpression(node: any, identation: any): string;
    printParameter(node: any, defaultValue?: boolean): string;
    printFunctionType(node: any): string;
    printMethodDefinition(node: any, identation: any): string;
    printPropertyDeclaration(node: any, identation: any): string;
    printArrayLiteralExpression(node: any): string;
    printArrayIsArrayCall(node: any, identation: any, parsedArg?: any): string;
    printObjectKeysCall(node: any, identation: any, parsedArg?: any): string;
    printObjectValuesCall(node: any, identation: any, parsedArg?: any): string;
    printJsonParseCall(node: any, identation: any, parsedArg?: any): string;
    printJsonStringifyCall(node: any, identation: any, parsedArg?: any): string;
    printPromiseAllCall(node: any, identation: any, parsedArg?: any): string;
    printMathFloorCall(node: any, identation: any, parsedArg?: any): string;
    printMathRoundCall(node: any, identation: any, parsedArg?: any): string;
    printMathCeilCall(node: any, identation: any, parsedArg?: any): string;
    printNumberIsIntegerCall(node: any, identation: any, parsedArg?: any): string;
    printArrayPushCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printIncludesCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printIndexOfCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printStartsWithCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printEndsWithCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printTrimCall(node: any, identation: any, name?: any): string;
    printJoinCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printSplitCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printConcatCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printToFixedCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printToStringCall(node: any, identation: any, name?: any): string;
    printToUpperCaseCall(node: any, identation: any, name?: any): string;
    printToLowerCaseCall(node: any, identation: any, name?: any): string;
    printShiftCall(node: any, identation: any, name?: any): string;
    printReverseCall(node: any, identation: any, name?: any): string;
    printPopCall(node: any, identation: any, name?: any): string;
    printAssertCall(node: any, identation: any, parsedArgs: any): string;
    printSliceCall(node: any, identation: any, name?: any, parsedArg?: any, parsedArg2?: any): string;
    printReplaceCall(node: any, identation: any, name?: any, parsedArg?: any, parsedArg2?: any): string;
    printReplaceAllCall(node: any, identation: any, name?: any, parsedArg?: any, parsedArg2?: any): string;
    printPadEndCall(node: any, identation: any, name: any, parsedArg: any, parsedArg2: any): string;
    printPadStartCall(node: any, identation: any, name: any, parsedArg: any, parsedArg2: any): string;
    printDateNowCall(node: any, identation: any): string;
    printLengthProperty(node: any, identation: any, name?: any): string;
    printPostFixUnaryExpression(node: any, identation: any): string;
    printPrefixUnaryExpression(node: any, identation: any): any;
    printConditionalExpression(node: any, identation: any): string;
    printDeleteExpression(node: any, identation: any): string;
    printThrowStatement(node: any, identation: any): string;
    getExceptionalAccessTokenIfAny(node: any): string;
}

declare class Transpiler {
    config: any;
    pythonTranspiler: PythonTranspiler;
    phpTranspiler: PhpTranspiler;
    csharpTranspiler: CSharpTranspiler;
    goTranspiler: GoTranspiler;
    javaTranspiler: JavaTranspiler;
    rustTranspiler: RustTranspiler;
    cppTranspiler: CppTranspiler;
    private programCache;
    private context;
    static createProgramCache(): ITranspileProgramCache;
    constructor(config?: {}, programCache?: ITranspileProgramCache);
    setVerboseMode(verbose: boolean): void;
    getProgramCache(): ITranspileProgramCache;
    cloneSharingProgramCache(config?: any): Transpiler;
    createProgramInMemoryAndSetContext(content: any): ITranspileContext;
    getByPathCompilerHost(options: ts.CompilerOptions): ts.CompilerHost;
    createProgramByPathAndSetContext(path: any): ITranspileContext;
    createProgramBatch(paths: string[]): TranspileProgramBatch;
    setContext(context: ITranspileContext): ITranspileContext;
    /** @deprecated renamed to createProgramInMemoryAndSetContext */
    createProgramInMemoryAndSetGlobals(content: any): ITranspileContext;
    /** @deprecated renamed to createProgramByPathAndSetContext */
    createProgramByPathAndSetGlobals(path: any): ITranspileContext;
    checkFileDiagnostics(context?: ITranspileContext): void;
    transpile(lang: Languages, mode: TranspilationMode, file: string, sync?: boolean, createContext?: boolean, handleImports?: boolean): ITranspiledFile;
    transpileDifferentLanguagesGeneric(mode: TranspilationMode, input: IInput[], content: string): ITranspiledFile[];
    transpileDifferentLanguages(input: any[], content: string): ITranspiledFile[];
    transpileDifferentLanguagesByPath(input: any[], content: string): ITranspiledFile[];
    transpilePython(content: any): ITranspiledFile;
    transpilePythonByPath(path: any): ITranspiledFile;
    transpilePhp(content: any): ITranspiledFile;
    transpilePhpByPath(path: any): ITranspiledFile;
    transpileCSharp(content: any): ITranspiledFile;
    transpileCSharpByPath(path: any): ITranspiledFile;
    transpileJava(content: any): ITranspiledFile;
    transpileJavaByPath(path: any): ITranspiledFile;
    transpileGoByPath(path: any): ITranspiledFile;
    transpileGo(content: any): ITranspiledFile;
    transpileRust(content: any): ITranspiledFile;
    transpileRustByPath(path: any): ITranspiledFile;
    transpileCpp(content: any): ITranspiledFile;
    transpileCppByPath(path: any): ITranspiledFile;
    getFileImports(content: string): IFileImport[];
    getFileExports(content: string): IFileExport[];
    setPHPPropResolution(props: string[]): void;
    setPhpUncamelCaseIdentifiers(uncamelCase: boolean): void;
    setPythonUncamelCaseIdentifiers(uncamelCase: boolean): void;
    setPhpAsyncTranspiling(async: boolean): void;
    setPythonAsyncTranspiling(async: boolean): void;
    setPythonStringLiteralReplacements(replacements: any): void;
    convertStringToLanguageEnum(lang: string): Languages;
}
declare class TranspileProgramBatch {
    private readonly transpiler;
    private readonly program;
    private readonly checker;
    constructor(transpiler: Transpiler, program: ts.Program, checker: ts.TypeChecker);
    getProgram(): ts.Program;
    setContextForPath(filePath: string): ITranspileContext;
    transpileByPath(lang: Languages, filePath: string, sync?: boolean): ITranspiledFile;
    transpilePythonByPath(filePath: string): ITranspiledFile;
    transpilePhpByPath(filePath: string): ITranspiledFile;
    transpileCSharpByPath(filePath: string): ITranspiledFile;
    transpileGoByPath(filePath: string): ITranspiledFile;
    transpileJavaByPath(filePath: string): ITranspiledFile;
    transpileRustByPath(filePath: string): ITranspiledFile;
    transpileCppByPath(filePath: string): ITranspiledFile;
}

export { TranspileProgramBatch, Transpiler, alignGoTrailingComments, Transpiler as default };

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
    csharpDeclaredLocalTypeResolver?: (declaration: any) => string | undefined;
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
    csharpNativeDeclaredDictionaryRead(expression: any, argumentExpression: any): string | undefined;
    csharpDeclaredDictionaryType(node: any): string | undefined;
    csharpMissingKeyFieldRead(expression: any, argumentExpression: any, isStringKey: any): string | undefined;
    csharpDeclaredCollectionRead(node: any, expression: any, argumentExpression: any, isStringKey: any, isNumberKey: any): string | undefined;
    csharpDeclaredCollectionType(expression: any): string | undefined;
    csharpKeyPresenceGuarded(node: any, expression: any, key: any): boolean;
    csharpLoopIndexListRead(expression: any, argumentExpression: any): string | undefined;
    csharpCounterRangeLoop(counter: any, receiver: any): ts.ForStatement;
    csharpForBoundsCounter(loop: any, counter: any, receiver: any): boolean;
    csharpCounterStartsAtZero(loop: any, counter: any): boolean;
    csharpCounterAdvances(loop: any, counter: any): boolean;
    csharpCounterUnwrittenIn(range: any, counter: any): boolean;
    csharpReceiverIntactIn(range: any, receiver: any): boolean;
    csharpIsSameDeclaration(identifier: any, declaration: any): boolean;
    csharpWalkIdentifiers(node: any, visit: any): void;
    csharpIsWriteTarget(node: any): boolean;
    csharpUnparenthesized(node: any): any;
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
    csharpNativeDelegateCall(node: any, propName: any): string | undefined;
    printOutOfOrderCallExpressionIfAny(node: any, identation: any): string;
    handleTypeOfInsideBinaryExpression(node: any, identation: any): string;
    csharpEqualityOperandType(node: any): string | undefined;
    csharpReferenceFieldType(node: any): string | undefined;
    csharpParameterOperandType(node: any): string | undefined;
    csharpNumericLiteralKind(node: any): string | undefined;
    csharpDeclaredTypeOfBinding(node: any): string | undefined;
    csharpValueEqualityKind(csharpType: any): string | undefined;
    csharpIsNullComparableType(csharpType: any): boolean;
    csharpOperandIsValueTyped(node: any): boolean;
    csharpTypeHasValueScalar(type: any): boolean;
    csharpDeclaredStringLiteralComparison(left: any, right: any, leftText: string, rightText: string, isEquality: boolean): string | undefined;
    csharpDeclaredReadType(node: any): string | undefined;
    csharpDeclaredLocalType(node: any): string | undefined;
    csharpOperandsAreDeclaredReads(left: any, right: any): boolean;
    csharpDeclaredReadEqualityType(node: any, printerType: string | undefined): string | undefined;
    printInlineEquality(left: any, right: any, leftText: string, rightText: string, isEquality: boolean): string | undefined;
    csharpNullComparison(text: string, isEquality: boolean): string;
    csharpNativeNumericCallEquality(left: any, right: any, leftText: string, rightText: string, isEquality: boolean): string | undefined;
    csharpNumericCallKind(node: any): string | undefined;
    csharpIntegerLiteralKind(node: any): string | undefined;
    csharpNumericKindHoldsLiteral(callKind: string, literalKind: string): boolean;
    csharpExpressionTypeOf(node: any): string | undefined;
    csharpOperandsAreNumbers(node: any): boolean;
    csharpOperandIsPlainNumber(operand: any): boolean;
    csharpNativeNumericComparison(node: any, identation: any): string | undefined;
    csharpNativeMathMinMax(node: any, name: string, parsedArg1: string, parsedArg2: string): string | undefined;
    csharpMinMaxResultIsPlainValue(node: any): boolean;
    printCallExpression(node: any, identation: any): any;
    csharpNativeParseCall(node: any): string;
    csharpCalleeIsGlobalFunction(node: any): boolean;
    csharpNativeParseCallOnDeclaredLocal(callee: any, arg: any): string;
    csharpNativeModExpression(left: any, right: any, leftText: any): string;
    csharpNativeNegatedLocal(operand: any, leftSide: any): string;
    csharpNativeReceiver(node: any): {
        text: string;
        type: string;
    } | undefined;
    csharpTypeIsNative(csharpType: string): boolean;
    csharpTypedLocalType(node: any): string | undefined;
    csharpCountMemberOf(csharpType: string): string | undefined;
    csharpDeclaredLengthExpression(node: any): string | undefined;
    csharpLengthReceiverIdentifier(node: any): any | undefined;
    csharpNativeStringKey(key: any): string | undefined;
    csharpIsDictionaryType(type: any): boolean;
    csharpIsArrayType(type: any): boolean;
    csharpNullableDictionaryType(type: any): boolean;
    csharpIsAnyValuedDictionaryType(type: any): boolean;
    csharpDictionaryParamsBag(node: any): boolean;
    csharpNameWrittenBefore(node: any, name: string): boolean;
    csharpNativeDictionaryReceiver(obj: any): {
        text: string;
        nullTest?: string;
    } | undefined;
    csharpNativeInExpression(key: any, obj: any): string | undefined;
    csharpNativeLengthExpression(expression: any): string | undefined;
    csharpNativeElementLiteralEquality(left: any, right: any, leftText: string, rightText: string, isEquality: boolean): string | undefined;
    csharpStringKeyedElementAccess(node: any): boolean;
    csharpNumericStringLiteral(node: any): boolean;
    csharpDictionaryReceiverType(node: any): string | undefined;
    csharpScalarElementKinds(node: any): number;
    printCustomBinaryExpressionIfAny(node: any, identation: any): string;
    csharpCallReturnType(initializer: any): string | undefined;
    csharpCalleeResolves(node: any): boolean;
    csharpTypeOfInitializer(initializer: any): string | undefined;
    csharpBoolCallTyped(node: any): boolean;
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
    csharpNativeIndexOfCall(node: any, name?: any, parsedArg?: any): string | undefined;
    csharpIndexOfReceiverHoldsString(node: any, receiver: any, declared: any): boolean;
    csharpIndexOfReceiverIsCheckedString(receiver: any): boolean;
    csharpIndexOfReceiverIsDeclaredList(declared: any): boolean;
    csharpReceiverDeclaredNonNullString(receiver: any): boolean;
    csharpDeclarationIsNonNullString(declaration: any): boolean;
    csharpInitializerIsUndefined(initializer: any): boolean;
    csharpNullGuardAdmitsRead(node: any, receiver: any): boolean;
    csharpIsFunctionLike(node: any): boolean;
    csharpEarlyExitNonNullGuarded(block: any, statement: any, symbol: any, scope: any): boolean;
    csharpTestIsNonNullCheck(test: any, symbol: any, truthy: any): boolean;
    csharpSameBinding(node: any, symbol: any): boolean;
    csharpReceiverWrittenBetween(scope: any, from: number, to: number, symbol: any): boolean;
    csharpNativeIndexOfNeedle(key: any, printed?: any): string | undefined;
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
    csharpNativeSliceCall(node: any, name: any): string;
    csharpSliceLiteralBound(node: any): any;
    csharpSliceBoundExpression(value: any, length: any): string;
    csharpSliceReceiverKind(expression: any): "string" | "list";
    csharpSliceStringType(type: any): boolean;
    csharpSliceNullishType(flags: ts.TypeFlags): boolean;
    csharpSliceReceiverIsSideEffectFree(expression: any): boolean;
    printReplaceCall(node: any, identation: any, name?: any, parsedArg?: any, parsedArg2?: any): string;
    printReplaceAllCall(node: any, identation: any, name?: any, parsedArg?: any, parsedArg2?: any): string;
    printPadEndCall(node: any, identation: any, name: any, parsedArg: any, parsedArg2: any): string;
    printPadStartCall(node: any, identation: any, name: any, parsedArg: any, parsedArg2: any): string;
    printDateNowCall(node: any, identation: any): string;
    printLengthProperty(node: any, identation: any, name?: any): string;
    csharpNativePostFixIncrement(node: any): boolean;
    printPostFixUnaryExpression(node: any, identation: any): string;
    printPrefixUnaryExpression(node: any, identation: any): any;
    csharpConditionPrintsBool(node: any): boolean;
    csharpFieldPrintsBool(node: any): boolean;
    csharpBinaryExpressionPrintsBool(node: any): boolean;
    csharpIsCheckedBoolean(node: any): boolean;
    csharpIdentifierPrintsBool(node: any): boolean;
    csharpCalleeName_Native(node: any): string | undefined;
    csharpBoolCall_Native(node: any): boolean;
    csharpCallPrintsBool(node: any): boolean;
    csharpNullableBoolCondition(node: any): string | undefined;
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
    goInferredLocalStaticType(node: any): string | undefined;
    goStringFieldStaticType(node: any, printedText: string): string | undefined;
    goNilProvenStringDeref(node: any): boolean;
    goStringConcatOperandType(node: any, printedText: string): string | undefined;
    goNativeStringConcat(node: any, leftText: string, rightText: string): {
        goType: string;
        text: string;
    } | undefined;
    goOperandStaticType(node: any, printedText: string): string | undefined;
    goStringCallStaticType(node: any, printedText: string): string | undefined;
    goConstFloatStaticType(node: any): string | undefined;
    isNonZeroIntegerLiteral(node: any): boolean;
    isNonZeroFloatLiteral(node: any): boolean;
    goConstantIntValue(node: any): number | undefined;
    goInsideTypedDeclarationInitializer(node: any): boolean;
    goNativeNumericResultType(op: any, leftType: string, rightType: string, node: any): string | undefined;
    goNativeOperandText(node: any, printedText: string): string;
    goNativeArithmetic(node: any, leftText?: any, rightText?: any): {
        goType: string;
        text: string;
    } | undefined;
    goNativeBinaryText(node: any, symbol: string, leftText: string, rightText: string): string;
    goNativeCompoundAssignment(op: any, leftNode: any, leftText: string, rightNode: any, rightText: string): string | undefined;
    goEnclosingFunction(node: any): any;
    goTypeNameIsShadowed(scope: any, goType: string): boolean;
    goIsNativeAppendShape(receiverNode: any, pushNode: any): boolean;
    goNativeAppendReceiver(pushNode: any): string | undefined;
    goLocalIsSafeToType(scope: any, declaration: any, varName: string, goType: string): boolean;
    goSafeDictLocalArgs(initializer: any): {
        container: any;
        key: any;
    };
    goSafeDictUseReadsTheMap(node: any): boolean;
    goSafeDictLocalUnboxCache: Map<any, string>;
    goSafeDictLocalUnbox(declaration: any): string | undefined;
    goSafeDictLocalUnboxUncached(declaration: any): string | undefined;
    goSafeDictUnboxValue(declaration: any, identation: number): string | undefined;
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
    goObjectBoxParameter(node: any): boolean;
    goTypeIsNilComparableObject(type: any): boolean;
    goPrintedCallee(printedValue: string): string | undefined;
    goIsAnyBoxExpression(node: any, printedText: string): boolean;
    goBoxedElementRead(node: any, printedText: string): boolean;
    goAnyLocalHoldsPointerCache: Map<any, boolean>;
    goAnyLocalHoldsPointer(decl: any): boolean;
    goAstCalleeName(call: any): string | undefined;
    goAwaitedCallIsImplicitEndpoint(expression: any): boolean;
    goIsNonPointerValueSource(expr: any): boolean;
    goAnyLocalHoldsNonPointerCache: Map<any, boolean>;
    goAnyLocalHoldsNonPointer(decl: any): boolean;
    goAssignmentWritesName(left: any, name: any): boolean;
    goAnyBoxLocalDeclaration(node: any): any;
    goGetArgBoundParameter(node: any): boolean;
    goParameterLaterWritesPointerBox(decl: any): boolean;
    goWritePrintsPointerBox(expr: any): boolean;
    goScalarFamilyOfType(type: any, allowNil?: boolean): string | undefined;
    goDeclaredTypeCache: Map<any, string>;
    goDeclaredTypeInProgress: Set<any>;
    goDeclaredTypeOfIdentifier(node: any): string | undefined;
    goIsPointerIdentifier(node: any): boolean;
    goPointerTypeOfExpression(node: any, printedText: string): string | undefined;
    goElementAssignmentContainerType(node: any, printedText: string): string | undefined;
    goFieldContainerTypeNative(node: any): string | undefined;
    goIsStringKeyExpression(node: any): boolean;
    goSliceIndexProvablyInRange(node: any, indexNode: any): boolean;
    goLocalIsRebound(scope: any, nameNode: any): boolean;
    goRebindingTargetOf(identifier: any): any;
    printNativeElementAssignment(containerNode: any, containerStr: string, keyNode: any, keyStr: string, valueStr: string, compound?: boolean): string | undefined;
    goPrintedTypeOfExpression(node: any, printedText: string): string | undefined;
    sliceLengthTypes: string[];
    GO_NATIVE_LENGTH_FIELDS: string[];
    printInlineArrayLength(expression: any, printedText: string, lengthNode?: any): string | undefined;
    goNativeLengthFieldType(printedText: string): string | undefined;
    goLengthFeedsArithmeticClassifier(lengthNode: any): boolean;
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
    goFileStdlibImports: Set<string>;
    printSourceFileStatements(node: any, identation: any): string;
    printNode(node: any, identation?: number): string;
    printObjectLiteralExpression(node: any, identation: any): string;
    printCondition(node: any, identation: any): any;
    goDerefComparableWith(ptrNode: any, ptrText: string, otherNode: any): boolean;
    goIsStringLiteralNode(node: any): boolean;
    printInlineEquality(left: any, right: any, leftText: string, rightText: string, isEq: boolean): string | undefined;
    goOperandNumericKind(node: any, printedText: string): string | undefined;
    goLiteralTypedLocalKind(node: any): string | undefined;
    goNumericLiteralKind(node: any): string | undefined;
    goIsSignedNumericLiteral(node: any): boolean;
    goIsNumericConstant(node: any): boolean;
    goNumericConstantValue(node: any): number;
    goLiteralFitsKind(node: any, kind: string): boolean;
    goComparisonKind(left: any, leftKind: string, right: any, rightKind: string): string | undefined;
    printInlineOrderedComparison(left: any, right: any, leftText: string, rightText: string, op: any): string | undefined;
    goOrderedComparisonPointerKind(node: any): string | undefined;
    printPointerOrderedComparison(left: any, right: any, leftText: string, rightText: string, operator: string, leftPointee: string | undefined, rightPointee: string | undefined): string | undefined;
    goIsNonNilTestOf(node: any, ident: any): boolean;
    goIsNilLiteral(node: any): boolean;
    goIsSameSymbol(a: any, b: any): boolean;
    goHasEnclosingNilGuard(ident: any): boolean;
    goConditionProvesNonNil(condition: any, ident: any): boolean;
    goUnwrapParenthesizedNode(node: any): any;
    goIsPureComparisonOperand(node: any): boolean;
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
    isArraySliceTypes: string[];
    isArrayNonSliceTypes: string[];
    goIdentifierUsedElsewhere(nameNode: any): boolean;
    goLocalHoldsOnlyArrays(nameNode: any): boolean;
    printNativeIsArray(node: any, parsedArg: string | undefined): string | undefined;
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
    goIndexOfOperandType(node: any, printedText: string): string | undefined;
    goFileKeepsFileLevelImports(): boolean;
    goNativeIndexOf(node: any, name: any, parsedArg: any): string | undefined;
    printIndexOfCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    goNativeStringOperands(operands: any[], texts: string[], expected: string[]): boolean;
    goNativeStringCall(nativeCall: string): string | undefined;
    goStdlibImportIsPlaceable(): boolean;
    printStartsWithCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printEndsWithCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printTrimCall(node: any, identation: any, name?: any): string;
    printJoinCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printSplitCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printToFixedCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printToStringCall(node: any, identation: any, name?: any): any;
    printConcatCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printToUpperCaseCall(node: any, identation: any, name?: any): string;
    printToLowerCaseCall(node: any, identation: any, name?: any): string;
    printShiftCall(node: any, identation: any, name?: any): string;
    printReverseCall(node: any, identation: any, name?: any): string;
    printPopCall(node: any, identation: any, name?: any): string;
    printAssertCall(node: any, identation: any, parsedArgs: any): string;
    goSliceLiteralBound(node: any): number | undefined;
    goSliceSubscript(value: string, start: number, hasEnd: boolean, end: number | undefined): string;
    goSliceReceiverType(node: any): string | undefined;
    goSliceLiteralBounds(node: any): {
        start: number;
        hasEnd: boolean;
        end: number;
    } | undefined;
    goIsNativeSliceCall(node: any): boolean;
    printInlineSlice(node: any, receiverText: string): string | undefined;
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
    goElementWriteChain(baseExpr: any, containerStr: string, keyNodes: any, keyStrs: string[]): string;
    goKeyIsString(node: any, printed: string): any;
    goIsDerefStringKeyExpression(node: any): boolean;
    printNilGuardedMapIndex(containerStr: string, keyStr: string): string;
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
    javaExpressionTypeResolver?: (node: any) => string | undefined;
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
    javaEqualityLiteralKind(node: any): "int" | "double" | "long";
    javaNativeLengthKind(node: any): string;
    isJavaPrimitiveCounterReference(node: any): boolean;
    javaLocalNumberKind(node: any, depth: any): any;
    javaWritesKeepNumberKind(declaration: any, symbol: any, kind: any): boolean;
    expressionReferencesSymbol(node: any, symbol: any): boolean;
    enclosingFunctionLike(node: any): ts.SignatureDeclaration;
    javaPrintedNumberKind(node: any, depth?: number): any;
    javaEqualityNumberKind(node: any): any;
    printNativeEqualityIfProvable(node: any, leftText: string, rightText: string): string | undefined;
    javaOperandPrintsPrimitiveNumber(node: any): boolean;
    elementWriteTargetsMap(container: any, base: any, keys: any): boolean;
    elementWriteKeyText(key: any, keyText: string): string;
    isPlainHashMapReceiver(container: any, keys: any[]): boolean;
    unwrapPrintTransparentExpression(node: any): any;
    javaLocalIsReassigned(node: any): boolean;
    callAlwaysReturnsPlainHashMap(node: any, depth: number): boolean;
    returnTypePrintsAsHashMap(declaration: any): boolean;
    isDictionaryType(node: any): boolean;
    isDictionaryTsType(type: any, checker: any, depth: number): boolean;
    javaIntegerLiteralKind(node: any): "int" | "long";
    isVarargsArrayReference(node: any, depth?: number): any;
    isJavaListType(type: any): boolean;
    javaLengthKind(expression: any): "List" | "String" | "StringOrNull" | "ListOrNull";
    isJavaListValueType(type: any): any;
    isJavaListBackedClassType(type: any): boolean;
    isJavaNullishUnion(type: any, isMember: any): any;
    printJavaLength(expression: any, leftSide: any): string;
    isJavaPrimitiveForCounter(node: any): boolean;
    javaPrimitiveOperandKind(node: any): any;
    isJavaFloatLiteral(node: any): boolean;
    javaPrintedCallKind(node: any): "int" | "double" | "long";
    javaComparisonOperandsAreExact(left: any, leftKind: any, right: any, rightKind: any): boolean;
    javaComparisonOperandIsExactAgainstDouble(node: any, kind: any): boolean;
    isJavaMapType(type: any): boolean;
    isJavaStringType(type: any): any;
    isJavaNullableMapType(type: any): boolean;
    javaRepeatableOperand(node: any): any;
    javaDeclaredTypeOf(expression: any): string | undefined;
    javaDeclaredStringType(expression: any): boolean;
    printCustomBinaryExpressionIfAny(node: any, identation: any): string;
    isJavaMapStructureType(type: any): boolean;
    isJavaListStructureType(type: any): boolean;
    tupleRequiredElementCount(type: any): number;
    isJavaArrayStructureType(type: any): boolean;
    javaSideEffectFreeReference(node: any): any;
    javaStringElementsReceiver(node: any): boolean;
    isLeftSideOfAssignment(node: any): boolean;
    javaDeclaredLocalTypeResolver: ((declaration: ts.Node) => string | undefined) | undefined;
    javaDeclarationOfIdentifier(expression: any): any;
    javaDeclaredMapReceiver(expression: any): boolean;
    printCheckerTypedElementAccessRead(node: any): string;
    printElementAccessExpression(node: any, identation: any): any;
    javaScalarFamily(node: any): string | undefined;
    javaProvableString(node: any): boolean;
    javaResolvedString(node: any): boolean;
    javaNativeConcat(node: any): boolean;
    javaThisCallNumericKind(node: any): string | undefined;
    javaProvableNumericKind(node: any, allowDeclaredLocals?: boolean): string | undefined;
    javaDeclaredNumericLocalKind(node: any): string | undefined;
    javaIdentifierKeepsDeclaredName(node: any): boolean;
    javaOperandIsNonNullNumber(node: any): boolean;
    javaNativeArithmeticKind(node: any, allowDeclaredLocals?: boolean): string | undefined;
    javaNativeArithmeticPairKind(isPlus: any, isMultiply: any, isDivide: any, leftKind: any, rightKind: any): string | undefined;
    javaBaseTimeLongCall(node: any): boolean;
    javaIntForCounter(node: any): boolean;
    javaCounterHasNoBoxWrite(node: any, symbol: any): boolean;
    javaLengthIntRead(node: any): boolean;
    javaWidenedNumericKind(node: any): any;
    javaWidenedAddKind(node: any): any;
    printWidenedNativeAdd(left: any, right: any, leftText: any, rightText: any): string;
    javaPrintWidenedOperand(kind: any, resultKind: any, node: any, text: any): any;
    javaSplitTernaryReceiver(node: any): boolean;
    javaNativeSplitCall(node: any, name: any, parsedArg: any): string | undefined;
    javaPrintOperandAsLong(node: any, text: any): any;
    javaProvableCounterInt(node: any): boolean;
    printInlineHelperArithmetic(left: any, right: any, leftText: any, rightText: any, op: any): string;
    javaNativeMathMinMaxOperandKind(node: any): "double" | "integral";
    javaNativeMathMinMaxResultIsPlainValue(node: any): boolean;
    printNativeMathMinMax(node: any, left: any, right: any, leftText: any, rightText: any, name: any): string;
    javaStringBoxText(node: any, text: any): string;
    javaScalarParseAccepts(callee: any, text: any): boolean;
    printNativeScalarParse(node: any, callee: any): string;
    javaPadStartReceiverText(receiver: any, name: any): any;
    printNativePadStart(node: any, name: any): string;
    javaCharLiteral(character: any): any;
    javaUnwrapParentheses(node: any): any;
    javaNativeArithmeticType(node: any): "String" | "Long" | "Double";
    javaEnclosingFunction(node: any): any;
    javaArithmeticWriteIsSafe(right: any, javaType: any): boolean;
    javaScopingBlock(node: any): any;
    javaNodeContains(outer: any, inner: any): boolean;
    javaBindingsAreDisjoint(declaration: any, other: any): boolean;
    javaArithmeticLocalUseIsSafe(node: any, declaration: any, javaType: any): boolean;
    javaArithmeticLocalIsSafeToType(scope: any, declaration: any, javaType: any): boolean;
    javaArithmeticLocalType(declaration: any): "String" | "Long" | "Double";
    javaProvableNumericDoubleOperand(node: any): boolean;
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
    printArrayIsArrayCall(node: any, _identation: any, parsedArg?: any): string;
    printNativeArrayIsArray(node: any, parsedArg: any): string;
    javaPrimaryIsArrayOperand(node: any): boolean;
    javaOperandType(operand: any): ts.Type;
    javaArrayLiteralDropsNothing(node: any, depth?: number): boolean;
    javaScalarType(type: any, depth?: number): boolean;
    javaNonArrayType(type: any, depth?: number): boolean;
    printObjectKeysCall(node: any, _identation: any, parsedArg?: any): string;
    printNativeObjectKeysCall(node: any): string;
    printObjectValuesCall(_node: any, _identation: any, parsedArg?: any): string;
    printJsonParseCall(_node: any, _identation: any, parsedArg?: any): string;
    printJsonStringifyCall(_node: any, _identation: any, parsedArg?: any): string;
    printNativePromiseAllCall(node: any): string;
    isConstBoundIdentifier(node: any): boolean;
    printPromiseAllCall(node: any, identation: any, parsedArg?: any): string;
    printMathFloorCall(node: any, _identation: any, parsedArg?: any): string;
    printMathRoundCall(node: any, _identation: any, parsedArg?: any): string;
    printMathCeilCall(node: any, _identation: any, parsedArg?: any): string;
    printNumberIsIntegerCall(_node: any, _identation: any, parsedArg?: any): string;
    printArrayPushCall(_node: any, _identation: any, name?: any, parsedArg?: any): string;
    printIncludesCall(_node: any, _identation: any, name?: any, parsedArg?: any): string;
    javaNativeIndexOfCall(node: any, name: any, parsedArg: any): string;
    printIndexOfCall(node: any, _identation: any, name?: any, parsedArg?: any): string;
    printSearchCall(_node: any, _identation: any, name?: any, parsedArg?: any): string;
    printStartsWithCall(_node: any, _identation: any, name?: any, parsedArg?: any): string;
    printEndsWithCall(_node: any, _identation: any, name?: any, parsedArg?: any): string;
    printTrimCall(_node: any, _identation: any, name?: any): string;
    printJoinCall(_node: any, _identation: any, name?: any, parsedArg?: any): string;
    printSplitCall(node: any, _identation: any, name?: any, parsedArg?: any): string;
    printConcatCall(_node: any, _identation: any, name?: any, parsedArg?: any): string;
    printToFixedCall(_node: any, _identation: any, name?: any, parsedArg?: any): string;
    printToStringCall(_node: any, _identation: any, name?: any): string;
    printToUpperCaseCall(_node: any, _identation: any, name?: any): string;
    printToLowerCaseCall(_node: any, _identation: any, name?: any): string;
    printShiftCall(_node: any, _identation: any, name?: any): string;
    printReverseCall(_node: any, _identation: any, name?: any): string;
    printPopCall(_node: any, _identation: any, name?: any): string;
    printAssertCall(_node: any, _identation: any, parsedArgs: any): string;
    printSliceCall(node: any, _identation: any, name?: any, parsedArg?: any, parsedArg2?: any): string;
    javaSliceLiteralBound(node: any): any;
    javaSliceBoundExpression(value: any, length: any): string;
    nativeSliceCallIfProvable(node: any, name: any): string;
    printReplaceCall(_node: any, _identation: any, name?: any, parsedArg?: any, parsedArg2?: any): string;
    printReplaceAllCall(node: any, identation: any, name?: any, parsedArg?: any, parsedArg2?: any): string;
    stringLiteralArgument(argument: any): string;
    sideEffectFreeReceiver(expression: any): any;
    printPadEndCall(_node: any, _identation: any, name: any, parsedArg: any, parsedArg2: any): string;
    printPadStartCall(node: any, _identation: any, name: any, parsedArg: any, parsedArg2: any): string;
    printDateNowCall(_node: any, _identation: any): string;
    printLengthProperty(node: any, _identation: any, _name?: any): string;
    printPostFixUnaryExpression(node: any, identation: any): string;
    javaPrimitiveCounter(node: any): boolean;
    javaNativeNegation(node: any): boolean;
    printPrefixUnaryExpression(node: any, identation: any): any;
    javaBooleanCondition(node: any): any;
    javaPreciseBooleanCall(node: any): any;
    javaBooleanValueKind(node: any): 'boolean' | 'nullableBoolean' | undefined;
    javaCalleeResolves(node: any): boolean;
    javaCallBooleanKind(node: any): 'boolean' | 'nullableBoolean' | undefined;
    javaConditionPrintsBoolean(node: any): any;
    javaBooleanBoxType(type: any): boolean;
    javaTypeOfNode(node: any): any;
    javaTypeOfDeclaration(decl: any): any;
    javaPrintsBooleanValue(node: any, seen: Set<any>): boolean;
    javaPrintsBooleanCall(node: any): boolean;
    isArrayIsArrayCall(node: any): boolean;
    javaBooleanBaseField(node: any): string | undefined;
    javaBooleanBoxIdentifier(node: any, seen: Set<any>): string | undefined;
    javaBooleanWritesAreBoxed(symbol: any, decl: any, node: any, seen: Set<any>): boolean;
    javaBooleanWrapperFreeCondition(node: any): string | undefined;
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

/** Answer of `RustTranspiler.rustDeclaredLocalTypeResolver` for a local whose
 *  value provably holds a `Value::Dict` at every use. */
type RustDeclaredLocalKind = 'dict';
/** One `let x: Value = <dict-proven initialiser>` declaration. `kind` is only
 *  answered by the resolver when `alwaysDict && stable`. */
interface RustDeclaredDictLocalEntry {
    kind: RustDeclaredLocalKind;
    name: string;
    /** printed callee of the initialiser: a `safe_dict*` name, or `value_map`. */
    source: string;
    /** the `safe_dict*` `optionalArgs` default is itself Dict-proven, so the
     *  helper returns a Dict on every path (it returns that default when the
     *  key does not hold one). */
    alwaysDict: boolean;
    /** no later write in the enclosing function can change the kind (D2). */
    stable: boolean;
    /** use census: element-access receiver / kind-preserving mutator / anything else. */
    uses: {
        elementAccess: number;
        mutHelper: number;
        other: number;
    };
    declaration: ts.VariableDeclaration;
    start: number;
}
/** Vocabulary of the declared-Dict locals table (see
 *  `RustTranspiler.rustDeclaredLocalTypeResolver`). */
declare const RUST_DECLARED_DICT_LOCALS: {
    /** value the resolver answers for a proven Dict local */
    DICT: RustDeclaredLocalKind;
    /** printed `self.<callee>` -> index of its `optionalArgs` parameter.
     *  `safe_dict*` returns `optional_args[0]` whenever the key holds a non-Dict. */
    SAFE_CALLEES: Record<string, number>;
    /** `&mut` receivers whose writes land inside the container, so a Dict local
     *  stays a Dict (`add_element_to_object` / `append_to_array` no-op on a
     *  non-container, `set_value` / `remove` write a key). */
    KIND_PRESERVING_MUTATORS: Set<string>;
};
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
    private static readonly RUST_NATIVE_INSERT_RECEIVERS;
    private static readonly RUST_BOOK_META_KEYS;
    private static readonly RUST_TAGGED_HANDLE_FIELDS;
    private static readonly RUST_BOOL_VALUE_HELPERS;
    private static readonly PAYLOAD_ACCESSORS;
    primitiveKindOfType(type: any): string;
    /** `true` / `false` / `boolean` (a union of BooleanLiteral members too). */
    isBooleanValueType(type: ts.Type | undefined): boolean;
    /** `boolean | undefined`: `undefined`/`null` both print `Value::Null` (false
     *  for the helper and for the `matches!` alike), so they may join the union. */
    isBooleanOrUndefinedType(type: ts.Type | undefined): boolean;
    /** Operands this unit owns: `safeBool`/`safeBool2`/`safeBoolN` calls (a
     *  `Value` in the port) and element accesses (printed as `get_value`). */
    isBooleanValueFamilyOperand(node: any): boolean;
    /** The emitted `matches!` is a bare Rust `bool`: it is only valid where the
     *  whole enclosing boolean expression already sits in a bool slot. A logical
     *  expression stored in a `Value` slot gets its `Value::Bool(..)` box from the
     *  ccxt post-passes, which key on the leading helper token the operand would
     *  no longer provide. */
    isBareBoolEmissionSafe(node: any): boolean;
    /** Native truthiness text of the operand, or undefined to keep `is_true`. */
    printNativeTruthiness(node: any): string | undefined;
    literalKindOfNode(node: any): string;
    printsValueExpression(node: any): boolean;
    callExpressionName(node: any): string;
    textCoercesToNumber(text: string): boolean;
    stringLiteralCoercesToNumber(node: any): boolean;
    numericLiteralF64Text(node: any): string;
    rustReadPrintsValue(node: any): boolean;
    rustBooleanComparableType(type: any): boolean;
    printNativeEqualityComparison(left: any, right: any, op: any): string;
    typeOfNodeIfAny(node: ts.Node): ts.Type | undefined;
    isValueLengthType(type: ts.Type | undefined): boolean;
    printArrayLength(node: any, identation: any, leftExpr?: any): string;
    /** Literal integer bound of a `slice` call (`3`, `-64`), else undefined. */
    rustSliceLiteralBound(node: any): number | undefined;
    rustSliceClampedIndex(value: number): string;
    printNativeStringIndexOf(node: any, receiverText: string): string | undefined;
    printNativeStringSlice(node: any, receiverText: string): string | undefined;
    private static readonly RUST_TYPE_PREDICATE_PATTERNS;
    isDeclaredValueIdentifier(node: any): boolean;
    isDeclaredValuePlace(node: any): boolean;
    valuePlaceRoot(node: any): any;
    nativeValuePredicateText(kind: string, operandNode: any, printedOperand: string): string | undefined;
    isDictShapedType(type: ts.Type | undefined): boolean;
    printNativeInOperator(key: any, obj: any): string;
    rustStringLiteralOf(printedKey: string): string | undefined;
    printNativeDictInsert(baseExpr: any, keyNode: any, keyText: any, valueText: any): string | undefined;
    rustNativeInsertReceiver(expr: any): {
        text: string;
        isField: boolean;
        nameNode: any;
    } | undefined;
    rustWriteDictShape(type: any): boolean;
    rustReceiverStaysDict(baseExpr: any, receiver: any): boolean;
    rustFieldStaysDict(baseExpr: any, fieldName: string): boolean;
    rustPrintedBoolArg(raw: string): boolean;
    foldNegateLiteral(operandText: string): string | undefined;
    ensureRef(expr: string): string;
    isNumberTyped(node: any): boolean;
    isBooleanPosition(node: any): boolean;
    printNativeNumericComparison(node: any, operator: any, leftText: any, rightText: any): string;
    rustNumericOperandKind(node: any): string | undefined;
    orderedComparisonOperand(node: any): any;
    printNativeOrderedComparison(node: any, op: any, left: any, right: any): string | undefined;
    isNumberLikeType(type: any): boolean;
    isStringLikeType(type: any): boolean;
    private static readonly RUST_CONCAT_SAFE_FLAGS;
    isStringOrNullishType(type: any): boolean;
    isNativeStringConcatPair(leftType: any, rightType: any): boolean;
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
    private static readonly RUST_BOOL_RESULT_CALLEES;
    rustCallPrintsBool(node: any): boolean;
    peelValueBox(printedValue: string, prefix: string): string | undefined;
    peelValueBoolBox(printedValue: string): string | undefined;
    peelValueStrBox(printedValue: string): string | undefined;
    stripOuterParens(printedValue: string): string;
    printedBoolHelperCall(printedValue: string): boolean;
    rustNodeIsBoolExpression(node: any): boolean;
    rustTypeIsBoolean(node: any): boolean;
    rustTypeIsString(node: any): boolean;
    rustEnclosingFunction(node: any): any;
    rustBindsName(node: any, name: string): boolean;
    rustIdentifierUseIsCondition(node: any): boolean;
    rustLocalUsesAcceptBool(declaration: any, sourceName: string): boolean;
    private static readonly RUST_STRING_LOCAL_HELPERS;
    private rustStringLocalDecisions;
    rustSafeStringLocalInitializer(declaration: any): boolean;
    rustStringLocalUseIsNative(node: any): boolean;
    rustSafeStringLocalIsTyped(declaration: any): boolean;
    rustSafeStringLocalIsTypedUncached(declaration: any): boolean;
    rustIdentifierIsPropertyName(node: any): boolean;
    rustStringLocalIdentifierIsTyped(node: any): boolean;
    getRustBoolLocalInitializer(declaration: any, printedValue: string): string | undefined;
    private declaredDictLocalsCache;
    /** All `let x: Value = <dict-proven initialiser>` declarations of the current
     *  source file, keyed by local name in declaration order. */
    rustDeclaredDictLocals(): Map<string, RustDeclaredDictLocalEntry[]>;
    /** Printer hook for the helper-removal units: the proven kind of a declared
     *  local, or undefined when the local is not proven Dict at every use.
     *  Accepts the receiver node of the helper call (identifier, `x['k']` chain,
     *  `this.x` chain) or the declaration itself. */
    rustDeclaredLocalTypeResolver(node: ts.Node): RustDeclaredLocalKind | undefined;
    /** The table entry a use site resolves to (the declaration whose binding the
     *  use refers to, proven), or undefined. */
    rustDeclaredLocalEntry(node: ts.Node): RustDeclaredDictLocalEntry | undefined;
    /** The identifier at the head of a place (`x`, `x['k']`, `this.x` is not a
     *  local) — the node the resolver matches against the table. */
    private rustDeclaredLocalIdentifier;
    /** Binding symbol of an identifier, or undefined when the checker cannot
     *  answer (ByContent probes without a class context, for instance). */
    private rustSymbolOf;
    /** True when this identifier is a use of the given declaration's binding.
     *  Without a checker answer the callers stay conservative (reject). */
    private rustIdentifierRefersToDeclaration;
    /** Census of the current source file's table, for reports and tests. */
    rustDeclaredDictLocalCensus(): {
        declarators: number;
        dict: number;
        alwaysDict: number;
        kindUnstable: number;
        retypeEligible: number;
    };
    private collectRustDeclaredDictLocals;
    /** The Dict-proven initialiser shape of a declaration, or undefined. */
    private rustDictInitializerInfo;
    /** Printed `safe_dict*` callee name of `self.<name>(..)`, or undefined. */
    private rustSafeDictCallee;
    /** True when the expression can only be a Dict at run time: an object
     *  literal, a `safe_dict*` call with a Dict-proven default, an element of a
     *  one-element literal default, or an already-proven local. */
    private rustDictProvenExpression;
    /** D2 scan over the enclosing function: an assignment of a non-Dict-proven
     *  value would let the kind change. Every other write path the printer emits
     *  for a local is kind-preserving (`x['k'] = v` -> `add_element_to_object`,
     *  `x.push(v)` -> `append_to_array`, `delete x[k]` -> `remove`, nested
     *  `x['a']['b'] = v` -> `get_value_mut`/`set_value`). A *different* binding of
     *  the same name (sibling block, parameter) is not this local and does not
     *  count; when the checker cannot separate the two bindings the scan stays
     *  conservative and rejects. */
    private rustDictLocalWriteScan;
    /** True when this assignment target writes the local ITSELF (`x = ..`,
     *  `[x, y] = ..`, `({x} = ..)`), as opposed to a write *into* it
     *  (`x['k'] = ..`, kind-preserving). */
    private rustAssignmentWritesWholeLocal;
    /** One use of a dict-proven local: an element-access chain (`x['k']`, also
     *  the `x['k'] = v` write), a kind-preserving mutator (`x.push(v)`,
     *  `delete x[k]`), or something that would need the local to still be a
     *  `Value`. */
    private rustDictLocalClassifyUse;
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
    private static readonly RUST_ERROR_CONSTRUCTOR_ARGS;
    printErrorConstructorArg(name: string, index: number, node: any, identation: number): string;
    rustErrorConstructorName(className: string): string;
    printNewExpression(node: any, identation: any): any;
    printPropertyAccessExpression(node: any, identation: any): any;
    /** Methods whose Rust counterpart takes `&mut self`: a `self.<field>` read in
     *  their args must keep the `get_value(...)` shape the ccxt post-pass hoists. */
    static readonly MUT_SELF_METHODS: Set<string>;
    /** Global parse helpers that go native (`str::parse`) on a proven string arg,
     *  keyed to the rust integer/float type their runtime helper parses into. */
    static readonly RUST_PARSE_HELPERS: Record<string, string>;
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
    /** Keys `get_value(_k)` serves from the book store, a cache bucket or a
     *  live `__live_id` snapshot instead of from the dict itself: those routes
     *  are invisible to a plain map read, so they keep the helper. */
    static readonly RUST_DICT_LOCAL_UNSAFE_KEYS: Set<string>;
    rustDeclarationOfIdentifier(node: ts.Node): ts.Declaration | undefined;
    /** Initializer shapes that construct or return a plain dict. */
    rustDictProducingInitializer(node: ts.Node | undefined, seen: Set<ts.Node>): boolean;
    /** D2: the proof holds only while nothing re-assigns the local. */
    rustLocalIsReassigned(declaration: ts.Declaration, name: string): boolean;
    /** True when the receiver is a local declared as (or provably holding) a
     *  plain dict — `get_value(_k)` and this read agree on every key the
     *  runtime does not route elsewhere. */
    rustIsDeclaredDictLocal(node: ts.Node): boolean;
    /** Constant string argument of `parseInt`/`parseFloat` folded the way rust's
     *  `str::parse` would; undefined when the fold is not obviously exact. */
    foldParsedStringLiteral(name: string, text: string): string | undefined;
    /** `parseInt(x)` / `parseFloat(x)` with a single checker-proven string argument
     *  become the runtime helper's own match with native `str::parse`; every other
     *  argument shape keeps the helper call the ccxt post-pass rewrites. */
    printNativeParseCall(node: ts.CallExpression): string | undefined;
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
    printTruthyArgument(expression: string): string;
    printAssertCall(node: any, identation: any, parsedArgs: any): string;
    splitFirstArgument(parsedArgs: string): [string, string];
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

export { RUST_DECLARED_DICT_LOCALS, type RustDeclaredDictLocalEntry, TranspileProgramBatch, Transpiler, alignGoTrailingComments, Transpiler as default };

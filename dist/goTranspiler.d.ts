import { BaseTranspiler } from "./baseTranspiler.js";
import { SyntaxKind } from 'typescript/unstable/ast';
import type { BinaryExpression, CallExpression, Node, NodeArray, Statement } from 'typescript/unstable/ast';
declare function alignGoTrailingComments(content: string): string;
export { alignGoTrailingComments, };
export declare class GoTranspiler extends BaseTranspiler {
    goScopeDescendants: WeakMap<object, any[]>;
    goDescendantsOf(scope: any): any[];
    hasNodeWhere(scope: Node | undefined, predicate: (n: any) => boolean): boolean;
    binaryExpressionsWrappers: any;
    wrapThisCalls: boolean;
    wrapCallMethods: string[];
    unifiedStringParams: {
        [method: string]: number[];
    };
    CCXT_GO_GETARG_DECLARED_TYPES: any;
    CCXT_GO_GETARG_SAFE_CONSUMERS: any;
    goGetArgTypeCache: WeakMap<any, string | undefined>;
    goGetArgTypeComputing: Set<any>;
    goLocalTypeResolution: Set<any>;
    goSelfConcatLeafCache: WeakMap<any, boolean>;
    goLocalStaticTypeCache: WeakMap<object, string>;
    goBinaryMemo: Map<object, Map<string, any>> | undefined;
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
    printAsyncDeclarationPair(node: any, identation: any, def: string, funcBody: string, isMethod: boolean): string;
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
    printGoSignature(node: any, identation: any, receiver: string): string;
    printMethodParameters(node: any): any;
    printParameter(node: any, defaultValue?: boolean): string;
    printParameterType(node: any): string;
    printFunctionType(node: any): string;
    isWholePrintedCall(value: string, open: number): boolean;
    goTypeOfInitializer(initializer: any, printedValue: string): string | undefined;
    goUnwrapPrintedParens(printedText: string): string;
    goLocalStaticType(node: any): string | undefined;
    goInferredLocalStaticType(node: any): string | undefined;
    goStringFieldStaticType(node: any, printedText: string): string | undefined;
    goDeclaredParamStaticType(node: any): string | undefined;
    goNilProvenStringDeref(node: any): boolean;
    goDefaultedSafeStringLocal(node: any): boolean;
    goDefaultedSafeStringCall(node: any): boolean;
    goDerefableStringOperand(node: any): boolean;
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
    goConstantProductKind(node: any): string | undefined;
    goNativeConstantProductType(node: any, leftType: string, rightType: string): string | undefined;
    goNativeOperandText(node: any, printedText: string): string;
    goNativeArithmeticType(node: any): string | undefined;
    goNativeArithmetic(node: any, leftText?: any, rightText?: any): {
        goType: string;
        text: string;
    } | undefined;
    goNonNilPointerDivisionText(node: any, leftText: string, rightText: string): string | undefined;
    goPointerNumberIsNonNil(ident: any): boolean;
    goDivisionConsumerIgnoresBox(node: any): boolean;
    goFloatDivisionText(node: any, leftType: string, rightType: string, leftText: string, rightText: string): string;
    goNativeBinaryText(node: any, symbol: string, leftText: string, rightText: string): string;
    goNativeCompoundAssignment(op: any, leftNode: any, leftText: string, rightNode: any, rightText: string): string | undefined;
    goEnclosingFunction(node: any): any;
    goTypeNameIsShadowed(scope: any, goType: string): boolean;
    goIsNativeAppendShape(receiverNode: any, pushNode: any): boolean;
    goNativeAppendReceiver(pushNode: any): string | undefined;
    goLocalIsSafeToType(scope: any, declaration: any, varName: string, goType: string): boolean;
    goSelfConcatWriteIsString(node: any, varName: string): boolean;
    goSelfConcatIsString(node: any, varName: string): boolean;
    goPointerWriteConversion(right: any, goType: string): 'nil' | 'wrap' | undefined;
    goPointerWriteText(node: any, identation: any): string | undefined;
    goSafeDictLocalArgs(initializer: any): {
        container: any;
        key: any;
    };
    goSafeAccessorLocalArgs(initializer: any, accessor: string, fallbackKind: SyntaxKind, fallbackItems: string): {
        container: any;
        key: any;
    };
    goSafeDictUseReadsTheMap(node: any): boolean;
    goSafeDictLocalUnboxCache: Map<any, string>;
    goCachedLocalUnbox(cache: Map<any, string | undefined>, declaration: any, compute: () => string | undefined): string | undefined;
    goSafeDictLocalUnbox(declaration: any): string | undefined;
    goDeclaredLocalTypeIfSafe(declaration: any, goType: string, readsTheValue: (n: any) => boolean, skipUse?: (n: any) => boolean): string | undefined;
    goSafeDictLocalUnboxUncached(declaration: any): string | undefined;
    goSafeDictUnboxValue(declaration: any, identation: number): string | undefined;
    goMarketCallReturnsDict(initializer: any): boolean;
    goMarketLocalUnboxCache: Map<any, string>;
    goMarketLocalUnbox(declaration: any): string | undefined;
    goIdentifierRefersToDeclaration(node: any, declaration: any): boolean;
    goMarketUseReadsTheValue(node: any, throwingAccessor: boolean): boolean;
    goMarketLocalUnboxUncached(declaration: any): string | undefined;
    goMarketUnboxValue(declaration: any, parsedValue: string): string | undefined;
    goDeclarationOfIdentifier(node: any): any;
    goMarketComparisonElementRead(node: any): boolean;
    goIsComparedOperand(node: any): boolean;
    goSafeListLocalArgs(initializer: any): {
        container: any;
        key: any;
    };
    goSafeListUseReadsTheList(node: any): boolean;
    goSafeListLocalUnboxCache: Map<any, string>;
    goSafeListLocalUnbox(declaration: any): string | undefined;
    goSafeListLocalUnboxUncached(declaration: any): string | undefined;
    goSafeListUnboxValue(declaration: any, identation: number): string | undefined;
    getGoLocalType(declaration: any, parsedValue: string): string;
    goLocalSafeVerdicts: WeakMap<object, Map<string, string>>;
    goAwaitReceiveUnbox(awaitNode: any, printedInitializer: string): {
        goType: string;
        wrap: (recv: string) => string;
    } | undefined;
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
    printDynamicCall(node: any, identation: any): string;
    printElementAccessExpressionExceptionIfAny(node: any): string;
    printWrappedUnknownThisProperty(node: any, identation?: number): string;
    transformMethodNameIfNeeded(name: string): string;
    transformCallExpressionName(name: string, nameNode?: any): string;
    transformPropertyAccessExpressionName(name: string, nameNode?: any): string;
    printOutOfOrderCallExpressionIfAny(node: any, identation: any): string;
    goTypeOfHelpers: Map<string, string>;
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
    goNativeParameterTypeCache: Map<any, string>;
    goSameFileCallCache: Map<any, Map<string, any[]>>;
    goTsSrcTreeCache: Map<string, any>;
    goNativeParameterType(param: any): string | undefined;
    goNativeParameterTypeOf(param: any): string | undefined;
    goIsUnifiedStringParameter(methodName: string, index: number): boolean;
    goUnifiedStringCallArgs(node: any, identation: any, flat?: boolean): string | undefined;
    goRequiredStringParameterType(param: any): string | undefined;
    goParameterKeepsNilCompareNative(body: any, param: any, goType: string): boolean;
    goIsProHandlerMethod(fn: any): boolean;
    goParameterTypeIsDict(type: any): boolean;
    goNativeParameterTypeCandidates(param: any, isHandler?: boolean): string[];
    goMethodKeepsBaseSignature(fn: any): boolean;
    goHasTreeCallSite(fn: any): boolean;
    goParameterCallSitesPassType(fn: any, index: number, goType: string): boolean;
    goEnclosingClass(fn: any): any;
    goEnclosingClassName(fn: any): string | undefined;
    goPrintedArgType(arg: any): string | undefined;
    goSameFileCallsOf(fn: any, name: string): Array<any>;
    goTsSrcTree(file: any): any;
    goTsSrcTreeBuild(root: string): {
        callIndex: Map<string, any[]>;
        fileText: Map<string, string>;
        classBases: Map<string, string>;
        relativeOf: Map<string, string>;
    };
    goTsSrcFileDerivesFrom(tree: any, file: string, className: string | undefined): boolean;
    goTextArgMatchesType(argText: string, goType: string, file: string, tree: any): boolean;
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
    printNativeElementAssignment(containerNode: any, containerStr: string, keyNode: any, keyStr: string, valueStr: string, compound?: boolean, valueNode?: any): string | undefined;
    printNativeGuardedPointerKeyAssignment(containerNode: any, containerStr: string, containerType: any, fieldType: any, keyNode: any, keyStr: string, valueStr: string, compound: boolean, valueNode: any): string | undefined;
    goIsNilGuardedStringPointerKey(keyNode: any): boolean;
    goIsFreshUnsharedMapLocal(node: any, writeSite: any): boolean;
    goUseMayPrecede(use: any, writeSite: any, scope: any): boolean;
    goIsNonPointerValue(valueNode: any): boolean;
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
    printInlineBoolBoxTruthy(node: any): string | undefined;
    printInlineBoolPointerTruthy(node: any, printedText: string): string | undefined;
    goIsRepeatSafePointerArgument(node: any): boolean;
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
    goBinaryMemoized<T>(node: any, key: string, compute: () => T): T;
    goBinaryContextKey(): string;
    goPrintBinaryMemoized(node: any, identation: number): string;
    printNode(node: any, identation?: number): string;
    printObjectLiteralExpression(node: any, identation: any): string;
    printCondition(node: any, identation: any): any;
    goDerefComparableWith(ptrNode: any, ptrText: string, otherNode: any): boolean;
    goIsStringLiteralNode(node: any): boolean;
    goDerefRepeatableOperand(node: any, printedText: string): boolean;
    goIsReadOnlyCallArgument(node: any): boolean;
    goIsBareStringOperand(node: any): boolean;
    printInlineEquality(left: any, right: any, leftText: string, rightText: string, isEq: boolean): string | undefined;
    goNativeNumericEqualityKind(left: any, leftText: string, right: any, rightText: string): string | undefined;
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
    goNilGuardFields: {
        [kind: number]: [string, string];
    };
    goHasEnclosingNilGuard(ident: any): boolean;
    goConditionProvesNonNil(condition: any, ident: any): boolean;
    goUnwrapParenthesizedNode(node: any): any;
    goIsPureComparisonOperand(node: any): boolean;
    printParenthesizedExpression(node: any, identation: any): string;
    goIsParenthesizedExpression(printed: string): boolean;
    goSkipGoLiteral(text: string, start: number): number;
    transformPropertyAcessExpressionIfNeeded(node: any): any;
    goGetArgLocalType(body: any, param: any, printedDefault: string): string | undefined;
    goGetArgBaseParamIsUnannotated(param: any): boolean;
    goGetArgNilMapUseOnlyReads(n: any): boolean;
    goGetArgNilStringSliceUseOnlyReads(n: any): boolean;
    goGetArgTypeOfShape(shape: string): string | undefined;
    goGetArgDeclaredTypeCandidates(param: any): string[];
    goGetArgPrimitiveType(declared: string): string | undefined;
    goGetArgTwinName(goType: string): string | undefined;
    goGetArgIsValueType(goType: string): boolean;
    goGetArgLocalIsSafe(body: any, param: any, goType: string, nilable?: boolean): boolean;
    goGetArgConsumersAreSafe(body: any, param: any, goType: string, nilable: boolean): boolean;
    goGetArgArmIsNilGuarded(n: any, cond: any): boolean;
    goGetArgWriteIsNativeArithmetic(rhs: any): boolean;
    goGetArgCopyTarget(use: any, body: any): any;
    goGetArgUsesAreSafe(body: any, param: any, name: string, goType: string, nilable: boolean, seen: Set<any>, boxed?: boolean): boolean;
    goGetArgPointerInHelperArithmetic(n: any): boolean;
    goGetArgPointerStoredAsValue(n: any, param: any): boolean;
    goTupleElementIsDict(right: any, index: number): boolean;
    goParamsTupleHelperIndex(call: any): number;
    goGetArgTupleWriteIsDict(declaration: any, right: any, index: number): boolean;
    goGetArgBindsDictElement(leftElement: any, right: any, index: number): boolean;
    goGetArgParameterType(decl: any): string | undefined;
    goGetArgPositionIsDefaulted(callee: any, argIndex: number): boolean;
    goGetArgPassesIntoContainerDefault(callee: any, argIndex: number): boolean;
    printFunctionBody(node: any, identation: any, wrapInChannel?: boolean): string;
    printAwaitExpression(node: any, identation: any): string;
    printInstanceOfExpression(node: BinaryExpression, identation: number): string;
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
    goNativeStringOperandTexts(operands: any[], texts: string[], expected: string[]): string[] | undefined;
    goUnwrapPrintedAssertions(node: any): any;
    goNativeStringCallOr(node: any, texts: string[], expected: string[], nativeCall: (ops: string[]) => string, helperCall: string, unwrapReceiver?: boolean): string;
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
    goIntIndexExpression(node: any): boolean;
    goIntOperandIdentifier(node: any): boolean;
    goSafeListUnboxIdentifier(node: any): boolean;
    goDeclaredListIdentifier(node: any): boolean;
    goNativeListElementRead(node: any, containerStr: string, keyNode: any, keyStr: string): string | undefined;
    printElementAccessExpression(node: any, identation: any): string;
    isInsideVoidFunction(node: Node): boolean;
    /**
     * Check if a block or statement contains a return statement or throws an error
     */
    hasReturnInBlock(statement: Statement): boolean;
    /**
     * Check if the last statement in a block is a conditional with returns in all branches
     */
    blockEndsWithConditionalReturn(statements: NodeArray<Statement>): boolean;
}

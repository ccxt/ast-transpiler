import { BaseTranspiler } from "./baseTranspiler.js";
import { type BinaryExpression, type BindingElement, type CallExpression, type Declaration, type DeleteExpression, type ElementAccessExpression, type Expression, type Identifier, type MethodDeclaration, type Node, type ParameterDeclaration, type PropertyAccessExpression, type Statement, type VariableDeclaration } from "typescript/unstable/ast";
import { type Symbol as TsSymbol, type Type } from "typescript/unstable/sync";
export declare function isRustTsIndexSource(name: string): boolean;
/** The text of a listed ts/src file; undefined when it vanished between listing and reading, any other error throws. */
export declare function readRustTsIndexSource(file: string): string | undefined;
export type RustDeclaredLocalKind = 'dict';
export interface RustDeclaredDictLocalEntry {
    kind: RustDeclaredLocalKind;
    name: string;
    /** printed callee of the initialiser: a `safe_dict*` name, or `value_map`. */
    source: string;
    alwaysDict: boolean;
    /** no later write in the enclosing function can change the kind (D2). */
    stable: boolean;
    /** use classification: element-access receiver / kind-preserving mutator / anything else. */
    uses: {
        elementAccess: number;
        mutHelper: number;
        other: number;
    };
    declaration: VariableDeclaration;
    start: number;
}
export interface RustParamShadow {
    kind: RustParamShadowKind;
    /** the parameter name; the shadow re-binds it, the `Value` ABI is untouched. */
    name: string;
    declaration: ParameterDeclaration;
}
/** Shadow kinds: `&IndexMap<String, Value>` / `&Vec<Value>`. */
export type RustParamShadowKind = 'map' | 'list';
/** Vocabulary of the parameter-shadow table (`RustTranspiler.rustParamShadowOf`). */
export declare const RUST_PARAM_SHADOWS: {
    MAP: RustParamShadowKind;
    LIST: RustParamShadowKind;
    /** `this.<safe*>` reads inlined natively against a shadowed dict param. */
    SAFE_READS: Set<string>;
};
export declare const RUST_DECLARED_DICT_LOCALS: {
    /** value the resolver answers for a proven Dict local */
    DICT: RustDeclaredLocalKind;
    SAFE_CALLEES: Record<string, number>;
    KIND_PRESERVING_MUTATORS: Set<string>;
};
interface RustScopeIndex {
    nodes: Node[];
    end: number[];
    byName: Map<string, Node[]> | undefined;
    propAccess: Map<string, PropertyAccessExpression[]> | undefined;
}
export type RustDispatchParamKind = 'value' | 'slice' | 'map' | 'strvec' | 'flag' | 'str' | 'optstr' | 'f64' | 'optf64' | 'opti64' | 'i64' | 'optstrvec' | 'strvecvec' | 'params' | 'orderreqs' | 'dict' | 'list' | 'optdict' | 'optlist' | 'optmarket' | 'optcurrency' | 'side' | 'book' | 'vlist' | 'mapref' | 'optmapref' | 'dictrows' | 'client' | 'dictref' | 'mutclient' | 'other';
export type RustDispatchReturnKind = 'optlist' | 'value' | 'void' | 'typed' | 'ostr' | 'oint' | 'keptostr' | 'keptint' | 'keptstr' | 'keptbool' | 'keptobool' | 'keptstruct' | 'int' | 'string' | 'bool' | 'dict' | 'list' | 'optdict' | 'struct' | 'dictpair' | 'other';
export interface RustMethodSignature {
    file: any;
    name: string;
    params: Array<{
        name: string;
        kind: RustDispatchParamKind;
        type: string;
    }>;
    ret: RustDispatchReturnKind;
    returns: string;
}
export declare const rustDispatch: {
    isTyped: (kind: string) => boolean;
    /** Tail of a dynamic-dispatch `args` list as a slice: the whole list, or the tail past index `i`. */
    sliceArg: (i: number) => string;
    /** An owned map copy for a native-map parameter, built on the arm's own line (400-char line budget). */
    mapArg: (i: number) => string;
    /** `args[i]` lowered to the parameter kind of a by-name dispatch arm. */
    arg(kind: string, i: number): string;
    /** `args[i]` for a sync ws handler slot (`Value` / `bool` / list / map / slice), else undefined. */
    wsArg(kind: string, i: number): string | undefined;
    /** The typed parameter `kind` read from the boxed `Value` expression `v` (a `DerivedExchange` slot argument). */
    fromValue(kind: string, v: string): string;
    /** Parameter list of a `DerivedExchange` slot: its `market` and currency arguments (never the first) are lent structs. */
    slotParams: (args: string[]) => string;
    /** The `sign` slot's `path` (every declaration of the override group spells `path: string`) is a lent `&str`. */
    isSlotStr: (arg: string, i: number) => boolean;
    isSlotInt: (arg: string, i: number) => boolean;
    isSlotOptStr: (arg: string, i: number) => boolean;
    isSlotMapRef: (arg: string, i: number) => boolean;
    isSlotOptMapRef: (arg: string, i: number) => boolean;
    /** A slot written `name: type` carries its own parameter type (printed as is); `slotName` is its argument. */
    isSlotTyped: (slot: string) => boolean;
    slotName: (slot: string) => string;
    /** A `&[..]` slot takes the method's optional-argument slice as is. */
    isSlotSlice: (slot: string) => boolean;
    /** A forwarder's argument for an inherent parameter of `kind`: a slot already of that type passes by name. */
    slotArg: (kind: string, arg: string, i: number) => string;
    isSlotMarket: (arg: string, i: number) => boolean;
    isSlotCurrency: (arg: string, i: number) => boolean;
    /** A `DerivedExchange` slot argument handed on in a `&[Value]` tail. */
    slotValue: (arg: string, i: number) => string;
    /** A sync method with a native return still gets a by-name arm (it boxes back inside the arm). */
    isNativeReturn: (ret: string) => boolean;
    /** A typed-return base method (or override): it keeps every arm it had as `-> Value`, sync ws handler arms too. */
    isKeptReturn: (ret: string) => boolean;
    /** Every `args[i]` of a by-name dispatch arm, one conversion per parameter kind. */
    args: (kinds: string[]) => string[];
    /** A typed method's `Result<T>` boxed back to the dispatcher's `Value`. */
    result(call: string, isTyped: boolean | string | undefined): string;
};
export declare class RustTranspiler extends BaseTranspiler {
    private rustScopeIndexes;
    rustScopeIndex(scope: Node): RustScopeIndex;
    rustWalkScope(scope: Node, visit: (n: any) => number | void): void;
    /** Scope nodes that are an identifier or a name-binding declaration spelled `name`, in walk order. */
    rustScopeNameNodes(scope: Node, name: string): Node[];
    /** Property-access nodes in `scope` with property identifier `name`, in walk order. */
    rustScopePropAccesses(scope: Node, name: string): PropertyAccessExpression[];
    private rustMethodReturnsCache;
    /** Direct `ReturnStatement` nodes of `method.body` (excluding nested functions), cached per method. */
    rustMethodReturns(method: any): Node[];
    private rustCheckerNodeMemo;
    private rustSymbolMemo;
    private rustDeclaredNodeMemo;
    private rustDeclOfIdentMemo;
    private rustCalleeDeclMemo;
    private rustTranspiledParamsMemo;
    private rustProducerSlotMemo;
    private rustExactSlotMemo;
    private rustTsDirCache;
    private rustTsFileInfoCache;
    private rustParsedTsFiles;
    /** Cached directory listing + file texts for ts/src index scans; returns null when `dir` cannot be read. */
    rustTsDirFilesOrNull(dir: string): Array<{
        file: string;
        path: string;
        text: string | undefined;
    }> | null;
    rustTsDirFiles(dir: string): Array<{
        file: string;
        path: string;
        text: string | undefined;
    }>;
    /** Cached per-file 4-space method declarations, `.name(` call counts, and quoted identifier names. */
    rustTsFileCallInfo(path: string, text: string): {
        declared4: Set<string>;
        calls: Map<string, number>;
        quoted: Set<string>;
    };
    rustParsedTsSourceFile(api: any, path: string, text: string): any;
    private rustTsFileTextCache;
    rustReadTsFileCached(file: string): string | undefined;
    private rustOverrideGroupHeaderCache;
    /** One-pass per-root map of method name -> parameter-list strings across venue and base Exchange files. */
    rustOverrideGroupCheck(root: string, key: string, name: string, index: number, pred: (declared: string) => boolean): boolean;
    private rustSignGraphCache;
    /** Cached inheritance graph over `root` for `rustSignParamsProofUncached`, avoiding parsing unrelated venues. */
    rustSignParentGraph(root: string, isPred: boolean): {
        files: Set<string>;
        parentOf: Map<string, string | undefined>;
        childrenOf: Map<string, string[]>;
    };
    /** Cycle-safe WeakMap boolean memo (seeds false before running `compute`, catches exceptions to false). */
    rustCachedBool(cache: WeakMap<any, boolean>, node: any, compute: () => boolean): boolean;
    private static readonly RUST_PREFETCH_TYPE_KINDS;
    /** One bulk getTypeAtLocation for the class's nodes of those kinds, seeding the checker memo. */
    rustPrefetchClassTypes(node: Node): void;
    binaryExpressionsWrappers: any;
    methodSignatures: Record<string, {
        requiredCount: number;
    }>;
    forLoopCounter: number;
    rustProHandlerShadowParam: ParameterDeclaration | undefined;
    /** Unified methods printed with a typed public signature (`config.typedUnified`, TS names). */
    rustTypedUnified: Set<string>;
    /** Base methods dispatched to the derived exchange first (snake name -> the `DerivedExchange` slot names). */
    rustVirtualDispatch: Record<string, string[]>;
    /** Virtual base methods whose overrides call `super.X()`: the base body prints as `X_non_virtual`. */
    rustNonVirtualShims: Set<string>;
    /** `DerivedExchange` slots whose first parameter is `impl Into<crate::Value>`: every venue override takes it lent. */
    rustLentSlots: Set<string>;
    /** ccxt error classes with a subclass (`errorHierarchy`): `e instanceof K` on a caught error walks the hierarchy. */
    rustErrorClassesWithSubclasses: Set<string>;
    constructor(config?: {});
    initConfig(): void;
    quotedStringLiteral(text: string): string;
    static readonly RUST_NAME_VALUE_IMPORTS: Set<string>;
    static readonly RUST_NUMBER_CONSTANT_IMPORTS: Set<string>;
    printIdentifier(node: any): string;
    private static readonly RUST_COPY_SCALAR_KINDS;
    rustOwnedUseMark(node: any, text: string): string;
    rustOwnedSelfWrite(node: any): boolean;
    private static readonly RUST_HOISTING_WORDS;
    rustUnderHoistedCall(node: any): boolean;
    /** A by-value argument of a call (the box is handed over whole). */
    rustOwnedHandOff(node: any): boolean;
    rustOwnedInReceiverChain(node: any): boolean;
    rustOwnedUseIsFree(node: any, element?: boolean): boolean;
    /** A bare read of an imported (or top-level destructured) binding: never a callee, member, key or `new` target. */
    rustIsImportedValueName(node: any): boolean;
    printStringLiteral(node: any): any;
    printNumericLiteral(node: any): string;
    printBooleanLiteral(node: any): string;
    printNullKeyword(node: any, identation: any): string;
    private static readonly BOOL_PRODUCING_OPERATORS;
    private static readonly BOOL_PRODUCING_CALLS;
    private static readonly RUST_NATIVE_INSERT_RECEIVERS;
    private static readonly RUST_ORDERBOOK_META_FIELDS;
    private static readonly RUST_ORDERBOOK_READ_FIELDS;
    private static readonly RUST_ORDERBOOK_CLASSES;
    private static readonly RUST_BOOK_META_KEYS;
    private static readonly RUST_TAGGED_HANDLE_FIELDS;
    private static readonly RUST_PLAIN_DICT_FIELDS;
    private static readonly RUST_BOOL_VALUE_HELPERS;
    private static readonly PAYLOAD_ACCESSORS;
    primitiveKindOfType(type: any): string;
    /** `true` / `false` / `boolean` (a union of BooleanLiteral members too). */
    isBooleanValueType(type: Type | undefined): boolean;
    isBooleanOrUndefinedType(type: Type | undefined): boolean;
    isBooleanValueFamilyOperand(node: any): boolean;
    /** Declarations `printVariableDeclarationList` emitted as `let mut x: bool`. */
    private rustBoolDeclaredLocals;
    isBooleanValueIdentifier(node: any): boolean;
    rustDeclarationPrintsNativeBool(declaration: any): boolean;
    isBareBoolEmissionSafe(node: any): boolean;
    /** Outermost ancestor reached through parens, `!` and `&&`/`||`. */
    rustClimbLogicalWrappers(node: any): any;
    rustConditionBoolSlot(node: any): boolean;
    private rustOptBoolChainPending;
    /** ral-ua: a local initialised by an optional-bool chain whose every read is a condition / bool-printed slot is `bool`. */
    rustOptBoolChainLocal(declaration: any): boolean;
    /** ral-ua: every read of an optional-bool chain local is a condition or sits in another bool-printed slot. */
    rustOptBoolChainUsesOk(declaration: any): boolean;
    rustOptBoolChain(node: any): boolean;
    /** Native truthiness text of the operand, or undefined to keep `is_true`. */
    printNativeTruthiness(node: any): string | undefined;
    printNativeIdentifierTruthiness(node: any): string | undefined;
    rustBoolLiteralOnlyLocal(node: any): boolean;
    rustBoolLiteralLogicalStore(node: any): boolean;
    literalKindOfNode(node: any): string;
    printsValueExpression(node: any): boolean;
    callExpressionName(node: any): string;
    textCoercesToNumber(text: string): boolean;
    numericLiteralF64Text(node: any): string;
    rustReadPrintsValue(node: any): boolean;
    rustBooleanComparableType(type: any): boolean;
    printNativeEqualityComparison(left: any, right: any, op: any): string;
    typeOfNodeIfAny(node: Node): Type | undefined;
    isValueLengthType(type: Type | undefined): boolean;
    printArrayLength(node: any, identation: any, leftExpr?: any): any;
    private rustNativeLengths;
    printNativeLength(node: any, place: string): string;
    rustIsOrderBookSide(node: Node, depth?: number): boolean;
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
    isDictShapedType(type: Type | undefined): boolean;
    printNativeInOperator(key: any, obj: any): string;
    rustStringLiteralOf(printedKey: string): string | undefined;
    printNativeBookMetaWrite(baseExpr: any, keyNode: any, keyText: any, valueText: any): string | undefined;
    rustReadsOrderbooksStore(ident: any): boolean;
    printNativeDictInsert(baseExpr: any, keyNode: any, keyText: any, valueText: any): string | undefined;
    rustNativeInsertKeyArg(receiver: any, keyNode: any, keyText: string): string | undefined;
    nestedDictWrite(baseExpr: any, keyNodes: any[], keyTexts: string[], valueText: string, fallbackText: string): string | undefined;
    entryKeyArg(receiver: any, keyNode: any, keyText: string): string | undefined;
    rustNativeInsertReceiver(expr: any): {
        text: string;
        isField: boolean;
        plain: boolean;
        nameNode: any;
    } | undefined;
    rustInsertIdentifierReceiver(ident: any): boolean | undefined;
    rustDeclaredInitIsTagFree(declaration: VariableDeclaration): boolean;
    /** Skip `( … )`, `x!` and `x as T` wrappers. */
    rustStripWrappers(node: any): any;
    rustLocalInitReadsTaggedContainer(ident: Identifier): boolean;
    static readonly RUST_TAGGED_CONTAINER_FIELDS: Set<string>;
    rustInsertReceiverBuildsPlainDict(declaration: VariableDeclaration): boolean;
    rustPlainFieldRowLocal(declaration: VariableDeclaration): boolean;
    rustDeclaredFreshDictLocal(declaration: VariableDeclaration): boolean;
    rustFreshDictInsertReceiver(ident: any, keyNode: any): {
        text: string;
        isField: boolean;
        plain: boolean;
        nameNode: any;
    } | undefined;
    static readonly RUST_FRESH_DICT_COPIES: Set<string>;
    rustFreshDictProducer(node: any): boolean;
    rustPlainDictLiteral(node: Node | undefined): boolean;
    rustHandlerTupleCall(node: Node | undefined): boolean;
    private rustTypeIsUndefinedish;
    rustSingleLocalDeclaration(ident: Identifier): VariableDeclaration | ParameterDeclaration | undefined;
    rustWriteDictShape(type: any): boolean;
    rustReceiverStaysDict(baseExpr: any, receiver: any): boolean;
    rustFieldStaysDict(baseExpr: any, fieldName: string): boolean;
    rustParamStaysPlainDict(declaration: ParameterDeclaration): boolean;
    /** RHS of a write to a plain-dict parameter that keeps the shape. */
    rustPlainDictPreservingRhs(node: Node, name: string): boolean;
    rustPrintedBoolArg(raw: string): boolean;
    foldNegateLiteral(operandText: string): string | undefined;
    ensureRef(expr: string): string;
    isNumberTyped(node: any): boolean;
    isBooleanPosition(node: any): boolean;
    private rustNativeCompares;
    printNativeNumericComparison(node: any, operator: any, leftText: any, rightText: any): string;
    rustNumericOperandKind(node: any): string | undefined;
    orderedComparisonOperand(node: any): any;
    printNativeOrderedComparison(node: any, op: any, left: any, right: any): string | undefined;
    /** True when the operands prove the helper's answer, so the comparison runs on `as_f64` unwraps. */
    rustOrderedOperandsProven(op: any, left: any, right: any): boolean;
    printNativeIndexOfLiteralTest(node: any, op: any, left: any, right: any): string | undefined;
    nativeIndexOfLiteralTestText(op: any, left: any, right: any): string | undefined;
    rustTypeFlagsAll(type: any, flags: Set<number>): boolean;
    isNumberLikeType(type: any): boolean;
    isStringLikeType(type: any): boolean;
    private static readonly RUST_CONCAT_SAFE_FLAGS;
    isStringOrNullishType(type: any): boolean;
    isNativeStringConcatPair(leftType: any, rightType: any): boolean;
    printNativeAssignmentArithmetic(op: any, left: any, right: any, leftText: any, rightText: any): string | undefined;
    printNativeArithmetic(op: any, left: any, right: any, leftText: any, rightText: any): string | undefined;
    rustConcatLiteralText(node: any, text: string, other: any): string;
    rustFormatConcatText(leftText: string, rightText: string): string;
    private rustFormatPrints;
    /** The `+` node (or the `+=` node) printed the native concat arm: record its unboxed `format!` and return the box. */
    rustRecordFormatConcat(node: any, leftText: string, rightText: string): string;
    /** A `.toString()` call printed as a whole `Value::Str(format!("{}", x).into())`: record the `format!` and return the box. */
    rustRecordFormatToString(node: any, name: string): string;
    rustUnboxedFormatOf(node: any): string | undefined;
    printNativeNumeric(op: any, leftText: string, rightText: string): string;
    private static readonly RUST_TYPEOF_HELPERS;
    printCustomBinaryExpressionIfAny(node: any, identation: any): string;
    printBinaryExpression(node: any, identation: any): any;
    /** The boxed own-container call converted straight back (`Value::Dict(c).into_dict()`) is the call `c` itself. */
    rustOwnContainerUnwrap(init: any, text: string): string;
    printDateNowCall(node: any, identation: any): string;
    printPadStartCall(node: any, identation: any, name: any, parsedArg: any, parsedArg2: any): string;
    printPadEndCall(node: any, identation: any, name: any, parsedArg: any, parsedArg2: any): string;
    printVariableDeclarationList(node: any, identation: any): any;
    printVariableDeclarationListInner(node: any, identation: any): any;
    printRust57eSideLevel(declaration: any, parsedValue: string, indent: string, varName: string): string | undefined;
    /** `const parts = lvl[K]` off a ral-57e side level: printed as a `&Value` borrow, which is `Copy` (no clone to hand it on). */
    rust57eSidePartLocal(declaration: any): boolean;
    rustDictRowReaderText(declaration: any, read: string): string | undefined;
    printRust58eBorrowedElement(declaration: any, indent: string, varName: string): string | undefined;
    /** Which arm of printNativeContainerAccess prints `xs[k]` as a slice read: a read-only list bearer, or a typed Vec local. */
    rust58eBorrowedElementArm(declaration: any): 'bearer' | 'vec' | undefined;
    private rust57eSideLevels;
    rust57eSideLevelLocal(declaration: any): boolean;
    rust57eSideLevelLocalUncached(declaration: any): boolean;
    /** `const e = x[k]` (one const declarator, identifier receiver, same function). */
    rust57eConstElementOf(declaration: any): boolean;
    /** Every use of the local is the receiver of an rvalue element read at a numeric literal key (no write-back bind). */
    rust57eLiteralReadOnly(declaration: any, safeStringArg?: boolean): boolean;
    /** `n` is the first argument of `this.safeString (n, K)` / `this.safeString (n, K, d)` with K a non-negative integer literal. */
    rust57eSafeStringLiteralRead(n: any): boolean;
    private static readonly RUST_NIL_INT_HELPERS;
    private static readonly RUST_NIL_BOOL_HELPERS;
    private static readonly RUST_NIL_PRECISE_STR;
    private rustNilLocalDecisions;
    /** `'str' | 'int' | 'bool'` when the nil-declared local prints `Option<..>`, else undefined. */
    rustNilLocalKind(declaration: any): string | undefined;
    private rustNilCandidateNames;
    private rustNilDeciding;
    private rustNilBoolAssumed;
    rustNilBoolTarget(target: any): boolean;
    rustNilLocalOfIdentifier(node: any): {
        declaration: any;
        kind: string;
    } | undefined;
    rustNilLocalKindUncached(declaration: any): string | undefined;
    rustSiblingStrBoxesMove(declaration: any, scope: any): boolean;
    /** Static kind of a write's right-hand side: `null`, or the `Option` payload it yields exactly. */
    rustNilWriteKind(rhs: any): string | undefined;
    rust90rhMarketFieldPartner(partner: Node | undefined, kind: string): string | undefined;
    rust90rhValueIndexOf(expr: Node | undefined): boolean;
    rust90rhOintShiftBound(expr: Node | undefined): {
        name: string;
        text: string;
    } | undefined;
    /** ral-90rh R1: a declaration initializer `parseInt (s)` (one bare identifier argument, checker type `string`; no multiply form). */
    rust90rhParseIntInit(expr: Node | undefined): boolean;
    /** ral-68b: `parseInt (s)` with one argument whose checker type is `string`, or that call times an integer literal. */
    rust68bParseIntWrite(expr: any): boolean;
    /** za: a ternary whose arms are an `undefined` and a boolean literal (either order). */
    rustNilBoolNullTernary(expr: any): boolean;
    /** A boolean that is never undefined: `!x`, a ternary of boolean literals, or `&&` / `||` / parens over such operands. */
    rustNilDefiniteBool(expr: any): boolean;
    /** `if <cond> { true } else { false }` for a ternary of boolean literals. */
    printRustNilBoolTernary(node: any): string | undefined;
    rustNilSelfHelperName(call: any): string | undefined;
    /** Integer literal text (`5`, `-5`), else undefined. */
    rustNilIntLiteral(node: any): string | undefined;
    rustNilReadForm(n: any, kind: string): string | undefined;
    rust68bNilIntTypedArg(call: any, n: any): boolean;
    /** rb: `y = !x;` as a whole statement, where `y` is another nil local typed `Option<bool>` (decided first; a cycle stays boxed). */
    rustNilNegatedBoolWrite(n: any): boolean;
    /** Box reads go only into plain `Value` slots: no `&mut` receivers, no native-typed callee slots. */
    rustNilBoxCallOk(call: any, at: number): boolean;
    /** Native text of `x == <literal>` for a typed nil local of `kind`; undefined when not exact. */
    rustNilLiteralTest(kind: string, other: any): string | undefined;
    /** Equality hook: `x.is_none()`, `x.as_deref() == Some("lit")`, `x == Some(5)`. */
    printRustNilLocalEquality(left: any, right: any, op: any): string | undefined;
    /** Condition hook: a bool nil local is truthy exactly when it holds `Some(true)`. */
    printRustNilLocalCondition(node: any): string | undefined;
    /** Identifier hook: a box read converts with the standard `From` impls. */
    printRustNilLocalRead(node: any): string | undefined;
    private static readonly RUST_NIL_SCALAR_NATIVE_FORMS;
    /** `ostr|oint|onum` for an empty local the scalar rule types, else undefined. */
    rustNilScalarKind(declaration: any): string | undefined;
    rust64pSelfMinTernaryKind(rhs: any, declaration: any): string | undefined;
    /** ral-65p: `-x` (prefix minus) where x is a scalar local the solver types `int` / `oint`: its kind and printed name. */
    rust65pNegatedIntLocal(node: any): {
        kind: string;
        name: string;
    } | undefined;
    rust65pSelfMinOperand(n: any): boolean;
    rust64pConstArithKind(node: any): string | undefined;
    rust67bBoolLogicalWrite(expr: any): boolean;
    /** ral-47d: `rhs` names another nil-declared (`let y: Str = undefined`) string local of the same function. */
    rustNilStrPartner(rhs: any, declaration: any, scope: any): boolean;
    /** ral-45b: the local has a `x = x.slice(..)` / case self write or a `x += ..` append (the forms lift 1 / 2 admit). */
    rust45bUsesNewForm(declaration: any, scope: any, name: string): boolean;
    /** ral-45b: `return x;` of the local in a method whose declared return is a string type. */
    rust45bReturnedFromStrMethod(declaration: any, scope: any, name: string): boolean;
    rust45bSelfStrWrite(rhs: any, declaration: any): boolean;
    /** za: kind of the scalar arm of `c ? <scalar> : x` / `c ? x : <scalar>` where the other arm is the written local itself. */
    rustNilSelfArmTernaryKind(rhs: any, declaration: any): string | undefined;
    rustNilScalarHandOff(declaration: any, scope: any, kind: string, boxed: any[]): boolean;
    private rustNilStrLentLocals;
    /** ral-ld: `m[k] = x` / `m.k = x` as a statement on a plain identifier receiver (not `x` itself), one level deep. */
    rustNilStrStoreBox(n: any): boolean;
    private rustNilAliasMoves;
    rustNilAliasMove(rhs: any, kind: string): boolean;
    rustScalarAliasMove(n: any, kind: string, declaration: any): boolean;
    rustScalarAliasCopy(n: any, kind: string, declaration: any): boolean;
    /** nc: a string slot unwrap (`.as_str().map(str::to_owned)`) would take its destructure line from within to over 400 chars. */
    rustNilSlotLineOverBudget(n: any): boolean;
    /** nc: the whole source of a `let t = n` / `t = n;` statement at the source's last use. */
    rustScalarAliasMoveSite(n: any, declaration: any): boolean;
    rustScalarTernaryArmMoveSite(n: any, declaration: any): boolean;
    rustNilLiveAliasCopy(rhs: any, kind: string): boolean;
    rustNilStrLendSites(declaration: any): boolean;
    rustNilConcatPartner(other: any): boolean;
    rustNilOptStrConcatUse(n: any): boolean;
    /** ral-56x K1: `return x` of a literal-seeded string local (never a parameter alias) in a `-> Option<String>` method. */
    rust56xStrReturnLocal(n: any, fn: any): boolean;
    rust90bStrConcatInit(node: Node): boolean;
    rust61xNilStrReturnLocal(n: any, fn: any): boolean;
    private rust76aS1Off;
    rust76aOptStrReturnLocal(n: any, fn: any): boolean;
    /** ral-76a S1: the method prints `-> Option<String>` only because a return is its own reader local (rust76aOptStrReturnLocal). */
    rust76aOptStrReturnMethod(fn: any): boolean;
    rust56xStrReturnText(exp: any, fn: any): string | undefined;
    rust56xFormatPartner(other: any): boolean;
    /** The `as_deref().unwrap_or("null")` read of a concat operand keeps its statement within the 400-char line budget. */
    rustOptStrConcatFits(n: any): boolean;
    /** ral-90rc R2: `let x: Str = undefined` (or `: string`), a plain one-declarator `let` statement inside a function. */
    rust90rcNilStrDecl(declaration: VariableDeclaration): boolean;
    /** A write that decodes a `Value` result (a call, or a ternary over one). */
    rustNilDecodedWrite(rhs: any): boolean;
    /** `[ x, .. ] = <list>` as its own statement: `x` is written from a tuple slot. */
    rustNilSlotWrite(n: any): boolean;
    /** Slot hook: an `Option<String>` local takes the slot's string. */
    printRustNilSlotWrite(element: any, read: string, strRead?: string, boolRead?: string): string | undefined;
    /** Declaration hook: `let mut x: Option<..> = None` for an empty scalar local. */
    printRustNilScalarDeclaration(declaration: any, varName: string, indent: string): string | undefined;
    /** Assignment hook: `x = <rhs>` with the right-hand side unwrapped to the local's payload. */
    printRustNilLocalWrite(left: any, right: any): string | undefined;
    private static readonly RUST_BOOL_RESULT_HELPERS;
    private static readonly RUST_BOOL_RESULT_CALLEES;
    rustCallPrintsBool(node: any): boolean;
    private rustSkipStringLiteral;
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
    private rustLocalUsesAll;
    rustOwnMethodName(n: any, scope: any): boolean;
    private rustOwnNameSkip;
    /** ral-52i: set only while the built-list rule walks its uses. */
    private rustDisjointShadowSkip;
    private rustDisjointShadowSeen;
    private rustBuiltListCopiedElement;
    /** ral-52i: `other` (a variable declaration) and `declaration` sit in two blocks of one function, neither inside the other. */
    rustDisjointBinding(other: any, declaration: any): boolean;
    rustLocalUsesAcceptBool(declaration: any, sourceName: string): boolean;
    /** `return x` in a method the typed-return table prints `-> bool`: the local is that return as is. */
    rustBoolTypedReturnUse(n: Node): boolean;
    private rustBoolParamDecisions;
    rustParamPrintsBool(param: any): boolean;
    rustParamPrintsBoolUncached(param: any): boolean;
    /** True when `this.<name>` is read as a value (not called) in the method's own file. */
    rustMethodReferencedAsValue(method: any): boolean;
    private rustValueReferencedMethods;
    rustValueReferenceCensus(file: any): Set<string>;
    private static readonly RUST_EXCHANGE_FIELD_KINDS;
    static rustIsBaseExchangeFile(name: string): boolean;
    /** The base `Exchange` / `BaseExchange` class of ts/src/base/Exchange.ts (or a union with undefined). */
    rustIsBaseExchangeClassType(type: Type | undefined): boolean;
    /** A parameter of a base method annotated as the base exchange class whose every use is a read of a known struct field. */
    rustExchangeParam(param: any): boolean;
    /** `p.f` / `p['f']` on a base-exchange parameter: the receiver text and the field kind, else undefined. */
    rustExchangeParamFieldOf(node: any): {
        field: string;
        kind: string;
        receiver: string;
    } | undefined;
    /** The field info when `node` reads a field of a parameter printed as `&crate::exchange::Exchange`. */
    rustExchangeParamRead(node: any): {
        field: string;
        kind: string;
        receiver: string;
    } | undefined;
    /** A value read of a base-exchange parameter field: the struct field boxed once (a dict / list shares its handle). */
    printExchangeParamFieldRead(node: any): string | undefined;
    /** `p.options[k]` on a base-exchange parameter: the dict entry by the key's text, `Null` when missing. */
    printExchangeParamDictEntry(node: any): string | undefined;
    /** `p.f === undefined` and `this.f = p.f` on a base-exchange parameter field: the native test / copy. */
    printExchangeParamFieldOp(node: any): string | undefined;
    /** Native type text of a parameter in the emitted signature. */
    rustParamType(param: any): string;
    rustBoolParamUseAccepted(node: any): boolean;
    rustOptionalBoolArgumentSlot(call: any, params: any, at: number): boolean;
    rustOptionalBoolArgLocal(a: any): boolean;
    private rustMarketFlagBoolDecisions;
    rustMarketFlagBoolLocal(declaration: any): boolean;
    rustMarketFlagText(right: any): string | undefined;
    rustMarketBoolFlagRead(receiver: any): string | undefined;
    rustMarketFlagBoolLocalUncached(declaration: any): boolean;
    /** `x = m['contract']` / `x = true` into a `rustMarketFlagBoolLocal`. */
    printMarketFlagBoolWrite(left: any, right: any): string | undefined;
    rustOptionalBoolSlotArgText(call: any, params: any, at: number, a: any): string;
    /** Parameter declarations of a call's resolved callee, when the checker has them. */
    rustCalleeParams(call: any): any[] | undefined;
    /** `bool` text for an argument in a native-`bool` parameter slot. */
    rustBoolArgumentText(node: any, identation: any): string;
    /** True when the call's `at`-th argument lands in a required native-`bool` slot. */
    rustNativeBoolArgumentSlot(params: any, at: number): boolean;
    /** Argument shapes the printer already emits as a Rust `bool`. */
    rustNativeBoolArgumentText(node: any): string | undefined;
    rustDeclaredNode(node: any): Node | undefined;
    /** Condition text for a bare identifier of native-`bool` type, else undefined. */
    printNativeBoolParamCondition(node: any): string | undefined;
    private rustMapParamDecisions;
    private rustStrVecParamDecisions;
    rustParamPrintsStrVec(param: any): boolean;
    rustStrVecParamUncached(param: any): boolean;
    /** Every call site resolving to `method` passes an array literal of plain `Value` identifiers (none is fine: the dispatcher converts). */
    rustStrVecCallSitesOk(method: any, index: number): boolean;
    rustStrVecArgumentOk(arg: any): boolean;
    /** A plain `Value` local (not a param, not a typed container): `x.to_str_vec()` converts it. */
    rustStrVecValueLocal(node: any): boolean;
    rustNativeStrVecArgumentSlot(params: any, at: number): boolean;
    /** `vec![a.to_string(), ..]` for an array literal landing in a `Vec<String>` slot. */
    rustStrVecArgumentText(node: any, identation: any): string;
    printStrVecParamJoin(node: any): string | undefined;
    rustParamPrintsMap(param: any): boolean;
    rustMapParamIsTypedUncached(param: any): boolean;
    rustMapParamBodyUsesOk(param: any): boolean;
    rustMapParamUseKind(node: any): string | undefined;
    rustDictWriteValue(node: any): boolean;
    rustMapParamBoxes(node: any): boolean;
    /** A parameter printed as a native map, or undefined. */
    rustMapParamDeclaration(node: any): any | undefined;
    /** The `at`-th argument of a call lands in a native-map parameter slot. */
    rustNativeMapArgumentSlot(params: any, at: number): any | undefined;
    /** `&mut <bearer>` for a map slot; every call site is proven a bearer. */
    rustMapArgumentText(node: any, identation: any): string;
    rustMapArgumentIsBearer(node: any): boolean;
    /** Program-wide call sites of `method`: every one passes a bearer in the slot. */
    rustMapParamCallSitesOk(method: any, index: number): boolean;
    rustDeclarationKey(node: any): string;
    private rustCallSitesCache;
    rustCallSitesForName(name: string): any[];
    rustMapParamDictInsert(baseExpr: any, keyNode: any, keyText: string, valueText: string): string | undefined;
    private rustStringMethodLocalDecisions;
    /** The native initializer text of a string-method local, else undefined. */
    rustStringMethodLocalInit(declaration: any): string | undefined;
    rustStringMethodLocalIsTyped(declaration: any): boolean;
    rustStringMethodLocalBoxUse(n: any): boolean;
    private static readonly RUST_STRING_LOCAL_HELPERS;
    private rustStringLocalDecisions;
    rustSafeStringLocalInitializer(declaration: any): boolean;
    rustStringLocalUseIsNative(node: any): boolean;
    rustSafeStringLocalIsTyped(declaration: any): boolean;
    rustSignApiStringLocalIsTyped(declaration: any): boolean;
    rustSafeStringLocalIsTypedUncached(declaration: any): boolean;
    private static readonly RUST_SIGN_API_METHODS;
    /** The `api: string[]` / `section: string[]` parameter (position 1) of sign/fetch2/request an identifier names. */
    rustSignApiParam(node: any): ParameterDeclaration | undefined;
    /** `api[N]` on a shadowed sign-api parameter: the element read the shadow prints as `api.get(N)`. */
    rustSignApiElementInit(declaration: any): {
        receiver: string;
        index: number;
    } | undefined;
    rustIdentifierIsPropertyName(node: any): boolean;
    rustStringLocalIdentifierIsTyped(node: any): boolean;
    getRustBoolLocalInitializer(declaration: any, printedValue: string): string | undefined;
    rustBoolMemberSource(init: any): boolean;
    /** An identifier read of a local the member rule above declares `bool`. */
    rustBoolMemberLocal(node: any): boolean;
    rustBoolMemberText(printed: string): string;
    private static readonly RUST_SCALAR_INT_HELPERS;
    private static readonly RUST_SCALAR_NUM_HELPERS;
    private static readonly RUST_SCALAR_BOOL_HELPERS;
    private static readonly RUST_SCALAR_TYPES;
    private rustScalarDecisions;
    private rustScalarCandidates;
    private rustScalarUseForms;
    private rustScalarSolved;
    private rustScalarSolving;
    private rustScalarSeeding;
    private rustScalarVetoed;
    private rustScalarGuarded;
    /** The Rust kind (`ostr|oint|onum|str|int|num|bool`) a scalar local is declared with, else undefined. */
    rustScalarLocalKind(declaration: any): string | undefined;
    rustScalarSolveScope(scope: any): void;
    /** ya: the scope whose settled decisions an alias write may read (phase 2 of `rustScalarSolveScope`). */
    private rustScalarAliasScope;
    private rustScalarAliasTarget;
    private rustScalarAliasJournal;
    rustScalarAliasPhase(scope: any, candidates: any[]): void;
    /** ral-54s: `let x: T;` (one declarator, no initializer, a declared type) inside a function body. */
    rustBareTypedLet(n: any): boolean;
    /** ya: a nil local with at least one `x = y;` write whose `y` is an initialised local (cheap pre-filter). */
    rustScalarAliasCandidate(declaration: any): boolean;
    rustScalarTry(declaration: any): string | null;
    /** The scalar local an identifier reads (never its own declaration name). */
    rustScalarLocalOf(node: any): {
        declaration: any;
        kind: string;
    } | undefined;
    /** Syntactic pre-filter: a literal, a `+` chain, or a `this.safe<Scalar>(..)` call. */
    rustScalarInitShape(init: any): boolean;
    /** True for test sources: their helpers take every argument as a `Value`, so a local typed there must earn a native use. */
    rustTestTierSource(node: any): boolean;
    /** `this`, or in a test source an identifier typed as the base `Exchange` class (it resolves to the base readers). */
    rustScalarReceiver(node: any): boolean;
    /** String hand-off locals boxed more than once: each box before the last lends the string. */
    private rustStrLentLocals;
    /** md: market-field strings lent at their boxes (guarded by their printed name: `type` prints `type_var`). */
    private rustMarketLentLocals;
    /** ral-70f: ral-70f reader locals whose last use walk accepted every use (rustScalarLocalKindCore). */
    private rust70fWalkOk;
    /** ral-90re R1: locals whose use walk took a pushed `parseNumber` pair box only through rust90reParsedPairElement. */
    private rust90rePairAdmitted;
    rustScalarLocalKindUncached(declaration: any): string | undefined;
    rustScalarLocalKindCore(declaration: any): string | undefined;
    rustAnyBoolTestedLocal(declaration: any): boolean;
    private rustStrNoLend;
    rustStrLendOnly(declaration: any): boolean;
    /** sc: the initializer is a call of another `this.` method (sync or awaited) that the scalar seed typed as a string */
    rustScOwnSelfCall(init: any): boolean;
    rustStrLendSites(declaration: any): boolean;
    rustReaderLendBoxes(declaration: any, nativeKeys?: boolean, preciseSlots?: boolean, copyDecls?: boolean): boolean;
    rustTestLendBoxes(declaration: any): boolean;
    /** `String` locals that key a proven map read through the plain lend rule (rustScalarUseFormOwn). */
    rustLentStrKeyLocals: Set<any>;
    /** Some insert-key (`key`) use of the local is not its last use, so a `String` key would be cloned there. */
    rustStrKeyInsertCopies(declaration: any): boolean;
    /** The key reads a local declared with a non-null initializer (nil-declared locals and slots keep their own rules). */
    rustInitKeyLocal(n: any): boolean;
    /** Some use of the local is a native map-key read (`okey`) or `in` test (`kin`). */
    rustScalarKeyedLocal(declaration: any): boolean;
    rust66s3VenueStrReturnedWhole(declaration: any, scope: any): boolean;
    /** The string-return veto of the hand-off rules, less the ral-66s3 returned-whole venue results. */
    rust66s3StrReturnedVeto(declaration: any, scope: any): boolean;
    /** ral-66s3: `x` read in a `return x` of the method owning a returned-whole venue `Str` local. */
    rust66s3ReturnedWholeRead(n: any): boolean;
    /** A local some `return` of a method with a declared string return hands back as-is. */
    rustStrReturnedLocal(declaration: any, scope: any): boolean;
    rust76fSourceMethodWrite(declaration: any, scope: any): boolean;
    rustParamAliasSeedKind(declaration: any): string | undefined;
    rustLimitCall(expr: any): boolean;
    rustLimitArgUse(n: any, kind: string): boolean;
    rustLimitArgText(arg: any, at: number): string;
    rustLimitCallText(expr: any): string | undefined;
    /** Integer literal text (`5`, `-5`) that fits an `i64`, else undefined. */
    rustScalarIntLiteral(node: any): string | undefined;
    /** Decimal float literal text (`1.5`, `-0.25`, `1e8`), else undefined. */
    rustScalarFloatLiteral(node: any): string | undefined;
    rustScalarValueKind(expr: any, fresh: boolean): string | undefined;
    rustSupportedMappingStr(expr: any): boolean;
    /** ral-62p: `this.handleOption (m, o, d) as Bool` (or `as boolean`) on the base handleOption. */
    rust62pBoolCastOption(node: any): boolean;
    rustHandleOptionLiteralKind(expr: any): string | undefined;
    private static readonly RUST_BASE_SCALAR_RETURNS;
    rustParseNumberOfString(call: any): boolean;
    private static readonly RUST_BASE_STR_FIELDS;
    /** ral-52k: `this.<field>` of the table whose declaration is the base-tier `string` property (no venue redeclares it). */
    /** ral-84h R1: the arm is a base `Str` parameter accepted by rust65nBaseStrParamArm through its `= undefined` / string-literal default. */
    rust84hDefaultedStrParamArm(node: Node): boolean;
    rust65nBaseStrParamArm(node: any): boolean;
    rustBaseStrFieldRead(node: any): boolean;
    /** ral-53k: a ternary whose arms are each a checker-typed string or a unified string key of an `Option<Dict>` local (one at least). */
    rustOptDictStrKeyTernary(init: any): boolean;
    rustOptDictStrKeyText(node: any): string | undefined;
    rust87rhValueMarketParam(node: Node): ParameterDeclaration | undefined;
    rust84eOptRecordRecv(recv: Node): boolean;
    /** ral-84e: a ternary initializer with an arm `r['k']` read off such a record (rust84eOptRecordRecv). */
    rust84eRecordArmTernary(init: Node): boolean;
    /** True when `node` (through parens) is the `whenTrue`/`whenFalse` arm of a ternary that initialises a declaration. */
    rustTernaryArm(node: any): boolean;
    /** `node` (through parens and ternary arms) is a variable declaration's initializer. */
    rustDeclInitPosition(node: any): boolean;
    rustValueCaseRecv(call: any): string | undefined;
    rustReaderCaseStrRecv(call: any): any;
    /** The initializer, or one of its ternary arms, is a `rustValueCaseRecv` conversion. */
    rustValueCaseInit(init: any): boolean;
    rustBaseReturnScalarKind(call: any, name: string): string | undefined;
    private static readonly RUST_STR_RUNTIME_METHODS;
    private static readonly RUST_STR_RUNTIME_APPEND_VETO;
    private static readonly RUST_STR_RUNTIME_FREE;
    /** A call of an imported base function (`ts/src/base/functions/`) named in `names`. */
    rustFreeSignerCall(node: any, names: Set<string>): boolean;
    private rustStrRuntimeBare;
    /** `this.implodeParams(..)` / `this.intToBase16(..)` resolved to the base tier with a non-null `string` return. */
    rustStrRuntimeCall(node: any): boolean;
    /** A base `Exchange` property bound to an imported encoder (`binaryToBase16 = binaryToBase16`, `@scure/base` underneath). */
    rustBaseBoundHelper(node: any): boolean;
    rustStrRuntimeTestCall(node: any): boolean;
    /** The bare `String` call text (no box), for typed string locals and `format!` operands. */
    rustStrRuntimeBareText(node: any, identation?: number): string;
    /** A `+` / `+=` operand the printer joins with `format!` (or a typed `String` push), where `Display` takes the `String` as-is. */
    rustStrRuntimeFormatOperand(node: any): boolean;
    /** A local seeded from such a call is not appended onto another local (that write would retype the other one). */
    rustStrRuntimeLocalCostly(declaration: any): boolean;
    rust84bAppendTargetString(parent: any): boolean;
    /** Call hook: the `String` result is boxed once (`Value::from`) wherever a `Value` is expected. */
    printRustStrRuntimeCall(node: any, identation: any): string | undefined;
    private static readonly RUST_BASE_TYPED_METHODS;
    private static readonly RUST_BASE_TYPED_RUNTIME;
    private static readonly RUST_BASE_TYPED_HAND_METHODS;
    private rustBaseTypedBare;
    /** The native kind a method declaration returns under the table, else undefined. */
    rustMethodTypedReturnKind(node: any): string | undefined;
    /** The scalar kind of rustBaseTypedReturnKindAll (an `odict` call is no scalar). */
    rustBaseTypedReturnKind(expr: any): string | undefined;
    /** `x.m(..)` whose member resolves to a table method of the base tier (or a typed override of one). */
    rustBaseTypedReturnKindAll(expr: any): string | undefined;
    /** pg: a call of a precision formatter of the typed-return table (`-> Option<String>`); its locals carry the venue copy veto. */
    rustPrecisionCall(expr: any): boolean;
    /** pg: the local is written from a precision formatter, or returned by one of the typed precision methods. */
    rustPrecisionTouched(declaration: any, scope: any): boolean;
    /** pg: a later whole write of the local is a precision-formatter call (the 400-char guard watches such locals). */
    rustPrecisionWritten(declaration: any): boolean;
    private static readonly RUST_PRECISE_LENT;
    /** vd: only a local declared with a value (nil-declared locals keep their own box rules). */
    rustPreciseLendLocal(n: any): boolean;
    rust67aNilStrLend(declaration: any): boolean;
    /** ral-67a: `string` / `Str` / a union of those with `undefined`, read from the type node. */
    rust67aStrTypeNode(type: any): boolean;
    rustPreciseLentOperand(n: any): boolean;
    private rustDeepPreciseChainMemo;
    rustDeepPreciseChainIn(scope: any): boolean;
    /** pg: some use of the local is an argument of a `Precise.<op>(..)` call. */
    rustPreciseOperandLocal(declaration: any): boolean;
    /** The unboxed call text. */
    rustBaseTypedBareText(node: any): string;
    /** The call as a `kind` value: the bare text, or `Some(..)` of a non-optional one. */
    rustBaseTypedText(kind: string, expr: any): string | undefined;
    /** Call hook: a `Value` position takes the native result boxed once. */
    printRustBaseTypedReturnCall(node: any): string | undefined;
    /** The bare `Option<Dict>` call text of an `odict` table call (safeDictN), else undefined. */
    rustOdictCallText(expr: any): string | undefined;
    /** A Dict local from an `odict` call: the empty map for `None`, as `.into_dict()` answered for Null. */
    rustOdictDefaultText(expr: any): string | undefined;
    /** The bare `Option<List>` call text of an `olist` table call (safeListN), else undefined. */
    rustOlistCallText(expr: any): string | undefined;
    /** `return x` of an `-> Option<Dict>` method: the map a `Value` holds is moved out, anything else is `None`. */
    rustOdictReturnText(exp: any): string;
    /** `return x` of an `-> Dict` method: a map literal or `deep_extend` as its typed twin, else the held map (empty otherwise). */
    rustDictReturnText(exp: any): string;
    /** `return x` in a typed method: the native value, converting a `Value` once. */
    printRustBaseTypedReturn(fn: any, exp: any): string | undefined;
    /** `format!(..)` of a whole `Value::Str(format!(..).into())` print (balanced, nothing after), else undefined. */
    rustBoxedFormatInner(text: string): string | undefined;
    private static readonly RUST_BYTES_PRODUCERS;
    private static readonly RUST_BYTES_SLOTS;
    private static readonly RUST_BYTES_FREE_SLOTS;
    private rustBytesBare;
    private rustBytesDecisions;
    private rustBytesUseForms;
    /** `this.encode(..)` & co. resolved to the base tier, or such a call on a test's untyped `exchange`. */
    rustBytesProducer(node: any): boolean;
    /** `this.hash(data, algo, 'binary')`: the TS overload for a literal `'binary'` digest returns the bytes (`hash_binary`). */
    rustHashBinaryCall(node: any): boolean;
    /** `this.hash(.., digest)` with a non-literal digest: the runtime `hash` returns the text digest, boxed at once. */
    rustHashOpenDigestCall(node: any): boolean;
    rustLiteralDigest(arg: any): string | undefined;
    /** A call of the imported base `functions/` export `name`. */
    rustBaseFunctionCall(node: any, name: string): boolean;
    /** An argument in a byte parameter (`impl Into<Value>`) of a hand-written consumer, outside the test crate. */
    rustBytesSlot(node: any): boolean;
    rustBytesSliceSource(node: any): Node | undefined;
    rustBoxedBytesProducer(node: Node): boolean;
    rustBytesBareText(node: any, identation?: number): string;
    /** Call hook: a producer call is the `Bytes` itself in a byte slot, boxed once anywhere else. */
    printRustBytesCall(node: any, identation: any): string | undefined;
    /** A local whose every write is a producer call and whose every read is a byte slot or a `Value` hand-off. */
    rustBytesLocal(declaration: any): boolean;
    rustBytesLocalUncached(declaration: any): boolean;
    rustBytesLocalOf(node: any): any;
    /** Identifier hook: a byte slot borrows the handle, a `Value` slot shares or moves its list. */
    printRustBytesLocalRead(node: any): string | undefined;
    /** Assignment hook: `x = <producer>` keeps the handle. */
    printRustBytesLocalWrite(left: any, right: any): string | undefined;
    /** `ecdsa(..)` from `base/functions/crypto.ts`: the runtime returns its `{ r, s, v }` record as a `crate::value::Dict`. */
    rustEcdsaCall(node: any): boolean;
    printRustEcdsaCall(node: any, identation: any): string | undefined;
    rustClockCall(node: any): boolean;
    rustVenueReturnTypesHas(node: any, name: string): boolean;
    /** tc: `this.randomBytes(n)` resolved to the hand-written `-> String` runtime method */
    rustRandomBytesCall(node: any): boolean;
    rustIdString(node: any): boolean;
    /** `this.milliseconds().toString()`: the decimal text of the `i64`, as `to_string_val` prints an `Int`. */
    rustClockString(node: any): boolean;
    rust46aIntRuntimeCall(node: any): boolean;
    rustNonceCall(node: any): boolean;
    /** A base `sum(a, b, ..)` call shape; whether it is native is decided by rustArithCallKind. */
    rustSumShape(node: any): boolean;
    /** A cast, clock-string or `sum` local must earn a native use, and a string one never copies where the `Value` moved. */
    rustNewShapeCostly(init: any, typedUses: number, copied: number): boolean;
    rust87rhToStringWrite(node: Node): boolean;
    rustNumParamToString(node: any): boolean;
    /** `n.toString()` of an `i64` scalar local. */
    rustIntToStringShape(node: any): boolean;
    rustStrCastCall(node: any): any;
    /** ral-68f: `node` is the whole initializer of a single-declarator `const` statement. */
    rust68fConstInit(node: any): boolean;
    /** ral-68f: a base safeString-family reader call (not safeCurrencyCode) with no default argument (rust64bReaderLocal's call test). */
    rust68fNoDefaultReader(init: any): boolean;
    rustParseNumberStrCall(call: any): boolean;
    rust90rgParseNumberOfNumParam(call: Node): boolean;
    rustParseNumberNumLocalInit(node: Node): boolean;
    rustDerivedScalarKind(call: any): string | undefined;
    rustListLengthInit(node: any): boolean;
    rustTypedOwnerLength(node: any): string | undefined;
    rust67bCastListLengthRecv(recv: any): boolean;
    rustSelfRootedLengthRecv(recv: any): boolean;
    rustLocalRootedLengthRecv(recv: any): boolean;
    rustListLengthText(node: any): string;
    rustInlineHandleStrSlot(node: any): boolean;
    rustElementReadScalarKind(node: any): string | undefined;
    /** `xs[i]` of a never-written `xs: string[]` parameter (not optional): every element the checker types `string`. */
    rust93raStrListParamElem(node: Node): boolean;
    rust56eIntListVenueElem(node: any, owner: any): boolean;
    rustConstTupleStrSlotRead(node: any, owner: any, listType: any): boolean;
    rustAnyStrPlaceRead(declaration: any): boolean;
    rustAnyStrPushElem(node: any): boolean;
    rust87raExactIntTupleRead(node: Node, owner: Node): string | undefined;
    private static readonly RUST_87RA_COMPARE_OPS;
    rustExactBoolTupleRead(node: any, owner: any): string | undefined;
    rustRowFieldStrText(node: any): string | undefined;
    /** ral-42g: `xs[i]` whose list is a `string[]` / `Strings` parameter rustStrListParam proves (base-declared or every call site). */
    rustStrListParamElement(init: any): boolean;
    /** `xs[i]` over a typed list parameter (the source the element-read rule admits from a parameter). */
    rustListParamElement(init: any): boolean;
    rust80hCopyWriteInto(node: Node, other: Node): boolean;
    rustScalarBareLastWrite(node: any): boolean;
    /** Some use of the local is the source of an assignment or of another declaration. */
    rustScalarFeedsWrite(declaration: any): boolean;
    rust90raFeedsForeignWrite(declaration: VariableDeclaration, scope: Node): boolean;
    /** Some statement of the parameter's function assigns the parameter itself. */
    rustParamWritten(param: any): boolean;
    rustReaderDefaultKind(name: string, args: any[], fresh: boolean): string | undefined;
    rustSignReaderUrlsLitDefault(fallback: any, receiver: any): boolean;
    private rustOptionsElemKinds;
    rustOptionsElemKind(fallback: any): string | undefined;
    rustReaderFallbackKind(fallback: any): string | undefined;
    /** The checker scalar of a default that is a field, parameter or local (never a call: its `Value` may differ). */
    rustReaderFallbackChecked(fallback: any): string | undefined;
    rustReaderDeclTooLong(declaration: any, kind: string): boolean;
    rustReaderDeclText(declaration: any, kind: string): {
        pre?: string;
        init: string;
    } | undefined;
    private rustReaderSplitKinds;
    rustReaderDefaultSplit(kind: string, expr: any, tmp: string): {
        pre: string;
        init: string;
    } | undefined;
    /** True when the initializer or any `x = ..` write is a reader this block admits. */
    rustReaderDefaultTouched(declaration: any): boolean;
    /** A string local that is the source of another local's write: that local then copies at its own uses. */
    rustStrHandOffDecided(n: any, top: any, declaration: any): {
        moved: boolean;
        solved: boolean;
    };
    /** The nil-declared receiver is handed back by `return` (its printed type then follows the method's return). */
    rustNilTargetReturned(target: any): boolean;
    /** uc: `const y = c ? x : z` in the local's own function, `y` a scalar-shape candidate: decided with the local. */
    rustStrTernaryArmSolved(ternary: any, declaration: any): boolean;
    rustReaderStrHandedOn(declaration: any): boolean;
    /** ud: `rustReaderLendBoxes`, plus a whole `const t = s` alias initialiser (the `Value` form cloned there too). */
    rustUdOverrideLendBoxes(declaration: any): boolean;
    /** ud: a `this.m(..)` initialiser whose callee is a venue override of a base native-`Str` method (step 3 seed). */
    rustUdOverrideStrSeed(init: any): boolean;
    /** ud: reader strings admitted only through the lending-slot exemption of `rustBlockLocalUsesAll`. */
    private rustUdLent;
    /** ral-76c R1: `xs[i]` over a local (never a parameter) whose checker type is an array of `string`, in a non-test source. */
    rust76cLocalStrListElement(init: any): boolean;
    /** ud: a base-tier string reader (`safeString*`, `safeCurrencyCode`) initialiser, with or without a default. */
    rustUdReaderStr(init: any): boolean;
    /** True when the initializer is a reader this block admits (its kind comes from `rustReaderDefaultKind`). */
    rustReaderDefaultInit(init: any): boolean;
    rustCompareOnlyNumUses(declaration: any): boolean;
    /** Every boxed use of the local is a direct argument of a `number`-typed parameter. */
    rustNumParamBoxesOnly(declaration: any): boolean;
    /** The parameter `arg` binds in `call` is declared `number` (not `int`), so it prints as an `f64`. */
    rustNumParamArg(call: any, arg: any): boolean;
    rust90rgFloatOnlyUses(declaration: Node, depth: number): boolean;
    /** A number reader whose default may be an `Int` (an int literal, or anything not proven a float). */
    rustReaderIntDefaultNum(init: any): boolean;
    rustScalarUsesAll(declaration: any, name: string, acceptUse: (n: any) => boolean): boolean;
    /** zi: a `const [ .. ] = ..` slot goes through the same per-binding walk (rustBlockLocalUsesAll). */
    rustSlotUsesAll(element: any, name: string, skipPropertyNames: boolean, acceptUse: (n: any) => boolean): boolean;
    rustBlockLocalUsesAll(declaration: any, name: string, acceptUse: (n: any) => boolean, scalar?: boolean, skipPropertyNames?: boolean): boolean;
    rustBindingUsesWalk(declaration: any, nodes: any[], own: any, home: any, skip: any[], skipPropertyNames: boolean, acceptUse: (n: any) => boolean, scalar: boolean): boolean;
    rust68fReaderSelfArgWrite(n: any, write: any, form: string, declaration: any): boolean;
    rust70fTargLocalWrite(write: BinaryExpression): boolean;
    rust64nTypedArgWrite(n: any, write: any, form: string | undefined): boolean;
    rust60kBaseCallArgDictWrite(n: any, write: any): boolean;
    rust62pBaseCallArgKeyWrite(n: any, write: any): boolean;
    rust58kDictReaderKeyWrite(n: any, write: any): boolean;
    rustScalarSumOperandWrite(n: any, write: any): boolean;
    rustScalarCacheFieldCtor(n: any, write: any): boolean;
    rustPushSelfCallArgUse(n: any, push: any, kind: string | undefined): boolean;
    rust90reParsedPairElement(n: Node, push: CallExpression, kind: string | undefined): boolean;
    rustCopyPushPairElement(n: any, push: any, kind: string | undefined): boolean;
    rustWsCacheCtorSizeWrite(n: any, write: any): boolean;
    rustScalarPreciseFeed(n: any, write: any, declaration: any): boolean;
    /** `Precise.<op> (..)`: the hand-written `crate::precise::Precise` string math (a string or undefined). */
    rustPreciseStringCall(node: any): boolean;
    rustScalarBoxedField(n: any, write: any, declaration: any): boolean;
    rustScalarFeedsElementWrite(n: any, write: any): boolean;
    rustScalarCounterCond(node: any, name: string): string | undefined;
    rustDecidedOintBound(cond: any, n: any): boolean;
    rust56nTernaryCounterBound(cond: any, n: any): boolean;
    /** ral-56n: `const b = Math.ceil (x / y)` (whole initializer of a const). */
    rust56nCeilDivConst(d: any): boolean;
    rust56nCeilCounterCompare(node: any): {
        counter: any;
        bound: any;
    } | undefined;
    rust56nCeilCompareText(node: any, ceil: {
        counter: any;
        bound: any;
    }, counterText: string): string;
    print56nCeilCompare(node: any): string | undefined;
    rustScalarCounterPlan(node: any, name: string): {
        cond: string;
    } | undefined;
    /** True for the derived sources above, which must earn a native use (not only `Value` boxes). */
    rustScalarNeedsNativeUse(init: any): boolean;
    rustScalarCallee(call: any): any;
    private rustVenueReturnTypesByRoot;
    rustVenueStrCall(node: any): boolean;
    rustVenueIntCall(node: any): boolean;
    rustVenueScalarSource(init: any): boolean;
    rustVenueLocalHandedOn(declaration: any): boolean;
    /** A same-function identifier as the whole right side of a nil write whose narrowed checker type is `never`. */
    rustNilNeverWrite(node: Node | undefined): boolean;
    rustNilVenueWrite(node: any): boolean;
    private static readonly RUST_NIL_ELEM_STR_KEYS;
    rustNilElemStrText(node: any): string | undefined;
    /** ya: argument count of a safeString-family reader before its default (`safeString2(o, a, b, d)`: 3). */
    private static readonly RUST_SAFE_STRING_KEY_ARGS;
    rustNilValueStrAlias(rhs: any): boolean;
    /** ya: alias reads phase 2 admitted (the printer asks again after the solve; the answer must not change). */
    private rustScalarAliasPrinted;
    /** The whole initializer of a `let`/`const` (writes and ternary arms keep their `Value`). */
    rustVenueInitializer(node: any): boolean;
    /** A venue `int` result boxed at two or more slots: the `i64` is `Copy`, so each box replaces a `Value` clone. */
    rustVenueIntReboxed(declaration: any, kind: string, boxed: number): boolean;
    /** `x.toString()` on an `i64` local: it prints `format!("{}", x)`, the same text `Display` gives the `Int` box. */
    rustVenueIntToString(call: any, access: any): boolean;
    /** The `toString()` print of an `i64` scalar local receiver, else undefined. */
    printRustVenueIntToString(node: any, name: string): string | undefined;
    /** Declared return type texts per method name over the venue sources under `srcRoot`. */
    rustVenueReturnTypes(srcRoot: string): Map<string, Set<string>>;
    private rustVenueFamiliesByRoot;
    rustVenueFamilies(srcRoot: string): {
        familyOf: Map<string, string>;
        types: Map<string, Map<string, Set<string>>>;
    };
    /** Declared return types of `name` over the venue family of `file` (the callee's declaring file). */
    rustVenueFamilyReturnTypes(file: string, at: number, name: string): Set<string> | undefined;
    /** The `Option<String>` text of a venue string-method call (the box a `Value` position adds is left off). */
    rustVenueStrCallText(node: any): string;
    private rustVenueTypedDecisions;
    rustVenueTypedCall(expr: any): string | undefined;
    rustVenueTypedKindUncached(declaration: any): string | undefined;
    rustOdExcludedCallee(init: any): boolean;
    /** ral-42a: an identifier the checker types exactly `undefined` at this read (narrowed by an `=== undefined` guard). */
    rustNarrowedUndefined(value: any): boolean;
    /** `x = E; return x;`: the returned local holds what the statement right before the return wrote. */
    rustVenueReturnSource(ret: any): any;
    /** An override whose hidden base method and every venue declaration of the name declare its own return type. */
    rustVenueOverrideAgrees(declaration: any, hidden: any): boolean;
    /** The once-converted native text of a venue typed call (the method keeps `-> Value` and its dispatch arm). */
    rustVenueTypedText(kind: string, expr: any): string | undefined;
    /** A venue typed string is copied out of the `Value` once: a box short of a moving last use, or a hand-on, would copy it again. */
    rustVenueTypedCostly(declaration: any, kind: string, copied: number): boolean;
    rustSideStoreArg(n: any): boolean;
    /** The bare `format!(..)` a string concat prints as (its `Value::Str(..into())` box peeled), else undefined. */
    rustScalarFormatText(node: any): string | undefined;
    rustScalarUseForm(n: any, kind: string): string | undefined;
    rustSafeStringScalarKey(n: Node): boolean;
    rustBalanceSafeDictKey(n: Node): boolean;
    rustBalanceRowInsertKey(n: Node): boolean;
    /** ral-70f: the identifier under `(x as string)` / parentheses (or `n` itself). */
    rust70fCastBase(n: Node): Identifier | undefined;
    /** ral-70f: `access` is (through parentheses) the target of an assignment or update, or a `delete` operand. */
    rust70fWriteTargetKey(access: Node): boolean;
    /** ral-70f: `n` reads a ral-70f reader local and is (through parentheses / `as string`) the whole key of a write target. */
    rust70fWriteKey(n: Node): boolean;
    rust70fFirstCharTest(node: BinaryExpression): string | undefined;
    rust93reStrCharTest(node: Node): string | undefined;
    /** `x.toString ()` (no argument) whose receiver `x` is the bare identifier. */
    rust93reIntToStringRecv(n: Node): boolean;
    /** ral-70f: `n` sits inside the left side (target chain) of an assignment. */
    rust70fInWriteTarget(n: Node): boolean;
    rust70fOperandBox(n: Node): boolean;
    rustSbCopyBoxUse(n: any, kind: string): boolean;
    /** sb: `const x = this.m(..)` where `m` is a typed base method / runtime call (no `safe*` / `handle*` reader). */
    rustSbTypedCallInit(declaration: any): boolean;
    private rustSbPartnerMemo;
    rustSbHasPartner(declaration: any): boolean;
    private rustSbJoinMemo;
    rust68aJoinWrite(node: any): boolean;
    rustSbJoinShape(node: any): boolean;
    /** 51k: the join is one arm of a ternary initializer of a plain identifier whose other arm is a string literal. */
    rust51kStrTernaryJoin(node: any): boolean;
    rustSbJoinText(node: any): string;
    /** sb: an identifier initializer naming a local already decided as a shared `Dict` (decided before this one: no pending cycle). */
    rustSbDictAliasSource(init: any): boolean;
    private rustHandedPending;
    /** sb: the alias declaration shares its source's Arc (`Value::from(&x).into_dict()`, the bump the `Value` alias made). */
    rustSbDictAliasDecl(declaration: any): boolean;
    private rustSbAliasDeferred;
    rustParamReadAfter(declaration: any): boolean;
    rustParamsAliasWrite(rhs: any, declaration: any): boolean;
    rustParamsAliasDecl(declaration: any): boolean;
    rustAssignmentOpKind(op: any): boolean;
    rustPlusEqualsJoinOperand(n: any): boolean;
    /** ral-46d: `n` reads a local declared `const f = m['<opt flag>']` off a loaded market struct (`Option<bool>` field). */
    rustMarketFlagFieldLocal(n: any): boolean;
    /** ral-80e: `n` names a single-binding `const` local with an initializer (no later write is possible). */
    rust84eOptBoolWriteLeaf(n: Node): boolean;
    rust80eConstDecl(n: any): boolean;
    rust80eMathArgOnlyLocal(n: any): boolean;
    rustScalarUseFormOwn(n: any, kind: string): string | undefined;
    /** ral-65n: `n` climbed through its parentheses. */
    rust65nClimbParens(n: any): any;
    /** ral-65n: `t` is the whole initializer (through parentheses) of a `const` whose current scalar decision is `ostr`. */
    rust65nOstrTernaryArmOfOstrLocal(t: any): boolean;
    private static readonly RUST_WS_CLIENT_VALUE_METHODS;
    rustWsClientCallArg(call: any, kind: string): boolean;
    rustWsClientOnlyUse(declaration: any): boolean;
    rustWsClientLastUse(node: any, declaration: any): boolean;
    rustOwnedLastUse(node: any, declaration: any): boolean;
    rustReturnedLiteralValueMoves(node: any, declaration: any): boolean;
    rustOwnedOtherArmLastUse(node: any, declaration: any): boolean;
    rustOwnedThrownErrorArg(node: any, declaration: any): boolean;
    rustOwnedDeadBeforeWrite(node: any, declaration: any): boolean;
    rustLocalLastUse(node: any, declaration: any): boolean;
    rustWsSettleCall(call: any): boolean;
    rust73cRejectOnlyError(declaration: any): boolean;
    /** The class-name shape `printNewExpression` routes to the runtime error constructors. */
    private static readonly RUST_ERROR_CLASS_NAME;
    /** `client.future|reusableFuture(hash)` on a ws handle: the hand-written method takes `hash: impl Into<Value>`. */
    rustWsFlightCall(call: any): boolean;
    /** `this.watch(url, hash, message, subscribeHash, ..)` / `this.watchMultiple(url, ..)`: url and hashes are `impl Into<Option<&str>>`. */
    rustWsWatchSlot(call: any, at: number): boolean;
    /** A string local read as a ws hash or key slot: the settle hash, a handle `in` test or a handle keyed read. */
    rustWsKeyUse(n: any): boolean;
    rustWsStrKey(node: any): boolean;
    rustSpawnKeyParamRead(node: any): boolean;
    /** A key slot's text: `x.as_str()` / `x.as_deref()` for a string local, else the `Value` by reference. */
    rustWsKeyText(node: any): string;
    rustWsKeySharesStatement(node: any): boolean;
    printWsSettleCall(node: any, receiver: string, identation: number): string;
    printWsFlightCall(node: any, receiver: string, identation: number): string;
    private static readonly RUST_CLIENT_HANDLE_TYPE;
    private static readonly RUST_CLIENT_HANDLE_KEYS;
    private static readonly RUST_CLIENT_HANDLE_NAMES;
    private static readonly RUST_CLIENT_HANDLE_METHODS;
    private static readonly RUST_CLIENT_HANDLE_MARK;
    private rustClientHandlePlans;
    private rustClientHandleDeclPrinting;
    /** Line of a node's first token (statements print one per line, so this orders reads and writes). */
    rustClientHandleLine(node: any): number;
    /** The handle plan of the method enclosing `node`, or undefined. */
    rustClientHandlePlan(node: any): any;
    rustClientHandlePlanUncached(method: any): any;
    rustClientHandleTypedLocal(plan: any, refs: any[]): boolean;
    /** The ws `Client` class or a class extending it (`WsClient`, what `this.client(url)` returns). */
    rustClientHandleClassType(type: any): boolean;
    rustClientHandleAccess(node: any, live?: boolean): {
        plan: any;
        key: string;
        write: boolean;
    } | undefined;
    /** `client.<key> = v` anywhere in the method: the field itself is replaced, so key methods keep the old guard. */
    rustClientHandleWholeWrite(node: Node, key: string): boolean;
    rust90bHandleSyncedInTest(node: Node, plan: {
        bindPos: number;
    }): boolean;
    rustHandleSyncedSafeRead(node: Node, plan: {
        bindPos: number;
    }): boolean;
    rust80bClientDeclPending(plan: any): boolean;
    rustClientHandleReceiver(plan: any, field: boolean): string;
    printClientHandleField(node: any, top: boolean): string | undefined;
    /** `k in client.subscriptions|futures` as the handle's key test (`bare`: a Rust bool). */
    printClientHandleInOp(key: any, obj: any, bare: boolean): string | undefined;
    /** A condition that is a handle key test, printed as a Rust bool. */
    printClientHandleCondition(node: any): string | undefined;
    rustClientHandleIsInTest(node: any): boolean;
    /** `client.subscriptions|futures[k]` read with a plain local key: the handle's keyed read. */
    printClientHandleKeyedRead(node: any): string | undefined;
    /** `Object.keys(client.subscriptions|futures)` bound to a key list: the handle's key list. */
    printClientHandleKeys(init: any): string | undefined;
    rustClientHandleKeysAlias(node: any): VariableDeclaration | undefined;
    rustClientHandleKeysAliasPrintsKeys(declaration: any): boolean;
    /** `delete client.subscriptions[k]`: the handle drops the live entry and its snapshot entry. */
    printClientHandleDelete(node: any): string | undefined;
    /** `client.subscriptions[k] = v`: the handle writes the live client and its snapshot. */
    printClientHandleSubscriptionWrite(left: any, right: any): string | undefined;
    /** A bare use of a local declared as the handle hands the `Value` handle on. */
    printClientHandleUse(node: any): string | undefined;
    printClientHandleDeclaration(node: any, identation: number): string | undefined;
    rustClientHandleFinish(method: any, statements: string, identation: number): {
        statements: string;
        head: string;
    };
    rustFieldKeyReceiver(expr: any): string | undefined;
    rustFieldKeyUseForm(n: any): string | undefined;
    /** Element-access hook: `this.f[k]` read with a typed string key. */
    printFieldKeyRead(node: any): string | undefined;
    /** A boxed use that takes the local by move (a `return`, or its last use); `err` always copies. */
    rustScalarBoxMoves(n: any, form: string, declaration: any): boolean;
    /** rd: a `String` error message at its provable last use moves into the constructor (`ToErrorMessage for String`). */
    rustErrMsgMoves(n: any, declaration: any): boolean;
    rustLendSlot(n: any): boolean;
    rustFormatLendLocal(declaration: any): boolean;
    rustScalarSelfArgBox(n: any): boolean;
    /** A local keyed on a field and re-boxed anywhere but a moving use would copy where the `Value` moved. */
    rustFieldKeyCostly(declaration: any): boolean;
    rustLiteralKeyReceiver(n: any): boolean;
    /** A loop (or closure) lies between the declaration and `n`: a box there repeats. */
    rustLoopAfterDeclaration(n: any, declaration: any): boolean;
    /** The statement holding `n` reads the local again. */
    rustStatementReadsTwice(n: any, declaration: any): boolean;
    /** `n` is an argument of a `this.m(..)` / `super.m(..)` call. */
    rustSelfCallArg(n: any): boolean;
    printFieldKeyInOp(key: any, obj: any): string | undefined;
    rustElemKeyInUse(n: any): boolean;
    /** An `in`-keyed element local stays `Value` when a boxed use would copy where the `Value` moved or was lent. */
    rustElemKeyInCostly(declaration: any): boolean;
    /** ral-52i: `n` is a top-level value of the object literal written by `m[k] = { .. }` keyed by the same local `k`. */
    rustElemKeyInsertLiteralValue(n: any, declaration: any): boolean;
    /** ral-53k: `m[k]` handed as a call argument off a plain map-literal local: the lookup borrows the key's `&str`, no copy. */
    rustElemPlainMapReadKey(n: any): boolean;
    rust59pDeleteKeyUse(n: any): boolean;
    rust59pDeleteKeyInboxed(declaration: any): boolean;
    /** `m[k] = v` as a statement: the element key of a native insert. */
    rustElemInsertKey(n: any): boolean;
    printElemKeyInOp(key: any, obj: any): string | undefined;
    /** ral-58k: `n` is the whole right side of a statement `this.f[k] = n`, `k` another identifier (decided from the AST). */
    rust58kThisFieldIdentKeyWrite(n: any): boolean;
    rust68fNewArgCast(n: any): boolean;
    rust70fReaderLocal(declaration: Node, cast?: boolean): boolean;
    rust90rgCurrencyCodeLocal(declaration: Node): boolean;
    /** A never-written `const x = this.safeString (o, k, '<lit>')` local (the base reader's `string` overload: never `undefined`). */
    rustDefaultedStrReaderLocal(declaration: Node): boolean;
    rust70fWritten(declaration: VariableDeclaration): boolean;
    /** ral-64b: a local declared from a base safeString-family reader with no default argument (its box is `Str` or `Null`). */
    rust64bReaderLocal(declaration: any): boolean;
    rustThisFieldLiteralWrite(n: any): boolean;
    /** ud: `n` is the whole right side of `x[k1][k2] = n` with `x` a typed two-level local map (`rustNestedBearerInsert`). */
    rustUdNestedBearerValue(n: any): boolean;
    rust68aBearerLitChainLiteralValue(n: any): boolean;
    rustBearerLitChainValue(n: any): boolean;
    rustDeepBearerChainKey(n: any): 'first' | 'later' | undefined;
    /** ral-53i: `n` is k1 or k2 of a statement `x[k1][k2] = v` with `x` a typed two-level local map (`rustNestedBearerInsert`). */
    rustUdNestedBearerKey(n: any): boolean;
    rustNestedWriteKeyPosition(key: any): boolean;
    /** ral-53i: `n` keys a bucket seed `x[n] = {}` or a write `x[k1][k2] = v` of a typed two-level local map `x`. */
    rustNestedBearerKeySlot(n: any): boolean;
    rust65bThisFieldConcatOperand(n: any): boolean;
    /** ral-65b: `n` is the receiver of a no-argument `.toString()` reached through a parenthesised `as string` cast. */
    rust65bCastToStringRecv(n: any): boolean;
    rustScalarInNestedWrite(n: any, boxUse?: boolean): boolean;
    rustNestedWriteFreeLocal(n: any): boolean;
    /** `this.balance|options[..][..]` with at least one hop below the field (the r05 receiver chain). */
    rustNestedFieldChain(access: any): boolean;
    rustNestedFieldKeyUse(n: any): boolean;
    /** int37: `k` is a local read by a `this.safeString*` reader with no default (may be undefined); its identifier. */
    rustSafeStrNoDefaultKey(key: any): any;
    /** ral-54k: `this.F[k1][n]` (exactly one upper hop) with `k1` such an int37 key: the upper key, else undefined. */
    rustNestedFieldEntryKey(access: any): any;
    rustNestedFieldUpperKeyUse(n: any): boolean;
    /** `this.F[..]['lit'] = n` (statement): the value slot of a nested plain-field insert. */
    rustNestedFieldValueUse(n: any): boolean;
    /** ral-68h: `n` is the receiver of a two-argument `n.padStart|padEnd (..)` call (TS `String.prototype` method). */
    rust68hPadReceiver(n: any): boolean;
    rust68hNestedParamKey(access: any, n: any): boolean;
    /** Assignment hook: the r05 insert of a nested plain-field write keyed by a typed string local. */
    printNestedFieldKeyWrite(left: any, acc: string, value: string): string | undefined;
    print70fUpperEntryWrite(left: ElementAccessExpression, acc: string, value: string): string | undefined;
    printNestedFieldUpperKeyWrite(left: any, acc: string, value: string): string | undefined;
    rust62kLocalNestedLastKey(n: any): boolean;
    rust63kLocalFlatHelperKey(n: any): boolean;
    rust65kThisValueOk(write: any): boolean;
    /** ral-63k: `n` is the last key of a statement write `p[..][n] = v` whose chain root is a plain-Dict parameter. */
    rust63kDictParamNestedKey(n: any): boolean;
    rust61kNestedFieldMiddleKey(n: any): boolean;
    /** `this.f` (one level, no element read in between). */
    rustThisFieldTarget(node: any): boolean;
    /** `n` is (inside) an argument of a call that lies within `root`, the call itself not being `n`. */
    rustInsideCallArgument(n: any, root: any): boolean;
    rustScalarWriteOk(kind: string, rhs: any, depth: number): boolean;
    rust54eCounterWrite(node: any): boolean;
    /** Plain `Value` argument slots: `this.`/`super.` methods without a native-typed slot, and `Precise.*`. */
    rustNilBoxSlotOk(call: any, at: number): boolean;
    rustTestHarnessSlot(call: any): boolean;
    /** ExchangeOps methods (rust/tests/src/test_helpers.rs) whose argument is not a plain `Value`. */
    static RUST_TEST_NATIVE_SLOT_METHODS: Set<string>;
    /** Native right-hand side of `x == <literal>` for a scalar local of `kind`; undefined when not exact. */
    rustScalarLiteralTest(kind: string, other: any): string | undefined;
    /** Equality hook: `x.is_none()`, `x.as_deref() == Some("lit")`, `n == 5`. */
    printRustScalarLocalEquality(left: any, right: any, op: any): string | undefined;
    /** Condition hook: a `bool` scalar local is its own condition. */
    printRustScalarLocalCondition(node: any): string | undefined;
    /** vg: element locals printed as a borrowed `Option<&str>` off their list (`recv.get(i).and_then(Value::as_str)`). */
    private rustBorrowedStrElems;
    rustBorrowStrElem(declaration: any): boolean;
    /** ral-41g: `const g = m[k]` (k the use `n`) where `g`, or a same-named local of the method, is the receiver of a `.push (..)`. */
    rustElemKeyFeedsPushedLocal(n: any): boolean;
    rustStrListParam(param: any, depth: number): boolean;
    /** wg: the declared (checker) type is a list of strings (`string[]`, `Strings`). */
    rustStrArrayDeclared(node: any): boolean;
    rustStrListArg(arg: any, depth: number): boolean;
    rustBorrowPlaceRead(declaration: any): boolean;
    private static readonly RUST_BORROW_STR_METHODS;
    /** wg: `k.m (..)` with `m` a pure string method (reads the receiver, returns a fresh value). */
    rustBorrowStrMethodRecv(n: any): boolean;
    rustFieldBucketChainRead(bucket: any): boolean;
    rustFieldBucketRereadUse(wrapped: any, read: any): boolean;
    rust59kFieldSafeDictReread(n: any, access: any, value: any): boolean;
    /** ral-59k: `n` is the reader key of a statement `this.F[k] = v` that rust59kFieldSafeDictReread admits. */
    rust59kFieldSafeDictReaderKey(n: any): boolean;
    /** ral-59k: `m` is the key argument of a base `this.safeDict (this.<field>, m, ..)`. */
    rust59kFieldSafeDictKeyArg(m: any, field: string): boolean;
    rustFieldBucketReread(n: any, access: any, value: any): boolean;
    /** wg: field-write keys whose write value also reads the key (admitted only for a borrowed element). */
    private rustWgKeyReadInValue;
    rustWgKeyReadInValueUse(declaration: any): boolean;
    /** wg: `const k = xs[i]` off a never-written local list of only strings (vg's owner rule, uses of `k` not yet checked). */
    rustBorrowStrElemShape(declaration: any): boolean;
    /** wg: `const xs: string[] = []` whose every push is one string-typed value and that is never rebound or element-written. */
    rustStrPushFilledList(owner: any): boolean;
    /** vg: `Object.keys (x)` (never a ws client handle's key list) or a non-empty literal of string literals: only strings. */
    rustExactStrListInit(init: any): boolean;
    rustInArrayNeedle(node: any): boolean;
    rustSafeDictKeyParam(param: any): boolean;
    private static readonly RUST_LENT_PRECISION_SLOTS;
    /** Methods whose leading `Str` parameter is lent as `Option<&str>`, with that parameter's name. */
    private static readonly RUST_SAFE_MARKET_ID_SLOTS;
    private static readonly RUST_LENT_SYMBOL_PRECISION;
    private static readonly RUST_LENT_OUTCOME_KEY;
    rustPriceSlotParam(param: Node | undefined): boolean;
    /** `n` is the value (argument 1) of `this.price|amount|costToPrecision (s, n)` whose resolved body takes the lent price slot. */
    rustPriceSlotArg(n: Node | undefined): boolean;
    rustSafeDictKeyOnlyLocal(declaration: any): boolean;
    rust56nSliceBoundOnlyLocal(declaration: any): boolean;
    /** ral-56n: a loop counter read as a bound of a loose `Value` slice (the typed bound text is `i` / `Some(i)`). */
    rust56nCounterSliceBound(n: any): boolean;
    /** ral-56n: `x = i` as a whole statement into another local (boxed `Value::Int(i)` or the bare i64 of an int local). */
    rust56nCounterPlainCopy(n: any): boolean;
    rustCounterArithInit(expr: any, declaration: any): boolean;
    rust57eCounterProduct(node: any, declaration: any): boolean;
    rust57eSumKeyOperand(n: any): boolean;
    rustCounterArithHasCounter(expr: any, declaration: any): boolean;
    /** The enclosing `for` whose block-scoped counter `node` reads (int-literal start, `j++` / `++j` step, `j < <i64 local>`, never written in the body). */
    rustCounterLoopOf(node: any, declaration: any): any;
    /** ral-50e: `n` is the key (argument 1) of `this.safeDict (x, n, ..)` resolving to the generated base body, outside the test crate. */
    rustSafeDictKeyArg(n: any): boolean;
    /** xd: `n` is the only argument of `this.iso8601 (n)` outside the test crate (hand-written `iso8601(ts: impl Into<Value>)`). */
    rustIso8601Arg(n: any): boolean;
    /** ral-53e: `n` is the whole key of an rvalue element read `xs[n]` on a plain local receiver (not a write target, not `delete`, non-test sources). */
    rust53eElemReadKey(n: any): boolean;
    /** Identifier hook: a `box` use converts with the standard `From` impls (scalars are `Copy`). */
    printRustScalarLocalRead(node: any): string | undefined;
    /** ral-59x: a local declared `let y = x` / `const y = x` from another local (an alias of it). */
    rust59xAliasDecl(declaration: any): boolean;
    /** The native value of a scalar expression for a local of `kind` (`Some(..)` for optional kinds). */
    rustScalarNativeText(kind: string, expr: any): string | undefined;
    /** Declaration hook: `let mut x: <scalar> = <native init>`, else undefined. */
    printRustScalarLocalDeclaration(declaration: any, varName: string, indent: string): string | undefined;
    /** 40b: `n` keys a one-level native read of a base-declared `this.<dict field>` (`this.markets[k]`, `this.urls[k]`). */
    rust40bFieldKeyRead(n: any): boolean;
    /** 40b: a node of the ws tier (`ts/src/pro/`): its subscription / cache keys stay boxed (in_op and ws cache locals must not move). */
    rust40bProTier(n: any): boolean;
    /** 40b: the operand of a top-level `<expr> as T` write source (parens only around it), else undefined. */
    rustScalarAsWrite(rhs: any): any;
    /** The identifier under one top-level `as string` write source (parens only around it), else undefined. */
    rustStrAsIdentWrite(rhs: any): any;
    rustAsOperand(node: any, stringOnly: boolean): {
        operand: any;
        casts: number;
    };
    /** Assignment hook: `x = <rhs>` in the local's native type. */
    printRustScalarLocalWrite(left: any, right: any): string | undefined;
    private static readonly RUST_SCALAR_ARITH_OPS;
    /** Kind of a typed local an identifier reads: a scalar local, or a typed `Option<String>|Option<i64>` of another rule. */
    rustScalarIdentifierKind(node: any): string | undefined;
    /** `{ method, kind }` of a native string method on a typed string local receiver, else undefined. */
    rustScalarStrMethod(node: any, syntactic?: boolean, params?: boolean): {
        recv: any;
        recvKind: string;
        method: string;
        kind: string;
    } | undefined;
    rust65xNeverNullStrRecv(recv: any): boolean;
    rust48fSlotAliasConcatRecv(call: any, recv: any): boolean;
    rustStrPadArgs(args: any[]): {
        width: number;
        pad: string;
    } | undefined;
    /** Literal `slice(a)` / `slice(a, b)` bounds the closure-free char form handles: `b >= 0` and `a >= 0` when `b` is given. */
    rustStrSliceBounds(args: any[]): {
        start: number;
        end: number | undefined;
    } | undefined;
    rustStrSliceVarBounds(args: any[]): {
        start: string;
        end: string | undefined;
        endOpt: boolean;
    } | undefined;
    rustStrSliceVarText(s: string, b: {
        start: string;
        end: string | undefined;
        endOpt: boolean;
    }): string;
    rustStrVarNeedle(node: any, empty: boolean): string | undefined;
    rust58kOptReplaceArgs(args: any[]): {
        index: number;
        opt: string;
        other: string;
    } | undefined;
    /** 41b: a replace operand that is never `Null`: a string literal or a `String` local (`&str` text). */
    rustStrReplaceOperand(node: any): string | undefined;
    /** ral-55x K1: every leaf of a `+` chain is a string literal or a `str` / `ostr` typed local, and at least one is a literal. */
    rustStrConcatOperandLeaves(node: any): boolean;
    private rust41bWsKeyMemo;
    private rust60pWsKeyMemo;
    rust60pLocalMapRead(p: any, keyDecl: any): boolean;
    rust41bWsKeyLocal(node: any, localElemOk?: boolean): boolean;
    /** 41b: an argument (bound / needle / operand) of a string method its typed string local receiver prints natively. */
    rustStrMethodArgNative(n: any, kind: string): boolean;
    /** Native `String` text of a pad / slice over the `&str` `s`. */
    rustStrPadSliceText(method: string, args: any[], s: string): string;
    /** `indexOf` needle as an `Option<&str>`: a non-empty literal, a typed string local, or a string-typed `Value` expression. */
    rustStrFindNeedle(node: any, syntactic: boolean): string | undefined;
    /** `s.indexOf(n)` on a typed string local: `str::find` (byte index), `-1` when absent or either side is null, as the helper. */
    rustStrFindText(recvKind: string, name: string, needle: any): string;
    /** `s.split(d)` on a typed string local with a literal or `String` delimiter: the helper's array of parts, empty for null. */
    rustStrLocalSplitText(node: any): string | undefined;
    rust64nOptSplitDelim(call: any): any;
    /** ral-64n: `n` (through its parentheses / `as string`) is the delimiter `rust64nOptSplitDelim` prints from the local. */
    rust64nOptSplitDelimUse(n: any): boolean;
    rustStrLocalSliceText(node: any): string | undefined;
    /** A string local read by `split` / `indexOf` / `replace` or appended a string `Value`: its printed lines keep the 400-char budget. */
    rustStrMethodRecvLocal(declaration: any): boolean;
    /** `s += v` with `v` a string-typed `Value` (not a `+` chain): `Display` is the text the `add` helper concatenates. */
    rustStrPushValueText(target: any, right: any, dry: boolean): string | undefined;
    /** A string-method local returned from a method whose signature alone could print `-> Option<String>`: typing it would flip that ABI. */
    rustStrReturnSignature(fn: any, n: any): boolean;
    /** `split`, `replaceAll`, `slice`, `padStart` / `padEnd`, an optional receiver's `replace`, or an `indexOf` outside a literal contains test. */
    rustStrMethodNewUse(call: any): boolean;
    /** `Precise.string<Add|Sub|..>(..)`: a `string | undefined` result. */
    rustScalarPreciseCall(node: any): boolean;
    /** ral-54x: `Precise.stringEq|Gt|Ge|Lt|Le(a, b)`: the runtime answers `Value::Bool` for every operand pair. */
    rustPreciseCompareCall(node: any): boolean;
    /** `s.length` on a typed string local. */
    rustScalarLengthRecv(node: any, params?: boolean): any;
    /** Non-optional numeric operand kind (`int|num`), optional (`oint|onum`), or undefined. */
    rustScalarNumericKind(node: any): string | undefined;
    /** ral-56n: `node` (parentheses skipped) is the one argument of `Math.ceil (..)`. */
    rust56nCeilDivisionArg(node: any): boolean;
    rust51kLitModKind(node: any): string | undefined;
    /** The exact kind an expression shape yields over typed operands, else undefined. */
    rustScalarExpressionKind(expr: any): string | undefined;
    private static readonly RUST_ALWAYS_INT_CALLS;
    rustArithCallKind(expr: any): string | undefined;
    /** The clock is a base property bound to `Date.now`, so its signature resolves outside the base tier. */
    rustArithBaseCallee(node: any, name: string): boolean;
    /** An operand's numeric kind; a never-null integer call (e.g. a literal-defaulted reader) prints natively too. */
    rustArithOperandKind(node: any): string | undefined;
    rustArithSideKind(node: any): string | undefined;
    rustArithTypedIntCall(node: any): string | undefined;
    /** ral-55e: a binary initializer with a typed parseToInt side (`time * this.parseToInt (x)`). */
    rustArithTypedIntSide(node: any): boolean;
    /** zb: the numeric kind of an unwritten typed-signature parameter read (`oint` / `onum` / `int` / `num`), else undefined. */
    rustArithParamKind(node: any): string | undefined;
    /** A combinator over a typed operand prints native and boxes its result once. */
    printRustArithCall(node: any): string | undefined;
    rustInlineIfMatchInit(declaration: any): boolean;
    /** qb: `n` is an argument of a two-operand `Math.min|max` the printer keeps as the runtime helper (no native kind). */
    rustMathMinMaxValueOperand(n: any): boolean;
    /** rd: `n` is one argument of a two-operand `Math.min|max` whose other argument is a number-typed `Value`. */
    rustMathMinMaxValueArg(call: any, n: any): boolean;
    /** `this.sum(..)` / `Math.min|max(a, b)`: a call whose own kind comes from its operands. */
    rustArithCombinator(node: any): boolean;
    private static readonly RUST_MATH_FLOAT_OPS;
    rustMathFloatShape(node: any): boolean;
    rustMathFloatCall(node: any): string | undefined;
    rustMathFloatText(node: any): string;
    rustArithCallText(kind: string, expr: any): string | undefined;
    rustScalarJoinKinds(a: string | undefined, b: string | undefined, arms?: boolean): string | undefined;
    /** Joins the initializer kind with every `x = <rhs>` write: a nullish write makes the local optional. */
    rustScalarWidenedKind(declaration: any, kind: string): string;
    rustOptParamKind(expr: any): string | undefined;
    rust68aStrParamWrite(node: any): boolean;
    private static readonly RUST_PARAM_READ;
    rustOptParamText(kind: string, node: any): string | undefined;
    rustScalarParamRead(node: any): {
        kind: string;
        text: string;
    } | undefined;
    rustScalarRecvName(node: any): string;
    rustScalarParamOperand(node: any): boolean;
    rustOptParamDefault(node: any): {
        kind: string;
        text: string;
    } | undefined;
    rustOptParamCapped(kind: string, param: any, present: any, d: any): {
        kind: string;
        text: string;
    } | undefined;
    rustOptParamWriteOk(kind: string, node: any): boolean;
    rustValueNotOfBoolLocal(node: any): string | undefined;
    rustScalarBoolLogicalText(expr: any): string | undefined;
    rustBoolLeafLogical(expr: any): boolean;
    /** A non-negative integer literal compared with a local: rustBoolNativeText still has to print the compare natively. */
    rustH26r13IntLitLeaf(n: any): boolean;
    /** Native `bool` text of a comparison proven native, `!x`, a bool local, or `&&`/`||` over those. */
    rustBoolNativeText(expr: any): string | undefined;
    /** Native text of an ordered/equality comparison over typed operands (`dry`: shape check only). */
    rustScalarCompareText(node: any, dry: boolean, literalKind?: string): string | undefined;
    /** A use that boxes the local as the key of an `in` test before its last use (read there by reference, so the box copies). */
    rustScalarBorrowedBox(declaration: any): boolean;
    /** The local is one side of `x === y` / `x !== y` against a `Value` partner (`rustScalarValuePartnerTest`). */
    rustScalarHasPairEquality(declaration: any): boolean;
    rustScalarValuePartnerTest(typed: any, other: any, kind: string, sign: string, dry: boolean): string | undefined;
    rustInKeyTypedText(key: any): string | undefined;
    rust80bClientStateInKey(n: any): boolean;
    /** td: the left operand of a `k in obj` test that is `k` itself or `k` under parens / `as` casts, else undefined. */
    rustInKeyTop(n: any): any;
    /** The key local of an `in` test has a non-null initializer (nil-declared locals are left to their own rule). */
    print65bWsInKey(left: any, right: any): string | undefined;
    /** ral-65b: `n` is the bare key of `n in client.subscriptions|futures` on a ws `Client` that the handle does not print. */
    rust65bWsInKey(n: any): boolean;
    rustInKeyInitialised(n: any): boolean;
    /** ral-84c R3: `n` names a nil-declared `let k: Str = undefined` local (rust84cNilStrInKey). */
    rust84cNilStrKeyLocal(n: Node): boolean;
    rust84cNilStrInKey(declaration: VariableDeclaration): boolean;
    rustScalarPayloadPartnerTest(self: any, partner: any, kind: string, sign: string, dry: boolean): string | undefined;
    private static readonly RUST_59N_VALUE_READERS;
    rust59nValueReaderPartner(node: any): boolean;
    rustScalarValuePartnerKind(partner: any): string | undefined;
    private rustScalarPending;
    /** The partner is a local whose checker type is a string / number and whose initializer is a scalar reader shape. */
    rustScalarValuePartnerShape(partner: any): boolean;
    rustRdOwnInit(declaration: any): boolean;
    /** rd: a non-literal operand printed as a `Value` whose checker type is `number` (`Int|Float|Null` at runtime). */
    rustScalarValueNumber(node: any): boolean;
    rustScalarCompareKind(node: any): string | undefined;
    /** `s.indexOf("lit") >= 0` / `> -1` / `!== -1` (contains) and `< 0` / `=== -1` (absent) on a typed string. */
    rustScalarContainsTest(node: any, dry: boolean): string | undefined;
    /** An operand printed by this rule: a scalar local, or a `.length` / string-method / `indexOf` of one. */
    rustScalarOwnsOperand(node: any): boolean;
    rustScalarHasTypedOperand(node: any): boolean;
    /** Native text of an operand in `kind` (an `int` operand of an `f64` expression is cast). */
    rustScalarOperandText(kind: string, node: any): string;
    /** Native text of an expression shape for a local of `kind`, else undefined. */
    rustScalarExpressionText(kind: string, node: any): string | undefined;
    /** `k / x`: a numeric literal over an `Option<f64>` local seeded from `parseNumber` (rustParseNumberNumLocalInit). */
    rustLitOverOptNumDivision(node: any): boolean;
    rustScalarOptArithText(base: string, node: any, sign: string): string;
    /** The `Value` box of a native scalar text. */
    rustScalarBoxText(kind: string, text: string, node: any): string;
    /** Binary hook: arithmetic/ordered comparisons over typed operands, and `+=`/`-=` on a typed local. */
    printRustScalarBinary(node: any): string | undefined;
    /** `s += <string>` (`push_str`) on a `String` local, `n += <int>` / `n -= <int>` on an `i64` local. */
    rustScalarCompoundText(node: any, dry: boolean): string | undefined;
    /** Pair equality of two typed operands (or a typed expression and a literal). */
    rustScalarPairEquality(left: any, right: any, op: any): string | undefined;
    /** Typed-signature argument text for a scalar local (`&str`, `Option<&str>`, `i64`, ..), else undefined. */
    rustScalarTypedArgText(arg: any, rustType: string, dry?: boolean): string | undefined;
    /** The typed-signature param type of a `this.<typed unified>(..)` argument slot the call prints natively. */
    rustScalarTypedParamType(call: any, at: number): string | undefined;
    /** A plain `Value` assignment target (no typed-local rule claims it). */
    rustScalarPlainValueTarget(left: any): boolean;
    /** Re-boxing an optional local lengthens each use: keep a line under the 400-char limit it was under. */
    printRustScalarGuardedBody(method: any, rawPrint: () => string): string;
    /** yd: index of the bracket closing the one opened at `open` (string literals skipped). */
    rustCloseBracketAt(text: string, open: number): number;
    rustSplitLongLine(line: string, nth: number, after?: string): string | undefined;
    rustFlattenConcatChain(line: string): string;
    rustSplitLongLines(text: string, names: string[]): string;
    /** ral-54k: `this.safeCurrencyCode (..)` (base reader, `string` return). */
    rustSafeCurrencyCodeInit(init: any): boolean;
    /** sd / ral-55f (one key path): the written value of `m[k] = v` assigns or steps the key local `k` itself. */
    rustInsertValueRewritesKey(key: string, value: any): boolean;
    /** `m[k] = v` with `k` a `String` local whose single-key write prints a native insert. */
    rustScalarInsertKeyUse(n: any): boolean;
    rustTbKeyReadOnlyInValue(n: any, value: any): boolean;
    rust48iChainKeyUse(n: any): boolean;
    /** tb: `this.networkIdToCode (..)` (the base typed `Str` reader of a network id). */
    rustTbNetworkCodeInit(init: any): boolean;
    /** A key written `m[k as string]` / `m[(k)]`: the cast and parens print nothing, so the key is `k` itself. */
    rustKeyWrapped(n: any): any;
    /** The insert key of a `String` scalar local, else undefined. */
    rustScalarInsertKeyArg(keyNode: any): string | undefined;
    rustInsertKeyMoves(key: any): boolean;
    rust55xGuardedSafeStringKey(n: any, local: any): boolean;
    rustScalarOptKeyUse(n: any): boolean;
    rust62kOwnKeyOnlyRead(declaration: any, name: string, n: any): boolean;
    rust61kSelfReassignRead(n: any): boolean;
    rust61kSelfReassignOnlyRead(declaration: any, name: string, n: any): boolean;
    rustScalarOptKeyArg(key: any): string | undefined;
    rustScalarOptKeyCount(declaration: any): number;
    rustScalarOptKeyCostly(declaration: any, kind: string): boolean;
    rustPlainFieldInsertKey(n: any): boolean;
    rustScalarOptKeyText(key: any): string;
    /** The key is an element-read local (`const k = keys[i]`). */
    rustOkeyLocal(n: any): boolean;
    rustOkeyBoxed(declaration: any, boxed: number): boolean;
    /** 'map' for a typed map receiver, 'value' for a proven-dict `Value` receiver, else undefined. */
    rustOkeyKind(receiver: any, read: any): 'map' | 'value' | undefined;
    rust63eChainLinkKeyRead(n: any): boolean;
    /** A one-level read `m[k]` (not a write target, not a chain link) on an `rustOkeyKind` receiver. */
    rustOkeyReadUse(n: any): boolean;
    rustAnyGetValueKeyUse(n: any): boolean;
    rust64eNestedOnlyMutationBind(read: any): boolean;
    rustOwnKeysTypedRowRead(read: any): boolean;
    rustOwnKeysElementKey(recv: any, key: any): boolean;
    rustUrlsKeyReadUse(n: any): boolean;
    /** uh: the use's local is initialised by `c ? 'a' : 'b'` (both arms string literals). */
    rustPassThroughStrCallIn(node: Node, depth?: number): boolean;
    private static readonly RUST_PASS_THROUGH_STR_HELPERS;
    rustPassThroughStrMethod(method: Node | undefined): boolean;
    /** ral-90re R3: a ternary initializer one of whose arms is a field read of an owned `safeMarket` (`smkt`) local. */
    rust90reSmktArmTernary(init: Node): boolean;
    /** ral-90re R3: `n` reads a local initialised from a ternary whose two arms are `String` fields of a typed market local. */
    rust90reMarketFieldTernaryLocal(n: Node): boolean;
    rustStrLiteralTernaryLocal(n: any): boolean;
    rust64kBookKeyRead(n: any): boolean;
    rust65kTypedResultKey(n: any): boolean;
    /** ral-64k: the read of a `bkey` use: `get_value(&<book box>, k.as_str() | k.as_deref())`. */
    print64kBookKeyRead(node: any): string | undefined;
    /** ral-90rh R2: `n` is the identifier of a `n as string` that is a whole element-access key. */
    rust90rhCastKey(n: Node | undefined): boolean;
    /** Element-access hook: the native read of an `okey` use. */
    printOkeyRead(node: any): string | undefined;
    private static readonly RUST_SCALAR_VALUE_OPERAND_OPS;
    /** A number local as one operand of `+ - * /` whose other operand prints as a `Value` (ordered compares keep their own native form). */
    rustScalarValueOperandUse(parent: any, n: any, kind: string): boolean;
    /** ral-84b: a nil-declared `let` whose current scalar decision (same scope solve) is a string kind. */
    rust84bStrNilPartner(d: any): boolean;
    rustConcatWithNilLocal(declaration: VariableDeclaration, strNilOk?: boolean): boolean;
    /** rd: a `for (let i = <int>; ..; i++)` counter read in its own loop whose only write is the step: always an `Int`. */
    rustValueIntCounter(node: any): boolean;
    rust76eCounterStep(node: any): boolean;
    rust87rbSumLiteralOnly(node: Node): boolean;
    /** tb: `const b = this.parseToInt (..)` (an `Int`-or-`Null` producer, `i64` / `Option<i64>`). */
    rustTbParseToIntInit(declaration: any): boolean;
    rustIntReaderLitDefault(declaration: any): boolean;
    /** ral-63n: `const x = this.safeInteger* (..)` with no default argument: the reader answers an `Int` or `Null`. */
    rust63nNoDefaultIntReader(declaration: any): boolean;
    /** ral-54n: `this.safeInteger* (..)` printed as its `Value` (an `Int` or `Null` on every path). */
    rustIntReaderCall(node: any): boolean;
    /** wi: a tuple slot whose producer builds an exact Int-or-null on every return (`checkOptionInteger`): an `i64` bound too. */
    rustTbExactIntSlot(declaration: any): boolean;
    /** ub: a `this.parseToInt(..)` call printed as its boxed `Int` / `Null` (`Value::from(self.parse_to_int(..))`). */
    rustUbPtiCall(node: any): boolean;
    rustUbPartnerInBucket(node: any): boolean;
    rust55ePtiTypedPartners(d: any): boolean;
    /** ral-55e: `Math.ceil (<x> / <y>)` as a declaration's whole initializer. */
    rust55eCeilDivInit(d: any): boolean;
    rustUbPtiPartnersDecided(declaration: any): boolean;
    rust54ePtiSelfStep(u: any): boolean;
    rustTbCounterBound(cond: any, n: any, kind: string): any;
    rust63pSumCounterBound(cond: any, n: any): boolean;
    rustTbBoundHasPartner(declaration: any, cond: any): boolean;
    /** tb: the for-condition of a `Value` `Int` counter (its i64 plan declined) against a typed parseToInt bound. */
    printTbCounterBound(node: any): string | undefined;
    rustScalarExprHasForCounter(node: any): boolean;
    /** ral-40a: the identifier under `(x as string)` (parens and a `string` assertion only), else undefined (rustAsOperand). */
    rustStrCastLocal(node: any): any;
    rustScalarExpressionUseForm(n: any, kind: string): string | undefined;
    /** `(x as string).length` (through parentheses) on a string local: the length prints from the local itself. */
    rust93reCastLengthRecv(cast: Node): boolean;
    /** `(x as string).split(..)` on a string local: the split prints from the local itself (`rustStrLocalSplitText`). */
    rustCastSplitRecv(cast: any): boolean;
    /** The ws cache classes whose hand-written `::new` takes `impl Into<Value>`. */
    private static readonly RUST_CACHE_CTORS;
    /** An integer local as the size argument of `new ArrayCache*(limit)`: passed natively (`i64` / `Option<i64>` into `impl Into<Value>`). */
    rustCacheCtorLimitArg(n: any, kind: string): boolean;
    /** The size argument is the local's last use, outside any loop or closure below its declaration (a bare move). */
    rustCacheCtorFinalUse(node: any): boolean;
    /** Call hook: a string method of a typed string local, boxed back to `Value`. */
    printRustScalarMethodCall(node: any): string | undefined;
    /** `.length` hook: the char count of a typed string local. */
    rustScalarLengthText(node: any, boxed: boolean): string | undefined;
    private rustNativeStrReturnDecisions;
    private static readonly RUST_BASE_TIER_FILE;
    private static readonly RUST_PRO_TIER_FILE;
    /** `'str'` when the method is emitted `-> Option<String>`, else undefined. */
    rustNativeStrReturnKind(node: Node): string | undefined;
    private rustMethodOverrides;
    private rustClassAncestorTables;
    private rustAncestorMethodTables;
    getMethodOverride(node: Node): Node;
    rust57xStrReturnMethod(fn: any): boolean;
    private rustNativeStrReturnDecisionUncached;
    /** The signature half of the native-`Str` return decision: a sync `string` method outside the base tier / override groups. */
    private rustNativeStrReturnHead;
    private static readonly RUST_BASE_NATIVE_STR_METHODS;
    private rustBaseNativeStrBare;
    /** A call resolving to a `-> Option<String>` base method of the table (or an override of one). */
    rustBaseNativeStrCall(node: any): boolean;
    /** The call's own `Option<String>`, unboxed. */
    rustBaseNativeStrBareText(node: any): string;
    private static readonly RUST_VENUE_KEPT_STR_ARMS;
    rustVenueKeptStrArm(node: any): boolean;
    /** A `: Str` method of the table declared in the base tier, or an override of one. */
    rustBaseNativeStrMethod(node: any): boolean;
    rustStrReturnValueConverts(expression: Node): boolean;
    rustStrNativeExpression(expression: Node): boolean;
    unwrapParensNode(node: Node): Node | undefined;
    private rustCallDeclarations;
    rustNativeStrCalleeKind(node: Node): string | undefined;
    rustNativeStrValueBox(text: string): string;
    rustNativeStrCallNeedsBox(node: Node): boolean;
    rustBoxNativeStrCallIfNeeded(node: Node, text: string): string;
    private declaredDictLocalsCache;
    rustDeclaredDictLocals(): Map<string, RustDeclaredDictLocalEntry[]>;
    rustDeclaredLocalTypeResolver(node: Node): RustDeclaredLocalKind | undefined;
    rustDeclaredLocalEntry(node: Node): RustDeclaredDictLocalEntry | undefined;
    private rustDeclaredLocalIdentifier;
    private rustSymbolOf;
    private rustIdentifierRefersToDeclaration;
    private collectRustDeclaredDictLocals;
    /** The Dict-proven initialiser shape of a declaration, or undefined. */
    private rustDictInitializerInfo;
    /** Printed `safe_dict*` callee name of `self.<name>(..)`, or undefined. */
    private rustSafeDictCallee;
    private rustDictProvenExpression;
    private rustDictLocalWriteScan;
    private rustAssignmentWritesWholeLocal;
    private rustDictLocalClassifyUse;
    getStructFields(node: any): Array<{
        name: string;
        init: string;
    }>;
    printStruct(node: any, identation: any): string;
    printNewMethod(node: any, identation: any): string;
    printClass(node: any, identation: any): string;
    printMethodDefinition(node: any, identation: any): string;
    rustSignatureTable: Map<any, RustMethodSignature>;
    private static readonly RUST_DISPATCH_PARAM_KINDS;
    private static readonly RUST_DISPATCH_RETURN_KINDS;
    rustRecordSignature(node: any, name: string, params: Array<{
        name: string;
        rustType: string;
    }>, returnType: string): void;
    rustVirtualDispatchMethod(node: any, methodDef: string, body: string): string;
    private static rustTypedParam;
    private static readonly RUST_TYPED_STR_PARAMS;
    private static readonly RUST_TYPED_RETURNS;
    rustTypedSignature(node: any): {
        params: Array<{
            name: string;
            rustType: string;
            toValue: string;
            optional: boolean;
        }>;
        ret: string;
    } | undefined;
    rustTypedIsAsync(node: any): boolean;
    rustTypedBody(node: any, typed: any, identation: number, inner: string): string;
    printTypedUnifiedCall(node: any): string | undefined;
    /** `await this.loadMarkets ();` as its own statement (the value is dropped). */
    rustTypedCallIsDiscarded(node: any): boolean;
    private static readonly RUST_MARKET_STR_FIELDS;
    private static readonly RUST_MARKET_BOOL_FIELDS;
    private static readonly RUST_MARKET_OPT_BOOL_FIELDS;
    private static readonly RUST_MARKET_SAFE_READERS;
    private static readonly RUST_MARKET_OPT_STR_FIELDS;
    private rustMarketLocalDecisions;
    /** `this.market (x)` printed through the typed core. */
    rustIsTypedMarketCall(node: any): boolean;
    /** The literal key of a struct-local read `m['k']` / `m.k` (not written, not called). */
    rustMarketReadKey(n: any): string | undefined;
    rust87rhPrecisionRead(outer: Node | undefined, inner: Node | undefined): boolean;
    rust87rhPrecisionLocal(declaration: Node): boolean;
    /** The listed field a `this.safeString|safeBool (m, 'k')` call reads (no default, or a `false` default for a flag). */
    rustMarketSafeReadField(call: any): string | undefined;
    /** `this.safeString (m, 'k', '')`: three arguments, the last an empty string literal. */
    rustMarketEmptyDefaultRead(call: any): boolean;
    /** ral-49c: `m as any` (in parentheses or not) as a call argument: the same whole-value hand-off of `m`. */
    rustMarketValueUseThroughCast(n: any): boolean;
    /** ral-50c: `d[k] = m`: the record stored whole into a map (its raw, an `Arc` bump). */
    rustMarketStoreUse(n: any): boolean;
    /** A whole-value hand-off: a call argument, an array element, a dict value or a returned value. */
    rustMarketValueUse(n: any): boolean;
    rustMarketLocalKind(declaration: any): false | 'struct' | 'opt' | 'call' | 'smkt';
    rustMarketLocalIsTyped(declaration: any): boolean;
    /** `m = this.market (x)` / `m = this.safeMarket (..)` as its own statement: a later write of the same struct. */
    rustIsTypedMarketWrite(n: any): boolean;
    rustMarketLocalUsesAll(declaration: any, name: string, acceptUse: (n: any) => boolean): boolean;
    /** `x[m['k']]` / `this.f[m['k']] = v` with a listed string field `k`: the key read of a market struct. */
    rustMarketKeyOfLookup(n: any): boolean;
    /** `m === undefined` / `m !== undefined` (either side). */
    rustIsNullTestOf(n: any): boolean;
    rustMarketLocalIsTypedUncached(declaration: any): false | 'struct' | 'opt' | 'call' | 'smkt';
    rustOptMarketKeyRead(n: any): boolean;
    /** `crate::value::KeyRead::key_read(&&m, "k")` for a direct read on an `Option<Market>` local. */
    printOptMarketKeyRead(node: any): string | undefined;
    /** The Rust result type of an awaited typed core call other than `market` that decodes into a struct. */
    rustTypedCallResultType(init: any): string | undefined;
    private static readonly RUST_RAW_RECORD_TYPES;
    /** `'vec'` for a `Vec<record>` typed result, `'map'` for `Tickers` (`HashMap<String, Ticker>`). */
    rustTypedResultElemKind(init: any): 'vec' | 'map' | 'map2' | undefined;
    /** `xs.length`, `xs[i]` (int literal / int-literal counter) on a Vec result, `xs[k]` (a `Value` key) on a map result. */
    rustTypedResultElemUse(n: any, elem: 'vec' | 'map' | 'map2'): boolean;
    /** `n` is the sole argument of `Object.keys (n)`. */
    rustTypedResultKeysUse(n: any): boolean;
    /** `Object.keys (r)` on a typed keyed result local (`HashMap<String, T>`): its own keys, in the order `into_raw` listed them. */
    printTypedResultKeys(node: any): string | undefined;
    /** ral-65k: the checker types `k` as plain `string` (no `undefined` / `null` member). */
    rust65kPlainStringKey(k: any): boolean;
    /** `x` is read only: not written, deleted, updated or called. */
    rustTypedResultReadOnlyAt(x: any): boolean;
    /** Element-access hook: the native read of a typed result element, boxed through its shared record handle. */
    printTypedResultElemRead(node: any): string | undefined;
    rust67gSafeDictElemUse(n: any): boolean;
    rust67gIndexText(key: any, mark: boolean): string | undefined;
    /** Call hook: the native `safeDict` read of a typed result row. */
    printTyped67gSafeDict(node: any, identation: number): string | undefined;
    printTypedResultIndex(key: any): string;
    private rustRecordElemDecisions;
    rustRecordElemLocal(declaration: any): string | undefined;
    rustRecordElemLocalUncached(declaration: any): string | undefined;
    rustRecordElemLocalOf(node: any): any;
    private rustBookSideDecisions;
    rustBookSideLocal(declaration: any): boolean;
    rustBookSideLocalUncached(declaration: any): boolean;
    rustBookSideLocalOf(node: any): boolean;
    private rustBookSideParams;
    rustBookSideParam(param: any): boolean;
    private static readonly RUST_BOOK_SIDE_GROUP;
    rustBookSideGroupParam(param: any): boolean;
    rustBookDeltasParam(param: any): boolean;
    private static readonly RUST_STRLIST_GROUP_PARAMS;
    rustStrListGroupParam(param: any): boolean;
    /** `this.safeString (xs, i[, default])` on a lent string-list group slot: the reader takes the slice (`impl KeyRead`). */
    rustStrListGroupSafeReadUse(id: any): boolean;
    /** `this.safeValue / safeList (deltas, i)` on a lent deltas list: the reader takes the slice (`impl KeyRead`). */
    rustBookDeltasSafeReadUse(id: any): boolean;
    /** Every use of the parameter is a side operation statement, a `length` read, a level read or a side-slot hand-on. */
    rustBookSideUsesOnly(param: any, allowNone: boolean): boolean;
    rustBookSideAnnotation(type: any): boolean;
    rustBookSideParamUncached(param: any): boolean;
    /** The argument lands in a side parameter slot of a `this.<m>(..)` call. */
    rustBookSideArgSlot(n: any): boolean;
    /** Argument text for a side slot: a side handle passes whole, anything else is wrapped once. */
    printBookSideArg(arg: any, identation: number): string;
    private static readonly RUST_BOOK_PARAM_GROUP;
    private rustBookParams;
    rustBookParam(param: any): boolean;
    /** Proves every use of a book parameter with the book-local forms (no write of the parameter itself). */
    rustBookParamUses(param: any): 'opt' | undefined;
    /** The argument lands in a book parameter slot of a `this.<m>(..)` call. */
    rustBookParamArgSlot(n: any): boolean;
    /** Argument text for a book slot: an optional book local or book parameter is lent, anything else is boxed once. */
    printBookParamArg(arg: any, identation: number): string;
    printBookSideLocal(declaration: any, indent: string, varName: string): string | undefined;
    /** `s.length` / `s[i]` on a side handle: the marker's own length and level reads. */
    printBookSideRead(node: any): string | undefined;
    /** A record element handle handed on whole (`list.push (r)`, `return r`) boxes the row's shared handle there. */
    printRecordElemBox(node: any): string | undefined;
    /** `let mut r: Option<&crate::types::T> = rows.get(i)` for a record element handle. */
    printRecordElemLocal(declaration: any, indent: string, varName: string): string | undefined;
    rustMarketLocalOfKind(node: any, kind: string): any;
    rustCallLocalOf(node: any): any;
    rustOptMarketLocalOf(node: any): any;
    /** The typed `this.market (x)` call, unboxed; its `Err` re-raises as the untyped call did. */
    printTypedMarketValue(call: any): string | undefined;
    /** `m = this.safeMarket (..)` as its own statement. */
    rustIsSafeMarketWriteOf(n: any): boolean;
    /** `m = this.getMarketFromSymbols (..)` as its own statement. */
    rustIsOptMarketWriteOf(n: any): boolean;
    private static readonly RUST_OPT_MARKET_RETURNS;
    rustReturnsOptMarket(node: any): boolean;
    private static readonly RUST_OPT_OUTCOME_RETURNS;
    private static readonly RUST_OPT_OUTCOME_BY_NAME;
    /** ral-50c: prediction venue methods that answer the outcome record (overrides of `fetchOutcome`, predictfun `outcomeForToken`). */
    private static readonly RUST_OPT_OUTCOME_VENUE_RETURNS;
    /** ral-48c: `outcome` / `safeOutcome` / `loadOutcome` of the prediction base class, declared with the outcome record. */
    rustReturnsOptOutcome(node: any): boolean;
    /** ral-48c: `await this.loadOutcome (..)` is the call itself for the `Option<Market>` proofs. */
    rustSkipOutcomeAwait(node: any): any;
    private rustVenueOptMarketDecisions;
    rustVenueReturnsOptMarket(node: any): boolean;
    /** `this.getMarketFromSymbols (..)` resolving to the typed base method (or a venue `rustVenueReturnsOptMarket` one). */
    rustIsOptMarketCall(init: any): boolean;
    /** ral-50c: `super.fetchOutcome (s)` in a prediction venue override declared with the outcome record (`super_fetch_outcome` answers `Option<Market>`). */
    rustSuperFetchOutcome(call: any): boolean;
    /** ral-50c: `c ? this.outcome (s) : {}` (either arm order): the outcome arm. Its local only takes key reads, where `None` reads as `{}` did. */
    rustOptOutcomeEmptyTernary(init: any): any;
    /** `c ? undefined : this.market (s)` (either arm order): the `this.market` arm. */
    rustOptMarketTernary(init: any): any;
    rustOptSafeMarketTernary(init: any): {
        arm: any;
        other: any;
    } | undefined;
    /** `(if c { Some(self.safe_market(..)) } else { market.cloned() })` for the ternary above. */
    printOptSafeMarketTernary(init: any): string | undefined;
    /** `(if c { None } else { Some(market) })` for an `Option<Market>` ternary initializer. */
    printOptMarketTernary(init: any): string | undefined;
    /** ral-50c: `(if c { self.outcome(s) } else { None })` for a `{}`-armed outcome ternary. */
    printOptOutcomeEmptyTernary(init: any): string | undefined;
    /** ral-48c: `await this.loadOutcome (..)` in a `Value` place: the answer boxed once after the `.await`. */
    printOptOutcomeAwaitBox(node: any, identation: number): string | undefined;
    /** `return x` in an `Option<Market>` method. */
    printOptMarketReturnValue(exp: any): string;
    private rustOptMarketBoxing;
    /** An `Option<Market>` call in a `Value` place: boxed once (its record's `raw`). */
    printOptMarketCallBox(node: any, identation: number): string | undefined;
    rustMarketAliasWriteSource(n: any): any;
    /** The `Option<Market>` local an alias write `m = s` stores the struct local `s` into. */
    rustMarketAliasTargetOf(n: any): any;
    /** ral-50c: `m = market` as its own statement, `market` a lent `Option<&Market>` parameter: stores `market.cloned()`. */
    rustIsSlotParamWriteOf(n: any): boolean;
    /** ral-50c: `d[m['k']]`: a literal-key read of the local used as another map's key (read through `KeyRead`, a `Value`). */
    rustOptMarketKeyAsKey(n: any): boolean;
    /** `m = undefined` as its own statement. */
    rustIsNullWriteOf(n: any): boolean;
    /** A later `m = this.market (y)` on a struct local (`Some(..)` on an `Option<Market>` one). */
    printTypedMarketWrite(left: any, right: any): string | undefined;
    /** The null test sits in a `bool` place (a condition, a `!` / `&&` / `||` operand of one, or a ternary test). */
    rustNullTestIsCondition(n: any): boolean;
    /** `m === undefined` on an `Option<Market>` local. */
    printOptMarketNullTest(left: any, right: any, op: any): string | undefined;
    rustMarketArmStrKind(node: any): string | undefined;
    /** The native text of a `rustMarketArmStrKind` read for a local of `kind`. */
    rustMarketArmStrText(kind: string, node: any): string | undefined;
    /** The struct local behind an identifier use (never the declaration name). */
    rustTypedMarketLocalOf(node: any): any;
    /** `let mut market: crate::types::Market = …` — the typed call, its `Err` re-raised as the untyped call did. */
    printTypedMarketLocal(declaration: any, indent: string, varName: string): string | undefined;
    rust84eBoolArmKind(arm: Node): string | undefined;
    private rust87reLocalSeeds;
    /** A `const x = <comparison>` initializer whose native text exists and whose local's checker type is `boolean`. */
    rustBoolCompareSeed(node: any): boolean;
    rustMarketFieldScalar(node: any, placed?: boolean): {
        kind: string;
        text: string;
    } | undefined;
    rust90rcNilWriteArm(node: Node | undefined): boolean;
    rust57kMarketTernaryArm(top: any): boolean;
    /** A read off a struct local: a listed field natively, any other key off `raw`; `asBool` for a condition slot. */
    printTypedMarketRead(node: any, asBool?: boolean): string | undefined;
    private static readonly RUST_MARKET_FLAG_KEYS;
    /** `const f = m['stock']` off a struct local, tested as a condition: `f.as_bool() == Some(true)`. */
    printTypedMarketFlagLocalCondition(node: any): string | undefined;
    /** A whole-value hand-off of a struct local: the `Value` the untyped local held. */
    printTypedMarketValueUse(node: any): string | undefined;
    private static rustTypedLiteralArg;
    printRustFunctionType(node: any): string;
    printMethodDeclaration(node: any, identation: any): string;
    rustFreeFnFirstDefault(node: any): number;
    printFunctionDefinition(node: any, identation: any): string;
    printFunctionDeclaration(node: any, identation: any): string;
    printOutOfOrderCallExpressionIfAny(node: any, identation: any): string;
    /** A bare local name (not `self`/`true`/`false`): passing it by value needs a `.clone()`. */
    static isBareLocal(text: string): boolean;
    /** `text.clone()` for a bare local, else `otherwise` (default: the text itself). */
    static cloneIfBareLocal(text: string, otherwise?: string): string;
    private static readonly RUST_RUNTIME_VARIADIC_ARITY;
    private static readonly RUST_TEST_VARIADIC_ARITY;
    printRuntimeVariadicCall(node: any, receiver: string, methodName: string, identation: number, testCrate?: boolean, handleProven?: boolean): string | undefined;
    printOptionalArgsSliceCall(node: any, receiver: string, methodName: string, fixed: number, identation: number): string | undefined;
    printSuperMarketSlotCall(node: any, methodName: string, identation: number): string | undefined;
    rustSliceArgText(a: string): string;
    rustCalleeIsRuntimeBase(node: any): boolean;
    rustCallsTestExchange(node: any): boolean;
    rustCallsRuntimeHandle(node: any): boolean;
    printImplicitApiCall(node: any, methodName: string, identation: number): string | undefined;
    printTranspiledVariadicCall(node: any, receiver: string, methodName: string, identation: number): string | undefined;
    rustTranspiledCalleeParams(node: any, methodName: string): any[] | undefined;
    printArgsForCallExpression(node: any, identation: any): string;
    rustHelperWriteReadsRoot(baseExpr: any, value: any): boolean;
    /** A bare local argument whose hand-off needs no clone (`rustOwnedUseIsFree`) carries the owned-use mark. */
    rustOwnedArgText(arg: any, text: string): string;
    rustPrintedArgs(node: any, identation: any, params?: any[]): string[];
    private static readonly RUST_PRECISE_TRIMMED;
    printRustNamespaceCall(node: any, identation: any): string | undefined;
    /** `eddsa` / `jwt` / `rsa` return a `String`: boxed once at a `Value` slot, bare for typed locals and `format!` operands. */
    printRustSignerCallBoxed(node: any, identation: any): string | undefined;
    printRustSignerCall(node: any, identation: any): string | undefined;
    private static readonly RUST_BY_VALUE_CALLEE;
    /** `x = y;` / `let mut x: Value = y;` on its own line moves `y`: the source is cloned so it stays usable. */
    static cloneAliasSources(text: string, commented?: boolean): string;
    /** Clone every bare-local argument of each by-value call in `text` (an argument already `x.clone()` is left). */
    /** `\u0004` before a bare lent argument: not a bare local to `cloneByValueCallArgs`, stripped from the file text. */
    static rustLentMark(text: string): string;
    private static readonly RUST_BY_VALUE_CALLEE_NO_SUPER;
    static cloneByValueCallArgs(text: string, superCalls?: boolean): string;
    static cloneSliceElements(text: string): string;
    private static readonly RUST_CACHE_CALL_HEADS;
    private static readonly RUST_CACHE_CALL_HEADS_TEST;
    static cloneCacheCallArgs(text: string, on: boolean, exchange: boolean): string;
    static cloneHelperWriteValues(text: string): string;
    private static rustBalancedClose;
    private static rustSplitTopLevel;
    printCallHead(node: any, parsedExpression: string, parsedArgs: string): string;
    /** First parameter of a venue override of a lent `DerivedExchange` slot (same arity as the slot): `impl Into<crate::Value>`. */
    rustLentSlotParam(param: any): boolean;
    rustPrintedParams(method: any): any[];
    /** A venue (not base-tier) method overriding a lent slot with the slot's arity. */
    rustLentSlotOverride(method: any): boolean;
    /** A sync venue method overriding a `DerivedExchange` slot with the slot's arity (its body may sit in the trait impl). */
    rustSlotOverrideBody(method: any): boolean;
    /** File of the base-tier class above the venue override `method` when it declares `name` (its base trait has the method). */
    rustBaseTierDeclarer(method: any, name: string): string | undefined;
    rustSlotCallPath(node: any): {
        path: string;
        snake: string;
        receiver: 'self' | 'parent';
    } | undefined;
    /** The whole call printed through its trait path (`rustSlotCallPath`), or undefined when method syntax stays. */
    rustSlotCallHead(node: any, args: string): string | undefined;
    printCallExpression(node: any, identation: any): any;
    printFreeFnDefaultArgsCall(node: any, identation: any): string | undefined;
    printDynamicSelfRead(node: any): string | undefined;
    rustDynamicSelfCallee(callee: any): boolean;
    printDynamicSelfCall(node: any, identation: any): string | undefined;
    printThisKeyword(node: any, identation: any): string;
    private static readonly RUST_ERROR_CONSTRUCTOR_ARGS;
    printErrorConstructorArg(name: string, index: number, node: any, identation: number): string;
    rustErrorConstructorName(className: string): string;
    printNewExpression(node: any, identation: any): any;
    rustErrorCtorValueTarget(node: any): boolean;
    /** Printed class expression of a `new` whose class is a runtime value, else undefined. */
    rustDynamicErrorClass(node: any): string | undefined;
    printStringMemberOfClassParam(node: any, receiverText: string): string | undefined;
    printPropertyAccessExpression(node: any, identation: any): any;
    static readonly MUT_SELF_METHODS: Set<string>;
    static readonly RUST_PARSE_HELPERS: Record<string, string>;
    private static readonly RUST_SNAKE_CACHE;
    toSnakeCaseName(name: string): string;
    escapeRustStringLiteral(text: string): string;
    getCheckedTypeOf(node: any): Type | undefined;
    typeSymbolOf(type: Type): TsSymbol | undefined;
    isLibDeclaredType(type: Type): boolean;
    isClassInstanceType(type: Type): boolean;
    hasCallableShape(type: Type): boolean;
    isProvenListType(type: Type): boolean;
    isProvenMapType(type: Type): boolean;
    rustTypeIsNullish(type: Type): boolean;
    isProvenMapExpression(node: Node): boolean;
    isProvenListExpression(node: Node): boolean;
    rustNativeListSource(node: Node): boolean;
    rustCallPrintsRuntimeSplit(node: Node): boolean;
    rustCallReturnsProvenList(node: Node): boolean;
    private rustProvenListCall;
    /** Implementation of a `x.y(..)` call, when the checker resolves one. */
    private rustCalleeDeclaration;
    private rustFunctionReturnsArrayLiteral;
    /** Native list-index read of a generator temp (`__destr_tmp.as_array()…`). */
    printNativeListIndex(receiverText: string, index: number, receiverNode?: Node): string;
    /** Element read of a `Vec<Value>` binding (a destructuring temp the printer declares typed). */
    printTypedVecElementRead(name: string, index: number): string;
    private rustTupleSlotDecisions;
    rustTupleSlotKind(element: any): string | undefined;
    private rustTupleSlotKindUncached;
    /** ral-66s1: every boxed hand-off of a string slot fits the line budget and none sits in a nested-write key position. */
    rust66s1StrSlotCopyBoxesOk(element: any, fn: any): boolean;
    rustStrSlotBoxesFit(element: any, fn: any): boolean;
    /** Trial of the exact-slot route for a slot whose tuple decision is pending; its cache entry is restored after. */
    rustStrSlotExactRouteTakes(element: any, fn: any): boolean;
    rustBoolSlotLogicalUse(n: any): boolean;
    rust68dBoolSlotLogicalInit(n: any): boolean;
    rustBoolSlotTrueTest(n: any): boolean;
    rustStrSlotBoxUse(n: any): boolean;
    /** A `+` operand of a thrown error message: the statement diverges, so the slot moves into its `format!`. */
    rustStrSlotThrownConcat(n: any): boolean;
    private rustStrSlotConcatUses;
    rustStrSlotConcatUse(n: any, element: any): boolean;
    /** Read hook: a concat use recorded by the slot decision (no re-print here, the decision already measured it). */
    printRustStrSlotConcat(node: any): string | undefined;
    /** `x.clone().map(Value::from).unwrap_or(Value::Null)` at a boxed use of a typed string slot. */
    printRustStrSlotBox(node: any): string | undefined;
    /** The slot's final read: no later use, no other use in its statement, no loop or closure since the destructure. */
    rustStrSlotLastUse(node: any, declaration: any): boolean;
    rustOptionalParamsSlot(call: any, arg: any): boolean;
    /** The trailing `params: Dict = {}` of a venue's own non-unified method (the wide optional slot), handed the typed `params` slot. */
    rustParamsHelperSlot(call: any, arg: any): boolean;
    /** `Value::from(&x)` for a handed dict local riding in an optional params slot. */
    printOptionalParamsArg(node: any, text: string): string | undefined;
    /** `let mut a: Option<String> | bool = <temp>.get(i)..` for a typed tuple slot, else undefined. */
    printRustTupleSlotLocal(element: any, printedName: string, temp: string, index: number, nativeList: boolean, indent: string): string | undefined;
    private rustExactSlotDecisions;
    private static readonly RUST_EXACT_INT_PRODUCERS;
    private static readonly RUST_EXACT_BOOL_PRODUCERS;
    rustExactSlotKind(element: any): string | undefined;
    rustExactCopySlotSeed(element: any): string | undefined;
    rustCopySlotAliasTarget(n: any, kind: string, element: any): boolean;
    private rustExactSlotKindUncached;
    private static readonly RUST_HANDWRITTEN_SLOT_KINDS;
    rustProducerSlotPrimitive(init: any, at: number, depth?: number): string | undefined;
    /** The checker's primitive kind of a destructured slot, else the producer-side proof (41i). */
    rustSlotPrimitiveKind(element: any): string | undefined;
    /** The callee builds slot `at` from an exact Int-or-null (`int`) / Bool-or-null (`bool`) producer on every return. */
    rustExactSlotCallee(init: any, at: number, want: string): boolean;
    /** An expression that is exactly Int-or-null / Bool-or-null in the `Value` form. */
    rustExactScalarExpr(expr: any, want: string, method: any, depth: number): boolean;
    /** `let mut a: Option<i64> | Option<bool> | Option<f64> = <temp>.get(i)..` for an exact slot, else undefined. */
    printExactSlotLocal(element: any, printedName: string, temp: string, index: number, indent: string): string | undefined;
    /** Native read for one chain level, or undefined to keep `get_value`. */
    printNativeBookFieldRead(receiverText: string, receiverNode: Node, keyText: string, viaStore?: boolean): string | undefined;
    printNativeContainerAccess(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined;
    printNativeDynamicListIndex(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined;
    printTypedIntKeyListIndex(receiverText: string, keyNode: Node): string | undefined;
    isWriteBackBindRead(read: Node): boolean;
    rust90rdTypedRowBind(bind: Node): boolean;
    rustExplicitWriteBackBind(read: any): boolean;
    rustStatementMutatesLocal(node: Node, name: string): boolean;
    isRustValueIndexKey(node: Node): boolean;
    /** Strips `( )`, `as T` and `!` wrappers. */
    /** The first ancestor of `node` that is not a parenthesis / `as` / non-null wrapper. */
    rustSkipWrappersUp(node: any): any;
    rustSkipWrappers(node: any): any;
    rustProvenDictParameter(node: Node): ParameterDeclaration | undefined;
    /** `Str` (`string | undefined`) — the key box is `Value::Str` or Null. */
    rustKeyIsProvenString(node: Node): boolean;
    rustProvenDynamicMapReceiver(node: Node): Declaration | undefined;
    /** The element-access read a key node belongs to (`x[k]`, `x[(k)]`). */
    rustElementReadOfKey(keyNode: Node): Node | undefined;
    /** `x[k]` where `x` is a proven-dict parameter and `k` a proven string. */
    printNativeDynamicMapAccess(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined;
    rustNodeIsKeyUnsafePlace(keyText: string): boolean;
    private paramShadowCache;
    private paramShadowEmitted;
    private rustParamShadowEmittedSet;
    rustParamShadowTables(): Map<Node, Map<string, RustParamShadow>>;
    rustParamShadowLines(fn: Node, identation: number): string;
    private rustParamShadowTable;
    /** The shadow a read receiver resolves to, or undefined (no proof → helper). */
    rustParamShadowOf(node: Node): RustParamShadow | undefined;
    /** True when the enclosing function already binds this name somewhere. */
    private rustFunctionDeclaresName;
    private collectRustParamShadows;
    isProvenShadowListType(type: Type): boolean;
    private rustParamShadowUseCensus;
    private rustShadowEnumKeysLocal;
    /** `k` is `const k = keys[i]` with `const keys = Object.keys (p)` on the same parameter `p`: a key the map holds. */
    private rustParamOwnKeysElementKey;
    private rustParamUseIsRead;
    private rustShadowKeyIsReadable;
    private rustShadowSafeReadKeyParam;
    private rustShadowKeyIsLiteral;
    /** Keys whose text is safe to inline into a rust string literal. */
    private rustShadowKeyLiteral;
    /** `this.safeString`-style callee of a call, or undefined. */
    private rustShadowSafeCallee;
    printShadowContainerRead(shadow: RustParamShadow, keyNode: Node): string | undefined;
    /** `'k' in x` on a shadowed dict parameter. */
    printShadowInOperator(shadow: RustParamShadow, keyNode: Node): string | undefined;
    /** A shadow dict key: an inlinable literal, or a proven-string plain place. */
    private rustShadowMapKey;
    /** `x.length` on a shadowed list parameter — `get_array_length` natively. */
    printShadowLength(node: any, shadow: RustParamShadow): string | undefined;
    rustShadowSafeReadOf(node: any): string | undefined;
    rustValueBorrowsSelf(node: any): boolean;
    printShadowSafeReadCall(node: CallExpression): string | undefined;
    /** The borrowed view bound by the shadow. */
    private static readonly PRO_HANDLER_SHADOW_NAME;
    /** TS helper name -> emitted match kind. */
    private static readonly PRO_HANDLER_SHADOW_SAFE_READS;
    rustProHandlerMessageParam(node: Node): ParameterDeclaration | undefined;
    rustProHandlerParamIsWritten(param: ParameterDeclaration, name: string): boolean;
    rustProHandlerShadowPlan(node: Node, identation: number): {
        param: ParameterDeclaration;
        lines: string;
    } | undefined;
    printProHandlerShadowRead(node: Node, probe?: boolean): string | undefined;
    rustProShadowScalarText(kind: string, node: Node): string | undefined;
    rustProHandlerShadowDefaultShape(node: Node): boolean;
    rustProHandlerShadowDefault(node: Node): string | undefined;
    rustProHandlerShadowReadText(kind: string, key: string, dflt: string): string;
    private rustDictPhase;
    private rustDictSites;
    private rustDictDecisions;
    private rustDictOwnerDepth;
    private rustDictHoistHosts;
    /** Base `Exchange` fields that hold plain, tag-free runtime state (never a cache/book marker). */
    static readonly RUST_DICT_FIELDS: Set<string>;
    /** Fields whose values are themselves Dicts (cache containers / client handles). */
    static readonly RUST_DICT_VALUE_FIELDS: Set<string>;
    static readonly RUST_DICT_TAGGED_ENTRY_FIELDS: Set<string>;
    static readonly RUST_DICT_MARKER_KEYS: RegExp;
    /** Base callees that only ever return a Dict (the content may still carry a marker). */
    static readonly RUST_DICT_CALLEES: Set<string>;
    /** Name of the base-Exchange runtime-state field behind `this.<name>`, else undefined. */
    rustDictField(node: Node): string | undefined;
    rustDictSite(site: {
        free?: string;
        closure: string;
        helper?: string;
        guarded?: boolean;
    }): string;
    /** Dict read keyed by a Str place: closure-free when both operands are side-effect-free places. */
    rustDictRead(recv: string, key: string, node: Node, guarded?: boolean): string;
    /** `K.as_str().and_then(|__k| D.get(__k))` on a shadowed parameter map. */
    rustShadowKeyRead(shadow: string, key: string, node: Node): string;
    /** `K.as_str().map(|__k| D.contains_key(__k)).unwrap_or(false)` on a shadowed parameter map. */
    rustShadowKeyHas(shadow: string, key: string, node: Node): string;
    /** Key text a dict read can take as `K.as_str()`: any printed place/expression that is not a boxed literal. */
    rustDictKeyText(keyNode: Node): string | undefined;
    rustFieldDynamicRead(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined;
    rustDictLocalProof(ident: Node): 'plain' | 'dicty' | undefined;
    /** 'plain' for a fresh object literal (or nullish when `allowNullish`), 'dicty' for a dict-only base callee. */
    rustDictSource(node: any, allowNullish: boolean): 'plain' | 'dicty' | undefined;
    /** `X[k]` on a proven local with a non-literal key. */
    rustLocalDictRead(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined;
    /** `X['k']` on a proven local, for a key the runtime does not route to a marker store. */
    rustLocalDictLiteralRead(receiverText: string, receiverNode: Node, keyText: string): string | undefined;
    /** `k in D` on a base-field / field-container map or a proven local: `in_op`'s Dict arm. */
    rustDictInOp(key: Node, obj: Node): string | undefined;
    rustFieldNestedInsert(node: Node, baseExpr: any, keys: any[], keyStrs: string[], rhs: string): string | undefined;
    rustDictReadInNativeInsert(acc: string, receiver: Node, key: Node, chain: Node): string | undefined;
    rustDictCloneGrowth(line: string): number;
    /** `this.<field>['k'].length`: a read-only use of a literal-key read off a base runtime-state field. */
    rustFieldLengthRead(acc: string, receiver: Node, key: Node, chain: Node): string | undefined;
    /** Statement-like nodes whose finished lines the 400-char budget is measured on. */
    private rustDictIsOwner;
    printNode(node: any, identation?: number): string;
    private printNodeUncloned;
    private rustDictPrintOwner;
    printNativeMapAccess(receiverText: string, receiverNode: Node, keyText: string): string | undefined;
    static readonly RUST_DICT_LOCAL_UNSAFE_KEYS: Set<string>;
    rustDeclarationOfIdentifier(node: Node): Declaration | undefined;
    /** Initializer shapes that construct or return a plain dict. */
    rustDictProducingInitializer(node: Node | undefined, seen: Set<Node>): boolean;
    /** D2: the proof holds only while nothing re-assigns the local. */
    rustLocalIsReassigned(declaration: Declaration, name: string): boolean;
    rustIsDeclaredDictLocal(node: Node): boolean;
    rustWsOrderBookClassType(type: Type | undefined): boolean;
    rustDictBearerType(type: Type | undefined): boolean;
    rustParameterIsClientHandle(declaration: ParameterDeclaration): boolean;
    /** The ws `Client` class (or a union with it); its type symbol is the file's `default` export. */
    rustIsWsClientType(type: Type | undefined): boolean;
    foldParsedStringLiteral(name: string, text: string): string | undefined;
    /** ral-41a: `parseInt (x as string)` whose one argument is the cast `top` of an `Option<String>` local. */
    rustParseIntOfOptStr(call: any, top: any): boolean;
    /** ral-73h: `str` / `ostr` when `arg` is a bare identifier of a typed string local (the one argument of `parseInt` / `parseFloat`). */
    rust73hParseStrLocalKind(arg: any): string | undefined;
    /** ral-73h: `n` is the sole bare argument of a global `parseInt` / `parseFloat` call. */
    rust73hParseArgUse(n: any): boolean;
    printNativeParseCall(node: CallExpression): string | undefined;
    isNodeInsideNode(node: Node, container: Node): boolean;
    rootPlaceText(node: Node): string | undefined;
    isNativeAccessPositionSafe(node: Node, ignoreAssign?: Node): boolean;
    /** `(x.k as T).push(..)`: the cast wrapper hides the push receiver from the position check. */
    isCastOrParenOperand(node: Node): boolean;
    /** Receiver shapes whose printed text is a single `Value` place (`x`, `this.x`). */
    isShallowValueReceiver(node: Node): boolean;
    isNativeWriteTargetBase(node: Node): boolean;
    transformPropertyAcessExpressionIfNeeded(node: any): any;
    staticKeyLookup(node: any, container: any): string | undefined;
    printElementAccessExpression(node: any, identation: any): any;
    printForStatement(node: any, identation: any): string;
    rustIntCounter(node: any, initStr: string, incrStr: string): {
        name: string;
        sign: '+' | '-';
        literal: string;
        symbol: any;
        start?: any;
    } | undefined;
    rust58nI64CounterStart(declaration: any): any;
    /** True when the identifier is (part of) an assignment target, a `++`/`--` operand or a `for-in/of` head. */
    rustIdentifierIsWritten(id: any): boolean;
    private rustI64Counters;
    /** The place `X` of a `i < X.length` condition over this counter, when its uses are all admissible. */
    rustI64CounterPlan(node: any, counter: {
        name: string;
        symbol: any;
    }): string | {
        cond: string;
    } | undefined;
    /** rd: `i <op> <int literal>` (either side) over a counter: the `Int` payload compares as the `i64` itself. */
    rustI64LiteralCompare(id: any): {
        op: string;
        literal: string;
        counterLeft: boolean;
        float?: boolean;
    } | undefined;
    /** rd: the native compare of a registered `i64` counter against an integer literal, else undefined. */
    printI64CounterCompare(node: any): string | undefined;
    /** A bare counter use that is an argument of a `this.m(..)` call or the value of an `x[k] = i` write. */
    rustI64BoxedUse(id: any): boolean;
    rustBoolSlotWrite(n: any): boolean;
    rustStrSlotWrite(n: any): boolean;
    /** The `__destr_tmp` line keeps the 400-char budget with the slot unwrap and the lent self default (`Value::from(&x)`). */
    private rustStrSlotLineMemo;
    rustStrSlotLineFits(write: any): boolean;
    /** ral-51f: the short head of a string slot write: every slot typed, or slot 0 typed with the boxed rest outside the test tier. */
    rustStrSlotShortHeadSlots(write: any, typedSlots: (string | undefined)[], head: string): boolean;
    /** ral-50f: the typed destructure line of a string slot write would newly cross 400 chars: the short head keeps it under. */
    rustStrSlotShortHead(write: any, printed: string): boolean;
    /** Some write of the initialised local is a string tuple slot (`rustStrSlotWrite`). */
    rustStrSlotWrites(declaration: any): boolean;
    rustStrSlotSelfDefault(n: any): boolean;
    rustBoolSlotUsesOk(declaration: any): boolean;
    rust87rbTrueTest(n: Node): boolean;
    private rustBoolSlotLineMemo;
    rustBoolSlotLineLong(n: any): boolean;
    /** The `usize` index text of a `Value` list read: a registered `i64` counter indexes directly. */
    rustI64IndexText(keyNode: any, place: string): string;
    /** ral-62n: the boxed key text of a typed `String` / `Option<String>` local keying a borrowed index read. */
    rust62nTypedStrKey(key: any): string | undefined;
    rustI64HelperKeyText(keyNode: any, read?: any): string | undefined;
    /** xb: a use of a registered counter in its own function, outside any scalar scope solve (decisions never see a trial counter). */
    rustI64CounterOperand(node: any): boolean;
    /** The registered counter's symbol when `node` is a use of it, else undefined. */
    rustI64CounterOf(node: any): any;
    private rustI64ClosedUses;
    rustI64CounterUse(node: any): boolean;
    rustI64BodyIsClosed(body: any, name: string): boolean;
    /** `i < X.length` whose condition printed as a native compare over a native `len()`: the place `X`. */
    rustLengthCounterBound(node: any, counter: string): string | undefined;
    /** ral-51n: numeric ordering only (an `Int` and a `Float` of one value order the same; equality goes through `is_equal`). */
    private static readonly RUST_NUM_ORDER_OPS;
    private static readonly COMPARISON_OPS;
    private static readonly NATIVE_COMPARISON_OPERATORS;
    isEqualityOp(op: any): boolean;
    isLogicalOp(op: any): boolean;
    printCondition(node: any, identation: any): any;
    rustLogicalChainIsCondition(node: any): boolean;
    /** Bool-slot text of a parenthesised native comparison/predicate, else undefined. */
    printNativeParenthesizedCondition(node: any): string | undefined;
    printTruthyArgument(expression: string): string;
    printAssertCall(node: any, identation: any, parsedArgs: any): string;
    splitFirstArgument(parsedArgs: string): [string, string];
    printComparisonInBooleanContext(node: any, identation: any): string;
    nativeEqualityText(node: any): string;
    unwrapParens(node: any): any;
    hasNativeComparisonOperand(node: any): any;
    printLogicalInBooleanContext(node: any): any;
    printWhileStatement(node: any, identation: any): string;
    printIfStatement(node: any, identation: any): string;
    printPostFixUnaryExpression(node: any, identation: any): string;
    printNativeIncrement(op: any, operand: any, operandText: string): string | undefined;
    printPrefixUnaryExpression(node: any, identation: any): any;
    printObjectLiteralExpression(node: any, identation: any): string;
    rustObjectLiteralBlock(node: any, identation: any): string;
    printArrayLiteralExpression(node: any, identation: any): string;
    printDeleteExpression(node: any, identation: any): string;
    /** `delete this.options['k'][key]`: remove inside the stored sub-dict itself, not from a cloned read of it. */
    rustOptionsSubDictDelete(node: DeleteExpression): string | undefined;
    printInstanceOfExpression(node: any, identation: any): string;
    printConditionalExpression(node: any, identation: any): string;
    private static readonly BOOL_VALUE_PREFIXES;
    private static isBoolValueExpression;
    printTernaryArm(node: any, identation?: number): string;
    printArrayIsArrayCall(node: any, identation: any, parsedArg?: any): string;
    /** `Object.keys/values(p)` on a shadowed Dict parameter (`IndexMap`; `Null` shadows the empty map, the helper's `[]`). */
    printShadowEnum(node: any, kind: 'keys' | 'values'): string | undefined;
    printObjectKeysCall(node: any, identation: any, parsedArg?: any): any;
    printObjectValuesCall(node: any, identation: any, parsedArg?: any): string;
    bearerEnum(node: any, kind: 'keys' | 'values'): string | undefined;
    /** The single plain-identifier argument of `Object.keys/values(…)`. */
    bearerEnumArg(node: any): Identifier | undefined;
    printJsonParseCall(node: any, identation: any, parsedArg?: any): string;
    printJsonStringifyCall(node: any, identation: any, parsedArg?: any): string;
    printMathFloorCall(node: any, identation: any, parsedArg?: any): string;
    printPromiseAllCall(node: any, identation: any, parsedArg?: any): string;
    printAwaitExpression(node: any, identation: any): string;
    printSelfCallShape(node: any, identation: any): string | undefined;
    private static readonly RUST_PROXY_CALLBACK_FIELDS;
    rustValueSpawnCall(node: any): boolean;
    printValueSpawnCall(node: any, identation: any): string | undefined;
    rustInlinesValueSpawn(method: any): boolean;
    printMathRoundCall(node: any, identation: any, parsedArg?: any): string;
    printMathCeilCall(node: any, identation: any, parsedArg?: any): string;
    printNumberIsIntegerCall(node: any, identation: any, parsedArg?: any): string;
    printArrayPushCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printIncludesCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printIndexOfCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printStartsWithCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printEndsWithCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printTrimCall(node: any, identation: any, name?: any): string;
    private rust90rdJoinReads;
    rust90rdListJoinUse(access: Expression): boolean;
    /** ral-90rd R2: the join of a typed list local the borrowed-container rule admitted at this call. */
    printBorrowedListJoin(node: CallExpression): string | undefined;
    printJoinCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printStrSliceJoin(node: any): string | undefined;
    printSplitCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printConcatCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printToFixedCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    printToStringCall(node: any, identation: any, name?: any): string;
    /** `x` is a local of the base `Precise` class: a typed `Precise` struct in Rust (precise.rs) with `integer`, `decimals: i64`. */
    rustPreciseLocal(x: any): boolean;
    /** `p.toString ()` on a `Precise` local: its `Display` text (the TS `toString` port), boxed as the `Str` it always is. */
    printRustPreciseToString(node: any): string | undefined;
    printRustPreciseDecimalsWrite(left: any, right: any): string | undefined;
    /** `k` is declared `Int`-typed and the write sits directly in `if (k !== undefined) { .. }`. */
    rustPreciseGuardedInt(k: any, write: any): boolean;
    printRustStrRuntimeCase(node: any, method: string): string | undefined;
    printToUpperCaseCall(node: any, identation: any, name?: any): string;
    printToLowerCaseCall(node: any, identation: any, name?: any): string;
    printShiftCall(node: any, identation: any, name?: any): string;
    printReverseCall(node: any, identation: any, name?: any): string;
    printPopCall(node: any, identation: any, name?: any): string;
    printSliceCall(node: any, identation: any, name?: any, parsedArg?: any, parsedArg2?: any): string;
    rust44bValueRecvSliceBound(n: any, kind: string): boolean;
    /** ral-44b: the typed (i64 / Option<i64>) text of each slice bound that rust44bValueRecvSliceBound admitted. */
    rust44bSliceBounds(node: any): Array<string | undefined>;
    printReplaceCall(node: any, identation: any, name?: any, parsedArg?: any, parsedArg2?: any): string;
    printReplaceAllCall(node: any, identation: any, name?: any, parsedArg?: any, parsedArg2?: any): string;
    printThrowStatement(node: any, identation: any): string;
    rustCaughtErrorMemo: WeakMap<object, boolean>;
    rustCaughtErrorBinding(catchClause: any): boolean;
    rustCaughtErrorBindingProof(catchClause: any): boolean;
    rustCaughtErrorSink(n: any): boolean;
    rustCaughtErrorClassName(node: any): string | undefined;
    /** `e instanceof K` over a typed caught binding. */
    printCaughtErrorInstanceOf(node: any): string | undefined;
    rustPresenceFlagLocals: WeakSet<object>;
    rustSubscriptionPresenceFlag(declaration: any, parsedValue: string): boolean;
    rustNullTestOnlyFlag(declaration: any): boolean;
    /** `X === undefined` / `X !== undefined` that is the whole `if` condition (parens allowed): '==' / '!='. */
    rustPresenceTest(n: any): string | undefined;
    printPresenceFlagTest(left: any, right: any, op: any): string | undefined;
    rustCatchBindingIsRead(block: Node, name: string): boolean;
    printTryStatement(node: any, identation: any): string;
    /** A statement every path of which returns or throws. */
    rustStatementAlwaysExits(s: any): boolean;
    printRustBoolReturnTry(node: any, identation: any, read: boolean, caught: boolean): string | undefined;
    rustLabelledTryBlocks: Set<object>;
    /** The node sits in a try block printed as `'__try: {`, with no function or nested try in between. */
    rustInLabelledTry(node: any): boolean;
    rustTryBlockOnlyOwnThrows(block: any): boolean;
    printReturnStatement(node: any, identation: any): string;
    printReturnStatementPlain(node: any, identation: any): string;
    printBreakStatement(node: any, identation: any): string;
    printContinueStatement(node: any, identation: any): string;
    printSpreadElement(node: any, identation: any): string;
    private static readonly RUST_PLAIN_DICT_BUILDERS;
    /** Base-tier `[Dict, Dict]` tuple helpers that hand back their `request` argument (index 1). */
    private static readonly RUST_REQUEST_TUPLE_HELPERS;
    /** The base `handleUntilOption` declaration itself. */
    rustUntilPairMethod(node: any): boolean;
    /** A `this.handleUntilOption (..)` call resolving to the base declaration. */
    rustUntilPairCall(node: any): boolean;
    /** `return [ a, b ]` in the base helper: each slot is a map argument (or its `omit`), unboxed once. */
    printRustUntilPairReturn(fn: any, exp: any): string | undefined;
    /** The pair call as printed, unboxed (`undefined` when `node` is not one). */
    rustUntilPairText(node: any): string | undefined;
    private rustUntilPairRaw;
    private rustOwnContainerDecisions;
    private rustOwnContainerBare;
    rustOwnContainerReturn(node: any): 'dict' | 'list' | 'odict' | undefined;
    private static readonly RUST_OWN_RECORD_RETURNS;
    rustOwnContainerReturnUncached(node: any): 'dict' | 'list' | 'odict' | undefined;
    rustOwnOptDictReturn(node: any): 'odict' | undefined;
    /** The `Option<Dict>` text of a return operand of an `rustOwnOptDictReturn` method, else undefined. */
    rustOwnOptDictOperand(exp: any): string | undefined;
    rustBaseStringListReturn(node: any): 'list' | undefined;
    /** `Value::from(vec![..])` / `Value::from(v)` of a built `Vec<Value>`: the `Arc` of that vector. */
    rustBaseListPayload(exp: any): string | undefined;
    /** A checker type that is a map (object, never any / unknown / nullable / array) or a list (array or tuple). */
    rustStaticContainerType(type: any, kind: 'dict' | 'list'): boolean;
    /** The venue container decision of a declaration (the call-site rule's own cache). */
    rustVenueContainerDecisionOf(declaration: any): {
        kind: 'dict' | 'list';
        nullable: boolean;
    } | undefined;
    /** `[await] this.m (..)` of an own-container method: its kind. */
    rustOwnContainerCallKind(expr: any): 'dict' | 'list' | 'odict' | undefined;
    private rustFilterTwinTexts;
    private rustFilterTwinRaw;
    rustFilterTwinKind(call: any): 'dict' | 'list' | undefined;
    rustFilterTwinText(call: any, kind: 'dict' | 'list'): string | undefined;
    /** Top-level comma-separated parts of printed argument text (brackets and string literals respected). */
    rustTopLevelArgs(text: string): string[];
    /** The bare twin call where the own-container rule asks for the native result. */
    printRustFilterTwinBare(node: any): string | undefined;
    rustOwnContainerBareText(node: any): string;
    /** The expression is a statement of its own: its result is thrown away and needs no box. */
    rustDiscardedResult(node: any): boolean;
    /** A value position boxes the native result once; an awaited call boxes after its `.await`. */
    printOwnContainerCallBox(node: any): string | undefined;
    /** The native text of `[await] this.m (..)` for a typed local of the same kind, else undefined. */
    rustOwnContainerNativeText(expr: any, kind: 'dict' | 'list'): string | undefined;
    /** Brackets balance and never close below depth 0 (string contents aside, as the literal rule does). */
    rustBalancedText(text: string): boolean;
    /** The native text of a return operand: an own-container call, or a printed box of the kind (`Value::Map(m)`, `Value::Arr(l)`). */
    rustOwnContainerPayload(exp: any, kind: 'dict' | 'list'): string | undefined;
    rustAwaitedDictEndpointReturn(exp: any): boolean;
    /** A venue method another venue source calls as `this.m (..)`: the child struct reaches the base stub, which keeps `Value`. */
    rustCalledFromOtherVenueFile(fn: any): boolean;
    /** `[await] this.m (..)` whose declaration lives in another venue file than `fn` (an inherited venue method). */
    rustOtherVenueCall(exp: any, fn: any): boolean;
    /** `this.filterBy*SinceLimit (..)` (optionally `as T[]`) of the base, printed as the bare call. */
    rustBaseListFilterOperand(exp: any, printed: string): boolean;
    /** `this.parseX (..)` whose declaration (not nullable) names the same record as `fn`'s own `Promise<Record>` return. */
    rustOwnRecordParserReturn(exp: any, fn: any): boolean;
    /** A `const x = this.m (..)` with no annotation in m's own file: that local stays `Value`, so m keeps its boxed return. */
    rustUntypedLocalCaller(fn: any): boolean;
    /** A plain local declared `string[]` and seeded with `[]`, filled only by `push`: it prints as a `Vec<Value>` of text values. */
    rustBuiltStringList(exp: any): boolean;
    /** A list literal or plain local whose element type is `any` or a map (never string / number lists, which print typed vectors). */
    rustBoxedElementList(exp: any): boolean;
    rustDictTwinText(init: any, printed: string, omit: boolean): string | undefined;
    /** `this.extend (..)` of the runtime base (never a venue override). */
    rustRuntimeExtendCall(exp: any): boolean;
    /** `return x` in an own-container method hands on the payload its operand already holds (never a new conversion). */
    printOwnContainerReturn(fn: any, exp: any): string | undefined;
    rustEmptyDefaultReaderPayload(exp: any, printed: string, kind: 'dict' | 'list'): string | undefined;
    /** Any other use of the pair call takes the `Value` it printed before (a two-map list). */
    printRustUntilPairBox(node: any): string | undefined;
    /** `this.handleUntilOption (..)[i]` with a literal 0 / 1: that map, boxed where the read took a `Value`. */
    printRustUntilPairSlotRead(node: any): string | undefined;
    /** Each slot written from map `__untilN`: the typed slot printer's own `Value::Dict(m).into_dict()` collapses to the move of `m`. */
    rustUntilSlotText(line: string, slot: string): string;
    /** `const [ a, b ] = this.handleUntilOption (..)`: `let (__until0, __until1) = ..;` then each slot from its map. */
    printRustUntilPairDestructure(declaration: any, parsedElements: string[], indent: string): string | undefined;
    /** `[ a, b ] = this.handleUntilOption (..)`: one block, each slot written from its map. */
    printRustUntilPairWrite(left: any, right: any): string | undefined;
    rustNativeDictInsert(baseExpr: any, keyNode: any, keyText: string, valueText: string): string | undefined;
    rustLocalStaysPlain(ident: Identifier, depth?: number): boolean;
    private rustTupleBindingStaysPlain;
    /** The shipped construction proof (literal-built local / handler tuple), read-only. */
    private rustShippedPlain;
    private rustUseKeepsPlain;
    private rustRequestTupleWrite;
    private rustTupleHeadIsPlain;
    /** A pass-through parameter: never assigned in the method body. */
    private rustParamUnassigned;
    /** A value that is a fresh plain dict, nullish, or the local itself. */
    rustPlainSource(node: Node, name: string): boolean;
    private rustCalleeIsBase;
    /** The class property declaration behind `this.<name>` when its annotation proves a plain dict. */
    rustProvenDictThisField(node: Node): Declaration | undefined;
    rustProvenDictThisFieldElement(node: Node): boolean;
    /** `this.<field>[k]` with a proven-dict field and a proven string key place. */
    printNativeThisFieldDynamicMapAccess(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined;
    private rustVecLocalDecisions;
    rustVecLocalIsTyped(declaration: any): boolean;
    rustVecLocalIsTypedUncached(declaration: any): boolean;
    rustVecNativeLiteral(declaration: any): string | undefined;
    rustVecPushShape(call: any, name: string): boolean;
    rustVecValueUse(n: any, name: string): boolean;
    rustVecIsFinalUse(n: any, name: string): boolean;
    rustVecBoxingCallee(callee: any): boolean;
    rustVecLocalDeclarationOf(node: any): any;
    printRustVecPush(node: any, name: string | undefined, parsedArg: string | undefined): string | undefined;
    transformIdentifier(node: any, identifier: any): string;
    private literalKeyHits;
    /** ral-wf: element reads admitted only through the self-write position rule for the local being decided. */
    private literalSelfWriteHits;
    /** Same-named sibling bindings `literalLocalUsesAll` skipped for the local being decided. */
    private literalSiblingBindings;
    literalLocalUsesAll(declaration: any, name: string, acceptUse: (n: any) => boolean): boolean;
    literalKeyWidened(keyArg: string | undefined): boolean;
    /** `return x`, bare or under a cast: the statement leaves the function, so the box moves. */
    rustReturnOperand(node: any): boolean;
    rustCastReturnOperand(node: any): boolean;
    rustLiteralBearerKeyArg(receiver: any, keyNode: any): string | undefined;
    rustValueKeyLocalArg(key: any, text: string, receiverName: string): string | undefined;
    private rustDictBearerDecisions;
    /** Bearers whose escapes all box a clone (the prediction-tier multi-escape rule). */
    private rustDictBearerCloned;
    /** The single move of a literal bearer into a list element / a ws settle or send value (`rustLiteralMoveSlot`). */
    private rustLiteralMoves;
    rustLiteralMoveSlot(n: any): boolean;
    rust76gTernaryMoveUse(n: any): boolean;
    rust76gTernaryArmMove(up: any, n: any): boolean;
    rust73aNilDictAliasWrite(n: any): boolean;
    rust73aThisFieldStore(n: any): boolean;
    /** A prediction venue: `ts/src/prediction/<id>.ts` builds nested request maps in one method. */
    private static readonly RUST_PREDICTION_VENUE_FILE;
    /** The declaration behind `node` when it is a local typed as a dict bearer. */
    rustDictBearerDeclaration(node: any): any | undefined;
    rustDictLocalIsTyped(declaration: any): boolean;
    rustDictLocalIsTypedUncached(declaration: any): boolean;
    private rustReaderTables;
    rustReaderTableLocal(declaration: any, literal: any): boolean;
    rustAlwaysListProducer(call: any): boolean;
    rustDictProducer(node: any): boolean;
    copyOnlyPlainMap(arg: any): boolean;
    rustProducerReuse(node: any): boolean;
    private static readonly RUST_DICT_PRODUCER_CALLEES;
    private static readonly RUST_BUILDER_PASSTHROUGH;
    private static readonly RUST_BUILDER_PASSTHROUGH_WIDE;
    private rustFreshWide;
    rustPassthroughLiteralLeaf(arg: any): boolean;
    rustBuilderPassthrough(method: string): boolean;
    private static readonly RUST_LIST_PASSTHROUGH;
    /** `x` read as the list argument of a base pass-through (`filterBy* (x, ..)` / `sortBy* (x, ..)`). */
    rustListPassthroughArg(node: any): boolean;
    rustListPassthroughCall(call: any): boolean;
    rust90rgBaseTailForward(owner: Node, inner: Node): MethodDeclaration | undefined;
    rust90rgImplReturnsList(impl: MethodDeclaration): boolean;
    rustCallBuildsContainer(call: any, kind: 'map' | 'list', depth?: number): boolean;
    rustScalarStoreValue(value: any): boolean;
    rustInitReadsTaggedStore(node: any): boolean;
    rustLocalStoreHandOff(n: any): boolean;
    /** `this.<field>` or `this.<field>[…]` — a store the runtime may tag. */
    /** zf: `this.balance[..]` / `this.options[..]` (any depth): the plain untagged store maps the r05 insert writes into. */
    rustBalanceOptionsPlace(node: any): boolean;
    rustThisRootedPlace(node: any): boolean;
    rustBuiltContainerKind(node: any, depth?: number): 'map' | 'list' | undefined;
    rust92rgListLiteralDefault(arg: Node): boolean;
    private rustLocalContainerWritesOnly;
    boxSiteOk(node: any): boolean;
    nativeReadCallee(call: any): boolean;
    private static readonly NATIVE_READ_NAMESPACES;
    rustDictBearerElementUse(access: any, name: string): boolean;
    rustBearerTypedStrReadKey(access: any): string | undefined;
    rustOwnedWriteBackPushBind(access: any): boolean;
    private rustOwnedBucketListDecisions;
    rustOwnedBucketListBind(declaration: any): boolean;
    rustOwnedBucketListBindUncached(declaration: any): boolean;
    rustLiteralWriteBackBindOk(access: any): boolean;
    rustBearerDeleteKey(del: any): string | undefined;
    /** ral-yf: `delete m[k]` on a typed map-literal local. */
    printBearerDelete(node: any): string | undefined;
    /** ral-xf: the `m[k]` receiver of a statement `m[k].push (v)` (one argument, no spread), else undefined. */
    rustBearerElementPushCall(call: any): any;
    rustBearerElementPushText(call: any, valueText: string): string | undefined;
    /** ral-xf: the local is an argument of a `this.` / `super.` call somewhere in its function. */
    rustMapHandedToSelfCall(declaration: any, name: string): boolean;
    /** Every value the literal stores is a list or a scalar by its checker type (never `any`, never an object). */
    rustBearerValuesNeverMap(declaration: any, literal: any, name: string): boolean;
    /** ral-wf: the statement `name[k] = v` (one key, `=`) whose value holds `node`. */
    rustBearerSelfWriteHost(node: any, name: string): any;
    /** ral-70f: `key` is the whole key of a statement `m[key].push (v)` and reads an `Option<String>` ral-70f reader local. */
    rust70fPushKey(key: Node): boolean;
    rustDictBearerKeyOk(keyNode: any): boolean;
    rustBookMetaPlaceOnLiteral(key: any): boolean;
    static rustBearerKeyTextOk(text: string): boolean;
    rustBearerDictDynamicRead(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined;
    rustBearerDictInsert(baseExpr: any, keyNode: any, keyText: string, valueText: string): string | undefined;
    rustBearerInsertText(name: string, keyArg: string, valueText: string): string;
    rustBearerChainHopArg(keyNode: any, keyText: string, name: string): string | undefined;
    rustBearerChainedWrite(baseExpr: any, keys: any[], keyStrs: string[], valueText: string): string | undefined;
    rustBearerWriteKeyOk(keyNode: any, receiverName: string): boolean;
    private rustBearerSawOpenKey;
    rustKeyScalarDecisionOpen(keyNode: any): boolean;
    /** `m[k] = v` on a bearer with `k` a native `Option<String>` local. */
    placeKeyNative(key: any): boolean;
    rustBearerWriteKeyArg(keyNode: any, keyText: string, receiverName: string): string | undefined;
    stringifiedWriteKeyArg(key: any, text: string): string | undefined;
    keyTextIsValuePlace(key: any, text: string): boolean;
    bearerInOp(key: any, obj: any): string | undefined;
    rustBearerOptKeyIn(recv: any, keyNode: any): boolean;
    rustUntilRequestLocal(declaration: any): boolean;
    rustBearerLiteralInKey(key: any): string | undefined;
    bearerInOpKeyText(key: any): string | undefined;
    keyPrintsAsValue(type: any): boolean;
    rustBearerPlainLiteral(node: any): boolean;
    /** `x = { .. }` (or a compound rebuild) on a bearer: the value is the map. */
    rustBearerRebuild(n: any): boolean;
    rustBearerLiteralMove(node: any): boolean;
    private rustReadBearerDecisions;
    /** The container kind a local is declared as, or undefined (no proof). */
    rustReadBearerKind(node: any): 'list' | 'map' | undefined;
    rustReadBearerKindOfDeclaration(declaration: any): 'list' | 'map' | false;
    private rust90rCompareLeftBearers;
    private rust90rForwardListCalls;
    rust90rMoveBearer(declaration: VariableDeclaration): boolean;
    rust92rgSafeListForward(call: CallExpression): boolean;
    rustReadBearerKindUncached(declaration: any): 'list' | 'map' | false;
    private rustContainerBoxUses;
    private static readonly RUST_CONTAINER_NULL_SAFE_READERS;
    private static readonly RUST_CONTAINER_LOCAL_SKIP;
    /** `'list' | 'map'` for a container local with at least one boxing use, else false. */
    rustContainerLocalKind(declaration: any): 'list' | 'map' | false;
    /** An argument rooted at a `this.` field other than `options` may be a runtime store (books, caches). */
    rustContainerInitReadsStore(init: any): boolean;
    /** A literal list/dict default (or a reader that always builds one): the local is never `Null`. */
    rustContainerInitNeverNull(init: any, kind: 'list' | 'map'): boolean;
    /** An identifier whose local prints a plain `Dict` (borrowed dict route, not the optional form). */
    rustNeverNullDictLocalArg(node: any): boolean;
    rustContainerBoxForm(n: any, neverNull: boolean): 'clone' | 'move' | undefined;
    /** The sole argument of a base `this.json (x)` (printed `json_stringify(&x)`, not a `self.` field). */
    rustIsJsonOperand(node: any): boolean;
    rustVoidHandlerJsonOperand(node: any): boolean;
    /** `Value::Map(x.clone())` / `Value::from(x.clone())` at an admitted boxing use, else undefined. */
    printRustContainerLocalBox(node: any, text: string): string | undefined;
    private static readonly RUST_BORROWED_DICT_READERS;
    private static readonly RUST_BORROWED_DICT_SOURCES;
    private static readonly RUST_BORROWED_LIST_SOURCES;
    private static readonly RUST_BORROWED_ANY_KEY_READERS;
    private rustBorrowedDictDecisions;
    rustBorrowedDictLocal(declaration: any): boolean;
    private rustBorrowedPending;
    /** ral-49a: an alias refused while its source was open: no decision derived from that refusal is cached. */
    private rustSbAliasReask;
    rustBorrowedDictLocalUncached(declaration: any): boolean;
    /** `'dict' | 'list'` for a local that holds the shared container and lends it to every read, else undefined. */
    rustBorrowedLocalKind(declaration: any): 'dict' | 'list' | undefined;
    private rustBorrowedKinds;
    rustBorrowedLocalKindUncached(declaration: any): 'dict' | 'list' | undefined;
    private rustOptContainerLocals;
    /** ral-61n: optional map locals whose key-set uses (`Object.keys`, `in`) print off `x.as_deref()`. */
    private rustOptKeySetLocals;
    static readonly RUST_62N_DICT_READERS: Set<string>;
    private rust62nDictArrayTests;
    /** ral-62n: the reader's default (after its key arguments) is absent, `undefined` or an object literal: a map default. */
    rust62nMapOrNullDefault(call: any): boolean;
    static readonly RUST_NEVER_NULL_TEST_READERS: Set<string>;
    /** ral-63i: base map readers whose result prints as a `Value` (the other arm of a boxed ternary arm). */
    static readonly RUST_63I_DICT_READERS: Set<string>;
    private rustNeverNullTests;
    /** ral-60n: the reader's default is the empty literal of the local's kind (`[]` for a list, `{}` for a map). */
    rustEmptyContainerLiteral(node: any, from: string): boolean;
    /** `true` / `false` for a null test the never-null rule recorded on a local that kept its plain container form. */
    printNeverNullContainerTest(left: any, op: any): string | undefined;
    rustOptAliasSourceKind(rhs: any, fn: any): 'dict' | 'list' | undefined;
    rustDeclaredDictEndpointLet(d: any, comparisonsRead?: boolean): boolean;
    rust65iSelfExtendLiteral(up: any, d: any): boolean;
    /** The source side: `t = n` (statement) whose target `t` holds the optional form of n's kind through rustOptAliasSourceKind. */
    rustOptAliasTargetUse(n: any, declaration: any, fn: any): boolean;
    private rustGuardedOptDictWrites;
    rustGuardedOptDictWrite(write: any, fn: any): boolean;
    rustGuardedOptDictSourceUse(n: any, declaration: any, fn: any): boolean;
    /** The guarded write printed by the source's form: `s.unwrap_or_default()` (optional) or `s.into_dict()` (boxed). */
    printGuardedOptDictWrite(node: any, left: any, right: any): string | undefined;
    /** ral-45f: the source side of `let t = n` whose target holds the optional form through the initialised alias rule. */
    rustOptAliasInitTargetUse(n: any, declaration: any, fn: any): boolean;
    private rustBorrowedIndexReads;
    /** `Promise.all ([..])` (an array literal operand): runtime `promise_all` hands its operand back, so it is always a list. */
    rustPromiseAllListKind(call: any): 'list' | undefined;
    /** ral-yh: the right side of `x = ..` on a never-nil container local builds the same container kind on every path. */
    rustSameKindRewrite(rhs: any, from: 'dict' | 'list'): boolean;
    rustJsonMapProducer(init: any): boolean;
    rustValueKeyType(key: any): boolean;
    rustBorrowedIndexReadUse(n: any): boolean;
    rust73eStrKeyRead(n: any): boolean;
    private rustExtendReuseLocals;
    rustExtendReuseLiteral(declaration: any, init: any): boolean;
    /** `n` is the target of a statement `n = this.extend (n, y)` (base `extend`, two operands, `y` not naming `n`). */
    rustSelfExtendWrite(n: any, declaration: any): boolean;
    private static readonly RUST_SELF_EXTEND;
    private rustReuseProducerWrites;
    /** A statement `n = <map producer>` whose right side does not name `n`. */
    rustReuseMapProducerWrite(n: any): boolean;
    private static readonly RUST_REUSE_SAFE_DICT;
    private static readonly RUST_SAFE_LIST_SELF_DEFAULT;
    rustSafeDictDefaultUse(n: any): boolean;
    rustReuseEndpointWrite(right: any): boolean;
    rustEndpointAliasWrite(write: any): any;
    /** ral-61i: `n` is the bare source of `t = n` (rustEndpointAliasWrite) and `t` another local that holds a typed reuse map. */
    rustEndpointAliasSourceUse(n: any, declaration: any): boolean;
    rustReuseProducerUntagged(n: any, rhs: any): boolean;
    rustUntilSelfCall(n: any, declaration: any): any;
    /** ral-50b: a statement `n = this.handleUntilOption (k, n, p)` (the two-slot list written whole into a reuse literal). */
    rustUntilListWrite(n: any, declaration: any): boolean;
    private static readonly RUST_UNTIL_LIST_WRITE;
    /** ral-50b: after the list write the local is only an `extend` head (the empty-map equivalence holds nowhere else). */
    rustUntilListUsesExtendOnly(n: any, declaration: any): boolean;
    rustUntilSelfWrite(n: any, declaration: any): boolean;
    /** pb: `x` as the `request` operand of such a write-back call. */
    rustUntilSelfArg(n: any, declaration: any): boolean;
    /** pb: `Value::Dict(x)` for the moved request operand of a write-back `handleUntilOption`. */
    printUntilSelfArg(node: any, text: string): string | undefined;
    private static readonly RUST_SELF_MERGE;
    /** `n` is the target of a statement `n = this.mergeBalanceAccount (n, c, a)` whose other operands do not name `n`. */
    rustSelfMergeWrite(n: any, declaration: any): boolean;
    /** `n` is the head operand of such a write. */
    rustSelfMergeHead(n: any, declaration: any): boolean;
    /** `n` is the request (first) operand of the runtime free function `jwt (request, secret, ..)`. */
    rustJwtRequestSlot(call: any, n: any): boolean;
    /** `&x` for a shared map local lent to the `jwt` request slot. */
    printJwtLentArg(node: any, text: string): string | undefined;
    rustExtendReuseOperandUntagged(arg: any): boolean;
    rustExtendReuseKeyWriteOk(n: any, declaration: any): boolean;
    /** The head of `x = this.extend (x, y)` on a reuse local: moved (the statement writes `x` back). */
    rustSelfExtendHead(node: any, declaration: any): boolean;
    /** sb: `y = self.omit(&x, ..).into_dict()` for a shared-map alias (`omit` of a proven map answers `Value::Map`: the Arc moves back). */
    private rustSbAliasWrites;
    private rustSbAliasSlotWrites;
    /** ral-54f: a slot write accepted by the shared-map alias rule, printed typed only when the alias printed as the map. */
    rustSbAliasSlotWriteOf(element: any): boolean;
    printSbAliasWrite(node: any, left: any, right: any): string | undefined;
    private rustReuseDynamicWrites;
    rustReuseDynamicKeyWrite(n: any, declaration: any): boolean;
    printReuseDynamicKeyWrite(left: any, right: any, valueText: string): string | undefined;
    /** `x = self.extend(x, ..).into_dict()` for a reuse local (`extend` answers `Value::Map`: the Arc moves back). */
    printExtendReuseWrite(left: any, right: any): string | undefined;
    rustBuiltMapKeyWriteOk(n: any, init: any): boolean;
    rustUntaggedMapOperand(arg: any): boolean;
    rustLentOptionalHandOff(call: any, arg: any, init: any, from: 'dict' | 'list' | 'api' | undefined, nilDeclared: boolean): boolean;
    private static readonly RUST_LIST_TELLING_SLOTS;
    private static readonly RUST_LENT_OPTIONAL_HELPERS;
    /** `this.parseX (x as Dict, ..)`: the assertion only retypes the TS side, the argument lands in the same lent slot. */
    rustLentAsHandOff(asArg: any, init: any, from: 'dict' | 'list' | 'api' | undefined, endpoint: boolean, nilDeclared: boolean): boolean;
    rustLentAsNullable(init: any, nilDeclared: boolean, endpoint: boolean): boolean;
    /** Every never-null lent use of an optional local lands in a slot that also takes the optional form. */
    rustLentOptionalOk(declaration: any, name: string, fn: any, init: any, from: 'dict' | 'list' | 'api' | undefined): boolean;
    /** `&x` for an optional container local lent whole to an `impl Into<crate::Value>` slot (`None` arrives as Null). */
    printLentOptionalArg(node: any, text: string): string | undefined;
    /** `&x` for a container local lent through `x as T` to a lent parse slot (plain or optional form). */
    printLentAsArg(node: any, text: string): string | undefined;
    private rustPrintedOptional;
    /** The value argument of `client.resolve|reject(value, hash)` on a ws handle: the hand-written method takes `impl Into<Value>`. */
    rustLentWsSettleSlot(call: any, arg: any): boolean;
    private rustNilMapDecisions;
    rustNilMapLocal(declaration: any): boolean;
    rustNilMapLocalUncached(declaration: any): boolean;
    private rustNilListLocals;
    /** ral-67c: `x = this.extend (x, y)` (base `extend`, y not naming x) on a `let` whose declared type node is `NullableDict` / `Dict`. */
    rust67cNilMapExtendWrite(n: any, declaration: any): boolean;
    private static readonly RUST_67C_MAP_TYPES;
    rust67cMapLocalSource(rhs: any, declaration: any): any;
    /** ral-67c: the head `x` of `x = this.extend (x, y)` on a nil map local: the optional map moves out (`x.take()`) and is written back. */
    rust67cNilMapExtendHead(node: any, declaration: any): boolean;
    /** og: the nil-declared map local a declaration aliases whole (`const x = y`, same function, no closure between). */
    rustNilMapAliasSource(declaration: any): any;
    /** og: `y` as the whole initializer of a nil-map alias: the handle moves at y's last use, else an Arc bump. */
    rustNilMapAliasInit(n: any): any;
    /** A list literal with no spread or bare-local element whose elements print natively (`vec![..]`). */
    rustNilListLiteralOk(rhs: any): boolean;
    rustNilMapExtraBox(n: any): boolean;
    /** `x['k'] = v` at a literal key on the map local, as a statement, whose value does not read `x`. */
    rustNilMapKeyWrite(n: any, declaration: any): boolean;
    rustNilMapLetBoundAlias(declaration: any): boolean;
    rustNilMapHasKeyWrite(declaration: any): boolean;
    /** `if let Some(__d) = &mut x { Arc::make_mut(__d).insert("k".to_string(), v); }`: a `None` map drops the write as the boxed `Null` did. */
    printNilMapKeyWrite(left: any, right: any, valueText: string): string | undefined;
    rustNilMapOf(node: any): any;
    /** `x = None` / `x = Some(crate::value::Dict::new({ .. }))`: the literal is built once behind the shared handle. */
    printNilMapWrite(left: any, right: any, identation: any): string | undefined;
    printNilMapNullTest(left: any, right: any, op: any): string | undefined;
    /** The `Value` hand-off: the map moved at the last use, else the Arc bump; `None` is `Value::Null`. */
    printNilMapBox(node: any, text: string): string | undefined;
    private rustMutableBuiltLocals;
    /** ral-48b: statement writes `x['k'] = v` printed as `add_element_to_object(&mut x, ..)` on a typed map local. */
    private rustAeoWrites;
    rustAeoBoxedNative(n: any): boolean;
    /** ral-50b: `n[<integer literal>] = v` (statement, one level, `=`). */
    rustListIndexLiteralWrite(n: any): boolean;
    rustListIndexIntKey(key: any, top?: boolean): boolean;
    /** ral-84d R2: statement writes `x[k] = v` printed as a native insert on a typed `safeDict (this.options, ..)` copy. */
    private rust84dStoreWrites;
    rust84dStoreKeyWrite(n: Node, init: Node): boolean;
    rust84dNeverNullMapInit(init: Node): boolean;
    rust84dStoreKeyArg(n: Node, keyNode: Node): string | undefined;
    /** ral-84d R2: `delete n[k]` (statement) on the `this.options` store copy, `k` a string local printed in the `dkey` form. */
    rust84dStoreDelete(n: Node, init: Node): boolean;
    rust87rdLiteralDelete(n: Node, init: Node): boolean;
    print84dStoreDelete(node: DeleteExpression): string | undefined;
    print84dStoreKeyWrite(left: ElementAccessExpression, right: Node, valueText: string): string | undefined;
    /** ral-48b: `n['k'] = v` (statement, literal non-digit key) whose value does not read `n`. */
    rustAeoTargetWrite(n: any): boolean;
    /** The source statement of a box (`Value::Dict(x)`, +13 chars) leaves the printed line within 400 chars. */
    rustBoxLineOk(n: any): boolean;
    /** The copy-on-write insert line (indent + `Arc::make_mut(&mut x).insert(..)`) stays within the 400-char budget. */
    rustSafeDictKeyWriteOk(n: any, init: any): boolean;
    rustCacheBucketRow(head: any): boolean;
    rustCacheRowOdictRewrite(rhs: any, init: any): boolean;
    rustCacheRowVenueOdictRewrite(rhs: any, head: any): boolean;
    rustCacheRowBuiltRewrite(rhs: any, init: any): boolean;
    /** The callee resolves to the base tier's `safePosition` (no venue override). */
    rustCacheRowBuiltRewriteDecl(rhs: any): boolean;
    rustCacheRowCastWriteHead(n: any, init: any): any;
    rustCacheRowDynamicWrite(n: any, init: any): boolean;
    /** `c.append (x)` (statement, sole argument) on a local ws cache (`CacheSlot::append` takes the item as a `Value`). */
    rustLocalCacheAppendArg(n: any): boolean;
    rustCacheRowStoreBack(n: any, init: any): boolean;
    private rustCacheRowNestedUses;
    rustCacheRowNestedUse(n: any, init: any): boolean;
    private rustCacheRowNestedReads;
    rustCacheRowNestedRead(n: any, init: any): boolean;
    rustCacheRowMapHead(recv: any): [string, string] | undefined;
    printCacheRowNestedWrite(baseExpr: any, keyStrs: string[], valueText: string): string | undefined;
    printCacheRowFieldPush(node: any, parsedArg: string | undefined): string | undefined;
    /** A multi-line value written into a cache-bucket row: only its first printed line joins the insert line (400-char budget). */
    rustCacheRowFirstLineOk(n: any, init: any): boolean;
    rustElementKeyWriteOk(n: any, init: any): boolean;
    rustDictRowKeyWriteBackOk(n: any, init: any): boolean;
    rustBuiltKeyWriteLineOk(n: any, extra?: number): boolean;
    rustNullTestedDictLocal(init: any, nullTests: number, writes: number): boolean;
    rustDictElementSource(init: any): boolean;
    rust73dBaseRecordType(type: any): boolean;
    rustUrlsMapEntry(init: any): boolean;
    /** lf: a local spelled `Dictionary<Dict>` (`const d: Dictionary<Dict> = …`): its string-keyed values are maps. */
    rustDictOfDictsLocal(node: any): boolean;
    rustListElementSource(init: any): boolean;
    private rustDictElementBoxes;
    /** A whole-value hand-off of a map element local: a plain `Value` argument of a `this.` method or an object literal value. */
    rustDictElementBoxUse(n: any, init: any): boolean;
    rustWsFieldRead(init: any): 'dict' | 'list' | undefined;
    /** A plain `Value` argument of a `this.` method or an object literal value, for a message field read local. */
    rustWsFieldBoxUse(n: any, init: any): boolean;
    rustWsFieldGetText(init: any, optional: boolean): string | undefined;
    /** `Value::Arr(x)` (moved) / `Value::Arr(x.clone())` at a list hand-off; dict hand-offs print through `printDictElementBox`. */
    printWsFieldBox(node: any, text: string): string | undefined;
    /** `Value::Dict(x)` / `Value::Arr(x)` at the last use (moved), else `Value::from(&x)` (the Arc bump the copied `Value` paid). */
    printDictElementBox(node: any, text: string): string | undefined;
    rustDefaultedContainerBoxUse(n: any, init: any): boolean;
    rustValueLocalWriteHandOff(n: any): boolean;
    rustContainerAliasInit(n: any, own: any): boolean;
    private rustNnAliasDecls;
    rustNnAliasSourceUse(n: any, kind: 'dict' | 'list'): boolean;
    /** ral-53n: the boxed source of a never-null alias, cloned when it is read again after `at` (or `at` sits in a loop), moved otherwise. */
    rustNnAliasSourceText(src: any, at: any): string;
    rustNeverNullAliasKind(declaration: any): 'dict' | 'list' | undefined;
    rustContainerNeverNullLocal(declaration: any, depth: number): boolean;
    private rustContainerAliasInits;
    private rustContainerAliasAsking;
    private rustValueWriteTargets;
    private rustValueWriteOpen;
    rustLocalKeyPlace(place: any, n: any, castRecv?: boolean): boolean;
    rustOptReaderBoxUse(n: any, init: any): boolean;
    rust62nListLiteralSink(list: any): boolean;
    static readonly RUST_62N_LIST_READERS: Set<string>;
    rust84aListLiteralSelfArg(list: Node): boolean;
    rustWsDispatchCallArg(n: any): boolean;
    rustBorrowedKeySetUse(n: any): boolean;
    /** The key operand of `k in m`: a literal as `"k"`, else the boxed key text `bearerInOp` tests. */
    rustBorrowedInOpKey(key: any): {
        literal: boolean;
        text: string;
    } | undefined;
    rustStrKeyIdentifier(node: any): boolean;
    /** A parameter key prints as its signature type: a boxed `Value`, `&str` or `Option<&str>` (per-venue string slots). */
    rustStrKeyParam(declaration: any): boolean;
    rustBorrowedStrKeyTest(name: string, node: any): string;
    rustBorrowedDictName(node: any): string | undefined;
    /** The printed name of a typed `const x: Dict = this.extend (..)` local (rustDeclaredDictExtendCopy). */
    rustExtendCopyDictName(recv: any): string | undefined;
    /** ral-61n: the printed name of an optional map local admitted for key-set uses (see rustOptKeySetLocals). */
    rustOptKeySetDictName(node: any): string | undefined;
    /** The printed name of a borrowed venue `Dict` slot (`&crate::value::Dict`): already the map, no `as_map` view. */
    rustVenueDictSlotName(node: any): string | undefined;
    /** The bound handler view of an unwritten `message: Dict` handler parameter (a non-map binds the empty map, the helper's `[]`). */
    rustProHandlerViewName(node: any): string | undefined;
    printBorrowedKeys(node: any, kind: 'keys' | 'values'): string | undefined;
    /** `k in message` on a borrowed venue `Dict` slot: the key test on the map itself (on the handler view where one is bound). */
    printProHandlerViewInOp(key: any, obj: any): string | undefined;
    printBorrowedInOp(key: any, obj: any): string | undefined;
    /** The `contains_key` test of `key` on the map printed as `name` (boxed `Value::Bool(..)` when `boxed`). */
    printBorrowedInOpOn(name: string | undefined, key: any, boxed?: boolean): string | undefined;
    /** A read of `n['literal']` / `n.name` (not a write target, call receiver, length or digit key). */
    rustDictKeyReadUse(n: any): boolean;
    /** The typed declaration line (`: crate::value::Dict = .. .into_dict()`, about 40 chars more) stays within 400 chars. */
    rustDictKeyReadLineOk(declaration: any, name: string): boolean;
    /** `crate::value::KeyRead::key_read(&&m, "k")` for a direct read on a dict-typed local, else undefined. */
    printDictKeyRead(node: any): string | undefined;
    rustDictTernaryInit(init: any): boolean;
    rustDictTernaryArm(arm: any): boolean;
    /** A local as one arm of a ternary that initialises another `let`, with no loop or closure in between. */
    rustDictTernaryArmPlace(node: any, declaration: any): boolean;
    rustDictTernaryArmMoves(node: any, declaration: any): boolean;
    /** A `let x = c ? <map> : <map>` local: like a params slot, it may also go whole into a plain `Value` argument. */
    rustHandedTernaryLocal(declaration: any): boolean;
    /** A typed dict local (handed slot / handed local / printed borrowed map) as such an arm: it goes in as the map. */
    rustDictTernarySlotArm(node: any, declaration: any): boolean;
    printDictTernaryArms(init: any, identation: number): string | undefined;
    rustMapTernaryInit(init: any): boolean;
    rustOptMapTernaryInit(init: any): boolean;
    rustDictTernaryCall(call: any): boolean;
    private rustNilResponseLocals;
    /** The container kind of a write to a borrowed local; an endpoint write to an empty `let` counts as a map. */
    rustNilResponseWriteKind(rhs: any, nilDeclared: boolean, declaration: any): 'dict' | 'list' | 'api' | undefined;
    rust68cVenueWriteKind(rhs: any): 'dict' | 'list' | undefined;
    /** ral-65i: `await this.<endpoint> (..)` whose abstract declaration spells `Promise<Dict>`. */
    rust65iDeclaredDictEndpointWrite(rhs: any): boolean;
    /** ral-kc: `await this.<endpoint> (..)` whose abstract declaration spells `Promise<Dict>` / `Promise<List>`. */
    rustDeclaredEndpointWrite(rhs: any): boolean;
    rustSelfDefaultedRead(call: Node, kind: 'dict' | 'list' | 'api'): boolean;
    /** A base `safeDict*` / `safeList*` call (default absent, nullish or an empty literal of its kind), or a base `extend`/`omit`. */
    rustOptContainerSourceOk(call: any, kind: 'dict' | 'list' | 'api'): boolean;
    /** A `const` local seeded by an array literal: a list on every path, so a `safeList` read defaulted to it is a list. */
    rustConstListLiteralLocal(node: any): boolean;
    /** The optional form's local behind an identifier, else undefined. */
    rustOptContainerOf(node: any): {
        declaration: any;
        kind: 'dict' | 'list';
    } | undefined;
    /** `let mut x: Option<crate::value::Dict> = <init>.into_opt_dict()` (`None` when declared empty). */
    printOptContainerDeclaration(declaration: any, varName: string, indent: string): string | undefined;
    rustOptDictNativeInit(init: any, printed: string): string | undefined;
    rustTypedListRowDict(init: any, printed: string): string | undefined;
    private static readonly RUST_RECORD_MAP_TYPES;
    /** `this.safeDict (r, k)` with no default, `r` (printed `name`) a const local of a typed call whose result is a record map. */
    rustRecordMapLocalRead(init: any, name: string): boolean;
    /** `x = None` / `x = <container read>.into_opt_dict()` for the optional form. */
    printOptContainerWrite(left: any, right: any, identation?: number): string | undefined;
    /** `x.is_some()` / `x.is_none()` for a null test of the optional form. */
    printOptContainerNullTest(left: any, right: any, op: any): string | undefined;
    rustBorrowedListUse(node: any): boolean;
    /** ral-50i: `n` is arg 0 of a base any-key reader call in a non-test source (the dict-bearer lend). */
    rustBearerReaderLend(n: any): boolean;
    /** A base hand-written reader (`safeString`, `safeValue2`, `safeIntegerN`, ..) with any key. */
    rustBorrowedAnyKeyReader(call: any): boolean;
    private static readonly RUST_BY_REF_GENERATED_READERS;
    private rustByRefParamDecisions;
    rustParamReadsByReference(param: any): boolean;
    rustParamReadsByReferenceUncached(param: any): boolean;
    rustVenueKeyReadParam(method: any, param: any, name: string): boolean;
    /** A typed market local (plain or optional) handed to a `rustVenueKeyReadParam` slot: lent as `&m` (both read its map). */
    printVenueKeyReadMarketArg(node: any): string | undefined;
    /** `m['k']` on a parameter `rustVenueKeyReadParam` lends: the `KeyRead` read of the same slot. */
    printVenueKeyReadParamRead(node: any): string | undefined;
    /** A call to a generated base reader (any overload) whose container parameter prints `impl KeyRead`. */
    rustReaderTakesContainerByReference(call: any): boolean;
    rustBuiltReturnSourceKind(call: any): 'dict' | 'list' | undefined;
    /** The printed `let mut x: crate::value::Dict = self.omit(..).into_dict();` line of a one-line omit stays under 400 chars. */
    rustOmitLineFits(call: any): boolean;
    rustOmitLiteralKeys(call: any): boolean;
    private static readonly RUST_BUILT_BOX_RECEIVER_METHODS;
    private static readonly RUST_BUILT_HELPER_RETURNS;
    private static readonly RUST_BUILT_RECORD_BUILDERS;
    private static readonly RUST_BASE_FILTER_LISTS;
    /** The container a base list filter answers, `undefined` when it is unproven, `null` when `method` is none of them. */
    rustBaseFilterReturnKind(call: any, method: string): 'dict' | 'list' | undefined | null;
    rustSortOfTypedList(call: any): boolean;
    /** `this.m (..)` resolves to the base declaration and no venue redeclares `m`. */
    rustListPassthroughCallee(call: any, method: string): boolean;
    /** ral-43a: `{ 'k': x }` (a plain object literal, not a destructuring target) or `return x` of a held endpoint answer. */
    rustDeclaredEndpointWholeBox(n: any): boolean;
    /** ral-53a: a plain `Value` argument slot of a `this.` method (not extend / omit, not a lent slot, no loop between). */
    rustSbAliasValueSlot(n: any): boolean;
    rust63iSameFileMethod(call: any): boolean;
    rust76bWholeHandOff(n: any): boolean;
    rust76bUntypedTarget(target: any): boolean;
    rustDeclaredEndpointBoxUse(n: any): boolean;
    rustDictShapedFieldInsert(expr: any): boolean;
    rustBuiltReturnBoxUse(n: any, init: any, literalDict?: boolean): boolean;
    /** ral-41h: the one operand of `this.keysort (x)` is a proven map (the same head proof `omit` takes). */
    rustKeysortOfDict(call: any): boolean;
    rustHandleTupleMapSlotRead(rhs: any): boolean;
    rust87raVenueTupleMapSlotRead(rhs: Node): boolean;
    rust87raBaseParamsSlot(call: CallExpression, at: number): boolean;
    /** ral-87ra R3: base tuple producer name -> [Dict slot, params argument index]. */
    private static readonly RUST_87RA_BASE_PARAMS_SLOT;
    rustRouteParamsDictCall(init: any): boolean;
    private static readonly RUST_ROUTE_PARAMS_DICT;
    /** ral-50a: a destructured `handle*AndParams` slot already handed as a map (`requestParams = paramsIsMargin`). */
    rustHandedSlotIdentifier(rhs: any): boolean;
    rustOmitOfDict(init: any): boolean;
    rustBaseDictParam(d: any): boolean;
    rustDeepExtendOfMaps(call: any): boolean;
    /** Every other `let`/`const` of `name` in the enclosing function is initialised by a call of the same `this.` method. */
    rustElementSiblingsAlike(declaration: any, name: string, init: any): boolean;
    rustZgOuterLocalWrite(left: any, n: any): boolean;
    private rustZgSiblingRows;
    /** Every other binding of `name` in the function is a `const` plain map literal declaration (ral-oc). */
    rustLiteralSiblingsAlike(declaration: any, name: string): boolean;
    rustSiblingBindingsAlike(declaration: any, name: string, init: any): boolean;
    rustTypedParamsParam(d: any): boolean;
    rustParamsDictSlot(d: any): boolean;
    private rustParamsDictDecisions;
    rustParamsDictSlotOmit(call: any): boolean;
    rustParamsDictSlotUncached(d: any): boolean;
    /** The never-reassigned `params: Dict = {}` of a base-tier method declared to return a `[.., Dict]` pair. */
    rustBaseTupleParamsParam(d: any): boolean;
    rustProvenMapParam(d: any): boolean;
    rustHelperParamsProvenMap(d: any): boolean;
    /** The helper is called by name somewhere in its venue or pro file and is not a base Exchange method. */
    rustHelperHasCaller(root: string, venue: string, name: string): boolean;
    private static readonly RUST_SIGN_MAP_PROOF;
    private static rustSignProofApi;
    private static readonly RUST_SIGN_PARAM_HANDLERS;
    rustSignParamsProvenMap(fn: any): boolean;
    rustSignParamsProofUncached(root: string, venue: string, target?: {
        name: string;
        at: number;
    }): boolean;
    r40hDynNames(access: any): string[] | undefined;
    rustTypedParamsSlot(call: any, at: number): boolean;
    /** `'dict' | 'list' | 'api'` for a container source the local may hold by reference. */
    rustBorrowedSourceKind(call: any): 'dict' | 'list' | 'api' | undefined;
    private static readonly RUST_SAFE_VALUE_KEY_SOURCES;
    rustSafeValueKeyReadSource(call: any): boolean;
    rust80gParseJsonKeyReadSource(call: Node): boolean;
    rustKeyReadTernarySource(init: any): boolean;
    rustListRowKeyReadSource(init: any): boolean;
    rust73dBaseRecordFieldRow(init: any): boolean;
    /** `this.safeX (o, '<k>'[, d])`: a base by-reference reader whose container is `o`, at a literal non-index string key. */
    rustSafeValueKeyReaderUse(n: any): boolean;
    private rustVenueContainerDecisions;
    private static readonly RUST_VENUE_RECORD_NAMES;
    /** ral-80f: element records that only name a list (`Market` itself is `MarketInterface | undefined`, so never a bare map). */
    private static readonly RUST_VENUE_LIST_ELEMENT_NAMES;
    rustVenueContainerReturnKind(call: any): {
        kind: 'dict' | 'list';
        nullable: boolean;
    } | undefined;
    rustVenueContainerReturnKindUncached(declaration: any): {
        kind: 'dict' | 'list';
        nullable: boolean;
    } | undefined;
    /** ral-43g: every `return` in `declaration`'s own body (nested functions excluded) is an array literal of `arity` plain elements. */
    rustTupleLiteralReturns(declaration: any, arity: number): boolean;
    rustStoreDictReturnCall(call: any): boolean;
    rustDeclaredEndpointKind(call: any): 'dict' | 'list' | undefined;
    private static readonly RUST_TEST_KEYREAD_READERS;
    printTestReaderArg(node: any, text: string): string | undefined;
    /** `&x` for a borrowed local (or a typed container local) passed to a hand-written any-key reader. */
    printBorrowedReaderArg(node: any, text: string): string | undefined;
    private rustPlainValueDecls;
    rustPlainValueReaderLend(node: any, declaration: any, call: any): boolean;
    /** A base `safeDict*` / `extend` / `omit` call, or an implicit-API endpoint call. */
    rustBorrowedDictSource(call: any): boolean;
    private static readonly RUST_RECORD_LOOKUP_SOURCES;
    rustRecordLookupSource(call: any): boolean;
    /** Rust `_k` reader name of a base `this.safeX(obj, 'literal'[, default])` call, else undefined. */
    rustBorrowedDictReader(call: any): string | undefined;
    private static readonly RUST_OPT_K_READERS;
    private static readonly RUST_OPT_READERS;
    private static readonly RUST_OPT_BOOL_READERS;
    private rustOptBoolReading;
    private static readonly RUST_TEST_OPT_READERS;
    private rustOptReaderPrint;
    private rustOptReaderPrinted;
    /** The twin's name for a base reader call (and the `&str` key text of a `_k` twin), else undefined. */
    rustOptReaderName(node: any): {
        name: string;
        key?: string;
    } | undefined;
    /** A borrowed `_k` reader with an `_opt` twin in the current print (`safe_bool_k` only while a bool twin prints). */
    rustOptKReader(rust: string): boolean;
    rustOptBoolReaderText(kind: string, node: Node): string | undefined;
    /** The `_opt` twin call of a base safeString-family reader node, printed by the reader's own printer; else undefined. */
    rustOptReaderCallText(expr: any, identation?: number): string | undefined;
    /** `self.safe_X_k(&x, "k", &[..])` when `x` is a borrowed dict local or a typed container local. */
    printBorrowedDictRead(node: any, identation: number): string | undefined;
    private rustLentListKinds;
    private rustLentListBoxes;
    rustLentListLocal(declaration: any): boolean;
    /** A call that yields a string list on every path (never `undefined`). */
    rustLentListSource(init: any): boolean;
    rust90rgLentListAliasSource(init: Node): VariableDeclaration | undefined;
    rustLentListRowWrite(access: any): boolean;
    printBoundedListRowInsert(left: any, keyText: string, valueText: string): string | undefined;
    printGuardedFirstRowInsert(left: any, keyText: string, valueText: string): string | undefined;
    rust64iStringSliceDeclaration(declaration: any): boolean;
    /** ral-64i: `this.arraySlice (..)` of the base tier (no venue redeclares it), outside the test tier. */
    rust64iBaseSliceInit(init: any): boolean;
    /** A base `safeList*` read with an empty `[]` default: a list on every path. */
    rustDefaultedListRead(init: any, constLocalDefault?: boolean): boolean;
    rust87rdPushedLocal(declaration: VariableDeclaration, name: string): boolean;
    rustLentListLocalUncached(declaration: any): boolean;
    private static readonly RUST_TYPED_LIST_FIELDS;
    rustTypedListField(node: any): boolean;
    printTypedListFieldRead(node: any): string | undefined;
    rustLentFieldNullTest(up: any, at: any, init: any): boolean;
    printLentFieldListNullTest(left: any, right: any, op: any): string | undefined;
    private rustHandlerTableLocals;
    rustHandlerTableLocal(declaration: any): boolean;
    rustHandlerTableLocalUncached(declaration: any): boolean;
    rustHandlerTableValue(expr: any, write: boolean): boolean;
    /** The `Option<String>` text of a handler value accepted by `rustHandlerTableValue`. */
    printHandlerTableValue(expr: any): string;
    /** `this.safeValue (table, k)` of a base-tier `safeValue` over a handler table. */
    rustHandlerTableRead(expr: any): boolean;
    private rustSubscriptionMethodFields;
    rustSubscriptionMethodField(call: any): boolean;
    rustSubscriptionMethodFieldUncached(call: any): boolean;
    printHandlerTableLocalWrite(left: any, right: any): string | undefined;
    /** A local map literal whose every value is a `this.<method>` reference, only read by `this.safeValue (m, k)`. */
    rustHandlerTable(node: any): boolean;
    rustHandlerList(declaration: any, literal: any): boolean;
    rustHandlerTableLocalOf(node: any): boolean;
    printHandlerTableLocalDeclaration(declaration: any, varName: string, indent: string): string | undefined;
    printHandlerTableNullTest(left: any, right: any, op: any): string | undefined;
    rustLentListUse(node: any): boolean;
    printLentListJoin(node: any): string | undefined;
    /** `Value::Arr(x.clone())` (the shared handle) or `Value::Arr(x)` at a hand-off of a lent list. */
    printRustLentListBox(node: any, text: string): string | undefined;
    rustWatchHashListSlot(call: any, n: any): 'clone' | 'lend' | undefined;
    private rustWsUrlLocals;
    rustWsUrlLocal(declaration: any): boolean;
    rustWsUrlLocalUncached(declaration: any): boolean;
    /** ral-ve: the url local lands in a per-venue string slot (`&str` / `Option<&str>`). */
    rustWsUrlVenueSlot(n: any): boolean;
    /** `this.urls[k1][k2]..` (through parens / `as` casts) with literal keys: a url string, or Null when absent. */
    rustWsUrlRead(init: any): boolean;
    rustWsUrlsDictAlias(node: Node): boolean;
    rustWsUrlDeclTooLong(declaration: any): boolean;
    rustWsUrlLocalOf(node: any): boolean;
    printWsUrlLocalDeclaration(declaration: any, varName: string, indent: string): string | undefined;
    /** A `watch` url / hash slot takes `impl Into<Option<&str>>`: a string local or literal as `&str`, anything else lent as `&Value`. */
    rustWsWatchSlotText(arg: any, printed: string): string;
    private static readonly RUST_FLIGHT_TYPE;
    private rustWsFlightLocals;
    rustWsFlightSource(init: any): boolean;
    rustWsFlightLocal(declaration: any): boolean;
    /** `this.safeValue(client.futures, k)` on the planned handle with a literal or string-local key: the access and key. */
    rustWsFlightSafeRead(node: any): {
        access: any;
        key: any;
    } | undefined;
    rustWsStrParamKey(key: any): boolean;
    /** `x === undefined` / `x !== undefined` on a flight local read through `safeValue`: whether it is the `!==` form. */
    rustWsFlightNullTestOf(n: any): boolean | undefined;
    /** The null test of a flight local read through `safeValue`: an absent entry reads as the empty `Flight::default()`. */
    printWsFlightNullTest(left: any, right: any): string | undefined;
    printWsFlightLocalDeclaration(declaration: any, varName: string, indent: string): string | undefined;
    /** A flight handle stays typed where it is awaited, a statement, or a `Flight` local's initializer; elsewhere it is boxed. */
    rustWsFlightBox(node: any, text: string): string;
    private static readonly RUST_CACHE_TYPE;
    private static readonly RUST_CACHE_METHODS;
    private rustWsCacheFields;
    private rustWsCacheLocals;
    private rustWsCacheUses;
    rustWsCacheListSplit(declaration: any): any;
    /** `this.F` for a base field declared `ArrayCache | undefined`. */
    rustWsCacheField(node: any): boolean;
    /** `new ArrayCache*(..)` of a class declared in `base/ws/Cache.ts`. */
    rustWsCacheCtor(node: any): boolean;
    rustWsCacheUndefined(node: any): boolean;
    /** The receiver of a cache method (`x.append(v)` statement, `x.getLimit(..)`, `x.clear()`, a `x.hashmap` read). */
    rustWsCacheMethodReceiver(n: any): boolean;
    /** A read that boxes the handle once: a call argument, a return, an element / length read, a dict-write value. */
    rustWsCacheBoxUse(n: any): boolean;
    /** `x = new ArrayCache*(..)` / `x = undefined` (an optional local) as a statement. */
    rustWsCacheLocalWrite(n: any, optional: boolean): boolean;
    /** `this.F = x` for a typed cache field. */
    rustWsCacheFieldWriteBack(n: any): boolean;
    /** 'opt' for a local bound to a typed field, 'cache' for one bound to a constructor; undefined when it stays `Value`. */
    rustWsCacheLocal(declaration: any): 'opt' | 'cache' | undefined;
    rustWsDeclaredCacheWatch(declaration: any): boolean;
    rustWsTupleCacheSlot(element: any): boolean;
    rustWsTupleStrSlot(element: BindingElement): boolean;
    /** A watch tuple destructure where every matching resolve is an array literal with no spread. */
    rustWsTupleListProof(declaration: VariableDeclaration): boolean;
    rustWsTupleSlotProof(element: BindingElement, want: 'cache' | 'str' | 'tuple'): boolean;
    /** ral-84a: a resolved tuple element the checker types `string` (`market['symbol']`, a `Str` reader result). */
    rustWsResolvedStr(x: Node): boolean;
    rustWsPlainMapResolve(x: any): boolean;
    /** `x.length` read on an optional cache local: the slot's own `size()`. */
    rustWsCacheLengthRead(n: any): boolean;
    printWsCacheLength(node: any): string | undefined;
    /** ral-54w: a watched tuple's cache slot: the runtime's marker test converts the slot once. */
    printWsTupleCacheSlot(element: any, printedName: string, read: string, nativeList: boolean, indent: string): string | undefined;
    /** ral-84a: a watched tuple's string slot reads its text once. */
    printWsTupleStrSlot(element: Node, printedName: string, read: string, nativeList: boolean, indent: string): string | undefined;
    printWsCacheLocalDeclaration(declaration: any, varName: string, indent: string): string | undefined;
    /** A use of a typed cache local: the handle itself, or boxed once at a `Value` hand-off. */
    printWsCacheLocalUse(node: any): string | undefined;
    /** `x === undefined` on an optional cache local or a typed field. */
    printWsCacheNullTest(left: any, right: any, op: any): string | undefined;
    /** `x.hashmap` on a cache handle is the handle's own `hashmap()` snapshot. */
    printWsCacheHashmapRead(node: any): string | undefined;
    /** A read of a typed field: the slot itself for a cache method or a write, else boxed once. */
    printWsCacheFieldRead(node: any): string | undefined;
    /** Writes of a typed field (`Some(ctor)`, `None`, a cache local) and of a cache local (a constructor). */
    printWsCacheWrite(left: any, right: any): string | undefined;
    /** A constructor stays a `Cache` where a cache slot takes it (a typed field / local write, a cache local's initializer); elsewhere it is boxed. */
    rustWsCacheCtorBox(node: any, text: string): string;
    private static readonly RUST_CACHE_MAP_TYPE;
    private rustWsCacheMapFields;
    /** `this.F` for a base field declared `Dictionary<ArrayCache>`. */
    rustWsCacheMapField(node: any): boolean;
    private static readonly RUST_CACHE_SHELF_TYPE;
    private rustWsCacheShelfFields;
    /** `this.F` for a base field declared `Dictionary<Dictionary<ArrayCache*>>`. */
    rustWsCacheShelfField(node: any): boolean;
    /** `this.F[k]` on a cache shelf. */
    rustWsCacheShelfEntry(node: any): boolean;
    /** `this.safeDict (this.F, k)` on a cache shelf. */
    rustWsCacheShelfLookup(node: any): boolean;
    /** A cache map: the map field itself or an inner map of a shelf. */
    rustWsCacheMapLike(node: any): boolean;
    /** The place text of a cache map (`self.F`, `self.F.shelf(&k)`, `self.F.shelf_text(&k)`). */
    rustWsCacheMapPlace(node: any): string;
    /** The key of a cache-map access (`m[k]`, `k in m`, `safeValue (m, k)`): printed by reference. */
    rustWsCacheMapKeyUse(n: any): boolean;
    /** `this.F[k]` on a cache map. */
    rustWsCacheMapEntry(node: any): boolean;
    /** `this.safeValue|safeDict (this.F, k)` on a cache map. */
    rustWsCacheMapLookup(node: any): boolean;
    rustWsCacheOptSource(node: any, orUndefined: boolean): boolean;
    /** The `Option<Cache>` text of an optional source. */
    rustWsCacheOptText(node: any): string;
    /** The borrowed key of a map access: a typed string local by reference, else the printed `Value`. */
    rustWsCacheMapKey(keyNode: any): string;
    rustWsCacheMapReadText(n: any): string;
    /** A map read outside an optional-local slot (those print through `rustWsCacheOptText`): boxed once. */
    printWsCacheMapRead(node: any): string | undefined;
    /** `x === undefined` on a map read, and the always-false test of the map field itself. */
    printWsCacheMapNullTest(left: any, right: any, op: any): string | undefined;
    /** `k in this.F`. */
    printWsCacheMapHas(key: any, obj: any): string | undefined;
    /** `delete this.F[k]`. */
    printWsCacheMapDelete(node: any): string | undefined;
    rustWsCacheForget(base: boolean, trait: string, field: string, keys: string[]): string;
    /** The value of `this.F[k] = x` for a cache local `x` (or a constructor). */
    rustWsCacheMapWriteValue(n: any): boolean;
    /** `this.F[k] = cache` and `this.F = {}` / `this.F = this.createSafeDictionary (..)`. */
    /** `this.safeDict|safeValue (this.F, k, {})` on a shelf: the ensure source of `this.F[k] = ..`. */
    rustWsCacheShelfEnsure(node: any): boolean;
    printWsCacheMapWrite(left: any, right: any): string | undefined;
    /** Any other read of the map field is its dict snapshot (each entry an Arc bump); a write is unproven. */
    printWsCacheMapField(node: any): string | undefined;
    private rustWsResolveTables;
    private rustWsWatchKinds;
    private rustWsHashEnv;
    private rustWsFollowed;
    private rustWsWrapperNil;
    /** The hash text of a Null hash (`stringify_param(Null)`): a literal no watch spells. */
    private static readonly RUST_WS_NIL_HASH;
    /** The hash patterns of `n`: segments are literal text or `null` (any text). */
    rustWsHashPatterns(n: any, depth: number, seen: Set<Node>): Array<Array<string | null>>;
    rust93rfSelfAppendTail(assign: BinaryExpression, declaration: VariableDeclaration): Node[] | undefined;
    rustWsDispatchKeyPatterns(declaration: any): Array<Array<string | null>> | undefined;
    /** Whether a parameter is written in its function (assignment, ++/--, destructuring target). */
    rustWsParamWritten(fn: any, param: any): boolean;
    rustWsSubscriptionKeyRead(init: any): {
        key: string;
        element: boolean;
        source?: any;
    } | undefined;
    rustWsSubscriptionGuardKey(sub: any): string | undefined;
    rustWsSubscriptionKeyPatterns(at: any, key: string, element: boolean, depth: number, seen: Set<Node>, guard?: string): Array<Array<string | null>>;
    static rustWsPatternNorm(p: Array<string | null>): Array<string | null>;
    /** ral-55h: the hash text of a request-id echo (`rustWsRequestIdEcho`): some run of decimal digits. */
    private static readonly RUST_WS_DIGITS_HASH;
    rustWsRequestIdEcho(declaration: any): boolean;
    /** Whether some string matches both patterns (a sound over-approximation: prefix and suffix agree). */
    static rustWsPatternsMeet(a0: Array<string | null>, b0: Array<string | null>): boolean;
    /** The typed kind a resolved value passes as, or undefined. */
    rustWsResolvedKind(x: any): 'book' | 'cache' | 'dict' | 'list' | undefined;
    rust92rfKeyedLocalElementKind(x: Node, depth?: number): 'cache' | 'dict' | undefined;
    rust92rfLoopListElementKind(n: ElementAccessExpression, constLocal: (id: Node | undefined) => VariableDeclaration | undefined): 'cache' | 'dict' | undefined;
    rustWsCacheFieldDictRead(n: any): boolean;
    rustWsResolvedList(x: any, depth: number): boolean;
    private static readonly RUST_WS_MAP_RECORD_BUILDERS;
    rustWsResolvedMap(x: any, depth: number): boolean;
    /** Every return of the method body is a map on every path (rustWsResolvedMap), and there is at least one. */
    rustWsMapReturns(declaration: MethodDeclaration, depth: number): boolean;
    rustWsRestParentMethod(declaration: Node, site: Node): boolean;
    /** Any write of the local after its declaration (an assignment or an update). */
    rustLocalReassigned(declaration: any): boolean;
    /** ral-53h: set while the resolve table builds its `rpats` (read only by `await client.future (h)`; watch calls keep `pats`). */
    private rustWsFoundRefine;
    rustWsFoundHashesLiteral(list: any, depth?: number, seen?: Set<Node>): Array<Array<string | null>> | undefined;
    rustWsRefinedHashPatterns(hash: any): Array<Array<string | null>>;
    /** Every resolve of the ws class with its hash patterns and kind; null when the class has ws relatives. */
    rustWsResolveTable(cls: any): Array<{
        pats: Array<Array<string | null>>;
        rpats?: Array<Array<string | null>>;
        kind: string;
        value?: any;
        plainMap?: boolean;
        scalar?: boolean;
    }> | null;
    rustWsSiteTupleValue(x: Node | undefined): Node | undefined;
    rustWsBaseCleanUnsubscription(call: CallExpression): boolean;
    rustWsHelperCallSites(cls: any, site: any, exprs: any[]): Array<Map<Node, {
        arg: any;
        env: Map<Node, any> | undefined;
    }>> | undefined;
    rustWsReturnPatterns(call: any, depth: number, seen: Set<Node>): Array<Array<string | null>> | undefined;
    private rustWsWsParents;
    rustWsHasWsRelatives(file: string, at: number): boolean;
    rustWsRestOnlyChild(path: string, parentFile: string): boolean;
    /** A ws subclass whose only methods are `describe` / `describeData` adds no handler and no resolve. */
    rustWsDescribeOnly(path: string): boolean;
    /** The proven kind of an `await this.watch|watchMultiple (..)` initializer, else undefined. */
    rustWsWatchResultKind(init: any): 'book' | 'cache' | 'dict' | 'list' | undefined;
    rustWsAwaitedHashes(call: any, cls: any, depth: number): Array<Array<string | null>> | undefined;
    rustWsReadOnlyListArg(call: any, at: number): boolean;
    rustWsParamCallerPatterns(param: any, read: (arg: any) => Array<Array<string | null>> | undefined, seen: Set<Node>): Array<Array<string | null>> | undefined;
    rustWsListParamReadOnly(param: any, within?: any): boolean;
    /** ral-54h: `this.m (.., list, ..)` of a method of the same class whose parameter at `at` is only read. */
    rustWsListArgParamReadOnly(call: any, at: number): boolean;
    rustWsHashListPatterns(harg: any, depth: number): Array<Array<string | null>> | undefined;
    rustWsListAliasReadOnly(r: any, scope: any, depth: number): boolean;
    private static readonly RUST_BOOK_TYPE;
    private static readonly RUST_BOOK_MAP_TYPE;
    private static readonly RUST_BOOK_CTORS;
    private static readonly RUST_BOOK_SIDE_FIELDS;
    private static readonly RUST_BOOK_META_WRITES;
    private rustWsBookMapFields;
    private rustWsBookLocals;
    private rustWsBookUses;
    private rustWsBookCtorPrinting;
    private rustWsBookCtorBare;
    /** `this.F` for a base field declared `Dictionary<WsOrderBook>`. */
    rustWsBookMapField(node: any): boolean;
    /** `this.orderBook|indexedOrderBook|countedOrderBook (..)` resolved to the base declaration. */
    rustWsBookCtor(node: any): boolean;
    /** A constructor, or a ternary whose arms are both book constructors. */
    rustWsBookCtorLike(node: any): boolean;
    /** `this.F[k]` on the book map. */
    rustWsBookMapEntry(node: any): boolean;
    /** `this.safeValue|safeDict (this.F, k)` on the book map. */
    rustWsBookMapLookup(node: any): boolean;
    rustWsBookMapRead(node: any): boolean;
    /** The `Option<Book>` text of a map read. */
    rustWsBookMapReadText(node: any): string;
    /** The key of a book-map access: printed by reference (the cache-map key form). */
    rustWsBookMapKeyUse(up: any): boolean;
    rustWsBookKeyParent(n: any): any;
    rustWsBookKeyOf(n: any): boolean;
    rustWsBookOptSource(node: any, orUndefined: boolean): boolean;
    rustWsBookOptText(node: any): string;
    /** `x.limit()` / `x.reset(..)` as a statement. */
    rustWsBookMethodReceiver(n: any): boolean;
    /** `return x.limit ()` on an optional book: the slot's `limit()` trims and hands the book back boxed. */
    rustWsBookLimitReturn(n: any): boolean;
    /** The literal key of a side / meta access on `x` (`x['bids']`, `x.nonce`), else undefined. */
    rustWsBookFieldKey(n: any): string | undefined;
    /** A hand-off that boxes the handle once: a call argument, a return, a non-literal element read, a literal value. */
    rustWsBookBoxUse(n: any): boolean;
    /** `this.F[k] = x` for a book local `x`. */
    rustWsBookMapWriteValue(n: any): boolean;
    /** 'opt' for a local bound to a map read, 'book' for one bound to a constructor; undefined when it stays `Value`. */
    rustWsBookLocal(declaration: any): 'opt' | 'book' | undefined;
    rustWsBookLocalOf(node: any): 'opt' | 'book' | undefined;
    /** The `push` call when `outer` (the `x.cache` access, wrappers climbed) is `outer.push (v)` as a statement. */
    rust66cCachePushCall(outer: any): any;
    rust84aBookCachePushArg(n: Node): boolean;
    /** `x.cache.push (v)` on a typed book local: the book's `cache_push`. */
    print66cCachePush(node: any, parsedArg: string | undefined): string | undefined;
    /** The book identifier of an initializer `x.cache` whose book local reads it as a `field` use, else undefined. */
    rust66cBookCacheRead(init: any): any;
    rustWsBookPath(node: any, type: string): string;
    printWsBookLocalDeclaration(declaration: any, varName: string, indent: string): string | undefined;
    /** A use of a typed book local: the handle itself, or boxed once at a `Value` hand-off. */
    printWsBookLocalUse(node: any): string | undefined;
    /** `x['bids']` / `x.nonce` on a book local: the shared-store read. */
    printWsBookFieldRead(node: any): string | undefined;
    /** `x['nonce'] = v` on a book local, and `this.F[k]['symbol'] = v` on a map entry: the shared-store write. */
    printWsBookMetaWrite(left: any, right: any): string | undefined;
    /** A write of a book local: a map read, `undefined` or a constructor. */
    printWsBookLocalWrite(left: any, right: any): string | undefined;
    /** A constructor stays a `Book` where a book slot takes it (a book local, a map write, a discarded statement); elsewhere it is boxed. */
    printWsBookCtorCall(node: any, identation: number): string | undefined;
    rustWsBookCtorSlot(node: any): boolean;
    /** A map read outside an optional-local slot: boxed once. */
    printWsBookMapRead(node: any): string | undefined;
    /** `x === undefined` on an optional book local or a map read, and the always-false test of the map field. */
    printWsBookNullTest(left: any, right: any, op: any): string | undefined;
    /** `k in this.F`. */
    printWsBookMapHas(key: any, obj: any): string | undefined;
    /** `delete this.F[k]`. */
    printWsBookMapDelete(node: any): string | undefined;
    /** `this.F[k] = book` and `this.F = {}` / `this.F = this.createSafeDictionary (..)`. */
    printWsBookMapWrite(left: any, right: any): string | undefined;
    /** Any other read of the map field is its dict snapshot (each entry an Arc bump); a write is unproven. */
    printWsBookMapField(node: any): string | undefined;
    printWsWatchCall(node: any, receiver: string, methodName: string, identation: number): string | undefined;
    /** A numeric or boolean hash argument: the runtime keys by its text, as `stringify_param` did. */
    rustWsNumberSlot(arg: any): boolean;
    rustWsNumberSlotText(arg: any, printed: string): string;
    /** The message and subscription slots take `impl Into<Value>`: a dict local is lent there as its shared handle. */
    rustWsWatchDictSlot(call: any, at: number): boolean;
    /** `client.subscriptions[k] = x`: the handle stores the boxed value, no nested container write. */
    rustWsSubscriptionWriteValue(n: any): boolean;
    private rustBuiltLists;
    rustBuiltListLocal(declaration: any): boolean;
    rust73aStoreLastUse(place: any, n: any, declaration: any): boolean;
    /** ral-56s: a base `this.arrayConcat (a, b)` (two operands, non-test tier): always a `Value::Arr`. */
    rustBuiltListConcatInit(init: any): boolean;
    rustBuiltListValueAliasWrite(n: any, declaration: any): boolean;
    /** ral-56i: `x` as the only element of `x = [ x ]`, an expression statement writing the same list local. */
    rustBuiltListSelfWrap(n: any, declaration: any): boolean;
    /** ral-56i: the whole write `x = [ x ]` of a built-list local (printed `x = Arc::new(vec![Value::Arr(x)])`). */
    rustBuiltListSelfWrapWrite(write: any, declaration: any): boolean;
    /** ral-tf: no later statement of the function pushes to or writes the list, and the use is in no loop or closure. */
    rustBuiltListFrozenAfter(node: any, declaration: any, name: string): boolean;
    rustBuiltListLentHelperSlot(call: any, n: any): 'inArray' | 'arrayConcat' | 'append' | undefined;
    /** `Promise.all(x)` with `x` its only argument (printed `promise_all(&x)`). */
    rustBuiltListPromiseAllOperand(call: any, n: any): boolean;
    rustBuiltListSelfSort(write: any, name: string): boolean;
    rustBuiltListAliasTarget(left: any): boolean;
    private rustBuiltListAliasGuard;
    /** ral-57i: `this.arraySlice (..)` resolved to the base declaration and redeclared by no venue. */
    rustBaseArraySliceCall(call: any): boolean;
    /** `x = this.m(.., x, ..)` naming `x` only there and on the left: the old list moves into the call before the write. */
    rustBuiltListSelfWriteArg(n: any, name: string): boolean;
    /** A right-hand side that answers a `Value::Arr` on every path. */
    rustBuiltListWriteSource(right: any): boolean;
    rust65iFilterByCall(call: any): boolean;
    private rustDeclaredArrayProof;
    rustDeclaredArrayCallWriteSource(right: any): boolean;
    rustOverloadListCallWriteSource(right: any): boolean;
    rustBuiltHelperListWriteSource(right: any): boolean;
    rustPresentListArg(call: any, arg: any): boolean;
    rustTypedCoreListCallWriteSource(right: any): boolean;
    rustVenueListWriteSource(rhs: any): boolean;
    rustDeclaredListProducer(rhs: any): boolean;
    rustBaseParserFamilyFree(call: any, declaration: any, method: string): boolean;
    private static readonly RUST_LIST_PARSERS;
    rustArrayGuardedMove(write: any): boolean;
    private rustArrayGuardedCopies;
    rustSelfDefaultedListRead(right: any, declaration: any): boolean;
    rustArrayGuardedTernary(right: any): boolean;
    /** ral-52i: `id` names a plain `Value` local or parameter of its own function (no typed local form). */
    rustPlainValueBinding(id: any): boolean;
    rustBuiltListBranchLastUse(node: any, declaration: any): boolean;
    rustGuardedBranchLastUse(node: any, declaration: any, guard: any): boolean;
    /** Every write to the local (`x = ..`) sits at or before `write` in source order. */
    rustWritesAllBefore(declaration: any, write: any): boolean;
    rustDefaultedAliasMove(write: any): any;
    private rustNnListHandOffs;
    /** ral-62i: `y = x` (statement), y a built list local of x's function (not x itself): the never-null list x hands over. */
    rustNnListHandOff(n: any, declaration: any): boolean;
    /** ral-62i: `y = x` is the only statement of the then-branch of `if (x !== undefined)` (or `!=`). */
    rustNnGuardedWrite(write: any, x: any): boolean;
    private rustOptMapDefaultTernaries;
    /** ral-62i: n is the `whenFalse` arm of `(n === undefined) ? {} : n` (or `!== undefined` with the arms swapped). */
    rustOptMapDefaultTernaryArm(n: any, declaration: any): boolean;
    /** ral-62i: the print of a ternary admitted by rustOptMapDefaultTernaryArm once its local holds `Option<Dict>`. */
    printOptMapDefaultTernary(node: any, bare?: boolean): string | undefined;
    rustBuiltListOf(node: any): any;
    /** ral-tf: a bare element local read nowhere after the literal (no loop or closure between): it moves into the element slot. */
    rustBuiltListMovedElement(e: any): boolean;
    /** ral-tf: the element list of a literal with moved bare elements, exactly as its `Value` box printed it (no added copy). */
    rustBuiltListMovedLiteral(node: any): string | undefined;
    rustBuiltListBoxedLiteral(node: any): string | undefined;
    printBuiltListLiteral(node: any): string;
    printBuiltListDeclaration(declaration: any, indent: string, varName: string): string | undefined;
    private rustNilListFirstCache;
    rustNilListAssignedFirst(declaration: any): boolean;
    rustNilListAssignedFirstUncached(declaration: any): boolean;
    rustOptListGuardedMove(write: any): any;
    /** A never-reassigned local initialised by a `[]`-defaulted base `safeList*` that still prints as the plain `Value` binding. */
    rustDefaultedListValue(declaration: any, y: any): boolean;
    printBuiltListWrite(left: any, right: any): string | undefined;
    printBuiltListPush(node: any, name: string | undefined, parsedArg: string | undefined): string | undefined;
    private static readonly RUST_OPT_LIST_SOURCES;
    private rustOptListDecisions;
    private rustOptListBoxes;
    /** ral-80d: optional list locals held in the split list-vs-map-vs-null form (a second `<name>__map` binding). */
    private rust80dSplitLocals;
    rustOptListLocal(declaration: any): boolean;
    /** A base-tier list source that may return `undefined` (a `safeList*` default must be absent or nullish). */
    rustOptListSource(node: any): boolean;
    rustOptListLocalUncached(declaration: any): boolean;
    rust87rfEndpointSplitSource(declaration: Node, init: Node): boolean;
    rust90rfMapOrListEndpoint(init: Node): boolean;
    rust90rfLastBesidesTest(n: Node, test: Node, declaration: VariableDeclaration): boolean;
    /** ral-90rf R4: some `Array.isArray (x)` of this declaration in its function. */
    rust90rfArrayTested(declaration: VariableDeclaration): boolean;
    /** ral-90rf R4: `x !== undefined` / `undefined !== x` (parenthesised or not) on this declaration. */
    rust90rfPresentTestOf(cond: Node, declaration: VariableDeclaration): boolean;
    rust90rfWholeBoxUse(n: Node): boolean;
    rust90rfArmOf(n: Node, declaration: VariableDeclaration, fn: Node): 'list' | 'map' | undefined;
    /** ral-80c R1: an unwritten method parameter whose typed signature slot is a string list (decided from the signature table). */
    rust80cStrVecParamAlias(init: Expression | undefined): boolean;
    /** `c ? a : b` where each arm is an unwritten string-list parameter, a base `string[]` field or a string-literal list. */
    rustStrListTernary(init: Node | undefined): boolean;
    /** ral-80c R1: `this.symbols` / `this.ids`, base fields declared `string[]` (always a list). */
    rust80cBaseStrListField(node: Expression): boolean;
    /** ral-80c R1: `x.push(v)` statement on an optional list alias. */
    print80cOptListPush(node: CallExpression, parsedArg: string | undefined): string | undefined;
    /** `xs[N]` on a `string[]` parameter the body re-binds as its slice (`xs.get(N)`). */
    rustOptListParamRead(node: any): boolean;
    rustOptListParamInit(init: any): boolean;
    rust80dInListArm(n: any, declaration: any, fn: any, flags?: boolean): boolean;
    /** `Array.isArray`. */
    rustIsArrayIsArrayCallee(call: any): boolean;
    /** The optional list local an identifier reads (never its own declaration name). */
    rustOptListOf(node: any): any;
    rustOptListName(node: any): string;
    /** The slice an optional list reads through (empty for `None`). */
    rustOptListSlice(node: any): string;
    /** ral-58i: `let x: T = undefined` / `let x: T;` (one `let` declarator, nil or no initializer). */
    rustOptListNilInit(declaration: any): boolean;
    printOptListDeclaration(declaration: any, varName: string, indent: string): string | undefined;
    rustProHandlerOptListRead(init: any): string | undefined;
    printOptListWrite(left: any, right: any): string | undefined;
    printOptListNullTest(left: any, right: any, op: any): string | undefined;
    printOptListIsArray(node: any): string | undefined;
    printOptListLength(node: any): string | undefined;
    printOptListElement(receiverNode: any, keyNode: any): string | undefined;
    /** `&x` at an any-key reader, the shared handle at a `Value` slot, a move at `return x`. */
    printOptListIdentifier(node: any, text: string): string | undefined;
    /** `[..]` without spread is always a list, so `into_opt_list` keeps exactly what the box held. */
    rustOptListLiteralWrite(node: any): boolean;
    rustOptListLiteralSome(right: any): string | undefined;
    rustDictLiteralArc(right: any, printed: string): string | undefined;
    rustOptListExtraUse(n: any, declaration: any): 'join' | 'move' | 'clone' | undefined;
    /** A plain local (not this list, no container rule of its own) that takes a whole optional list as a `Value`. */
    rustOptListAliasTarget(place: any): boolean;
    printOptListJoin(node: any): string | undefined;
    private static readonly RUST_HANDED_DICT_SOURCES;
    private rustHandedDictDecisions;
    private rustPromiseAllPendingHits;
    rustHandedDictLocal(declaration: any): boolean;
    /** `this.m (..)` resolved to the base tier, `m` in `names`. */
    rustBaseCallNamed(call: any, names: Set<string>): boolean;
    rustHandedDictLocalUncached(declaration: any): boolean;
    /** `const x: Dict = this.extend (..)` (base `extend`, which builds a `Value::Map` on every input). */
    rustDeclaredDictExtendCopy(declaration: any): boolean;
    private static readonly RUST_ALWAYS_MAP_HELPERS;
    private static readonly RUST_84G_GROUP_HELPERS;
    /** The initialiser of a reassigned handed local answers a map on every path. */
    rustHandedMapInit(declaration: any): boolean;
    rustOmitDeclLineFits(declaration: any): boolean;
    /** ral-57a: a single-binding `const x = this.omit (m, k)` whose head is a proven map (rustOmitOfDict). */
    rustOmitOfDictInit(declaration: any): boolean;
    /** ral-55a: a plain `let x = <map>` (rustHandedMapInit) that is reassigned in its function. */
    rustHandedReassignedMap(declaration: any): boolean;
    /** `n = <map>` as a statement: an always-map helper, an omit of `n` itself, or an omit of a proven map. */
    rustHandedMapWrite(n: any, declaration: any): boolean;
    /** `this.omit (x, k)` whose head is the local itself (named nowhere else in the call). */
    rustHandedSelfOmit(call: any, declaration: any): boolean;
    /** The reassigned handed local written by `n = ..`, else undefined. */
    rustHandedRewriteOf(n: any): any;
    private rustNilSlotDictCandidates;
    rustNilSlotDictCandidate(declaration: any): boolean;
    /** The element `n` of `[ .., n, .. ] = <call>` sits at a map slot of the call's tuple. */
    rustDictSlotOfWrite(n: any): boolean;
    private static readonly RUST_87RG_PARAM_SLOT_HELPERS;
    rust87rgParamSlotCall(call: CallExpression, n: Node): boolean;
    rustNilSlotDictCandidateUncached(declaration: any): boolean;
    rustNilSlotLineOk(n: any): boolean;
    rustShortDestrHeads: WeakSet<any>;
    rustDestrBoxLineOk(n: any): boolean;
    /** A nil-declared slot local typed as the map. */
    rustNilSlotDictLocal(declaration: any): boolean;
    /** ral-46g: the reassigned handed map written at slot 1 of `[ a, x ] = this.handle*AndParams (..)`, else undefined. */
    rustHandedSlotWriteOf(node: any): any;
    rustNilSlotDictOf(node: any): any;
    /** `[a, b] = this.m (.., n)`: printed as one `__destr_tmp` block line, kept within the line budget by the bare box. */
    rustInDestructureWrite(n: any): boolean;
    private static readonly RUST_HANDED_DICT_OMIT;
    private static readonly RUST_HANDED_DICT_EXTEND;
    /** The sole extra operand of a base `this.extend (a, x)` / `this.deepExtend (a, x)` when it is a bare identifier. */
    rustHandedDictExtendOperand(call: any): any;
    private static readonly RUST_OPT_EXTEND;
    /** ral-40a: `n` is the sole extra operand of a base `this.extend (a, n)` (not `deepExtend`, which merges a list too). */
    rustOptExtendOperandUse(n: any): boolean;
    /** `self.extend(a, &[&x])` / `self.omit(&x, keys, &[])` lending a handed dict local. */
    printHandedDictExtend(node: any, identation: number): string | undefined;
    rustHandedRestOmit(call: any): boolean;
    /** `let mut x: crate::value::Dict = <slot read>.into_dict()` for a handed params slot. */
    printRustHandedDictSlot(element: any, printedName: string, read: string, indent: string): string | undefined;
    /** `n` is the first operand of a two-operand base `this.extend (n, x)`. */
    rustExtendHeadUse(n: any): boolean;
    private static readonly RUST_EXTEND_HEAD_CALLS;
    private rustUntilHeadDecisions;
    rustUntilRequestSlot(element: any): boolean;
    rustUntilHeadSlot(element: any): boolean;
    rustUntilHeadSlotUncached(element: any): boolean;
    /** 41i: `n` is the first argument of a base borrowed-key reader (`safeInteger` / `safeString` ..) read with a literal key. */
    rustUntilHeadReaderUse(n: any): boolean;
    /** `x` (moved at its last use) or `&x` for a shared-map local as the head of a base `extend`, else undefined. */
    printExtendHeadArg(node: any, text: string): string | undefined;
    /** The literal key of a statement write `n['k'] = v` (one level, not a book-meta or replaced key). */
    rustUntilHeadKeyWrite(n: any): string | undefined;
    rustSlotNestedInsertKeys(n: any): string[] | undefined;
    private static readonly RUST_SLOT_NESTED_TAG_ACCESS;
    /** ral-40f: the target of a nested write printSlotNestedInsert prints (a typed params slot, literal keys). */
    rustPrintedSlotNestedWrite(place: any): boolean;
    printSlotNestedInsert(left: any, right: any, valueText: string): string | undefined;
    private rustHeadSeedCache;
    private rustHeadSeedGuards;
    private rustHeadSeedParams;
    rustHeadSeedParam(param: any): boolean;
    rustHeadSeedOf(declaration: any): {
        param: any;
        guard: any;
    } | undefined;
    rustHeadSeedUncached(declaration: any): {
        param: any;
        guard: any;
    } | undefined;
    /** The literal key of `x['k'] = v` (a statement whose value does not read `x`), else undefined. */
    rustHeadSeedKeyWrite(access: any, x: any): string | undefined;
    printHeadSeedKeyWrite(left: any, right: any): string | undefined;
    /** `std::sync::Arc::make_mut(&mut x).insert("k".into(), v)` for a literal-key write on a typed request slot. */
    printUntilHeadKeyWrite(left: any, right: any, valueText: string): string | undefined;
    private rustLentListParamDecisions;
    rustParamIsLentList(param: any): boolean;
    private static readonly RUST_LENT_LIST_TYPES;
    private static readonly RUST_LENT_RESPONSE_READERS;
    rustParamIsLentListUncached(param: any): boolean;
    rust92rfVenueRowsParam(method: MethodDeclaration, param: ParameterDeclaration, file: string): boolean;
    /** `object`, `Dict` or `any`, optionally `| undefined`: the parser reads its input as a `Value` of any shape. */
    rustLentRecordTypeNode(type: any): boolean;
    /** `Dict[]` / `object[]`, optionally `| undefined`: a list of rows, the same Value list a `List` holds. */
    rustRowListTypeNode(type: any): boolean;
    /** ral-tf: per-venue ws helpers whose hash / topic / channel lists callers build and hand on whole. */
    private static readonly RUST_LENT_HASH_LIST_METHODS;
    /** ral-tf: `string[]` / `Str[]` / `any[]` (a hash, topic or channel list): a required per-venue list slot like `Dict[]`. */
    rustScalarListTypeNode(type: any): boolean;
    /** A call argument landing in a lent list parameter of the callee. */
    rustLentListSlot(call: any, arg: any): boolean;
    /** `&x` for a shared list local lent to a lent list parameter. */
    printLentListArg(node: any, text: string): string | undefined;
    private rustLentResponseDecisions;
    rustParamIsLentResponse(param: any): boolean;
    private static readonly RUST_LENT_RESPONSE_TYPES;
    rustParamIsLentResponseUncached(param: any): boolean;
    private rustLentVenueDecisions;
    rustParamIsLentVenue(param: any): boolean;
    rustVenueLentKind(param: any): 'dict' | 'list' | undefined;
    rustVenueLentKindUncached(param: any): 'dict' | 'list' | undefined;
    rustVenueOnlyMethod(method: any, name: string): boolean;
    private rustBaseTierMethodNamesByRoot;
    rustBaseTierMethodNames(srcRoot: string): Set<string>;
    /** The lent per-venue slot kind a call argument lands in (`this.m(.., x, ..)`). */
    rustLentVenueSlot(call: any, arg: any): 'dict' | 'list' | undefined;
    /** `&x` for a typed container local (plain or optional form) lent to a per-venue lent slot. */
    printLentVenueArg(node: any, text: string): string | undefined;
    /** The response argument of a call to the class's own lent override (an inherited one is the `Value` trait method). */
    rustLentResponseSlot(call: any, arg: any): boolean;
    /** A base `extend` / `deepExtend`, or a `safeDict*` with an empty-map default: the local always holds a map. */
    rustLentResponseSource(init: any): boolean;
    rustLentEndpointSlot(call: any, arg: any, kind: 'dict' | 'list' | 'api' | undefined): boolean;
    private static readonly RUST_LENT_HELPER_SLOTS;
    /** A whole dict / list local handed to a lent operand of a hand-written base helper. */
    rustLentHelperSlot(call: any, arg: any, kind: 'dict' | 'list'): boolean;
    private rustPrintedBorrowed;
    /** `&x` for a non-optional borrowed local lent to a hand-written helper operand. */
    printLentHelperArg(node: any, text: string): string | undefined;
    /** A base `safeDict*` / `safeList*` read with an empty literal default: a container on every path. */
    rustLentContainerSource(init: any): boolean;
    /** A lent first parameter not declared a list (`any` / `object` / `Dict`): a dict lends there as well. */
    rustLentAnyShapeSlot(call: any): boolean;
    /** `&x` for a shared dict local lent to a lent response slot; a container local boxes explicitly there (no `.into()`). */
    printLentResponseArg(node: any, text: string): string | undefined;
    private static readonly RUST_TYPED_FILTER_METHODS;
    private static readonly RUST_TYPED_FILTER_TYPES;
    private rustTypedFilterDecisions;
    rustTypedFilterParams(method: any): {
        typed: Map<number, string>;
        positional: number;
    } | undefined;
    rustTypedFilterParamsUncached(method: any): {
        typed: Map<number, string>;
        positional: number;
    } | undefined;
    /** A parameter the typed filter signature takes positionally (typed or `Value`). */
    rustTypedFilterPositional(param: any): boolean;
    /** `let mut values: Value = values.into();` for each lent symbol-list parameter. */
    rustTypedFilterBinding(node: any, identation: number): string;
    /** A call argument landing in a lent symbol-list slot of a typed filter method. */
    rustTypedFilterLentSlot(call: any, arg: any): boolean;
    rustTypedFilterSymbolSlot(call: any, arg: any): boolean;
    printTypedFilterSignature(node: any, identation: number): string | undefined;
    /** The typed parameter an identifier reads inside its own filter method, else undefined. */
    rustTypedFilterParamOf(node: any): {
        param: any;
        rustType: string;
    } | undefined;
    /** A read of a typed filter parameter in a `Value` position boxes it (both types are `Copy`). */
    printTypedFilterParamRead(node: any): string | undefined;
    /** The Rust type of a typed slot of a `this.filterBy*` call, else undefined. */
    rustTypedFilterSlot(call: any, at: number): string | undefined;
    rustTypedFilterArgText(arg: any, rustType: string, identation: number): string;
    /** `self.m(array, <positional typed / Value args>, &[rest])` for a call of a typed filter method. */
    printTypedFilterCall(node: any, identation: number): string | undefined;
    private static readonly RUST_FILTER_ROWS;
    private static readonly RUST_LOOP_KINDS;
    private rustFilterRowsDecisions;
    rustFilterRowsParamOk(param: any): boolean;
    /** `object[]`, `Dict[]` or a union of those with `Dictionary<..>` / `undefined` (never `any`). */
    rustFilterRowsTypeNode(type: any): boolean;
    rustFilterRowsParamOkUncached(param: any): boolean;
    /** The rows parameter a read refers to inside its own filter method, else undefined. */
    rustFilterRowsParamOf(node: any): any;
    /** A rows slot argument: an own rows parameter moves on, a typed cache field / local or a lent list is lent. */
    rustFilterRowsArgText(node: any): string | undefined;
    /** `Rows::rows(x)` where the rows parameter is handed to a `Value` slot. */
    printFilterRowsParamRead(node: any): string | undefined;
    /** `x === undefined` on a rows parameter. */
    printFilterRowsNullTest(left: any, right: any, op: any): string | undefined;
    private rustLentParamDecisions;
    private rustLentOverrideNames;
    rustParamIsLentDict(param: any): boolean;
    /** A required venue `params: Dict` of a sync method: the borrowed-map rule decides it before the lent-`Value` form. */
    rustVenueLentDictYields(param: any): boolean;
    rustParamIsLentDictUncached(param: any): boolean;
    rustLentOverridden(name: string): boolean;
    private rustVenueMethodNamesByRoot;
    /** Method names declared by the venue sources under `srcRoot` (REST, pro, prediction). */
    rustVenueMethodNames(srcRoot: string): Set<string>;
    rustVenueLocalMethod(method: any, name: string): boolean;
    private rustVenueMethodDeclCountsByRoot;
    /** Class-member method declarations per name over the base tier and the venue sources (base counts twice). */
    rustVenueMethodDeclCounts(srcRoot: string): Map<string, number>;
    private rustAsyncNoValueByRoot;
    rustAsyncNoValueMethod(node: any): boolean;
    /** Index of the bracket closing the one at `open` in raw source text, or -1. */
    rustIndexMatchClose(text: string, open: number, o: string, c: string): number;
    /** The callee parameter a call argument lands in, when that parameter takes a lent dict. */
    rustLentParamsSlot(call: any, arg: any): boolean;
    /** `&x` for a handed dict local lent to a lent-params slot. */
    printLentParamsArg(node: any, text: string): string | undefined;
    /** A parameter named anywhere in the body (an unread typed slot needs no `Value` binding). */
    rustParamIsRead(node: any, param: any): boolean;
    /** `let mut params: Value = params.into();` heading a method whose params dict is lent: the body reads the `Value`. */
    rustLentParamsBinding(node: any, identation: number): string;
    rustLentSlotSource(init: any, element: any): boolean;
    /** The call a slot destructures, past parentheses, casts and one `await`. */
    rustAwaitedCall(node: any): any;
    rustHandedSlotBoxUse(n: any, declaration: any): boolean;
    rust68dReturnedParamsSlot(declaration: any): boolean;
    rustRewrittenFromLocal(declaration: any): boolean;
    /** ral-59a: a single-binding, never-reassigned `const x = this.omit (m, k)` whose head is a proven map. */
    rustOmitAliasSource(declaration: any): boolean;
    /** ral-53a: no loop or closure between the source's declaration and the alias declaration. */
    rustAliasInitOutsideLoop(alias: any, declaration: any): boolean;
    /** No loop or closure between the destructure and this use: a box there copies the slot once. */
    rustSlotUseOutsideLoop(node: any, element: any): boolean;
    /** `Value::Dict(x)` at the slot's last use (moved), else `Value::from(&x)`. */
    printHandedSlotBox(node: any, text: string): string | undefined;
    /** `native` for a literal-key read / statement write / `in` test of a params slot, `box` for a whole-value hand-off. */
    rustMutableSlotUse(n: any, declaration: any): 'native' | 'box' | undefined;
    /** A `let` the slot is copied into that no typed-local rule claims (it keeps its `Value` box). */
    rustSlotTargetStaysValue(target: any): boolean;
    rustMutableDictSlot(declaration: any): boolean;
    rustStrSlotKind(element: any, scope: any): string | undefined;
    rustStrSlotListElement(n: any): boolean;
    rustStrSlotTernaryArmJoined(n: any, element: any): boolean;
    rustStrTernaryOtherArmMoves(other: any, ternary: any): boolean;
    rustStrSlotBoxIsNotValueOf(n: any, feeds: any): boolean;
    rustStrSlotBoxLineFits(n: any): boolean;
    rustSlotJoinsSolve(element: any): boolean;
    rustPromiseAllDictSlot(element: any): boolean;
    rustPromiseAllOperandProducer(element: any): any;
    rustPromiseAllListProducer(element: any): any;
    private rustPromiseAllListKinds;
    rustPromiseAllListSlotKind(element: any): 'list' | undefined;
    printPromiseAllDictLocals(declaration: any, names: string[], indent: string): string | undefined;
    printPromiseAllListLocals(declaration: any, names: string[], indent: string): string | undefined;
    /** `let mut x: crate::value::List = <slot read>.into_list()` for a Promise.all list slot (the producer is always a list). */
    printPromiseAllListSlot(element: any, printedName: string, read: string, indent: string): string | undefined;
    rustDeclaredDictSlot(element: any): boolean;
    rustTernaryDictSlot(element: any): boolean;
    rustBaseHandleLastDictSlot(element: any): boolean;
    rust66s1SuperHandleParamsSlot(element: any): boolean;
    rustCallDeclaresDictSlot(init: any, at: number): boolean;
    rustReturnsBuildMapSlot(declaration: any, at: number): boolean;
    /** One element read rooted at the bearer: a plain read the native op serves. */
    rustReadBearerElementUse(access: any, kind: 'list' | 'map'): boolean;
    /** `xs[i].length` read (not written, not stepped): the element read feeds `Value::len` alone. */
    rustElementLengthRead(access: any): boolean;
    rustReadBearerKeyOk(kind: 'list' | 'map', keyNode: any): boolean;
    /** A typed `i64` sum/difference index (`n - j - 1`): `as usize` wraps a negative out of range, as `get_list_value` does. */
    rustI64ArithIndexText(key: any, print?: boolean): string | undefined;
    /** Native read of one bearer level; undefined keeps the helper. */
    printReadBearerAccess(kind: 'list' | 'map', receiverText: string, keyNode: any): string | undefined;
    /** Container kind a printed `Value` expression provably yields on every path. */
    rustContainerProducingKind(node: any, seen: Set<Node>): 'list' | 'map' | undefined;
    /** Declared element type of a container indexed by a string key. */
    rustStringIndexedElementType(node: Node | undefined): Type | undefined;
    private rustNestedBearerDecisions;
    rustNestedDictBearerDeclaration(node: any): any;
    rustNestedDictLocalIsTyped(declaration: any): boolean;
    rustNestedDictLiteral(node: any): any;
    rustNestedDictLocalIsTypedUncached(declaration: any): boolean;
    rustNestedBearerElementUse(access: any, name: string): boolean;
    /** The initialiser of a two-level bearer: one bucket per key, a line per entry. */
    rustNestedObjectLiteralBlock(literal: any, identation?: number): string;
    /** Read key: a bare literal, or the String an `IndexMap` lookup takes. */
    rustNestedBearerReadKey(node: any, text: string, receiver?: string): string | undefined;
    /** Write key: the `String` an `entry`/`insert` takes. */
    rustNestedBearerWriteKey(node: any, text: string, receiver?: string): string | undefined;
    /** `x[k1][k2] = v` on a two-level bearer: create the bucket, insert. */
    rustNestedBearerInsert(baseExpr: any, key1Node: any, key1Text: string, key2Node: any, key2Text: string, valueText: string): string | undefined;
    /** `x[k1] = {}` on a two-level bearer: seed the bucket, no box, no helper. */
    rustNestedBearerBucket(baseExpr: any, key1Node: any, key1Text: string, valueNode: any): string | undefined;
    /** `x[k1][k2]` on a two-level bearer: the two map lookups, boxed like `get_value`. */
    rustNestedBearerRead(baseExpr: any, key1Node: any, key2Node: any): string | undefined;
    /** Source path of a node (forward slashes). */
    provenDictFieldPath(node: Node): string;
    /** Test sources keep the helpers: tests-pipeline post-passes match `in_op(` text. */
    isTestSource(node: Node): boolean;
    provenDictFieldInOp(key: any, obj: any): string | undefined;
    provenDictFieldDelete(node: any): string | undefined;
    /** ral-59p: the borrowed `Option<&str>` text of a `dkey` string local key, else undefined. */
    rust59pDeleteKeyText(keyNode: any): string | undefined;
    rustRestCallLocalDelete(node: any, base: any, key: any): string | undefined;
    /** `this.extend ({..}, ..)`, or `this.m ({..}, ..)` whose single return is `this.extend (<first param>, ..)`. */
    rustPredictionHeadIsLiteral(call: any): boolean;
    rustFreshMapCall(init: any, depth: number): boolean;
    rustDeleteKeyBorrowable(keyExpr: string, recv: string): boolean;
    untaggedDictField(node: any): boolean;
    rustDeclaredPlainDictField(node: any): boolean;
    provenDictFieldEnum(node: any, parsedArg: string | undefined, kind: 'keys' | 'values'): string | undefined;
    /** Printed receiver usable as a method receiver, else undefined. */
    rustNativeStringReceiver(node: any, receiverText: string, kind?: string): string | undefined;
    /** Escaped text of a string-literal argument, else undefined. */
    rustNativeStringLiteralArg(node: any): string | undefined;
    printNativeStringCase(node: any, receiverText: string, method: string): string | undefined;
    rustStrCaseConvert(receiver: string, method: string): string;
    printNativeStringAffixTest(node: any, receiverText: string, method: string): string | undefined;
    printNativeStringSplit(node: any, receiverText: string): string | undefined;
    printNativeStringReplace(node: any, receiverText: string): string | undefined;
    printNativeStringPad(node: any, receiverText: string, dir: '>' | '<'): string | undefined;
    printNativeStringPadStart(node: any, receiverText: string): string | undefined;
    printNativeStringPadEnd(node: any, receiverText: string): string | undefined;
    printNativeToFixed(node: any, receiverText: string): string | undefined;
    rust43bInPlusEquals(call: any): boolean;
    rust43bValueRecvFindNeedle(n: any, kind: string): boolean;
    printNativeStringIndexOfString(node: any, receiverText: string): string | undefined;
    printNativeStringJoin(node: any, receiverText: string): string | undefined;
    rustOperandKind(node: any): string | undefined;
    printRustNativeToString(node: any, name: string): string | undefined;
    printRustNativeMathCall(node: any, op: string, parsedArg: string): string | undefined;
    printRustNativeNegate(operand: any, operandText: string): string | undefined;
    printRustNativeMod(left: any, right: any, leftText: string, rightText: string): string | undefined;
    rustIsDefiniteInt(node: any): boolean;
    rustNumericOperand(node: any): string | undefined;
    rustLengthEquality(left: any, right: any, op: any): string | undefined;
    rustNativeAddSubtract(op: any, left: any, right: any, leftType: any, rightType: any, leftText: string, rightText: string): string | undefined;
    /** 'local' for a proven plain-dict local, 'param' for a plain-kept dict parameter. */
    rustPlainReceiver(node: Node): 'local' | 'param' | undefined;
    /** A literal-key read (`x['k']` / `x.k`) on a proven plain receiver. */
    rustLiteralReadOk(receiverNode: Node, keyText: string): boolean;
    /** `x[k]` on a proven plain receiver with a `Value` key place (`string` or `any` typed). */
    rustDynamicRead(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined;
    vecUse(n: any): boolean;
    loopBetween(n: any): boolean;
    vecReadShape(access: any): boolean;
    printElementAccessExpressionExceptionIfAny(node: any): any;
    provenListValue(node: any, depth?: number): boolean;
    private static readonly RUST_BOOL_READERS;
    private static readonly RUST_DICT_READERS;
    /** A REST venue file (`ts/src/<id>.ts`): no base / pro / prediction tier. */
    private static readonly RUST_REST_FILE;
    private rustVisiting;
    rustPlainDictSource(node: any, depth?: number): boolean;
    rustUnsharedDict(arg: any): boolean;
    rustPlainBuilder(call: any, depth: number): boolean;
    rustPlainReturn(expr: any, depth: number): boolean;
    /** A prediction-venue parameter declared as a map type (a list `any` would pass through `omit` unchanged), unshared. */
    mapParamCopy(arg: any): boolean;
    /** A sync base method no venue source declares and outside virtual dispatch: a base-tier `self.m()` runs this body. */
    rustBaseOnlyCallee(declaration: any, name: string): boolean;
    rustMethodImpl(call: any, baseOnly?: boolean): any;
    /** The expression's Rust value is always `Value::Bool(_)` or `Value::Null`. */
    rustBoolValue(expr: any, depth?: number): boolean;
    rustBoolCall(call: any, depth: number): boolean;
    rustEveryReturn(call: any, depth: number, ok: (e: any) => boolean): boolean;
    /** Element `index` of `this.m (…)`'s tuple is a bool value on every return path. */
    rustBoolTupleElement(expr: any, index: number, depth: number): boolean;
    rustBoolLocal(ident: any, depth: number): boolean;
    rustNativeBoolLocal(inner: any): boolean;
    rustNativeTruthiness(node: any): string | undefined;
    rustNativeBoolEquality(left: any, right: any, op: any): string | undefined;
    rustProvenStrSource(node: any): boolean;
    rustProvenStrIdentifier(node: any): boolean;
    /** A destructuring / for-in-of target: a write the direct-assignment check cannot see. */
    rustWriteTarget(node: any): boolean;
    /** `x` / `(x as string)` → the identifier under parens / `as`. */
    rustPeelCast(node: any): any;
    rustStrOperand(node: any, allowChecker: boolean): string | undefined;
    printRustProvenStrEquality(left: any, right: any, op: any): string | undefined;
    /** Receiver text when the call's receiver is a proven-`Str` local (checker strings are handled separately). */
    rustReceiver(node: any, receiverText: string): string | undefined;
    /** The checker-string receiver, when it prints as a bare name (it is read twice). */
    rustCheckerStrReceiver(node: any, receiverText: string): string | undefined;
    printRustReplace(node: any, receiverText: string): string | undefined;
    printRustSplit(node: any, receiverText: string): string | undefined;
    printRustToString(node: any, receiverText: string): string | undefined;
    printRustCase(node: any, receiverText: string, method: string): string | undefined;
    /** A bodiless overload signature whose class also holds the bodied implementation. */
    baseOverload(declaration: any): boolean;
    listArithIndex(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined;
    valueNumberOperand(node: any): boolean;
    vecJoinUse(access: any): boolean;
    printVecJoin(node: any): string | undefined;
    vecPropertyUse(n: any): boolean;
    private rustInProgress;
    private rustAssumed;
    rustNumericKind(node: any, depth?: number): string | undefined;
    rustCombine(kinds: (string | undefined)[]): string | undefined;
    rustStructuralKind(inner: any, depth: number): string | undefined;
    rustCallKind(call: any, depth: number): string | undefined;
    rustIdentifierKind(ident: any, depth: number): string | undefined;
    rustWrittenKind(declaration: any, depth: number): string | undefined;
    rustHasWrites(declaration: any): boolean;
    rustOrderedProven(op: any, left: any, right: any): boolean;
    rustNativeArithmetic(op: any, left: any, right: any, leftText: string, rightText: string): string | undefined;
    alwaysStr(node: any): boolean;
    concatOperandSafe(node: any, type: any): boolean;
    concatIsAnchored(left: any, right: any, leftType: any, rightType: any): boolean;
    /** Checker-string or proven-`Str` receiver printed as a plain name / parenthesised. */
    strReceiverText(node: any, receiverText: string): string | undefined;
    printTrim(node: any, receiverText: string): string | undefined;
    printAffixTest(node: any, receiverText: string, method: string): string | undefined;
    printReplace(node: any, receiverText: string): string | undefined;
    /** `"lit" in x` where x is a proven plain local / plain-kept Dict parameter. */
    literalInOp(key: any, obj: any): string | undefined;
    /** `Object.keys/values(x)` in `ts/src/prediction/<id>.ts` on a proven plain local. */
    predictionEnum(node: any, parsedArg: string | undefined, kind: 'keys' | 'values'): string | undefined;
    /** Base-tier array readers whose result is the stored `Value::Arr` or the default argument. */
    private static readonly RUST_LIST_READERS;
    arrSource(node: any, allowNull: boolean): boolean;
    arrLocal(ident: any, allowNull: boolean): boolean;
    arrReadLocal(ident: any): boolean;
    private ownedArrayInitializer;
    /** `x.length` on an Arr-only local: `get_array_length`'s marker arms need a Dict. */
    arrLength(node: any, receiver: string): string | undefined;
    /** `x.push(v)` statement on an Arr-only local: `append_to_array`'s cache-push arm needs a Dict. */
    arrPush(node: any, name: string | undefined, parsedArg: string | undefined): string | undefined;
    rustLitKeyBearerReadLocal(ident: any): boolean;
    bearerReadLocal(ident: any): boolean;
    boolCallEquality(left: any, right: any, op: any): string | undefined;
    /** `fn(...)` whose first `(` closes at the very end (string literals skipped). */
    boolCallBalanced(text: string): boolean;
    nativeNumericAdd(op: any, left: any, right: any, leftText: string, rightText: string): string | undefined;
    /** Base-tier (`ts/src/base/**`) `Object.keys/values(x)` on a proven plain local. */
    baseEnum(node: any, parsedArg: string | undefined, kind: 'keys' | 'values'): string | undefined;
    private static readonly RUST_PURE_STRING_METHODS;
    pureStringMethodReceiver(node: any): boolean;
    /** Locals whose Arr-only proof is in progress (a self-referencing write proves nothing new). */
    private arrVisiting;
    extraArrSource(n: any): boolean;
    rust87rgAggregateCall(n: Node): boolean;
    arrAlias(ident: any): boolean;
    assumedNumericSelf(inner: any): string | undefined;
    private strVisiting;
    /** Always `Value::Str`: string-helper shapes, a `+` chain with such an operand, or an always-Str local. */
    alwaysStrOperand(node: any): boolean;
    alwaysStrLocal(ident: any, allowNull?: boolean): boolean;
    concatAnchor(node: any): boolean;
    strOrNullConcatIsAnchored(left: any, right: any, leftType: any, rightType: any): boolean;
    /** `Option<&str>` text of an operand that is always `Value::Str` / `Value::Null`, else undefined. */
    strOrNullOperand(node: any): string | undefined;
    strOrderedComparison(node: any, op: any, left: any, right: any): string | undefined;
    rustSourceTier(node: Node): 'rest' | 'base' | 'pro' | undefined;
    plainSourceTier(node: Node): boolean;
    tierSourceOk(arg: any): boolean;
    private copyVisiting;
    freshCopy(node: any, depth: number): boolean;
    looseF64(binding: string): string;
    plainValueOperand(node: any): boolean;
    nativeCoercingArithmetic(op: any, left: any, right: any, leftText: string, rightText: string): string | undefined;
    nativeLooseOrderedComparison(node: any, op: any, left: any, right: any): string | undefined;
    private static readonly PARAMS_SLOT_ARG;
    paramsSlot(rhs: Node, selfName: string | undefined, depth: number): boolean;
    looseI64(expr: string): string;
    looseI64OrZero(expr: string): string;
    looseSliceArm(variant: string, len: string, take: string, empty: string): string;
    looseSlice(name: string, start: string, end: string, typed?: Array<string | undefined>): string;
    looseIndexOf(name: string, needle: string): string;
    looseStrCase(name: string, method: string): string;
    private rustVenueStrDecisions;
    private rustVenueStrCallers;
    rustVenueStrParamType(param: any): string | undefined;
    rustVenueStrParamTypeUncached(param: any): string | undefined;
    rust63xLiteralSeedStrParam(method: any, param: any, rustType: string): boolean;
    rust92raStrConsumerParam(method: MethodDeclaration, param: ParameterDeclaration, rustType: string): boolean;
    rust93raWsDictBuilder(method: MethodDeclaration, param: ParameterDeclaration): boolean;
    rust93raWsLocalStrSlot(method: MethodDeclaration, param: ParameterDeclaration): boolean;
    /** Every same-file caller passes a string literal or a checker-`string` identifier / element read at the slot. */
    rust93raStrArgsTyped(method: MethodDeclaration, param: ParameterDeclaration): boolean;
    rust63xNoArmStrMethod(method: any): boolean;
    rust64xOintParamArg(n: any): boolean;
    private static readonly RUST_BASE_SCALAR_PARAM_METHODS;
    private static readonly RUST_BASE_ASYNC_SCALAR_PARAM_METHODS;
    private static readonly RUST_OVERRIDE_GROUP_STR_PARAMS;
    private static readonly RUST_OVERRIDE_GROUP_INT_PARAMS;
    private static readonly RUST_OVERRIDE_GROUP_OSTR_PARAMS;
    private static readonly RUST_OVERRIDE_GROUP_MAP_PARAMS;
    private static readonly RUST_INHERENT_GROUP_OSTR_PARAMS;
    private static readonly RUST_INHERENT_GROUP_STR_PARAMS;
    private static readonly RUST_INHERENT_GROUP_NUM_PARAMS;
    private rustOverrideGroupAgreeByRoot;
    private static readonly RUST_INHERENT_GROUP_LIST_PARAMS;
    rustListGroupParam(param: any): boolean;
    /** A use of a list group slot outside its slice view: the shared list boxed by reference (no copy). */
    rustListGroupParamBoxedUse(node: any): boolean;
    rustOverrideGroupParam(method: any, param: any, file: string): boolean;
    rustGroupMapParamType(param: any): string | undefined;
    /** Argument text for a group map slot: `{}` / `undefined` natively, a held dict local lent, any other value viewed once. */
    rustGroupMapArgText(arg: any, type: string, identation: number): string;
    /** The group map type of the callee parameter at `at`. */
    rustGroupMapSlot(params: any[] | undefined, at: number): string | undefined;
    rustBaseOnlyMethod(method: any, file: string): boolean;
    rustVenueScalarTypeOf(type: any, typeNode: any): string | undefined;
    rustVenueScalarArgExact(arg: any, rustType: string): boolean;
    rust64xLentStrParamArg(arg: any, method: any, at: number): boolean;
    /** ral-64x: every read of `param` is a ws url / hash slot (ral-yc) or a call argument `other` accepts. */
    rust64xStrParamReadsLent(param: any, other: (call: any, at: number) => boolean): boolean;
    private rustVenueStrCallSitesMemo;
    private rustWsSiblingCallsMemo;
    /** `this.<m>(..)` / `super.<m>(..)` calls in the method's own file that resolve to it. */
    rustVenueStrCallSites(method: any): any[];
    /** ral-ve: an identifier bound once (`const`) to a `this.urls[..]` literal-key read: a url string or Null. */
    rustWsUrlReadIdent(arg: any): boolean;
    rustVenueUrlParam(method: any, param: any): boolean;
    private rustVenueStrUnbound;
    rustVenueStrParamUnbound(param: any): boolean;
    rustVenueStrParamUnboundUncached(param: any): boolean;
    rustStrParamAffixOnly(param: any): boolean;
    /** `p.endsWith (n)` / `p.replace (n, lit)` on the identifier `p`: the call, else undefined. */
    rustStrParamAffixCall(n: any): any;
    rustStrParamAffixText(node: any): string | undefined;
    /** A `&str` parameter never written whose every read is the receiver of `x.slice (n)` with one integer literal bound. */
    rustStrParamTailSliceOnly(param: any): boolean;
    /** `x.slice (n)` on an unbound `&str` parameter: the runtime's char slice read from the borrow, boxed once. */
    rustStrParamTailSliceValue(node: any): string | undefined;
    /** `&str` of the last `n` chars of the string `s` (the whole string when shorter): a char-boundary sub-slice, no copy. */
    rustStrTailSliceNative(s: string, n: number): string;
    /** A per-venue `f64` parameter read only as a whole argument of typed unified `f64` slots: no `Value` binding. */
    rustVenueF64ParamUnbound(param: any): boolean;
    rustGroupIntParamUnbound(param: any): boolean;
    printGroupIntParamCompare(leftNode: any, rightNode: any, op: any): string | undefined;
    rustGroupIntParamUnboundRead(node: any): boolean;
    rustSpawnKeyParam(method: any, param: any): boolean;
    /** `n` is the key of a futures read on the ws client handle (in-test, keyed read or base `safeValue`). */
    rustSpawnKeySlot(n: any): boolean;
    rustVenueStrParamUnboundRead(node: any): boolean;
    /** Scalar-local kind of a per-venue string parameter read through its `Value` binding. */
    rustVenueStrParamKind(param: any): string | undefined;
    /** The per-venue string type of the callee parameter at `at`. */
    rustVenueStrSlot(params: any[] | undefined, at: number): string | undefined;
    /** A typed scalar local handed whole to a per-venue string slot. */
    rustVenueStrLocalArg(n: any): boolean;
    /** A string local initialised from a string method or alias over a per-venue string parameter. */
    rustVenueStrParamLocal(node: any): boolean;
    /** `Option<String>` text of a typed string local returned from a native-`Str` method. */
    rustVenueStrReturnLocal(node: any): string | undefined;
    /** Another read of the same local inside the call the argument belongs to, not itself a borrowing slot. */
    rustVenueStrMovedInCall(arg: any): boolean;
    rustScalarBoxCopies(u: any): boolean;
    /** A literal, an identifier, a field read, or a call: the converted argument stays short. */
    rustVenueStrSimpleArg(arg: any): boolean;
    /** `x.slice (n)` with one integer literal bound on an identifier the checker types `string`: its receiver. */
    rustStrTailSliceRecv(arg: any): any;
    /** `&str` argument text of `x.slice (n)` on a `&str` parameter or a `String` local: the chars past the clamped start. */
    rustStrTailSliceText(arg: any): string | undefined;
    /** Order request builders whose amount / price slots stay as they are (held). */
    private static readonly RUST_HELD_ORDER_REQUEST;
    rustVenueStrCastOperand(arg: Node | undefined): Expression | undefined;
    /** The argument node lands in a per-venue string slot of its call. */
    rustVenueStrArgSlot(arg: any): boolean;
    /** Argument text for a per-venue string slot: a typed local or literal natively, any other value read once. */
    rustVenueStrArgText(arg: any, type: string, identation: number): string;
    rustVenueScalarArgText(arg: any, type: string, identation: number): string;
    rustVenueFloatUsesStayInside(method: any, param: any): boolean;
    rustVenueFloatArgsAllFloat(method: any, param: any): boolean;
    rustVenueArithmeticArg(arg: any): boolean;
    /** `!x` over a simple operand: a `bool` slot reads it once as a native negation. */
    rustVenueNegatedArg(arg: any): boolean;
    rustVenueParseToInt(node: any): boolean;
    rustVenueOptionalSlotOpen(method: any, param: any): boolean;
    /** An optional per-venue parameter that prints as a typed positional `Option`. */
    rustVenuePositional(param: any): boolean;
    private static readonly RUST_CURRENCY_SLOT_METHODS;
    private rustCurrencySlotDecisions;
    rustCurrencySlotParam(param: any): boolean;
    /** `currency: Currency = undefined`, the second parameter of a listed base method (or of an override of one), never written. */
    rustCurrencySlotParamUncached(param: any): boolean;
    private static readonly RUST_CURRENCY_PARSE_METHODS;
    rustParseCurrencyParam(method: any, param: any): boolean;
    /** The callee parameter at `at` is a lent currency slot. */
    rustCurrencySlot(params: any[] | undefined, at: number): boolean;
    /** A use (never the declaration) of a lent currency parameter. */
    rustCurrencySlotParamOf(node: any): any;
    /** A lent currency parameter in a `Value` place: its record, boxed once. */
    printCurrencySlotParamValue(node: any): string | undefined;
    /** `currency === undefined` on a lent currency parameter. */
    printCurrencySlotNullTest(left: any, right: any, op: any): string | undefined;
    /** Argument text for a lent currency slot: `None`, a slot parameter as is, any other value decoded once. */
    rustCurrencySlotArgText(arg: any, identation: number): string;
    private static readonly RUST_CURRENCY_RETURN_METHODS;
    /** Base `currency (code)` / `safeCurrency (..)` declared `: CurrencyInterface` with a body. */
    rustReturnsCurrency(node: any): boolean;
    /** `this.currency (..)` / `this.safeCurrency (..)` resolving to a typed producer. */
    rustIsTypedCurrencyCall(init: any): boolean;
    private rustCurrencyBoxing;
    /** The typed call as printed, never boxed. */
    printCurrencyCallRaw(node: any, identation: number): string;
    /** A typed currency call that lands where the struct goes as is. */
    rustCurrencyCallNative(node: any): boolean;
    /** A typed currency call in a `Value` place: its record boxed once. */
    printCurrencyCallBox(node: any, identation: number): string | undefined;
    private rustCurrencyLocalDecisions;
    rustCurrencyLocalKind(declaration: any): false | 'cstruct' | 'copt';
    /** `c = <typed currency call>` / `c = undefined` as its own statement. */
    rustCurrencyWriteOf(n: any): 'call' | 'null' | undefined;
    /** A whole-value hand-off: a call argument, an array element, a dict value or a returned value. */
    rustCurrencyValueUse(n: any): boolean;
    rustCurrencyLocalKindUncached(declaration: any): false | 'cstruct' | 'copt';
    /** The literal key of a read-only `c['k']` / `c.k` (never written, deleted or stepped): it reads the record's map. */
    rustCurrencyKeyReadKey(n: any): string | undefined;
    /** `crate::value::KeyRead::key_read(&&c, "k")` for a read off a typed currency local. */
    printCurrencyKeyRead(node: any): string | undefined;
    /** The null test sits in a `bool` place (a condition, a `!` / `&&` / `||` operand of one, or a ternary test). */
    rustCurrencyNullTestIsCondition(n: any): boolean;
    /** The typed currency local behind a use (never the declaration name). */
    rustCurrencyLocalOf(node: any): any;
    printCurrencyLocalDeclaration(declaration: any, indent: string, varName: string): string | undefined;
    printCurrencyLocalWrite(left: any, right: any): string | undefined;
    /** `c === undefined`: `is_none` on an `Option<Currency>`, constant on a `Currency` (a producer always answers a record). */
    printCurrencyLocalNullTest(left: any, right: any, op: any): string | undefined;
    /** A typed currency local in a `Value` place: the stored record (one shared handle, as the boxed local's copy). */
    printCurrencyLocalValue(node: any): string | undefined;
    /** `this.currencies` / `this.currencies_by_id`, directly or through a const alias. */
    rustCurrencyStoreOf(node: any): string | undefined;
    /** The `crate::types::Currency` a currency-returning method hands back for `return <exp>`. */
    printCurrencyReturnValue(exp: any): string;
    /** `None` for each positional optional slot a call leaves out. */
    rustVenuePads(params: any[] | undefined, given: number, fixed: number): string[];
    private static readonly RUST_MARKET_SLOT_METHODS;
    private rustMarketSlotDecisions;
    /** A method declared `safeMarket (..): MarketInterface` with a body in `ts/src` (base or venue). */
    rustReturnsMarket(node: any): boolean;
    private rustVenueMarketDecisions;
    rustVenueReturnsMarket(node: any, file: string): boolean;
    rust92rgLoadedMarketReturn(method: MethodDeclaration, ret: Statement): boolean;
    /** The `market` parameter of a base market-slot reader, read only by key readers, null tests or `Value` hand-offs. */
    rustMarketSlotParam(param: any): boolean;
    private rustMarketDepth;
    private rustMarketGuardHits;
    private rustMarketPending;
    rustMarketSettle(map: any, key: any, decision: any, hitsBefore: number): void;
    rustMarketSlotParamUncached(param: any): boolean;
    /** `n` is the container of a base key reader, which borrows the record (`KeyRead` for `&Market`). */
    rustMarketReaderArg(n: any): boolean;
    /** `n` is an argument in a lent market slot of its call. */
    rustMarketSlotUse(n: any): boolean;
    /** The callee parameter at `at` is a lent market slot. */
    rustMarketSlot(params: any[] | undefined, at: number): boolean;
    /** A use (never the declaration) of a lent market parameter. */
    rustMarketSlotParamOf(node: any): any;
    /** A lent market parameter handed to a `Value` place: its record, boxed once. */
    printMarketSlotParamValue(node: any): string | undefined;
    rustParseMarketParam(method: any, param: any): boolean;
    /** A `Market` type reference (or `MarketInterface` when `iface` is set). */
    rustIsMarketTypeNode(type: any, iface: boolean): boolean;
    private static readonly RUST_LIST_MARKET_METHODS;
    rustListMarketParam(method: any, param: any): boolean;
    rustVenueMarketParam(method: any, param: any): boolean;
    /** ral-92rg R3: `n` is the whole value of a property of an object literal (`{ 'info': market }`): one box of the record. */
    rust92rgLiteralValueSlot(n: Node): boolean;
    rustWsSiblingCallSites(method: any): any[] | undefined;
    /** `ts/src/<id>.ts`'s method `m` is called as `this.m (` / `super.m (` in `ts/src/pro/<id>.ts`. */
    rustCalledFromWsSibling(method: any): boolean;
    /** A market slot argument that lends without a decode (`rustMarketSlotArgText` takes no `FromRaw` path). */
    rustMarketArgLends(arg: any): boolean;
    rustSafeMarketIdParam(param: any): boolean | undefined;
    /** `n` is the first argument of a call landing in a borrowed `marketId` slot (rustSafeMarketIdParam). */
    rustSafeMarketIdArg(n: any): boolean;
    /** `safeMarket`'s first parameter `marketId: Str = undefined`: a positional `Value` (padded with `Value::Null`). */
    rustPositionalValueParam(param: any): boolean;
    private rustVenueStrListDecisions;
    rustVenueStrListParam(param: any): boolean;
    private rustVenueDictDecisions;
    private rustVenueDictPending;
    private rustVenueDictGuardHits;
    rustVenueDictParam(param: any): boolean;
    /** `bidAsks: any[]` beside a leading book-side handle (`handleBidAsks (bookSide, bidAsks)`). */
    rustBookSideListShape(param: any): boolean;
    rustVenueStrListParamUncached(param: any): boolean;
    /** `arg` lands in a lent string-list slot of the `this.` callee `call`. */
    rustVenueStrListSlotOf(call: any, arg: any): boolean;
    rustStrListSliceUse(id: any): boolean;
    rustStrListNumberKeyText(key: any): string | undefined;
    /** A slice-slot use whose parameter itself prints as a lent `&[crate::Value]` slice. */
    rustStrListSliceLent(id: any): boolean;
    /** `this.safeString (xs, i)` on a lent string-list parameter with a loop-counter key: `&[Value]` is a `KeyRead`. */
    rustStrListSafeStringUse(id: any): boolean;
    rustStrListNumberKeyUse(id: any): boolean;
    printStrListNumberKeyRead(name: string, key: any): string | undefined;
    /** The argument of a lent string-list slot: a held list is lent, anything else is boxed and viewed once. */
    rustVenueStrListArgText(arg: any): string;
    rustVenueOptStrParam(method: MethodDeclaration, param: ParameterDeclaration, rustType: string): boolean;
    rustVenueStrParam(method: MethodDeclaration, param: ParameterDeclaration, rustType: string): boolean;
    rustVenueDictParamUncached(param: any): boolean;
    rustRoutedMessageDictParam(method: any, param: any): boolean;
    /** The identifier names the `message` parameter of a routed `handleMessage` override. */
    rustRoutedFrameUse(id: any): boolean;
    rustSyncVenueDictWholeSlot(method: any, param: any): boolean;
    rustSpawnOnlyTarget(method: any): boolean;
    rustFrameLentJsonOperand(node: any): boolean;
    /** Every use of the parameter is a whole argument of the runtime `this.extend (..)`: the merge copies it. */
    rustParamOnlyExtendOperand(method: any, param: any): boolean;
    rustWsHandlerMessageSlot(method: any, param: any): boolean;
    rustWsHandlerExtrasPassed(method: any): boolean;
    /** No identifier in the body names the parameter (shadowing locals included, so the answer is conservative). */
    rustParamNeverNamed(method: any, param: any): boolean;
    rustOwnStateRowLocal(decl: any, name: string, depth?: number): boolean;
    /** `this.safeDict (this.balance, k, ..)`: a row of the exchange's own state, not of the message. */
    rustReadOffThisMember(init: any): boolean;
    rustLocalHoldsFreshBook(decl: any, init: any): boolean;
    /** An expression the checker types as string, number, boolean, null or undefined only (never a shared map or list). */
    rustPrimitiveValue(e: any): boolean;
    rustCallReturnsFreshLiteral(init: any): boolean;
    rustCallReturnsObjectLiteral(init: any): boolean;
    rustCallReturnsFreshRecord(init: any): boolean;
    /** Another ts/src/pro file calls `.name (` and declares no method of that name (an inherited copy answers it). */
    rustWsHandlerCalledElsewhere(method: any, name: string): boolean;
    rustVenueDictTextCallCount(method: any, name: string, own: number): number;
    /** A plain (never-null) dict local, or the caller's own borrowed `Dict` slot. */
    rustVenueDictArgLends(arg: any): boolean;
    /** `const row = rows[i]` (no annotation, never reassigned) of a `Dict[]` local converted once by `dict_rows`. */
    rustP21RowLocalLends(declaration: any): boolean;
    /** The argument lands in an async method slot whose every use is a `this.extend` operand. */
    rustExtendOnlySlotOf(arg: any): boolean;
    /** A `const x: Dict = { .. }` local the printer holds as `indexmap::IndexMap<String, Value>`, never reassigned. */
    rustVenueDictLiteralLocalArg(declaration: any): boolean;
    /** A never-reassigned reader-produced local the declared-Dict locals table proves a map: it prints the shared handle. */
    rustTableDictLocalArg(arg: any): boolean;
    /** The value of an object-literal entry (`'info': x`): the borrowed map is copied into a fresh `Value::Map` there. */
    rustVenueDictValueUse(id: any): boolean;
    /** An object-literal entry value (`'info': x`) at the last use: the dict handle is shared into the box (`Value::from(x)`). */
    rustVenueDictLastEntryUse(id: any): boolean;
    rustVenueDictLentValueUse(id: any): boolean;
    rustClientResolveValueArg(id: any): boolean;
    /** `Value::Dict(Arc::clone(x))` for a rustVenueDictParam handed whole to a lent `impl Into<crate::Value>` slot. */
    printVenueDictLentValue(node: any, text: string): string | undefined;
    /** The container of a base by-reference reader (`this.safeString2 (x, ..)`): it reads the borrowed map as is. */
    rustVenueDictReaderUse(id: any): boolean;
    rustVenueDictWholeArgUse(id: any): boolean;
    /** `Value::from(x)` for a borrowed dict handle handed whole to a boxed slot. */
    printVenueDictWholeArg(node: any, text: string): string | undefined;
    rustVenueDictLentSlotUse(id: any): boolean;
    /** A rustVenueDictParam handed to a base by-reference reader: lent as `&x` (no copy). */
    printVenueDictReaderArg(node: any, text: string): string | undefined;
    /** A borrowed rustVenueDictParam handed to the runtime `this.extend`: the head and the operands take the map by reference. */
    printVenueDictExtendArg(node: any, text: string): string | undefined;
    /** `Value::Map(x.clone())` for a rustVenueDictParam read as an object-literal entry value. */
    printVenueDictValue(node: any, text: string): string | undefined;
    /** A ws handler's message handed whole to an untyped `Value` slot of `this.m (..)`, or returned: the dict handle boxes as is. */
    rustVenueDictWholeUse(id: any): boolean;
    /** `Value::from(x)` (the shared dict handle) for a rustVenueDictParam handed whole to a `Value` slot or returned. */
    printVenueDictWhole(node: any, text: string): string | undefined;
    /** A dict-handle parameter as an object-literal entry value at its last use: the box shares the handle. */
    printVenueDictHandleEntry(node: any, text: string): string | undefined;
    rustArgSlotTakesDictHandle(arg: any): boolean;
    private rustVenueDictValuePending;
    /** Lent on to a sibling's borrowed slot that takes the dict handle: the handle is passed on as is. */
    rustVenueDictLentHandleUse(id: any): boolean;
    /** A rustVenueDictParam stored whole as an object-literal value: it takes the dict handle, so the store shares it. */
    rustVenueDictValueParam(param: any): boolean;
    rustBoxedDictParamLends(param: any): boolean;
    rustVenueDictRowReadArg(arg: any): [any, any] | undefined;
    /** The row read above, lent to a rustVenueDictParam slot: a map view, or the dict handle for a handle slot. */
    printVenueDictRowReadArg(node: any): string | undefined;
    /** A local initialised by an awaited endpoint whose abstract declaration answers `Promise<Dict>`. */
    rustEndpointDictLocal(arg: any): boolean;
    /** The argument lands in a rustVenueDictParam slot of its `this.` call. */
    rustVenueDictSlotOf(call: any, arg: any): boolean;
    /** `&x` (or the borrowed slot as is) for an argument landing in a rustVenueDictParam slot. */
    printVenueDictArg(node: any, text: string): string | undefined;
    rustVenueNumParam(call: any, arg: any, param: any): boolean;
    private static readonly RUST_VENUE_NUM_PRECISION;
    /** The text a call leaves in an omitted positional slot. */
    rustPositionalPad(param: any): string;
    /** `this.safeMarket (..)` / `super.safeMarket (..)` resolving to a method that returns the typed market. */
    rustIsSafeMarketCall(init: any): boolean;
    /** `const m = this.safeMarket (..)` whose every use reads a key, lends the record, or rewrites it from `safeMarket`. */
    /** ral-46i: `const a: Market = s` where `s` is a const declared from `this.safeMarket (..)`: the declaration of `s`. */
    rustSmktAliasSource(declaration: any): any;
    /** ral-46i: a whole-value hand-off of a `safeMarket` alias that is neither a lent market slot nor a reader's record. */
    rustSmktAliasValueUse(n: any): boolean;
    rustSafeMarketLocalOk(declaration: any, alias?: boolean): boolean;
    rust76jSmktUse(declaration: any, n: any, scope: any, alias: boolean): boolean | 'value';
    rust76jSmktValueArg(n: any): boolean;
    /** A use of a `safeMarket` struct local. */
    rustSafeMarketLocalOf(node: any): any;
    /** Argument text for a lent market slot: a typed market lends itself, any other value decodes once. */
    rustMarketSlotArgText(arg: any, identation: number): string;
    /** `crate::types` in the library crates, `ccxt::types` in the test crate. */
    rustTypesPath(node: any): string;
    private rustSafeMarketBoxing;
    /** A `safeMarket` call that lands where the struct goes as is (a struct local, a market return, a lent slot). */
    rustSafeMarketCallNative(node: any): boolean;
    /** A `safeMarket` call whose result goes to a `Value` place: the typed result boxed once. */
    printSafeMarketCallBox(node: any, identation: number): string | undefined;
    rustMarketStoreLocal(declaration: any): boolean;
    /** `const m = markets[i]` over a store local: read by key readers and returned. */
    rustMarketStoreElement(declaration: any): boolean;
    rustMarketStoreOf(node: any): any;
    private rust65eByIdLists;
    rust65eByIdListLocal(declaration: any): boolean;
    rust65eByIdListLocalUncached(declaration: any): boolean;
    rust65eForCounterOf(k: any, list: any): boolean;
    /** ral-65e: `return e` / `return l[0]` of a by-id row (rust65eByIdListLocal) in a method whose body returns a `Value`. */
    print65eByIdReturnValue(exp: any): string | undefined;
    rustMarketStoreElementOf(node: any): any;
    printMarketStoreDeclaration(declaration: any, indent: string, varName: string): string | undefined;
    rustMarketStoreElementDecl(declaration: any): boolean;
    rustStoreIndexText(keyNode: any): string;
    /** The `crate::types::Market` a market-returning method hands back for `return <exp>`. */
    printMarketReturnValue(exp: any): string;
    rustVenueBoolArgText(arg: any, identation: number): string;
    printVariableStatement(node: any, identation: any): string;
    rustH26r01LentStrListArg(n: Node): boolean;
    private static readonly RUST_H26R14_RECORD_FNS;
    rustH26r14RecordWrite(rhs: any): boolean;
    rustH26r05BalanceRowStore(n: any): boolean;
    rustFreshDictDynamicKeyReceiver(ident: any, keyNode: any): {
        text: string;
        isField: boolean;
        plain: boolean;
        nameNode: any;
        ownedKey: boolean;
    } | undefined;
    rustFreshGroupedDictProducer(node: any): boolean;
    h26r11FieldAliasEnum(node: any, parsedArg: string | undefined, kind: 'keys' | 'values'): string | undefined;
    /** `const v = m[k]` whose next statement only rebinds `v` (no keyed write or push through it): no write-back is due. */
    rustH26r12RebindOnlyBind(read: Node): boolean;
    rustH26r12MutatesThrough(node: Node, name: string): boolean;
    /** `this.f` (declared plain-dict, untagged), `{}`, or a ternary whose arms are each one of those. */
    h26r11UntaggedMapSource(node: any): boolean;
    /** The settled value of a ws `client.resolve (x, hash)` or the item of a cache `.append (x)`: both take `impl Into<Value>`. */
    rustH26r14RecordBoxUse(n: any): boolean;
    h27r02IntToStringSeed(declaration: any, kind: string | undefined, checked: string | undefined): boolean;
    h27r05ArrayRowInsert(left: any, keyText: string, valueText: string): string | undefined;
    h27r06FreshParseEnum(node: any, parsedArg: string | undefined, kind: 'keys' | 'values'): string | undefined;
    /** `this.parseX (..)` or `super.setMarkets (..)` whose declared return is a proven map type. */
    h27r06FreshParseCall(node: any): boolean;
    private static readonly H27R07_BASE_HANDLE_METHODS;
    h27r07BaseHandlePlan(method: any, file: string): any;
    h27r07KeepBoxedKey(node: any, plan: any): boolean;
    private rustWsHandleParamCache;
    private rustWsHandleParamWriters;
    private rustWsHandleParamMut;
    rustWsHandleParam(param: any): boolean;
    rustWsHandleParamLinks(param: any): any[] | undefined;
    /** The caller's own `client` param when `call` passes it bare at `at`. */
    rustWsHandleArgParam(call: any, at: number): any;
    /** The callee's `client` param when bare `client` is argument `n` of a `this.h (..)` call to a method with a body. */
    rustWsHandleSlotOf(n: any): any;
    rustWsHandleParamUncached(param: any, links: any[]): boolean;
    rustWsHandleSubscriptionStatement(p: any): boolean;
    /** `client` as a later argument of `this.spawn (this.m, ..)` whose target is a method reference. */
    rustWsSpawnHandoff(call: any, n: any): boolean;
    rustWsRoutedHandler(method: any): boolean;
    private static readonly RUST_H27R08_WS_FNS;
    private static readonly RUST_H27R08_RECORD_RETURN;
    rustH27r08WsRecordWrite(rhs: any): boolean;
    /** `c.append (x)` on a local whose checker type is a ws cache (`ArrayCache*`): the hand-written `append` takes `impl Into<Value>`. */
    rustH27r08CacheAppendUse(n: any): boolean;
    /** The box at such an append: moved at the last use, else the Arc bump; `None` is `Value::Null`. */
    rustH27r08CacheAppendBox(node: any, text: string): string | undefined;
    h27r10SubscriptionRowKey(n: any): boolean;
    h28r04GrowOnlyRowSlotWrite(left: any, keyText: string, valueText: string): string | undefined;
    /** `c` is `xs.length - 1` (directly, or through `const` locals): on a grow-only list it is in range or -1. */
    h28r04LastRowIndex(node: any, list: any): boolean;
    /** A non-negative integer literal, or a local bound once (`const`) to one. */
    h28r04ConstIndex(node: any): number | undefined;
    private h28r05Decisions;
    h28r05BaseDictParamEnum(node: any, parsedArg: string | undefined, kind: 'keys' | 'values'): string | undefined;
    h28r05ParamProven(param: any): boolean;
    private static readonly H28R05_MAP_RETURNS;
    h28r05CallersProven(method: any, name: string, at: number): boolean;
    /** `a` names a const of the enclosing function bound to `[await] this.p (..)` with a map return, or (one hop) to such a const. */
    h28r05FreshMapIdent(a: any, site: any, hops: number, returns: (p: string) => string | undefined): boolean;
    h28R07ResolveBox(n: any, kind: string): string | undefined;
    /** `client.subscriptions[k] = x` of a string nil local: the handle's `add_subscription` takes a `Value`. */
    h28R07SubscriptionBox(n: any, kind: string): string | undefined;
    h29r04BoundedArrRowWrite(left: any, keyText: string, right: any, rhs: string): string | undefined;
    /** Always a `Value::Arr`: base `this.safeList (o, k, [])`, or `g[k]` of a `const g = this.groupBy (..)` (every bucket a list). */
    h29r04ArrSource(init: any): boolean;
    private h29r05Decisions;
    h29r05OptionsDictEnum(node: any, parsedArg: string | undefined, kind: 'keys' | 'values'): string | undefined;
    /** `p` is an optional, never reassigned `Dict` / `NullableDict` parameter of a method whose ts/src callers are proven. */
    h29r05OptionsParam(id: any): boolean;
    /** Every `.name (..)` in ts/src is `this.name (..)` (no quoted use) and omits argument `at` or passes an options dict. */
    h29r05CallersProven(root: string, name: string, at: number): boolean;
    /** `this.options[k]`, `this.safeDict (O, k[, {}])` with `O` such a value, or a const of the caller's function bound to one. */
    h29r05OptionsValue(node: any, site: any, hops: number): boolean;
    private static readonly H29R06_FIELDS;
    private static readonly H29R06_CALLEES;
    private static readonly H29R06_MARKER_KEYS;
    private h29r06Memo;
    h29r06ConfigDictRead(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined;
    h29r06Binding(decl: any, seen: Set<any>): boolean;
    h29r06BindingUncached(decl: any, seen: Set<any>): boolean;
    /** An expression whose map value derives only from the config fields (or is nullish). */
    h29r06Origin(node: any, scope: any, seen: Set<any>): boolean;
    /** The method's own result: every `return` gives an origin value (a recursive call holds by induction). */
    h29r06OwnResult(method: any, seen: Set<any>): boolean;
    h29r06ParamProven(method: any, param: any, seen: Set<any>): boolean;
    h29R07NilStrConcatSplits(nilStr: boolean, lines: string[], column: number, width: (l: string) => number): boolean | undefined;
    h29r08ClockLiteralValue(n: any, declaration: any): boolean;
    h28t01ReturnedCallArgLastUse(node: any, declaration: any): boolean;
    h28t01ReturnedSliceMoves(node: any, cloned: string[]): void;
    h30r06CacheRowFeeWrite(baseExpr: any, keys: any[], right: any, rhs: string, identation: number): string | undefined;
    h30r06BoundedRowIndex(row: any, key: string, indexNode: any): string | undefined;
    h30r07ConfigDictEnum(node: any, parsedArg: string | undefined, kind: 'keys' | 'values'): string | undefined;
    h30r08ListRowRead(acc: string, receiver: Node, key: Node, chain: Node): string | undefined;
    rustP21DictRowsLocal(declaration: any): boolean;
    rustP21DictRowsLocalUncached(declaration: any): boolean;
    rustP21TypedListLocal(declaration: any): boolean;
    rustP21ReadsAwaitedLocal(init: any): boolean;
    rustP21SafeListEmpty(init: any): boolean;
    rustP21RowRead(call: any, recv: any): any;
    printRustP21DictRowsDecl(declaration: any, indent: string, varName: string): string | undefined;
    rustP21RowReadText(rowDeclaration: any): string | undefined;
    printRustP21Length(node: any): string | undefined;
    printRustP21RowCall(call: any): string | undefined;
    rustP21ElementRowRead(access: any, recv: any): any;
    rustP21ElementRowReadText(access: any): string | undefined;
    rustP22KeyedDictRead(initializer: any, optional: boolean): string | undefined;
    rustP22IndexByLocal(recv: any): boolean;
    rustP22ConfigPath(recv: any): {
        field: string;
        path: string[];
    } | undefined;
    rustP22NestedRead(call: any, cfg: {
        field: string;
        path: string[];
    }, optional: boolean): string | undefined;
    rustP22StrKeyText(key: any): string | undefined;
    rustP22TypedMapLocal(recv: any): boolean;
    rustP28OrderRowsParam(param: any): boolean;
    rustP28OrderRowsParamCore(param: any): boolean;
    rustP28OrderRowsBind(node: any, name: string, indent: string): string | undefined;
    rustR14RowsParam(param: any): boolean;
    rustR14RowsParamUncached(param: any): boolean;
    rustR14VenueCalled(srcRoot: string, name: string): boolean;
    rustR24RowsBody(param: any): boolean;
    rustR24RowsParam(param: any): boolean;
    rustR24RowsParamUncached(param: any): boolean;
    rustR24OrderRowsWithHandOn(param: any): boolean;
    rustH49MemberDictKeys(node: any): string | undefined;
    rustTypedListRowDictText(initializer: any): string | undefined;
    rustPrintedListKind: WeakMap<any, "list" | "opt">;
    rustP28OrderRowsParamUncached(param: any): boolean;
}
export {};

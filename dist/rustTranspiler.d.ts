import { BaseTranspiler } from "./baseTranspiler.js";
import { type BinaryExpression, type BindingElement, type Block, type CallExpression, type Declaration, type DeleteExpression, type ElementAccessExpression, type Expression, type Identifier, type MethodDeclaration, type Node, type ParameterDeclaration, type VariableDeclaration } from "typescript/unstable/ast";
import { type Symbol as TsSymbol, type Type } from "typescript/unstable/sync";
/** A ts/src index scan reads real `*.ts` sources and this process's own stripped base copy only: no `.d.ts`, no
 *  dot-file temp copy, no other process's `*.nooverloads.<pid>.ts` (it can vanish or change mid-scan). */
export declare function isRustTsIndexSource(name: string): boolean;
/** The text of a listed ts/src file; undefined when it vanished between listing and reading, any other error throws. */
export declare function readRustTsIndexSource(file: string): string | undefined;
/** Answer of `RustTranspiler.rustDeclaredLocalTypeResolver` for a local whose
 *  value provably holds a `Value::Dict` at every use. */
export type RustDeclaredLocalKind = 'dict';
/** One `let x: Value = <dict-proven initialiser>` declaration. `kind` is only
 *  answered by the resolver when `alwaysDict && stable`. */
export interface RustDeclaredDictLocalEntry {
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
    /** use classification: element-access receiver / kind-preserving mutator / anything else. */
    uses: {
        elementAccess: number;
        mutHelper: number;
        other: number;
    };
    declaration: VariableDeclaration;
    start: number;
}
/** A `Dict`/`List` parameter whose body uses are all printable reads: the
 *  printer re-binds the same name to a borrowed container at fn entry
 *  (`let x = x.as_map().unwrap_or(&__x_empty);`) so every read is native. */
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
/** Vocabulary of the declared-Dict locals table (see
 *  `RustTranspiler.rustDeclaredLocalTypeResolver`). */
export declare const RUST_DECLARED_DICT_LOCALS: {
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
/** Preorder (forEachChild order) of a scope's descendants, decoded once: `end[i]` is the index past
 *  node i's subtree; `byName` lists identifiers and name-binding declarations per name text. */
interface RustScopeIndex {
    nodes: Node[];
    end: number[];
    byName: Map<string, number[]> | undefined;
}
export type RustDispatchParamKind = 'value' | 'slice' | 'map' | 'strvec' | 'flag' | 'str' | 'optstr' | 'f64' | 'optf64' | 'opti64' | 'i64' | 'optstrvec' | 'strvecvec' | 'params' | 'orderreqs' | 'dict' | 'list' | 'optdict' | 'optlist' | 'optmarket' | 'optcurrency' | 'side' | 'other';
export type RustDispatchReturnKind = 'value' | 'void' | 'typed' | 'ostr' | 'oint' | 'keptostr' | 'keptint' | 'keptstr' | 'keptbool' | 'keptstruct' | 'int' | 'string' | 'bool' | 'dict' | 'list' | 'optdict' | 'struct' | 'other';
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
    /** `scope.forEachChild(visit)` recursion over the cached preorder: `visit` answers
     *  RUST_WALK_SKIP to skip the node's subtree, RUST_WALK_STOP to end the walk. */
    rustWalkScope(scope: Node, visit: (n: any) => number | void): void;
    /** Scope nodes that are an identifier or a name-binding declaration spelled `name`, in walk order. */
    rustScopeNameNodes(scope: Node, name: string): Node[];
    private static readonly RUST_PREFETCH_TYPE_KINDS;
    /** One bulk getTypeAtLocation for the class's nodes of those kinds, seeding the checker memo. */
    rustPrefetchClassTypes(node: Node): void;
    binaryExpressionsWrappers: any;
    methodSignatures: Record<string, {
        requiredCount: number;
    }>;
    forLoopCounter: number;
    /** The handler `message` parameter a shadow is being printed for (set only
     *  while its method body is printed). */
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
    /** `x = f(.., x, ..)` as a statement, `x` named once on the right side and not captured: the old value is dead
     *  after the call (the write replaces it before any later read, in a loop too). */
    rustOwnedSelfWrite(node: any): boolean;
    private static readonly RUST_HOISTING_WORDS;
    rustUnderHoistedCall(node: any): boolean;
    /** A by-value argument of a call (the box is handed over whole). */
    rustOwnedHandOff(node: any): boolean;
    /** The use sits inside the receiver of a member access (`f(x).replace(..)`): native receiver forms print the
     *  receiver text twice (`.unwrap_or_else(|| recv.clone())`), so the argument is read twice. */
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
    /** `boolean | undefined`: `undefined`/`null` both print `Value::Null` (false
     *  for the helper and for the `matches!` alike), so they may join the union. */
    isBooleanOrUndefinedType(type: Type | undefined): boolean;
    /** Operands this rule handles: `safeBool`/`safeBool2`/`safeBoolN` calls (a
     *  `Value` in the port) and element accesses (printed as `get_value`). */
    isBooleanValueFamilyOperand(node: any): boolean;
    /** Declarations `printVariableDeclarationList` emitted as `let mut x: bool`. */
    private rustBoolDeclaredLocals;
    /** A bare identifier whose reads still hold a `Value` box: every declaration
     *  this printer emits as `Value` (param, destructured element, local) minus
     *  the ones the declaration site retypes to a native Rust type. */
    isBooleanValueIdentifier(node: any): boolean;
    /** The declaration site emits `let mut x: bool = …` (see
     *  `getRustBoolLocalInitializer`): its reads are native bools, not `Value`. */
    rustDeclarationPrintsNativeBool(declaration: any): boolean;
    /** The emitted `matches!` is a bare Rust `bool`: it is only valid where the
     *  whole enclosing boolean expression already sits in a bool slot. A logical
     *  expression stored in a `Value` slot gets its `Value::Bool(..)` box from the
     *  ccxt post-passes, which key on the leading helper token the operand would
     *  no longer provide. */
    isBareBoolEmissionSafe(node: any): boolean;
    /** Outermost ancestor reached through parens, `!` and `&&`/`||`. */
    rustClimbLogicalWrappers(node: any): any;
    rustConditionBoolSlot(node: any): boolean;
    private rustOptBoolChainPending;
    /** ral-ua: a local initialised by an optional-bool chain whose every read is a condition / bool-printed slot is `bool`. */
    rustOptBoolChainLocal(declaration: any): boolean;
    /** ral-ua: every read of an optional-bool chain local is a condition or sits in another bool-printed slot. */
    rustOptBoolChainUsesOk(declaration: any): boolean;
    /** ral-ua: `a && b` / `a || b` (parens, `!`) whose leaves are each checker `boolean | undefined`: as a condition every
     *  leaf prints its truthiness, and a local read only as a condition never boxes the undefined arm. */
    rustOptBoolChain(node: any): boolean;
    /** Native truthiness text of the operand, or undefined to keep `is_true`. */
    printNativeTruthiness(node: any): string | undefined;
    /** Same native truthiness for a bare `Value`-boxed identifier of boolean type. Prints the bool-tuple
     *  truthiness text (`x.as_bool() == Some(true)`) so the typed-locals pass keeps rewriting it byte-identically. */
    printNativeIdentifierTruthiness(node: any): string | undefined;
    /** ral-42f: a local whose box only ever holds a `Value::Bool` or `Null`: declared with `true` / `false` / `undefined`, written
     *  at least once as slot 0 of `[x, p] = this.handleOptionBoolAndParams(2)(..)` (`checkOptionBool`: Bool or undefined), every
     *  other write one of those literals or a `&&` / `||` (printed `Value::Bool(..)`).
     *  In a printer bool slot (`let x: bool = ..` / `Value::Bool(..)`) `x.as_bool() == Some(true)` answers what `is_true(&x)` did
     *  for both (the ccxt rustNativeBoolEquals pass printed the same text after the fact). */
    rustBoolLiteralOnlyLocal(node: any): boolean;
    /** ral-42f: `x = a && b;` (statement) whose `&&` / `||` has a bool-literal-only local operand: the printer boxes the logical
     *  itself (`x = Value::Bool(..)`, the box the ccxt bool-assignment regex added keyed on the leading `is_true`). */
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
    printArrayLength(node: any, identation: any, leftExpr?: any): string;
    private rustNativeLengths;
    printNativeLength(node: any, place: string): string;
    /** `orderbook['bids']` / `orderbook.asks` on an `OrderBook`-typed receiver, or a
     *  local initialised from one. The WS runtime keeps those sides as marker dicts
     *  whose levels live in the side store, so only `get_array_length` / `get_value`
     *  reach them — the checker's array type is not the runtime shape. */
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
    /** The `insert` key argument. A literal becomes `"k".into()`; a proven
     *  string place becomes `crate::runtime::stringify_param(&k)` — the exact
     *  conversion the helper's dict branch applies to a non-string key, and
     *  `k.to_string()` for a string one. */
    rustNativeInsertKeyArg(receiver: any, keyNode: any, keyText: string): string | undefined;
    nestedDictWrite(baseExpr: any, keyNodes: any[], keyTexts: string[], valueText: string, fallbackText: string): string | undefined;
    /** The `get_mut` key of a nested-dict hop: a borrowed `&str` — the literal itself,
     *  or the stringification the insert's key uses. */
    entryKeyArg(receiver: any, keyNode: any, keyText: string): string | undefined;
    rustNativeInsertReceiver(expr: any): {
        text: string;
        isField: boolean;
        plain: boolean;
        nameNode: any;
    } | undefined;
    /** Element-write receiver proof for a local: a whitelisted name (`plain: false`), a dict-shape proof plus a
     *  plain-`Value::Map` build on every path, or a plain-dict-annotated parameter whose writes keep that shape.
     *  The flag is the by-construction plainness (literal-init locals, handler tuples, plain fields) a book-meta key needs. */
    rustInsertIdentifierReceiver(ident: any): boolean | undefined;
    /** A literal initializer must carry no runtime tag key; a call initializer
     *  is the axiom the declared-Dict table itself rests on. */
    rustDeclaredInitIsTagFree(declaration: VariableDeclaration): boolean;
    /** Skip `( … )`, `x!` and `x as T` wrappers. */
    rustStripWrappers(node: any): any;
    /** The local's single declaration is initialised from a call that reads
     *  `x.hashmap` / `x.subscriptions` / `x.futures` — element dicts the runtime
     *  tags with a backref so writes reach the shared store, not the COW copy. */
    rustLocalInitReadsTaggedContainer(ident: Identifier): boolean;
    static readonly RUST_TAGGED_CONTAINER_FIELDS: Set<string>;
    /** True when every value the local can hold comes from an object literal:
     *  the runtime tags a dict (`__book_id`, `__ws_subs_url`, `__ws_sub_ref`,
     *  `__cache_backref`) only on handles its own store builds, so the helper's
     *  write-through branches are provably dead and `insert` is the whole
     *  helper. A `[ x, params ] = this.handle…(…)` tuple re-assigns the
     *  hand-written handler's own dict arguments. */
    rustInsertReceiverBuildsPlainDict(declaration: VariableDeclaration): boolean;
    /** An object literal with no runtime tag key — the transpiler built it, so
     *  it is a fresh plain `Value::Map` on every path. */
    rustPlainDictLiteral(node: Node | undefined): boolean;
    /** `this.handle…(…)` — the hand-written `handle*AndParams` / `handleUntil…`
     *  family; each returns its own request/params dict arguments. */
    rustHandlerTupleCall(node: Node | undefined): boolean;
    /** A `null`/`undefined` write leaves the receiver a non-dict, which the
     *  emitted `if let Value::Dict` no-ops exactly like the helper. */
    private rustTypeIsUndefinedish;
    /** The single variable declaration a local identifier binds to, or
     *  undefined when the checker cannot answer / the binding is not a local. */
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
    /** A string-literal operand of a `format!` concat prints as the `&str` literal itself:
     *  `Display` of `Value::Str(s)` is `s`, so the text is identical and the box is gone. */
    rustConcatLiteralText(node: any, text: string, other: any): string;
    printNativeStringConcat(leftText: string, rightText: string): string;
    rustFormatConcatText(leftText: string, rightText: string): string;
    /** ral-57x: the `format!(..)` a `+` / `.toString()` node took at its latest print (the printer's own arm decision,
     *  recorded where the box is built), cleared whenever that node is printed again; never read back from printed text. */
    private rustFormatPrints;
    /** The `+` node (or the `+=` node) printed the native concat arm: record its unboxed `format!` and return the box. */
    rustRecordFormatConcat(node: any, leftText: string, rightText: string): string;
    /** A `.toString()` call printed as a whole `Value::Str(format!("{}", x).into())`: record the `format!` and return the box. */
    rustRecordFormatToString(node: any, name: string): string;
    /** ral-57x: the `format!(..)` that the node's print boxes whole as `Value::Str(format!(..).into())`, else undefined. Decided
     *  from the node: it is printed (as before) and the arm that printer took for this very node is looked up. */
    rustUnboxedFormatOf(node: any): string | undefined;
    printNativeNumeric(op: any, leftText: string, rightText: string): string;
    private static readonly RUST_TYPEOF_HELPERS;
    printCustomBinaryExpressionIfAny(node: any, identation: any): string;
    printBinaryExpression(node: any, identation: any): any;
    printDateNowCall(node: any, identation: any): string;
    printPadStartCall(node: any, identation: any, name: any, parsedArg: any, parsedArg2: any): string;
    printPadEndCall(node: any, identation: any, name: any, parsedArg: any, parsedArg2: any): string;
    printVariableDeclarationList(node: any, identation: any): string;
    /** ral-57e: `const lvl = side[i]` off an order-book side handle (`Side::level` hands out the stored level, an `Arr` built
     *  by `storeArray` / `store`, or `Null` out of range), read only as `const parts = lvl[K]` (numeric literal K) where
     *  `parts` is itself read only at numeric literal keys. `lvl` holds the list (`into_list()`: the same `Arr`, an empty
     *  list for `Null`), and `parts` borrows its element (`lvl.get(K).unwrap_or(&Value::Null)`): the same element
     *  `get_value` cloned, `Null` where it answered `Null`. */
    printRust57eSideLevel(declaration: any, parsedValue: string, indent: string, varName: string): string | undefined;
    /** ral-58e: `const e = xs[k]` where `xs` is a typed `Vec<Value>` local of the same function (rustVecLocalDeclarationOf)
     *  that no earlier container arm claims (read bearer, opt list, lent list, param shadow), so its element read is the
     *  slice read `xs.get(K).cloned().unwrap_or(Value::Null)`. When `xs` is only read and every use of `e` is the receiver of
     *  an rvalue element read at a numeric literal key, `e` borrows the element instead
     *  (`xs.get(K).unwrap_or(&Value::Null)`): the same element, `Null` where the clone was `Null`. Decided on the AST and the
     *  printer's own Vec decision; nothing is read back from printed text. */
    printRust58eBorrowedElement(declaration: any, indent: string, varName: string): string | undefined;
    rust58eBorrowedElementLocal(declaration: any): boolean;
    /** Which arm of printNativeContainerAccess prints `xs[k]` as a slice read: a read-only list bearer, or a typed Vec local. */
    rust58eBorrowedElementArm(declaration: any): 'bearer' | 'vec' | undefined;
    private rust57eSideLevels;
    rust57eSideLevelLocal(declaration: any): boolean;
    rust57eSideLevelLocalUncached(declaration: any): boolean;
    /** `const e = x[k]` (one const declarator, identifier receiver, same function). */
    rust57eConstElementOf(declaration: any): boolean;
    /** Every use of the local is the receiver of an rvalue element read at a numeric literal key (no write-back bind). */
    rust57eLiteralReadOnly(declaration: any): boolean;
    private static readonly RUST_NIL_INT_HELPERS;
    private static readonly RUST_NIL_BOOL_HELPERS;
    private static readonly RUST_NIL_PRECISE_STR;
    private rustNilLocalDecisions;
    /** `'str' | 'int' | 'bool'` when the nil-declared local prints `Option<..>`, else undefined. */
    rustNilLocalKind(declaration: any): string | undefined;
    private rustNilCandidateNames;
    private rustNilDeciding;
    private rustNilBoolAssumed;
    /** ral-40a: `y` of `y = !x` is a nil local typed `Option<bool>`, or one still being decided (a `!x` cycle such as
     *  `inverse = !linear; .. linear = !inverse`): assumed `bool`, and every local decided under that assumption is
     *  asked again if `y` settles otherwise, so the cycle settles by fixed point. */
    rustNilBoolTarget(target: any): boolean;
    rustNilLocalOfIdentifier(node: any): {
        declaration: any;
        kind: string;
    } | undefined;
    rustNilLocalKindUncached(declaration: any): string | undefined;
    /** og: past a same-named sibling binding, a string local is typed only when each of its boxed hand-offs (a literal
     *  value / element, a return) is its last use: the box moves it where the `Value` moved, so no copy is added. */
    rustSiblingStrBoxesMove(declaration: any, scope: any): boolean;
    /** Static kind of a write's right-hand side: `null`, or the `Option` payload it yields exactly. */
    rustNilWriteKind(rhs: any): string | undefined;
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
    /** How a read of a typed nil local prints: `'test'` (null / literal compare), `'cond'` (bool
     *  condition slot) or `'box'` (a `Value` argument, field, element, return or plain copy). */
    rustNilReadForm(n: any, kind: string): string | undefined;
    /** ral-68b: `n` is a direct argument of a `this.<typed unified>(..)` call whose typed slot there is `Option<i64>`
     *  (luno fetchLedgerByEntries `since`): the call prints the nil `Int` local's own `Option<i64>` in place of the box
     *  the slot would read back through `.as_i64()`, the same `None` / `Some(n)` either way. */
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
    /** ral-64p: the integer kind (`oint`) of `(x === undefined) ? y : Math.min|max (x, y)` (or `y` / `x` swapped in the
     *  call) written to the nil-declared local x, where y's own kind is `int` / `oint`; else undefined. Seeding only. */
    rust64pSelfMinTernaryKind(rhs: any, declaration: any): string | undefined;
    /** ral-65p: `-x` (prefix minus) where x is a scalar local the solver types `int` / `oint`: its kind and printed name. */
    rust65pNegatedIntLocal(node: any): {
        kind: string;
        name: string;
    } | undefined;
    /** ral-65p: `n` is x's own operand of the `Math.min|max (x, y)` arm of a `x = (x === undefined) ? y : Math.min|max (x, y)`
     *  statement write that rust64pSelfMinTernaryKind types `oint`. */
    rust65pSelfMinOperand(n: any): boolean;
    /** ral-64p: while seeding, a `const y = this.sum (..)` / `Math.min|max (..)` local's kind is its initializer's
     *  combinator kind (rustArithCallKind), before y's own decision is seeded. */
    rust64pConstArithKind(node: any): string | undefined;
    /** ral-67b: the right side of a write into a declared-empty `Bool` local: `a && b` / `a || !b` (rustBoolLeafLogical: every
     *  leaf a local of the same function) whose checker type at the write is exactly `boolean`. JS hands back an operand, and
     *  every operand the checker narrows to `boolean` is a JS boolean there, so the condition's native `bool` is the value. */
    rust67bBoolLogicalWrite(expr: any): boolean;
    /** ral-47d: `rhs` names another nil-declared (`let y: Str = undefined`) string local of the same function. */
    rustNilStrPartner(rhs: any, declaration: any, scope: any): boolean;
    /** ral-45b: the local has a `x = x.slice(..)` / case self write or a `x += ..` append (the forms lift 1 / 2 admit). */
    rust45bUsesNewForm(declaration: any, scope: any, name: string): boolean;
    /** ral-45b: `return x;` of the local in a method whose declared return is a string type. */
    rust45bReturnedFromStrMethod(declaration: any, scope: any, name: string): boolean;
    /** ral-45b: `x.slice(..)` / case of the declared local itself, in a shape whose `Option<String>`
     *  receiver form maps `None` to `None` (the boxed helper gives `Null` for a `Null` receiver too). */
    rust45bSelfStrWrite(rhs: any, declaration: any): boolean;
    /** za: kind of the scalar arm of `c ? <scalar> : x` / `c ? x : <scalar>` where the other arm is the written local itself. */
    rustNilSelfArmTernaryKind(rhs: any, declaration: any): string | undefined;
    rustNilScalarHandOff(declaration: any, scope: any, kind: string, boxed: any[]): boolean;
    private rustNilStrLentLocals;
    /** ral-ld: `m[k] = x` / `m.k = x` as a statement on a plain identifier receiver (not `x` itself), one level deep. */
    rustNilStrStoreBox(n: any): boolean;
    private rustNilAliasMoves;
    rustNilAliasMove(rhs: any, kind: string): boolean;
    /** nc: `n` is the whole source of `let t = n` / `t = n;` (a statement), `t` a typed scalar local of `kind`, and this is
     *  the source's last use (no loop or closure between): the typed target takes the value by move. */
    rustScalarAliasMove(n: any, kind: string, declaration: any): boolean;
    /** wi: `n` is the whole source of `let t = n` / `t = n;` with `t` a local the joint solve types `kind`, outside a loop or
     *  closure since the destructure, and `n` is read again: the typed alias clones `n` where the boxed one did. */
    rustScalarAliasCopy(n: any, kind: string, declaration: any): boolean;
    /** nc: a string slot unwrap (`.as_str().map(str::to_owned)`) would take its destructure line from within to over 400 chars. */
    rustNilSlotLineOverBudget(n: any): boolean;
    /** nc: the whole source of a `let t = n` / `t = n;` statement at the source's last use. */
    rustScalarAliasMoveSite(n: any, declaration: any): boolean;
    /** 40i: an arm of `c ? n : z` that is the whole initializer of another local, at the source's last use outside a
     *  loop (bybit withdraw `defaultAccountType`): only one arm runs and the source is never read again, so it moves. */
    rustScalarTernaryArmMoveSite(n: any, declaration: any): boolean;
    /** nc: `x = y` from a typed `Option<String|i64|f64>` local of the same kind that is read again later (one function,
     *  no closure between). A string clones `y` where the boxed write cloned it (`y.clone().map(Value::from)..`); a
     *  number is `Copy` and its write prints `y` owned, so neither adds a copy. */
    rustNilLiveAliasCopy(rhs: any, kind: string): boolean;
    /** Every box before the last sits at a `this.` / `super.` argument (where the `Value` form was cloned); no free-function,
     *  `Precise`, `Math` or `new` operand, which read `&Value` and would take a copy only because of the lending. */
    rustNilStrLendSites(declaration: any): boolean;
    /** ral-va: an identifier partner of an optional-string `+` operand whose checker type is string-or-nullish: the
     *  pair prints the `format!` arm whatever its Rust form (`Value`, `String`, `Option<String>` read), and each of
     *  those displays as the JS concat does (Str text, Null `null`). */
    rustNilConcatPartner(other: any): boolean;
    rustNilOptStrConcatUse(n: any): boolean;
    /** ral-56x K1: `return x` of a literal-seeded string local (never a parameter alias) in a `-> Option<String>` method. */
    rust56xStrReturnLocal(n: any, fn: any): boolean;
    /** ral-61x: `return x` of the method's own nil-declared `let x: Str = undefined` local (an accumulator the body writes):
     *  as an `Option<String>` it is the payload itself, as a `Value` a checker-string `Value` (converts either way). */
    rust61xNilStrReturnLocal(n: any, fn: any): boolean;
    /** ral-76a S1: `return x` of the method's own local that another rule already prints `Option<String>` (a `safeString`
     *  read, checker `string | undefined`): under a `: Str` signature it is the payload itself, so the method prints
     *  `-> Option<String>` and its callers' string locals read it natively. Decided from the AST and the local's own rule. */
    private rust76aS1Off;
    rust76aOptStrReturnLocal(n: any, fn: any): boolean;
    /** ral-76a S1: the method prints `-> Option<String>` only because a return is its own reader local (rust76aOptStrReturnLocal). */
    rust76aOptStrReturnMethod(fn: any): boolean;
    rust56xStrReturnText(exp: any, fn: any): string | undefined;
    /** ral-56x K1: a `+` partner that is itself a concat (or a `.toString()`) the printer already prints as a boxed `Value::Str(format!(..))`
     *  (always a `Str`, never `Null`), so the optional string joins the same `format!` with its `as_deref().unwrap_or("null")` text. */
    rust56xFormatPartner(other: any): boolean;
    /** The `as_deref().unwrap_or("null")` read of a concat operand keeps its statement within the 400-char line budget. */
    rustOptStrConcatFits(n: any): boolean;
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
    /** ral-qd: `n` is the name of the method declaration `scope` itself (a declaration name, never a read of a local),
     *  asked while the shared-container rule walks its uses (the copying `IndexMap` bearer rules keep the old walk). */
    rustOwnMethodName(n: any, scope: any): boolean;
    private rustOwnNameSkip;
    /** ral-52i: set only while the built-list rule walks its uses. */
    private rustDisjointShadowSkip;
    private rustDisjointShadowSeen;
    private rustBuiltListCopiedElement;
    /** ral-52i: `other` (a variable declaration) and `declaration` sit in two blocks of one function, neither inside the other. */
    rustDisjointBinding(other: any, declaration: any): boolean;
    rustLocalUsesAcceptBool(declaration: any, sourceName: string): boolean;
    private rustBoolParamDecisions;
    rustParamPrintsBool(param: any): boolean;
    rustParamPrintsBoolUncached(param: any): boolean;
    /** True when `this.<name>` is read as a value (not called) in the method's own file. */
    rustMethodReferencedAsValue(method: any): boolean;
    private rustValueReferencedMethods;
    rustValueReferenceCensus(file: any): Set<string>;
    /** Native type text of a parameter in the emitted signature. */
    rustParamType(param: any): string;
    rustBoolParamUseAccepted(node: any): boolean;
    /** ral-45e: the call's `at`-th argument lands in an OPTIONAL venue `boolean` parameter the callee binds
     *  `let p: bool = get_arg(optional_args, i, ..).is_truthy()`: a native bool local re-boxes as `Value::Bool(x)` there,
     *  and the callee applies the same truthiness the old `Value` box got. */
    rustOptionalBoolArgumentSlot(call: any, params: any, at: number): boolean;
    /** The argument is a local the PRINTER declares `bool` from a bool expression (comparison / logical); literal and
     *  alias locals are narrowed later by ccxt narrowBoolLocals, which boxes their uses itself. */
    rustOptionalBoolArgLocal(a: any): boolean;
    private rustMarketFlagBoolDecisions;
    rustMarketFlagBoolLocal(declaration: any): boolean;
    rustMarketFlagText(right: any): string | undefined;
    /** ral-46e / ne / 47e: THE market `bool` flag read (one decision for initialisers and literal-seeded flag writes):
     *  off an `Option<Market>` local `matches!(m, Some(Market { f: true, .. }))` (`None` reads `false`, no closure),
     *  off a loaded struct local its own field `(m).f`; anything else undefined. */
    rustMarketBoolFlagRead(receiver: any): string | undefined;
    rustMarketFlagBoolLocalUncached(declaration: any): boolean;
    /** `x = m['contract']` / `x = true` into a `rustMarketFlagBoolLocal`. */
    printMarketFlagBoolWrite(left: any, right: any): string | undefined;
    /** An argument in an optional native-`bool` slice slot: a bool local the printer still prints bare is boxed once
     *  (a scalar bool local already prints its own `Value::Bool(x)`). */
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
    /** Every body use is a map operation the bearered printer emits, and at
     *  least one of them writes (otherwise the read shadow already covers it). */
    rustMapParamBodyUsesOk(param: any): boolean;
    /** `read` / `write` on a single-level key, or `box` where the printer moves
     *  the map into a `Value::Map(..)`; anything else has no printed form. */
    rustMapParamUseKind(node: any): string | undefined;
    /** The value operand of a `m['k'] = x` write: the receiver takes a `Value`, so
     *  the map is boxed there (a move at its last use, a clone before it). */
    rustDictWriteValue(node: any): boolean;
    /** A use that prints the map as `Value::Map(x.clone())`: the body scan's
     *  `box` positions, never a key read or a map argument slot. */
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
    /** `x['k'] = v` on a native-map parameter: the insert `add_element_to_object`
     *  performs on the same plain dict, on the map the type already is. */
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
    /** Decides every scalar candidate of one function together: seeds each with its initializer kind,
     *  then re-checks all of them in declaration order until a whole pass changes nothing (each kept
     *  decision is then proven against the final ones); a candidate that keeps flipping stays `Value`. */
    rustScalarSolveScope(scope: any): void;
    /** ya: the scope whose settled decisions an alias write may read (phase 2 of `rustScalarSolveScope`). */
    private rustScalarAliasScope;
    private rustScalarAliasTarget;
    private rustScalarAliasJournal;
    /** ya: phase 2. Once every scalar decision of the function has settled, a nil local still `Value` may take
     *  `x = y.into_opt_string()` from a `Value` string local `y` at its last use. The alias never feeds back into
     *  `y`'s own rule: it is admitted only when re-deciding every other candidate with it gives the same answers. */
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
    rustScalarLocalKindUncached(declaration: any): string | undefined;
    rustScalarLocalKindCore(declaration: any): string | undefined;
    rustAnyBoolTestedLocal(declaration: any): boolean;
    private rustStrNoLend;
    rustStrLendOnly(declaration: any): boolean;
    /** Every box of the string sits where the `Value` form cloned it (a `this.` / `super.` argument) or is its
     *  moving last use, and no use reads it by reference: lending there costs the one copy the clone made. */
    /** sc: the initializer is a call of another `this.` method (sync or awaited) that the scalar seed typed as a string */
    rustScOwnSelfCall(init: any): boolean;
    rustStrLendSites(declaration: any): boolean;
    /** Every non-moving box of the string is a slot where the `Value` form cloned it (a `this.`/`super.` argument,
     *  an object-literal value, a dict write or an array element), so lending there adds no copy. */
    rustReaderLendBoxes(declaration: any, nativeKeys?: boolean, preciseSlots?: boolean, copyDecls?: boolean): boolean;
    /** Test tier: every non-moving box of the string is a by-value `Value` argument / element of a call (the
     *  harness helpers take `Value`), where the `Value` form printed `x.clone()`: lending there costs that copy. */
    rustTestLendBoxes(declaration: any): boolean;
    /** The key reads a local declared with a non-null initializer (nil-declared locals and slots keep their own rules). */
    rustInitKeyLocal(n: any): boolean;
    /** Some use of the local is a native map-key read (`okey`) or `in` test (`kin`). */
    rustScalarKeyedLocal(declaration: any): boolean;
    /** ral-66s3: a `const x = this.m (..)` local whose venue callee declares a `Str` return (rustVenueStrCall), returned
     *  whole by its own sync venue method whose head prints `-> Option<String>` (rustNativeStrReturnHead): as an
     *  `Option<String>` the `return x` is the payload itself (rustVenueStrReturnLocal), so the return is no copy and the
     *  string-return veto does not apply. Decided from the AST: const declaration, venue callee, every return of the
     *  local a bare `return x` in that method. */
    rust66s3VenueStrReturnedWhole(declaration: any, scope: any): boolean;
    /** The string-return veto of the hand-off rules, less the ral-66s3 returned-whole venue results. */
    rust66s3StrReturnedVeto(declaration: any, scope: any): boolean;
    /** ral-66s3: `x` read in a `return x` of the method owning a returned-whole venue `Str` local. */
    rust66s3ReturnedWholeRead(n: any): boolean;
    /** A local some `return` of a method with a declared string return hands back as-is. */
    rustStrReturnedLocal(declaration: any, scope: any): boolean;
    private static readonly RUST_COPY_SCALAR_KINDS;
    /** ral-76f: a write `x = p.m(..)` of a string alias `x = p` calls a method on its own source parameter: the typed
     *  write would copy the parameter again (a second copy), so such an alias keeps the `Value` binding. */
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
    /** The scalar kind an expression yields exactly (`null` for nullish); `fresh` admits the
     *  non-null literal kinds (`str|int|num|bool`) a declaration may seed. */
    rustScalarValueKind(expr: any, fresh: boolean): string | undefined;
    /** ral-61p: base `this.getSupportedMapping (key, { 'k': 'v', .. })` at a declaration whose mapping is an object literal of
     *  string-literal values: the base body throws unless `key in mapping` and then answers `mapping[key]`, so the result
     *  is always one of those literals (a `String`, never `Null`). */
    rustSupportedMappingStr(expr: any): boolean;
    /** ral-61p: `this.handleOption (m, o, <literal>)` resolved to the base tier: the option value or the default argument.
     *  A string literal default names `ostr` (the runtime answers the stored option or that literal; a stored option of
     *  another kind reads as `None`, the same miss the `Value` form's `.as_str()` compare made). */
    /** ral-62p: `this.handleOption (m, o, d) as Bool` (or `as boolean`) on the base handleOption. */
    rust62pBoolCastOption(node: any): boolean;
    rustHandleOptionLiteralKind(expr: any): string | undefined;
    private static readonly RUST_BASE_SCALAR_RETURNS;
    /** Base `parseNumber(s)` with no default over a string (literal, string local, `Precise.string*`): the
     *  runtime parses a `Str` to `Float` and answers `Null` otherwise, so the result is exactly an `Option<f64>`. */
    rustParseNumberOfString(call: any): boolean;
    private static readonly RUST_BASE_STR_FIELDS;
    /** ral-52k: `this.<field>` of the table whose declaration is the base-tier `string` property (no venue redeclares it). */
    /** ral-65n: `p` is a parameter of a base-tier method, annotated `Str` (or `string`), whose checker type is a string
     *  (or string | undefined), printed as a `Value` binding (no typed signature slot) and never written in its function.
     *  Its box holds a `Str` or `Null`, so the arm reads it once as an `Option<String>` (the same conversion the base
     *  `Str` call arm next to it takes). */
    /** ral-84h R1: the arm is a base `Str` parameter accepted by rust65nBaseStrParamArm through its `= undefined` / string-literal default. */
    rust84hDefaultedStrParamArm(node: Node): boolean;
    rust65nBaseStrParamArm(node: any): boolean;
    rustBaseStrFieldRead(node: any): boolean;
    /** ral-53k: a ternary whose arms are each a checker-typed string or a unified string key of an `Option<Dict>` local (one at least). */
    rustOptDictStrKeyTernary(init: any): boolean;
    /** ral-53k: `c['code']` (a unified string key of a market / currency record) on an `Option<Dict>` local, printed as the
     *  owned `KeyRead::key_read(&&c, "code")` temporary moved into its string (`into_opt_string`: `None` for a missing key). */
    rustOptDictStrKeyText(node: any): string | undefined;
    /** ral-87rh R2: `node` reads a never-written base-tier `market: Market = undefined` parameter that is no typed market
     *  slot (it prints as the plain `Value` get_arg gave back); the parameter declaration, else undefined. */
    rust87rhValueMarketParam(node: Node): ParameterDeclaration | undefined;
    /** ral-84e: an optional market / currency record (`Option<Market>` local, lent `Option<&Market>` / currency slot, currency
     *  local): its `KeyRead` reads the record's own map and answers `Null` when absent, the same `Value` the boxed read held. */
    rust84eOptRecordRecv(recv: Node): boolean;
    /** ral-84e: a ternary initializer with an arm `r['k']` read off such a record (rust84eOptRecordRecv). */
    rust84eRecordArmTernary(init: Node): boolean;
    /** True when `node` (through parens) is the `whenTrue`/`whenFalse` arm of a ternary that initialises a declaration. */
    rustTernaryArm(node: any): boolean;
    /** `node` (through parens and ternary arms) is a variable declaration's initializer. */
    rustDeclInitPosition(node: any): boolean;
    /** `x.toUpperCase()` / `x.toLowerCase()` on a `Value` place the checker types `string`: the helper converts a `Str`
     *  and answers `Null` for anything else, which is exactly `x.as_str().map(str::to_uppercase)` as an `Option<String>`.
     *  Returns the printed receiver place, else undefined. */
    rustValueCaseRecv(call: any): string | undefined;
    /** ral-54x K1: the receiver of `<reader>.toUpperCase()` / `.toLowerCase()` (no arguments) when the reader is a base
     *  string reader with a string-literal default (always a `Str`, so the scalar rule types it `String`), else undefined. */
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
    /** A test helper's `exchange.m(..)` on an untyped receiver: the test crate hands it a concrete `Exchange`
     *  (or the `ExchangeOps` shim on `Value`), whose `m` returns the same `String`, so the call boxes once. */
    rustStrRuntimeTestCall(node: any): boolean;
    /** The bare `String` call text (no box), for typed string locals and `format!` operands. */
    rustStrRuntimeBareText(node: any, identation?: number): string;
    /** A `+` / `+=` operand the printer joins with `format!` (or a typed `String` push), where `Display` takes the `String` as-is. */
    rustStrRuntimeFormatOperand(node: any): boolean;
    /** A local seeded from such a call is not appended onto another local (that write would retype the other one). */
    rustStrRuntimeLocalCostly(declaration: any): boolean;
    /** ral-84b: the append `.. + x` / `t += x` writes a local the printer already holds as a native string (a scalar
     *  `String` / `Option<String>` decision or the url-builder `String` let): the append prints the same `format!` operand
     *  whatever this local's type, so typing it retypes nothing. */
    rust84bAppendTargetString(parent: any): boolean;
    /** Call hook: the `String` result is boxed once (`Value::from`) wherever a `Value` is expected. */
    printRustStrRuntimeCall(node: any, identation: any): string | undefined;
    private static readonly RUST_BASE_TYPED_METHODS;
    private static readonly RUST_BASE_TYPED_RUNTIME;
    private static readonly RUST_BASE_TYPED_HAND_METHODS;
    private rustBaseTypedBare;
    /** The native kind a method declaration returns under the table, else undefined. */
    rustMethodTypedReturnKind(node: any): string | undefined;
    /** `x.m(..)` whose member resolves to a table method of the base tier (or a typed override of one). */
    rustBaseTypedReturnKind(expr: any): string | undefined;
    /** pg: a call of a precision formatter of the typed-return table (`-> Option<String>`); its locals carry the venue copy veto. */
    rustPrecisionCall(expr: any): boolean;
    /** pg: the local is written from a precision formatter, or returned by one of the typed precision methods. */
    rustPrecisionTouched(declaration: any, scope: any): boolean;
    /** pg: a later whole write of the local is a precision-formatter call (the 400-char guard watches such locals). */
    rustPrecisionWritten(declaration: any): boolean;
    /** Runtime `Precise::string*` entry points whose string operands take `&impl PreciseArg` (precise.rs). The
     *  comparators keep `&Value` (a ccxt build/ pass reads their exact signature text). */
    private static readonly RUST_PRECISE_LENT;
    /** vd: only a local declared with a value (nil-declared locals keep their own box rules). */
    rustPreciseLendLocal(n: any): boolean;
    /** ral-67a: a `let x: Str = undefined` local (declared string type, no value) lends at a Precise operand too: the
     *  runtime takes `&impl PreciseArg`, and `&Option<String>` reads `None` as the `Null` box and `Some(s)` as its `Str`. */
    rust67aNilStrLend(declaration: any): boolean;
    /** ral-67a: `string` / `Str` / a union of those with `undefined`, read from the type node. */
    rust67aStrTypeNode(type: any): boolean;
    /** vd: `n` is a direct string operand (one of the first two, the third of `stringDiv` is the precision) of a lent
     *  `Precise.<op>(..)` call. */
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
    /** ral-46c: `n.toString()` of an `i64` scalar local, or `this.requestId().toString()` of a venue method every
     *  declaration of which returns `int` (rustVenueIntCall, or the typed `-> i64` return rustBaseTypedReturnKind proves): the decimal text of the `i64`, as `to_string_val` prints an `Int`. */
    rustIdString(node: any): boolean;
    /** `this.milliseconds().toString()`: the decimal text of the `i64`, as `to_string_val` prints an `Int`. */
    rustClockString(node: any): boolean;
    /** ral-46a: `this.incrementingNonce()` / `this.randNumber(n)` of the base runtime (no venue override): the runtime
     *  answers a bare `i64` (`fn incrementing_nonce(&mut self) -> i64`, `fn rand_number(&self, size: Value) -> i64`), and
     *  `format!("{}", ..)` of it is the decimal text `to_string_val` gave for the `Int` box. */
    rust46aIntRuntimeCall(node: any): boolean;
    /** `this.nonce()` where every declaration of the name (base and each override) declares `int`: the trait slot
     *  answers a `Value` holding that `Int`, and `format!("{}", ..)` of it is the decimal text `to_string_val` gives. */
    rustNonceCall(node: any): boolean;
    /** A base `sum(a, b, ..)` call shape; whether it is native is decided by rustArithCallKind. */
    rustSumShape(node: any): boolean;
    /** A cast, clock-string or `sum` local must earn a native use, and a string one never copies where the `Value` moved. */
    rustNewShapeCostly(init: any, typedUses: number, copied: number): boolean;
    /** ral-87rh R3: `x = v.toString ()` (no radix) as a whole statement write whose target is a single-binding `let` local
     *  seeded with a string literal, in a non-test source, and whose call the printer boxes whole as
     *  `Value::Str(format!("{}", ..))` (decided from that very node's print, rustUnboxedFormatOf). */
    rust87rhToStringWrite(node: Node): boolean;
    /** ral-45g: `p.toString()` (no radix) of a parameter the checker types `number`: the printer already boxes
     *  `format!("{}", p)` (the decimal text `Display` gives the `Int` / `Float` box), so the local holds that String. */
    rustNumParamToString(node: any): boolean;
    /** `n.toString()` of an `i64` scalar local. */
    rustIntToStringShape(node: any): boolean;
    rustStrCastCall(node: any): any;
    /** ral-68f: `node` is the whole initializer of a single-declarator `const` statement. */
    rust68fConstInit(node: any): boolean;
    /** ral-68f: a base safeString-family reader call (not safeCurrencyCode) with no default argument (rust64bReaderLocal's call test). */
    rust68fNoDefaultReader(init: any): boolean;
    rustParseNumberStrCall(call: any): boolean;
    rustDerivedScalarKind(call: any): string | undefined;
    rustListLengthInit(node: any): boolean;
    /** ral-67b: `(x as T[]).length` (any array type T): the receiver is a local or parameter cast to an array type in the
     *  source, so the read prints the same native `len()` (or `get_array_length`) as a list receiver, an `Int` every time. */
    rust67bCastListLengthRecv(recv: any): boolean;
    rustSelfRootedLengthRecv(recv: any): boolean;
    rustLocalRootedLengthRecv(recv: any): boolean;
    rustListLengthText(node: any): string;
    /** ral-52f: `this.handle*AndParams (..)[0]` read inline (bitget `productType`, toobit / okx pro `marketType`) where the
     *  helper's declared tuple slot 0 is a string (`[string, Dict]` / `[Str, Dict]`): the read is that string or undefined,
     *  printed off the temp list exactly as the destructured slot 0 (`.and_then(Value::as_str).map(str::to_owned)`). */
    rustInlineHandleStrSlot(node: any): boolean;
    rustElementReadScalarKind(node: any): string | undefined;
    /** ral-56e: `const xs = this.m (..)` where `m` is a method of the same class declared `number[]` whose body builds
     *  one `const r: number[] = []` filled only by `r.push (i)` of a plain int for-counter and answers `return r`; a
     *  declaration's literal-index `xs[k]` is then an `Int` or (out of range) `Null`: `Option<i64>`. Non-test sources. */
    rust56eIntListVenueElem(node: any, owner: any): boolean;
    /** ral-53f: `const t = this.m (..); const x = t[0]` where `t` is a const tuple local (a declared `[string, Str, Dict]`
     *  return, e.g. binance pro `resolveAuthType`) and the literal-index slot is declared `string`: the read is the slot's
     *  string or undefined. Non-test sources only. */
    rustConstTupleStrSlotRead(node: any, owner: any, listType: any): boolean;
    /** xg: the element read prints straight off the list place (`xs.get(..).and_then(Value::as_str)..`), never a helper read
     *  that would leave the declaration `Value` while its uses read a string (the paradex E0599 trap). */
    rustAnyStrPlaceRead(declaration: any): boolean;
    /** xg: `const k = xs[i]` where `xs` is a local `[]` (declared `any[]` / `List` / unannotated) whose only writes are
     *  `.push (v)` of one string-typed value: never rebound, element-written, spliced or handed on whole. Every element
     *  the list can hold is a `Str`, so the read is the string or (out of range) undefined. */
    rustAnyStrPushElem(node: any): boolean;
    /** ral-87ra R2: the integer twin of `rustExactBoolTupleRead`: `t[i]` (a literal index) of a never-written `const t = this.m (..)`
     *  (or `await this.m (..)`) whose every return puts an exact Int-or-Null at slot i (rustExactSlotCallee `int`, as the
     *  destructured slot rule; lighter `handleAccountIndex` / `handleApiKeyIndex`), the read typed `number`: `Option<i64>`. */
    rust87raExactIntTupleRead(node: Node, owner: Node): string | undefined;
    private static readonly RUST_87RA_COMPARE_OPS;
    /** ral-ug: `t[i]` (a literal index) of a never-written `const t = this.m (..)` whose every return puts an exact
     *  Bool-or-Null at slot i (`handleOptionBoolAndParams[2]`: `checkOptionBool`): `Option<bool>`, as the slot rule. */
    rustExactBoolTupleRead(node: any, owner: any): string | undefined;
    /** ne: `row['k']` (a literal key) off a local printed as a typed map (`Dict` / `IndexMap`) whose checker type
     *  declares `k` a string (a unified `Ticker` / `Trade` / `Order` row): the `Option<String>` the boxed read held
     *  (a non-string slot reads as `None`, like the lf / md market-field rule), only as a `const`/`let` initializer. */
    rustRowFieldStrText(node: any): string | undefined;
    /** ral-42g: `xs[i]` whose list is a `string[]` / `Strings` parameter rustStrListParam proves (base-declared or every call site). */
    rustStrListParamElement(init: any): boolean;
    /** `xs[i]` over a typed list parameter (the source the element-read rule admits from a parameter). */
    rustListParamElement(init: any): boolean;
    /** The local's last use is the whole right side of a statement `y = x;`: the boxed local moves there,
     *  a typed one keeps the clone ccxt adds to that write. */
    /** ral-80h: every bare last-use write `y = x;` of the typed local `x` targets `other`, the compared optional-number local
     *  (base safeOrder `lastTradeTimeTimestamp = tradeTimestamp` beside `tradeTimestamp > lastTradeTimeTimestamp`): both are
     *  `Option<i64>` / `Option<f64>` of one kind, so the write copies a Copy value and no clone is ever added. */
    rust80hCopyWriteInto(node: Node, other: Node): boolean;
    rustScalarBareLastWrite(node: any): boolean;
    /** Some use of the local is the source of an assignment or of another declaration. */
    rustScalarFeedsWrite(declaration: any): boolean;
    /** Some statement of the parameter's function assigns the parameter itself. */
    rustParamWritten(param: any): boolean;
    rustReaderDefaultKind(name: string, args: any[], fresh: boolean): string | undefined;
    /** ral-49i: a `sign` reader default `m['<lit>']` (or `m['<lit>'] as string`) where `m` is the reader's own receiver, a
     *  never-written `const m = this.urls['api']` (rustUrlsMapEntry) of the same function, and every venue file of the family
     *  writes `'<lit>'` only as a string literal (the describe() urls literal; checked by rustOptionsElemKind's scan of
     *  literal `'<lit>': v` writes): the default the runtime reader hands back unconverted is a `Str` or `Null`. */
    rustSignReaderUrlsLitDefault(fallback: any, receiver: any): boolean;
    /** zd: `this.options['k']` as a reader default, where every write of key `k` over the venue family (describe()
     *  literals `'k': v` anywhere in the family's files, incl. request literals, and `this.options['k'] = v`) is a string
     *  literal or `undefined`: a string-or-Null default. Any other value, a dynamic options key write, an options
     *  reassignment or the base Exchange writing `k` poisons it. */
    private rustOptionsElemKinds;
    rustOptionsElemKind(fallback: any): string | undefined;
    rustReaderFallbackKind(fallback: any): string | undefined;
    /** The checker scalar of a default that is a field, parameter or local (never a call: its `Value` may differ). */
    rustReaderFallbackChecked(fallback: any): string | undefined;
    rustReaderDeclTooLong(declaration: any, kind: string): boolean;
    /** 41d: the declaration's native initializer within the line budget: the plain native text, else (a reader whose
     *  default is a no-default reader of the same optional kind) the nested reader hoisted into a typed temp on the line
     *  before (`pre`) and handed to the outer reader as its default `Value::from(__rd_x)`. */
    rustReaderDeclText(declaration: any, kind: string): {
        pre?: string;
        init: string;
    } | undefined;
    /** 41d: `this.safeX (o, k.., this.safeY (o2, k2))`, an optional string / integer reader whose default is a no-default
     *  reader of the same kind: the nested reader prints natively into `tmp` (`Option<String>` / `Option<i64>`) and the
     *  outer reader takes `Value::from(tmp)` as its default, the same `Str|Null` (`Int|Null`) value the boxed nested
     *  reader handed it (the nested native form is that reader's own form). Every other argument is a plain local,
     *  property read or literal, so evaluating the nested reader first changes no order a side effect could see. */
    private rustReaderSplitKinds;
    rustReaderDefaultSplit(kind: string, expr: any, tmp: string): {
        pre: string;
        init: string;
    } | undefined;
    /** True when the initializer or any `x = ..` write is a reader this block admits. */
    rustReaderDefaultTouched(declaration: any): boolean;
    /** A string local that is the source of another local's write: that local then copies at its own uses. */
    /** sd: a bare string hand-off `y = x` / `const y = x` that needs no veto: `moved` at the local's last use into a
     *  receiver with a value (the receiver decides alone), or `solved` when that receiver is a scalar-shape candidate of
     *  the same function, decided together with the local (a copy where both are typed is the copy the `Value` clone made). */
    rustStrHandOffDecided(n: any, top: any, declaration: any): {
        moved: boolean;
        solved: boolean;
    };
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
    /** ral-51n: every use of a number local is a presence test or an operand of a numeric comparison (never boxed, never
     *  arithmetic): an `Int` reader default read back as `f64` compares exactly as the `Int` did, so no number can change. */
    rustCompareOnlyNumUses(declaration: any): boolean;
    /** Every boxed use of the local is a direct argument of a `number`-typed parameter. */
    rustNumParamBoxesOnly(declaration: any): boolean;
    /** The parameter `arg` binds in `call` is declared `number` (not `int`), so it prints as an `f64`. */
    rustNumParamArg(call: any, arg: any): boolean;
    /** A number reader whose default may be an `Int` (an int literal, or anything not proven a float). */
    rustReaderIntDefaultNum(init: any): boolean;
    rustScalarUsesAll(declaration: any, name: string, acceptUse: (n: any) => boolean): boolean;
    /** zi: a `const [ .. ] = ..` slot goes through the same per-binding walk (rustBlockLocalUsesAll). */
    rustSlotUsesAll(element: any, name: string, skipPropertyNames: boolean, acceptUse: (n: any) => boolean): boolean;
    /** The one "decide per binding when a same-named twin sits in a sibling block" walk (round 39 merged here: zg map rows,
     *  zh Object.keys / values key lists, zi tuple slots; za's same-spelled method-name skip lives in its use callback).
     *  A `let` / `const` declaration whose same-named twins are other `let` / `const` declarations outside it, or a
     *  destructure slot whose twins are slots of destructures in disjoint sibling blocks, is its own Rust block-scoped
     *  local: only uses bound to its own symbol are walked. Any other second binding keeps the plain walk. */
    rustBlockLocalUsesAll(declaration: any, name: string, acceptUse: (n: any) => boolean, scalar?: boolean, skipPropertyNames?: boolean): boolean;
    rustBindingUsesWalk(declaration: any, nodes: any[], own: any, home: any, skip: any[], skipPropertyNames: boolean, acceptUse: (n: any) => boolean, scalar: boolean): boolean;
    /** ral-68f: an `Option<String>` base-reader local boxed at its moving last use as a bare argument of the `this.` call
     *  that is the whole source of a write (mexc pro `timeframe = this.findTimeframe (timeframeId, ..)`): the box is
     *  `x.map(Value::from).unwrap_or(Value::Null)`, the `Str` / `Null` the `Value` local moved there (ccxt's
     *  rustStr2LocalOptionString pass printed this); the write's own source text is the call, unchanged otherwise. Also the
     *  local itself as the whole source of a write to a plain `Value` local, at its last use. */
    rust68fReaderSelfArgWrite(n: any, write: any, form: string, declaration: any): boolean;
    /** ral-70f: the write a ral-70f reader local's typed-signature argument (`targ`) feeds targets a local declared with
     *  `let` / `const` (bitget fetchTickers `market = this.market (symbol)` under the typed `market (&str)` signature): the
     *  argument prints `x.as_deref().unwrap_or_default()` whatever the target, the text ccxt's narrowStrNullLocals pass
     *  printed there. A parameter target (untyped `any`) keeps the refusal. */
    rust70fTargLocalWrite(write: BinaryExpression): boolean;
    /** ral-64n: a typed-signature argument (`targ`: printed `x.as_deref().unwrap_or_default()` / `x.as_deref()` / the Copy
     *  payload, never a boxed operand) of the call that is the whole source of a write to a typed scalar local (bitflyer
     *  `expiry = this.parseExpiryDate (expiryDate)` with `expiryDate` declared in two sibling blocks): the written local
     *  prints its own conversion of the call's `Value`, so no build/ pass reads a boxed text of this argument there. */
    rust64nTypedArgWrite(n: any, write: any, form: string | undefined): boolean;
    /** ral-60k: a direct argument of a base-class `this.m (..)` call that is the whole source of a write to a local declared
     *  `Dict` (kucoin fetchBalance `result = this.mergeBalanceAccount (result, currencyCode, ..)` in a sibling block): the
     *  written local's type is its annotation and the argument boxes into the call, as the plain walk already prints it. */
    rust60kBaseCallArgDictWrite(n: any, write: any): boolean;
    /** ral-62p: the key of an element read `m[k]` that is a direct argument of a base-class `this.f (..)` call, the call the
     *  whole source of a write to a local declared `Dict` / `List` (indodax fetchDepositsWithdrawals
     *  `transactions = this.arrayConcat (transactions, withdraw[key])`): the written local's type is its annotation, the
     *  element read prints its own key form and the call takes the read's `Value` either way, never this key's box. */
    rust62pBaseCallArgKeyWrite(n: any, write: any): boolean;
    /** ral-58k: the key argument of a base `this.safeDict (src, k, dflt)` that is the whole source of a write to a local
     *  declared `Dict` (bitget pro handleBalance `account = this.safeDict (this.balance, code, account)`): the written local's
     *  type is its annotation, never this key's, and the reader takes the key as a boxed `Value` either way. */
    rust58kDictReaderKeyWrite(n: any, write: any): boolean;
    /** ral-53s: a direct operand of a base `this.sum (a, b)` that is the whole source of a write to another local
     *  (`endTime = this.sum (startTime, oneWeek)`): with this operand typed the call keeps its own combinator kind
     *  (`rustArithCallKind`), so the write prints the same native combinator text the other operands decide, and the
     *  written local's own rules read that call, never this operand's box. */
    rustScalarSumOperandWrite(n: any, write: any): boolean;
    /** zd: the size argument of `this.<field> = new ArrayCache*(limit)`: the written place is a ws cache field, not a
     *  local, and the hand-written `::new(impl Into<Value>)` boxes an `i64` / `Option<i64>` into the `Value` the boxed
     *  local held (`Value::Int` / `Value::Null`), so no other local's decision reads this one's type. */
    rustScalarCacheFieldCtor(n: any, write: any): boolean;
    /** ral-51x: an optional string boxed as a property value of a map literal handed to a `this.m(..)` call that is the one
     *  argument of `xs.push (..)` (`result.push (this.safeMarketStructure ({ 'quote': quote }))`): the pushed source prints
     *  `self.m(..)`, so ccxt's native-push pass reads that call's text and never this operand's box. */
    rustPushSelfCallArgUse(n: any, push: any, kind: string | undefined): boolean;
    /** 40d: a Copy number that is a direct element of the array literal pushed whole (`rows.push ([ price, amount ])`):
     *  the element prints `Value::from(x)` (the Int / Float / Null its box held, no copy) inside `Value::from(vec![..])`,
     *  which ccxt's rustVecPushInline (build/rustTranspiler.ts) already treats as a marker-free source whatever the
     *  elements print, so no text pass reads this local's type. */
    rustCopyPushPairElement(n: any, push: any, kind: string | undefined): boolean;
    /** 40d: `n` is the one argument of a base `ws/Cache.ts` constructor that is the whole source of a ws cache-map entry
     *  write (`this.trades[k] = new ArrayCache (n)`, `this.ohlcvs[k][tf] = new ArrayCacheByTimestamp (n)`), which
     *  printWsCacheMapWrite prints as `CacheStore::put` / `CacheShelves::put2` around the constructor text. */
    rustWsCacheCtorSizeWrite(n: any, write: any): boolean;
    /** vi: a `Precise.string*` result moved at its last use into an operand of a `Precise.*` chain that is the whole
     *  write (`x = Precise.stringDiv (Precise.stringMul (local, y), ..)`): the written text is a `Precise` call either
     *  way (the `&Value` operand takes the moved string), so the receiver's decision does not read this local's type. */
    rustScalarPreciseFeed(n: any, write: any, declaration: any): boolean;
    /** `Precise.<op> (..)`: the hand-written `crate::precise::Precise` string math (a string or undefined). */
    rustPreciseStringCall(node: any): boolean;
    /** A String-helper result boxed as an object-literal value or as a one-level element write: the written
     *  place is a `Value` either way, so no other local's decision reads this one's type. */
    rustScalarBoxedField(n: any, write: any, declaration: any): boolean;
    /** A scalar read anywhere inside the source of an element write `m[k] = ..` (one level, any key): the written
     *  place is a `Value` slot of a map, so no other local's decision reads this one's type; the use itself was
     *  already accepted with its own form (box / native / arg). */
    rustScalarFeedsElementWrite(n: any, write: any): boolean;
    rustScalarCounterCond(node: any, name: string): string | undefined;
    /** One decided-bound mechanism for a parseToInt `Option<i64>` for-bound `n` (the oint kind already decided):
     *  ral-55e: its other uses meet typed arithmetic partners (rust55ePtiTypedPartners); ral-56n: or `j` is a `Value::Int`
     *  counter of this very ordered for-condition (paradex pro `j < numInGroup`). `is_less_than(Int(j), n)` is the `as f64`
     *  compare of `Some`, false on `None`. */
    rustDecidedOintBound(cond: any, n: any): boolean;
    /** ral-56n: `cond` is `i OP n` of `for (let i = <int>; ..; i++)` (a `Value::Int` counter) and `n` a const whose initializer is
     *  a ternary of two identifiers (each arm an `i64` local by its own decision). */
    rust56nTernaryCounterBound(cond: any, n: any): boolean;
    /** ral-56n: `const b = Math.ceil (x / y)` (whole initializer of a const). */
    rust56nCeilDivConst(d: any): boolean;
    /** ral-56n: an ordered compare (not equality) of a `for` `Value::Int` counter (int-literal start, `++` / `--` its only write)
     *  and a `Math.ceil` division const: the two operands, else undefined. */
    rust56nCeilCounterCompare(node: any): {
        counter: any;
        bound: any;
    } | undefined;
    /** ral-56n: `is_less_than` & co. compare both `as_f64` payloads, false for a `Null` side: the `Some` payload against the
     *  counter's f64 (`(i as f64)` for an `i64`, `i.as_f64().unwrap_or(NAN)` for the `Value::Int` counter). */
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
    /** A sync venue method (not a base one) every venue declaration of which returns `int`: it keeps its
     *  `-> Value` signature and dispatch arm, and its result holds an `Int`, read once as an `i64`. */
    rustVenueIntCall(node: any): boolean;
    /** A venue string-method result: typed only when no use boxes it back or hands it to another local
     *  (each would copy the `String`). */
    rustVenueScalarSource(init: any): boolean;
    rustVenueLocalHandedOn(declaration: any): boolean;
    /** ral-wa: the whole right side of an `x = <call>;` statement writing a nil-declared (`let x;`) local: the
     *  venue result moves into the `Option<String>` local as printed (no box, no copy). */
    rustNilVenueWrite(node: any): boolean;
    private static readonly RUST_NIL_ELEM_STR_KEYS;
    /** ral-xa: `m['symbol']` as the whole right side of `x = m['k'];` into a nil-declared local, printed as an owned
     *  `KeyRead::key_read(..)` temporary the checker types string: the string moves out of that temporary
     *  (`.into_opt_string()`: `Some` for a `Str`, `None` otherwise, as `as_str()` reads it), so no copy is added. */
    rustNilElemStrText(node: any): string | undefined;
    /** ral-xa: `x = y;` into a nil-declared local, `y` a `Value` local of the same function the checker types string
     *  (initialised, typed by no scalar / nil / reader rule) at its last use: `y.into_opt_string()` moves the string out. */
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
    /** od: `handle*` results are their own group's producers; the lending rules leave them alone.
     *  ral-qd: a venue `parse*` string result lends like any other venue string (`Value::from(x.as_deref())`
     *  at each copying box: the copy the `Value` clone made). */
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
    /** A price / size argument of an order-book side's `x.store(price, size)`: the hand-written runtime
     *  `Value::store` / `store_to_bids|asks` take `impl Into<Value>`, so a Copy number passes as-is
     *  (`From<Option<f64>>` / `From<Option<i64>>` give the same `Value::Null` the box held). */
    rustSideStoreArg(n: any): boolean;
    /** The bare `format!(..)` a string concat prints as (its `Value::Str(..into())` box peeled), else undefined. */
    rustScalarFormatText(node: any): string | undefined;
    /** How a use of a scalar local prints: `test` (literal/null compare), `cond` (bool condition),
     *  `write` (same-kind assignment statement), `concat` (a `format!` operand) or `box` (a by-value `Value` slot). */
    rustScalarUseForm(n: any, kind: string): string | undefined;
    /** ral-70f: a read of a ral-70f reader local (rust70fReaderLocal) no other rule prints, used whole as a call argument, the
     *  value of `a = x` / `a[..] = x`, a property value or an array element (through parentheses and `as string`): the box
     *  converts the `Str` / `Null` the boxed reader held, cloned unless it is the last use (ccxt's narrowStrNullLocals pass
     *  printed exactly `x[.clone()].map(Value::from).unwrap_or(Value::Null)` there). */
    /** ral-70f: the identifier under `(x as string)` / parentheses (or `n` itself). */
    rust70fCastBase(n: Node): Identifier | undefined;
    /** ral-70f: `access` is (through parentheses) the target of an assignment or update, or a `delete` operand. */
    rust70fWriteTargetKey(access: Node): boolean;
    /** ral-70f: `n` reads a ral-70f reader local and is (through parentheses / `as string`) the whole key of a write target. */
    rust70fWriteKey(n: Node): boolean;
    /** ral-70f: `x[0] === 'c'` / `!==` (one-character literal, either side) on a ral-70f reader local: the boxed element read was
     *  the first character of the `Str` (`Null` for `None`, empty or out of range), so the test is
     *  `x.as_deref().unwrap_or("").starts_with("c")` (ccxt's narrowStrNullLocals pass printed this). */
    rust70fFirstCharTest(node: BinaryExpression): string | undefined;
    /** ral-70f: `n` sits inside the left side (target chain) of an assignment. */
    rust70fInWriteTarget(n: Node): boolean;
    rust70fOperandBox(n: Node): boolean;
    /** sb: a Copy number local (`i64` / `f64` / `Option<..>`) initialised from a typed base call that the `Value` local only boxed
     *  (`Value::from(self.parse_to_int(..))`) keeps the typed value and boxes it at any plain read no other rule prints natively:
     *  `Value::from(x)` is the Int / Float / Null the `Value` local held (the same conversion the initialiser did), and a Copy
     *  value boxes with no clone. Writes, nested-write operands, element keys and receivers keep their own rules. */
    rustSbCopyBoxUse(n: any, kind: string): boolean;
    /** sb: `const x = this.m(..)` where `m` is a typed base method / runtime call (no `safe*` / `handle*` reader). */
    rustSbTypedCallInit(declaration: any): boolean;
    private rustSbPartnerMemo;
    /** sb: typing this local could flip another local's decision (it meets another identifier in a compare / arithmetic /
     *  `Math.*` / ternary, or initialises / is written into another local): those partners belong to other groups. */
    rustSbHasPartner(declaration: any): boolean;
    private rustSbJoinMemo;
    /** ral-68a R3: `recv.join('<sep>')` (an identifier or `this.<field>` receiver the checker types as an array) that is the
     *  whole right side of a statement `x = ..` into an identifier: every printed join form answers a `Str` (a non-list
     *  receiver joins to `""`), never `Null`. */
    rust68aJoinWrite(node: any): boolean;
    /** sb: `xs.join(sep)` as a local's initializer: every printed join form is `Value::Str(<String>.into())` (a non-list
     *  receiver joins to `""`, never `Null`), so the local is that `String`. Only at a declaration initializer. */
    rustSbJoinShape(node: any): boolean;
    /** 51k: the join is one arm of a ternary initializer of a plain identifier whose other arm is a string literal. */
    rust51kStrTernaryJoin(node: any): boolean;
    /** The `String` inside the printed join, printed at emission only (a print inside a decision perturbs other locals);
     *  any other printed form reads its `Str` back (`join` always answers a `Str`). */
    rustSbJoinText(node: any): string;
    /** sb: an identifier initializer naming a local already decided as a shared `Dict` (decided before this one: no pending cycle). */
    rustSbDictAliasSource(init: any): boolean;
    private rustHandedPending;
    /** sb: the alias declaration shares its source's Arc (`Value::from(&x).into_dict()`, the bump the `Value` alias made). */
    rustSbDictAliasDecl(declaration: any): boolean;
    private rustSbAliasDeferred;
    /** ral-44c: the aliased parameter is read again after the alias declaration (or the alias sits in a loop): the
     *  alias copies the Arc; otherwise the parameter moves into it, as the boxed alias did at its last use. */
    rustParamReadAfter(declaration: any): boolean;
    /** ral-44c: write forms of a params alias that answer a map on every path: `omit` of the alias itself, or `extend`
     *  whose every operand is a proven untagged map (`extend` answers `Value::Map`). */
    rustParamsAliasWrite(rhs: any, declaration: any): boolean;
    /** ral-44c: `let y = params` of a typed unified method's `params`: the alias takes the map behind the boxed parameter
     *  (`params.clone().into_dict()`, the same Arc bump the boxed alias paid); the parameter itself stays readable. */
    rustParamsAliasDecl(declaration: any): boolean;
    rustAssignmentOpKind(op: any): boolean;
    /** ral-ua: `acc += x` (statement) with `acc` a checker-string local the solve leaves boxed (its decision is not taken
     *  during seeding: the join is assumed, then re-checked) and `x` a `string | undefined`, within the 400-char line. */
    rustPlusEqualsJoinOperand(n: any): boolean;
    /** ral-46d: `n` reads a local declared `const f = m['<opt flag>']` off a loaded market struct (`Option<bool>` field). */
    rustMarketFlagFieldLocal(n: any): boolean;
    /** ral-80e: `n` names a single-binding `const` local with an initializer (no later write is possible). */
    /** ral-84e: `n` is a leaf (through `!`, parentheses, `&&` / `||`) of the right side of a statement `y = <logical>` whose
     *  target y is an `Option<bool>` local and whose logical rust67bBoolLogicalWrite admits (printed `Some(<condition>)`). */
    rust84eOptBoolWriteLeaf(n: Node): boolean;
    rust80eConstDecl(n: any): boolean;
    /** ral-80e: every read of `n`'s local is (through parentheses and casts) a whole `Math.min|max` argument: typing it would
     *  only move the conversion from the declaration to the box at the call (not a lift), so the Math box form refuses it. */
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
    /** `rustLocalLastUse`, also admitting earlier reads in the same statement that end before the hand-off: the
     *  condition of a ternary whose branch holds the use, and the target of `x = f(.., x, ..)` (written after). */
    rustOwnedLastUse(node: any, declaration: any): boolean;
    rustLocalLastUse(node: any, declaration: any): boolean;
    rustWsSettleCall(call: any): boolean;
    /** ral-73c E1: `const e = new XError (msg)` (a ccxt error class the printer routes to `crate::exchange_errors::<x>(msg)`,
     *  which returns `ExchangeError`) in a non-test function, never written, whose every use is the settled value of a ws
     *  `client.reject (e, ..)` (rustWsSettleCall: `err: impl Into<Value>`, the same `From<ExchangeError>` box the `Value`
     *  local took at its declaration). Decided from the AST and the checker's symbols. */
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
    /** A `this.client(url)` local whose every use the handle serves: a handle field read (not after a
     *  write of that field) or write, a `resolve|reject|send|future|reusableFuture` call, or a hand-off
     *  (`client.as_value()`) as a call argument or the returned value. */
    rustClientHandleTypedLocal(plan: any, refs: any[]): boolean;
    /** The ws `Client` class or a class extending it (`WsClient`, what `this.client(url)` returns). */
    rustClientHandleClassType(type: any): boolean;
    /** `client.<field>` on the planned handle: its plan, field and whether it is written; undefined
     *  when the access is not on the handle or reads a field after the method wrote it. */
    rustClientHandleAccess(node: any): {
        plan: any;
        key: string;
        write: boolean;
    } | undefined;
    /** ral-80b: a `const client = this.client (url)` local whose declaration has not printed yet. A scalar decision made
     *  ahead of the method's print (a key local's use walk) would otherwise see `declOk` false and refuse every handle
     *  key use; the declaration prints `let mut client: Value = self.client(..)` on one line (the declOk test) when its
     *  initializer is that call over an identifier, string literal or property access argument. Decided from the AST. */
    rust80bClientDeclPending(plan: any): boolean;
    rustClientHandleReceiver(plan: any, field: boolean): string;
    /** `client.<field>` as the handle's field (`top`: only for a local declared as the handle, ahead of
     *  the native map reads; otherwise the last resort of the property printer). */
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
    /** `delete client.subscriptions[k]`: the handle drops the live entry and its snapshot entry. */
    printClientHandleDelete(node: any): string | undefined;
    /** `client.subscriptions[k] = v`: the handle writes the live client and its snapshot. */
    printClientHandleSubscriptionWrite(left: any, right: any): string | undefined;
    /** A bare use of a local declared as the handle hands the `Value` handle on. */
    printClientHandleUse(node: any): string | undefined;
    /** The planned `client` local: declared as the handle, or printed as usual with a mark where the
     *  handle binding goes. */
    printClientHandleDeclaration(node: any, identation: number): string | undefined;
    /** After a method body printed: the handle binding of a touched `client` param (returned, for the
     *  body head) or local (spliced at its mark). */
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
    /** rd: a box at a slot where the `Value` form cloned the local (a `this.`/`super.` argument, an object-literal value,
     *  a dict write, an array element): lending the `String` there costs that same one copy. */
    rustLendSlot(n: any): boolean;
    /** rd: a `format!` string local whose every use is a `this.`/`super.` argument (lent: the copy the `Value` clone made)
     *  or a moving last use (`return`, a final error message, the last box). */
    rustFormatLendLocal(declaration: any): boolean;
    /** A bare argument of a `this.` / `super.` call: ccxt's arg pass clones the `Value` local there, so a typed
     *  string re-boxed at that slot pays the same one copy (`Value::from(x.as_deref())` / `x.clone().map(..)`). */
    rustScalarSelfArgBox(n: any): boolean;
    /** A local keyed on a field and re-boxed anywhere but a moving use would copy where the `Value` moved. */
    rustFieldKeyCostly(declaration: any): boolean;
    /** rf: the map `m[k] = v` writes into is not a call-bound local that a typed key turns into an IndexMap bearer (its
     *  `.as_map().cloned()` copies the map out of the `Value`; bitvavo `limits`). A literal-bound map, or one whose insert
     *  stays the guarded `if let Value::Dict(..)` write, takes the key text with no copy. */
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
    /** ral-59p: `n` is the whole key of `delete X[n]` as an expression statement. The delete prints the key either into
     *  provenDictFieldDelete's native `shift_remove` (borrowing the `&str`: a `None` key removes nothing, as the `Null` key
     *  matched no `Value::Str` arm) or into the `remove` helper as `&Value::from(..)` (the `Str` / `Null` the box held). */
    rust59pDeleteKeyUse(n: any): boolean;
    /** ral-59p: a local typed for a `delete` key (`dkey`) that is also an `in` key boxed into `in_op` (`inbox`) stays `Value`:
     *  its `Value` print took the borrowed `in` test, the typed one would box into the helper. */
    rust59pDeleteKeyInboxed(declaration: any): boolean;
    /** `m[k] = v` as a statement: the element key of a native insert. */
    rustElemInsertKey(n: any): boolean;
    printElemKeyInOp(key: any, obj: any): string | undefined;
    /** ral-58k: `n` is the whole right side of a statement `this.f[k] = n`, `k` another identifier (decided from the AST). */
    rust58kThisFieldIdentKeyWrite(n: any): boolean;
    /** ral-68f: `n` (or `(n as string)`, through parentheses) is an argument of a `new X (..)` / `new m[k] (..)` expression that is
     *  not thrown, and `n` reads a base-reader local. */
    rust68fNewArgCast(n: any): boolean;
    /** ral-70f: a non-test local declared `this.safeString (o, k)` (any key) or `this.safeStringLower|Upper (o, 'lit')`, two
     *  arguments, base reader (rust64bReaderLocal): the boxed reader is `Str` or `Null`, exactly its `_opt` twin. */
    rust70fReaderLocal(declaration: Node, cast?: boolean): boolean;
    rust70fWritten(declaration: VariableDeclaration): boolean;
    /** ral-64b: a local declared from a base safeString-family reader with no default argument (its box is `Str` or `Null`). */
    rust64bReaderLocal(declaration: any): boolean;
    rustThisFieldLiteralWrite(n: any): boolean;
    /** ud: `n` is the whole right side of `x[k1][k2] = n` with `x` a typed two-level local map (`rustNestedBearerInsert`). */
    rustUdNestedBearerValue(n: any): boolean;
    /** ral-68a R2: `n` is a property value inside an object literal (possibly nested in further object literals) that is the
     *  whole right-hand side of a statement `x['a']['b'] = {..}` the printer prints itself (rustBearerLitChainValue). */
    rust68aBearerLitChainLiteralValue(n: any): boolean;
    /** ral-55k: `n` is the whole right side of a statement `x['a']['b'] = n` with `x` a typed one-level map bearer and both keys
     *  plain string literals (rustBearerChainedWrite prints the two-level guarded native insert). */
    rustBearerLitChainValue(n: any): boolean;
    /** ral-56k: `n` is a key of a statement `x[k1][k2][k3..] = v` (three or more keys) with `x` a typed one-level map bearer
     *  (rustBearerChainedWrite's deep form): 'first' for k1, 'later' for any other key, else undefined. */
    rustDeepBearerChainKey(n: any): 'first' | 'later' | undefined;
    /** ral-53i: `n` is k1 or k2 of a statement `x[k1][k2] = v` with `x` a typed two-level local map (`rustNestedBearerInsert`). */
    rustUdNestedBearerKey(n: any): boolean;
    /** ral-53i: `key` is k1 of a statement bucket seed `x[k1] = {}` or k1 / k2 of a statement write `x[k1][k2] = v` with `x`
     *  a plain identifier (syntax only: the two-level bearer prints these through rustNestedBearerWriteKey). */
    rustNestedWriteKeyPosition(key: any): boolean;
    /** ral-53i: `n` keys a bucket seed `x[n] = {}` or a write `x[k1][k2] = v` of a typed two-level local map `x`. */
    rustNestedBearerKeySlot(n: any): boolean;
    /** ral-65b: `n` is a direct operand of a `+` chain forming the whole right side of `this.f['lit'] = ..` (a statement)
     *  and that chain prints as one `Value::Str(format!(..))`. */
    rust65bThisFieldConcatOperand(n: any): boolean;
    /** ral-65b: `n` is the receiver of a no-argument `.toString()` reached through a parenthesised `as string` cast. */
    rust65bCastToStringRecv(n: any): boolean;
    rustScalarInNestedWrite(n: any, boxUse?: boolean): boolean;
    /** ral-41f: a local whose kind the nested-write text passes never decide: declared with an initializer that is
     *  not a safe* reader call, not `undefined` / another identifier (nil-declared and alias locals keep their own
     *  rules) and not returned by its function (binance pro `stream`: its safeString local written whole into
     *  `this.options[..][..]` and returned would move the method's return type to `Value` and add a dispatch arm). */
    rustNestedWriteFreeLocal(n: any): boolean;
    /** `this.balance|options[..][..]` with at least one hop below the field (the r05 receiver chain). */
    rustNestedFieldChain(access: any): boolean;
    /** The statement write `this.F[..][n] = v` whose last key is `n` and whose other operands never name `n` or `this`
     *  (the r05 insert keeps the helper for a value reading `self`). */
    rustNestedFieldKeyUse(n: any): boolean;
    /** int37: `k` is a local read by a `this.safeString*` reader with no default (may be undefined); its identifier. */
    rustSafeStrNoDefaultKey(key: any): any;
    /** ral-54k: `this.F[k1][n]` (exactly one upper hop) with `k1` such an int37 key: the upper key, else undefined. */
    rustNestedFieldEntryKey(access: any): any;
    /** ral-56f: `n` is the one upper key of a statement write `this.F[n][k2] = v` (F balance / options, non-test) whose last
     *  key is a string literal or an `nkey` local and whose value never names `n`: printNestedFieldKeyWrite prints the
     *  bucket entry (`entry(<n key text>).or_insert(Null)`) and the insert itself, so no ccxt pass reads a boxed `&n`. */
    rustNestedFieldUpperKeyUse(n: any): boolean;
    /** `this.F[..]['lit'] = n` (statement): the value slot of a nested plain-field insert. */
    rustNestedFieldValueUse(n: any): boolean;
    /** ral-68h: `n` is the receiver of a two-argument `n.padStart|padEnd (..)` call (TS `String.prototype` method). */
    rust68hPadReceiver(n: any): boolean;
    /** ral-68h: the last key of `this.F[..][k] = n` is a string parameter of the enclosing method (pro requestId
     *  `this.options['requestId'][url] = newValue`): the insert prints the same helper call with its own key text, the
     *  value slot takes `Value::from(n)` (the Int / Float the `Value` local held). Decided from the parameter's
     *  declaration (checker type `string`, never reassigned in the body) and `n` not naming the key. */
    rust68hNestedParamKey(access: any, n: any): boolean;
    /** Assignment hook: the r05 insert of a nested plain-field write keyed by a typed string local. */
    printNestedFieldKeyWrite(left: any, acc: string, value: string): string | undefined;
    /** ral-70f: `this.F[k1][k2] = v` (F balance / options, one upper hop) whose upper key `k1` is an `Option<String>` ral-70f
     *  reader local (int37 key) and whose last key is a string literal or a plain `Value` binding (bullish handleBalance
     *  `this.balance[tradingAccountId]['info'] = message`): the bucket entry ccxt's plain-dict pass printed of the r05 insert
     *  when the key was the boxed local (`entry(stringify_param(&k1))`, narrowed by narrowStrNullLocals to the local's own
     *  text). A value reading `self` keeps the helper chain. */
    print70fUpperEntryWrite(left: ElementAccessExpression, acc: string, value: string): string | undefined;
    /** ral-56f: the bucket entry of a `ukey` upper key (rustNestedFieldUpperKeyUse), keyed by the local's own text (the
     *  string `stringify_param` made of the boxed local, `"null"` for `None`); a value reading `self` is bound first. Over
     *  the line budget the helper chain takes the key as a `Value` (`From<Option<&str>>`, the one allocation). */
    printNestedFieldUpperKeyWrite(left: any, acc: string, value: string): string | undefined;
    /** ral-62k: `n` is the last key of a statement write `x[..][n] = v` whose chain root is a plain local identifier
     *  (two or more hops) and whose value never names `n` or `this`. */
    rust62kLocalNestedLastKey(n: any): boolean;
    /** ral-63k: `n` is the whole key of a statement write `x[n] = v` whose receiver is a local declared by a call (never an
     *  object literal: ccxt's literal-map pass keys on the boxed key text), whose value never writes `n` and never names `this`. */
    rust63kLocalFlatHelperKey(n: any): boolean;
    /** ral-65k: the flat helper write `x[k] = v` (rust63kLocalFlatHelperKey) whose value may read `this`: the key is a
     *  `String` local initialised by a ternary of two string literals, so its lent box is the very `Str` the `Value` held. */
    rust65kThisValueOk(write: any): boolean;
    /** ral-63k: `n` is the last key of a statement write `p[..][n] = v` whose chain root is a plain-Dict parameter. */
    rust63kDictParamNestedKey(n: any): boolean;
    /** ral-61k: `n` keys a middle hop of a statement write `this.balance|options[..][n][..] = v`: an element read whose
     *  receiver is itself an element read and which is itself the receiver of the outermost written element access. */
    rust61kNestedFieldMiddleKey(n: any): boolean;
    /** `this.f` (one level, no element read in between). */
    rustThisFieldTarget(node: any): boolean;
    /** `n` is (inside) an argument of a call that lies within `root`, the call itself not being `n`. */
    rustInsideCallArgument(n: any, root: any): boolean;
    /** A write source the local's type holds exactly: a same-kind value, a typed scalar local of the
     *  same kind, or a ternary of those (its condition printed as a bool). */
    rustScalarWriteOk(kind: string, rhs: any, depth: number): boolean;
    /** ral-54e: `x = i` (statement write) where `i` is the counter of an enclosing `for (let i = <int>; ..; i++)` that only the
     *  step writes (rustValueIntCounter: always an `Int`) and the write sits in that loop's body: the `i64` the counter holds. */
    rust54eCounterWrite(node: any): boolean;
    /** Plain `Value` argument slots: `this.`/`super.` methods without a native-typed slot, and `Precise.*`. */
    rustNilBoxSlotOk(call: any, at: number): boolean;
    /** Test tier: a call of the harness (`exchange.m(..)` on the base `Exchange`, `testSharedMethods.m(..)`) whose
     *  printed callee takes every argument as a by-value `Value` (no native-typed slot). */
    rustTestHarnessSlot(call: any): boolean;
    /** ExchangeOps methods (rust/tests/src/test_helpers.rs) whose argument is not a plain `Value`. */
    static RUST_TEST_NATIVE_SLOT_METHODS: Set<string>;
    /** Native right-hand side of `x == <literal>` for a scalar local of `kind`; undefined when not exact. */
    rustScalarLiteralTest(kind: string, other: any): string | undefined;
    /** Equality hook: `x.is_none()`, `x.as_deref() == Some("lit")`, `n == 5`. */
    printRustScalarLocalEquality(left: any, right: any, op: any): string | undefined;
    /** Condition hook: a `bool` scalar local is its own condition. */
    printRustScalarLocalCondition(node: any): string | undefined;
    /** The needle of a base `inArray` call outside the test crate: the hand-written `in_array(needle: impl InArrayNeedle, ..)`
     *  takes a typed string / integer lent as `&x` (`None` matches Null, a value the element its box would equal). */
    /** vg: element locals printed as a borrowed `Option<&str>` off their list (`recv.get(i).and_then(Value::as_str)`). */
    private rustBorrowedStrElems;
    /** vg: `const k = recv[i]` where `recv` is a local list every element of which is a string (`Object.keys (..)`, a literal of
     *  string literals) and every use of `recv` is an element read or `.length` (never written, pushed, moved or handed on, so the
     *  borrow stays valid while `k` lives and no non-string can reach `k`: out of range reads `None`, the `Null` the box held).
     *  Every use of `k` reads the borrow: literal tests, `format!` operands, map-key reads / `in` tests, and boxes at a call
     *  argument, object-literal value, array element, dict write or `+` operand (`Value::from(k.as_deref())`: the copy the `Value`
     *  clone made, never more). */
    rustBorrowStrElem(declaration: any): boolean;
    /** ral-41g: `const g = m[k]` (k the use `n`) where `g`, or a same-named local of the method, is the receiver of a `.push (..)`. */
    rustElemKeyFeedsPushedLocal(n: any): boolean;
    /** wg: a `string[]` / `Strings` parameter whose list holds only strings: declared so by the base tier (a unified method:
     *  its callers are the typed API and `fetch2`), or proven at every call site of a venue-private method. */
    rustStrListParam(param: any, depth: number): boolean;
    /** wg: the declared (checker) type is a list of strings (`string[]`, `Strings`). */
    rustStrArrayDeclared(node: any): boolean;
    /** wg: a call argument that is a list of strings: a literal of string-typed elements, a local list initialised so (or by
     *  `Object.keys`) and only ever pushed string-typed values, or a proven parameter of the caller. Producers of user data
     *  (`safeList`, a declared `string[]` return) prove nothing about their elements. */
    rustStrListArg(arg: any, depth: number): boolean;
    /** wg: the element read prints straight off the list place (`xs.get(i)..and_then(Value::as_str).map(str::to_owned)`), so
     *  the declaration and every use agree on the borrow (no temporary it could outlive; a helper read keeps `Value`). */
    rustBorrowPlaceRead(declaration: any): boolean;
    private static readonly RUST_BORROW_STR_METHODS;
    /** wg: `k.m (..)` with `m` a pure string method (reads the receiver, returns a fresh value). */
    rustBorrowStrMethodRecv(n: any): boolean;
    /** ral-57f: `bucket` (`this.F[k]`) is the receiver of a plain two-level read `this.F[k][k2]` that is no assignment
     *  target, update, delete or deeper chain link, in a non-test source. */
    rustFieldBucketChainRead(bucket: any): boolean;
    /** ral-56f: `read` (`this.F[k]`) is an argument of a `this.` call that is the whole value of the statement write
     *  `this.F[k] = this.m (.., this.F[k], ..)` whose key admits the bucket reread. */
    rustFieldBucketRereadUse(wrapped: any, read: any): boolean;
    /** ral-59k: `this.F[k] = v` where every read of `k` in `v` is the key argument of a base `this.safeDict (this.F, k, ..)`
     *  on the same field (woo pro handleBalance `this.balance[code] = this.extend (this.safeDict (this.balance, code, {}), account)`):
     *  the printer binds the value before the insert, so the reader's boxed key and the insert key text are one copy each,
     *  as the `Value` key cloned at the reader and stringified at the insert. Non-test sources; decided from the AST. */
    rust59kFieldSafeDictReread(n: any, access: any, value: any): boolean;
    /** ral-59k: `n` is the reader key of a statement `this.F[k] = v` that rust59kFieldSafeDictReread admits. */
    rust59kFieldSafeDictReaderKey(n: any): boolean;
    /** ral-59k: `m` is the key argument of a base `this.safeDict (this.<field>, m, ..)`. */
    rust59kFieldSafeDictKeyArg(m: any, field: string): boolean;
    /** ral-56f: every read of `k` in `value` is `this.F[k]` on the written field (no write of `k`), and some other use of
     *  `k` is a two-level upper key of the same field (rustNestedFieldUpperKeyUse). Non-test sources. */
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
    /** ral-50e: the `key` parameter (slot 1) of the generated base `safeDict`: prints `impl Into<crate::Value>` and binds
     *  `let mut key: Value = key.into();` (every `Value` argument still passes; a number local passes unboxed). */
    rustSafeDictKeyParam(param: any): boolean;
    /** ral-50e: a local read only as base `safeDict` keys (its `any` checker type comes from an `any` operand such as
     *  `response.length`): an `i64` the printer proved passes there as the Int its box held, so the checker's `any` is moot. */
    rustSafeDictKeyOnlyLocal(declaration: any): boolean;
    /** ral-56n: every read of the local is a bound (argument 0 / 1) of a loose `Value` slice (rust44bValueRecvSliceBound), where
     *  an `i64` reads as the `Int` box the helper's looseI64 match took (paradex pro sbeReadAddress `next = i + 1`). */
    rust56nSliceBoundOnlyLocal(declaration: any): boolean;
    /** ral-56n: a loop counter read as a bound of a loose `Value` slice (the typed bound text is `i` / `Some(i)`). */
    rust56nCounterSliceBound(n: any): boolean;
    /** ral-56n: `x = i` as a whole statement into another local (boxed `Value::Int(i)` or the bare i64 of an int local). */
    rust56nCounterPlainCopy(n: any): boolean;
    /** ral-51e: `+` / `-` over int literals, `i64` scalar locals and the counter of an enclosing `for (let j = <int>; j < <i64 local>; j++)`
     *  whose body never writes it (the counter the loop prints as an `i64`; while the scope solves it is not registered yet). */
    rustCounterArithInit(expr: any, declaration: any): boolean;
    /** ral-57e: `j * <int literal>` (either order) over a `for (let j = <int>; ..; j++)` counter only the step writes
     *  (rustValueIntCounter, always an `Int`): the
     *  printer already spells it `(j * k)` on the `i64` counter, the `Int` the runtime product of two Ints answers. */
    rust57eCounterProduct(node: any, declaration: any): boolean;
    /** ral-57e: `n` is an operand of a base `this.sum (n, <int literal>)` that is itself a base `safeDict` key: with `n` an
     *  `i64` the sum prints as the native `i64` add (rustArithCallKind 'int') and boxes once into the key slot as the Int
     *  the runtime `sum` of two Ints answers. */
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
    /** INT-48: the one `as T` decision shared by ral-40a (`(x as string)` read-through), ral-40b (`as T` write operand)
     *  and the ral-40h alias rules: peel parens and `as` assertions (only `as string` when `stringOnly`), counting the
     *  assertions; the assertion prints nothing, so the operand is what every rule decides on. */
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
    /** ral-65x: `x.toString()` of an `Option<String>` local that can never hold `None`: the checker types this read
     *  `string` and every write of the local (initializer included) is a string the checker types `string` where it is
     *  written (a required string parameter, a guarded non-undefined local, a literal or a `+` chain with a string literal
     *  operand). The `Value` form's `format!` then displayed a `Str` box, so the local itself is the same text. */
    rust65xNeverNullStrRecv(recv: any): boolean;
    /** ral-48f: `x.toString()` read as a `+` operand, `x` a destructured handle*AndParams slot or a local declared `Str` whose
     *  initializer is such a slot read whole (the slot and the alias are decided together by the joint scalar solve). */
    rust48fSlotAliasConcatRecv(call: any, recv: any): boolean;
    /** `padStart(N, "c")` / `padEnd(N, "c")`: a literal width (0..4096) and a one-char alphanumeric / space pad, the
     *  helper's one-char arm, which `format!` width (counted in chars, never truncating) reproduces. */
    rustStrPadArgs(args: any[]): {
        width: number;
        pad: string;
    } | undefined;
    /** Literal `slice(a)` / `slice(a, b)` bounds the closure-free char form handles: `b >= 0` and `a >= 0` when `b` is given. */
    rustStrSliceBounds(args: any[]): {
        start: number;
        end: number | undefined;
    } | undefined;
    /** 41b: `slice(a)` / `slice(a, b)` whose bounds are not both literal, each an `i64` / `Option<i64>` operand (literal, typed
     *  integer local, arithmetic or `.length` of typed operands): the start as `i64` (a `None` start is the helper's `0`) and the
     *  end as `i64` or `Option<i64>` (`None` is the helper's missing end, the char length). */
    rustStrSliceVarBounds(args: any[]): {
        start: string;
        end: string | undefined;
        endOpt: boolean;
    } | undefined;
    /** 41b: the char slice of the `&str` `s` with `i64` bounds, clamped as the helper's `Str` arm (a negative bound counts from the
     *  char length floored at 0, a bound past the end is the length, `b <= a` is empty). */
    rustStrSliceVarText(s: string, b: {
        start: string;
        end: string | undefined;
        endOpt: boolean;
    }): string;
    /** 41b: an affix / includes needle as `Option<&str>`: any string literal (an empty one included when `empty`), a typed string local
     *  or a string-typed `Value` expression (`None` for `Null`: the helper answers `false`). */
    rustStrVarNeedle(node: any, empty: boolean): string | undefined;
    /** ral-58k: `x.replace (o, to)` where exactly one operand `o` is an `Option<String>` local (decided from the AST: a typed
     *  string identifier) and the other a never-`Null` operand. The boxed form answered the receiver itself when `o` was `Null`
     *  (`recv.as_str().zip(o.as_deref()).map(..).unwrap_or_else(|| recv.clone())`): the native form keeps that arm. */
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
    /** ral-60p: `p` (`m[k]`) is a read (not a write target, not a delete operand) whose receiver is a plain identifier bound by a
     *  `const` declared in the same function as the key's declaration `keyDecl`. */
    rust60pLocalMapRead(p: any, keyDecl: any): boolean;
    /** 41b: a local some use of which is a ws subscription / future / cache key, a ws client call argument or a ws cache
     *  write key: those keep their `Value` (the new string-method forms never decide them). */
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
    /** ral-64n: the sole argument of `s.split(..)` when it is `(d as string)` (parentheses / a `string` assertion only) over an
     *  `Option<String>` local `d`; a bare identifier keeps the old decision (no assertion, no new form). */
    rust64nOptSplitDelim(call: any): any;
    /** ral-64n: `n` (through its parentheses / `as string`) is the delimiter `rust64nOptSplitDelim` prints from the local. */
    rust64nOptSplitDelimUse(n: any): boolean;
    /** `s.slice(a)` / `s.slice(a, b)` on a typed string local with literal bounds (a non-negative end): the runtime's
     *  char-indexed slice without a closure. A start past the end clamps to an empty `skip`, `b < a` takes nothing (the
     *  helper's `i <= j` arm), a negative start counts from the char length floored at 0; a `None` receiver is `Null`. */
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
    /** 51k: `a % b` over int literals / `int` / `oint` locals with a non-literal divisor (a parseToInt answer, a const int):
     *  an `Option<i64>` (`mod_val` answers `Int(a % b)`, `Null` for a zero or `Null` operand). */
    rust51kLitModKind(node: any): string | undefined;
    /** The exact kind an expression shape yields over typed operands, else undefined. */
    rustScalarExpressionKind(expr: any): string | undefined;
    private static readonly RUST_ALWAYS_INT_CALLS;
    rustArithCallKind(expr: any): string | undefined;
    /** The clock is a base property bound to `Date.now`, so its signature resolves outside the base tier. */
    rustArithBaseCallee(node: any, name: string): boolean;
    /** An operand's numeric kind; a never-null integer call (e.g. a literal-defaulted reader) prints natively too. */
    rustArithOperandKind(node: any): string | undefined;
    /** zb: an arithmetic side's kind: a typed scalar shape, else a typed-signature numeric parameter read
     *  (`now - limit * duration`: `limit` holds only `Int` or `Null`, so the Option arm equals the helper's). */
    rustArithSideKind(node: any): string | undefined;
    /** ral-55e: `this.parseToInt (..)` (a base method of the typed-return table, no venue override) as an arithmetic side:
     *  the runtime answers `Option<i64>` (`Int` or `Null`), exactly what the boxed helper operand held. */
    rustArithTypedIntCall(node: any): string | undefined;
    /** ral-55e: a binary initializer with a typed parseToInt side (`time * this.parseToInt (x)`). */
    rustArithTypedIntSide(node: any): boolean;
    /** zb: the numeric kind of an unwritten typed-signature parameter read (`oint` / `onum` / `int` / `num`), else undefined. */
    rustArithParamKind(node: any): string | undefined;
    /** A combinator over a typed operand prints native and boxes its result once. */
    printRustArithCall(node: any): string | undefined;
    /** qb: a local whose initializer prints as an inline `if` / `match` (a ternary, or runtime arithmetic): the
     *  ternary / match result family. Reader, self-call, nil-declared and element-read locals belong to other families. */
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
    /** ral-68a R1: an identifier read of an unwritten parameter whose typed signature slot is `&str` / `Option<&str>`
     *  (decided from the signature table / per-venue string slot, never from printed text). */
    rust68aStrParamWrite(node: any): boolean;
    private static readonly RUST_PARAM_READ;
    rustOptParamText(kind: string, node: any): string | undefined;
    rustScalarParamRead(node: any): {
        kind: string;
        text: string;
    } | undefined;
    rustScalarRecvName(node: any): string;
    rustScalarParamOperand(node: any): boolean;
    /** `p === undefined ? d : p` (or `p !== undefined ? p : d`) over a typed optional parameter `p` and a
     *  literal or typed local `d`: never `Null`, printed `p.as_i64().unwrap_or(d)`. */
    rustOptParamDefault(node: any): {
        kind: string;
        text: string;
    } | undefined;
    rustOptParamCapped(kind: string, param: any, present: any, d: any): {
        kind: string;
        text: string;
    } | undefined;
    rustOptParamWriteOk(kind: string, node: any): boolean;
    /** yb: `!x` over a `bool` scalar local outside a condition and outside any logical: `Value::Bool(!x)`, the box the
     *  `!is_true(&x)` form got (`is_true(&Value::Bool(b))` is `b`). */
    rustValueNotOfBoolLocal(node: any): string | undefined;
    /** `a || b` / `a && b` whose every leaf is a native `bool` and one is a `bool` scalar local: JS returns an
     *  operand, which is then a boolean, so the Rust `||` / `&&` value is the same. */
    rustScalarBoolLogicalText(expr: any): string | undefined;
    /** ral-43a: `!x` / `x || y` / `x && y` (nested, parenthesised) whose leaves are identifiers of locals declared in the
     *  same function (never a parameter or a member): the shape the bool seed above reads through the solver. */
    rustBoolLeafLogical(expr: any): boolean;
    /** Native `bool` text of a comparison proven native, `!x`, a bool local, or `&&`/`||` over those. */
    rustBoolNativeText(expr: any): string | undefined;
    /** Native text of an ordered/equality comparison over typed operands (`dry`: shape check only). */
    rustScalarCompareText(node: any, dry: boolean, literalKind?: string): string | undefined;
    /** `x == p` of a typed scalar local `x` and a `Value` local `p` whose initializer and every write print
     *  one scalar family or `Null` (`Str|Null` / `Int|Null`): `is_equal` on those operands is exactly the
     *  variant compare (`Null == Null`, `Str == Str` by text, `Int == Int`, else false), so the typed side
     *  compares its own `Option` against `p.as_str()` / `p.as_i64()`. Both read in place, no copy. */
    /** A use that boxes the local as the key of an `in` test before its last use (read there by reference, so the box copies). */
    rustScalarBorrowedBox(declaration: any): boolean;
    /** The local is one side of `x === y` / `x !== y` against a `Value` partner (`rustScalarValuePartnerTest`). */
    rustScalarHasPairEquality(declaration: any): boolean;
    rustScalarValuePartnerTest(typed: any, other: any, kind: string, sign: string, dry: boolean): string | undefined;
    /** qf: the `Option<&str>` text of a typed string local keying an `in` test (`inbox` use), else undefined:
     *  `Some(k.as_str())` / `k.as_deref()`, so a native `contains_key` reads it without the box (`None` misses like `Null`). */
    rustInKeyTypedText(key: any): string | undefined;
    /** ral-80b: the key of `k in client.subscriptions|futures` the client handle does not serve (read after the method wrote
     *  that field): ccxt's container pass folds that `in_op` into its own membership test only for a bare `Value` key, so a
     *  boxed typed key would leave the helper call. Decided from the AST (the handle plan). */
    rust80bClientStateInKey(n: any): boolean;
    /** td: the left operand of a `k in obj` test that is `k` itself or `k` under parens / `as` casts, else undefined. */
    rustInKeyTop(n: any): any;
    /** The key local of an `in` test has a non-null initializer (nil-declared locals are left to their own rule). */
    /** ral-65b: `k in client.subscriptions|futures` keyed by a typed `Option<String>` reader local (rust65bWsInKey): the
     *  dict-shaped membership test of the client field read, with the key boxed as the `Value` local held it (a `None` key
     *  is `Null`, which never matches a `Str` key: the `in_op` answer) */
    print65bWsInKey(left: any, right: any): string | undefined;
    /** ral-65b: `n` is the bare key of `n in client.subscriptions|futures` on a ws `Client` that the handle does not print. */
    rust65bWsInKey(n: any): boolean;
    rustInKeyInitialised(n: any): boolean;
    /** ral-84c R3: `n` names a nil-declared `let k: Str = undefined` local (rust84cNilStrInKey). */
    rust84cNilStrKeyLocal(n: Node): boolean;
    /** ral-84c R1: a nil-declared `let k: Str = undefined` (one declarator, a `let` statement) keys an `in` test too: the
     *  nil-scalar rule types it `Option<String>`, and the `inbox` key reads `None` as a miss exactly as `in_op` read the
     *  `Null` the `Value` local held (latoken parseTicker / parseTrade / parseOrder `symbol in this.markets`). */
    rust84cNilStrInKey(declaration: VariableDeclaration): boolean;
    /** qf: a typed local against an untyped `Value` partner (a local or parameter) that the checker types like the local:
     *  the `Value` pair printed `a.<payload>() == p.<payload>()` (PAYLOAD_ACCESSORS by checker kind), and the typed local
     *  is exactly `a.<payload>()` (`None` where the `Value` was `Null`), so the same compare reads `own == p.<payload>()`.
     *  ral-59n: an `Option<i64>` local prints `Value::from(x).as_f64()` (the very `as_f64` of the box it held, no closure),
     *  and the partner may also be a base `safe*` scalar read off `this` (rust59nValueReaderPartner), which prints a `Value`. */
    rustScalarPayloadPartnerTest(self: any, partner: any, kind: string, sign: string, dry: boolean): string | undefined;
    private static readonly RUST_59N_VALUE_READERS;
    /** ral-59n: some read of the local is the argument of an element access `m[x]` (decided on the TS AST). */
    rust59nKeysElementRead(self: any): boolean;
    /** ral-59n: `this.safeString|Integer|Number|Bool(..)` declared in the base tier (no venue override): printed as the
     *  generated `self.safe_*` reader, a `Value`. The boxed compare against it was the payload pair `a.<p>() == r.<p>()`
     *  (printNativeEqualityComparison, both sides `Value`, same checker kind), so the typed side prints its own payload. */
    rust59nValueReaderPartner(node: any): boolean;
    /** `'str'` / `'int'` when `p` is a plain `Value` local (no typed-local rule claims it) whose initializer and every
     *  write is a fresh `str|ostr|null` (`int|oint|null`) producer, written only by whole `p = ..` statements. */
    rustScalarValuePartnerKind(partner: any): string | undefined;
    private rustScalarPending;
    /** The partner is a local whose checker type is a string / number and whose initializer is a scalar reader shape. */
    rustScalarValuePartnerShape(partner: any): boolean;
    /** rd: the scalar-literal / boxed initializer shapes this rule owns: a literal, a `+`/arithmetic chain, a list `.length`,
     *  `indexOf` / `toString` / a string method, a clock or nonce, a `Math.*` or typed base call that is no `safe*` / `handle*`
     *  reader (readers, ternaries, aliases, element reads and nil-declared locals keep their own rules). */
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
    /** `a OP b` with an optional operand: `Some(..)` only when every optional side is present, as the helpers
     *  (`add`/`subtract`/`multiply`/`divide` by a non-zero literal) answer `Null` when either operand is `Null`. */
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
    /** Prints a method body; boxed expression-shape locals named on a printed line over 400 chars
     *  are left `Value` when that lowers the count of such lines. */
    printRustScalarGuardedBody(method: any, rawPrint: () => string): string;
    /** yd: index of the bracket closing the one opened at `open` (string literals skipped). */
    rustCloseBracketAt(text: string, open: number): number;
    /** yd: splits one printed statement line over 400 chars that names a guarded local by hoisting its FIRST evaluated
     *  operand into a let-bound typed temp on the line before (a move or a borrow, never a copy). Exact shapes only:
     *  `let x: T = self.f(..(Value::from(vec![..])));` (the list moves: `Vec<Value>`), `let x: T = (match R.get("k") {..` (the
     *  lookup borrows: `Option<&Value>`), `let x: T = (match (&(Value::from(self.parseToInt(..))), ..` (`Option<i64>`, moved into the box). */
    rustSplitLongLine(line: string, nth: number, after?: string): string | undefined;
    /** 42b: `format!("{}..{}", .., Value::Str(format!("{}..{}", a, b).into()), ..)` -> one `format!` with the inner arguments spliced in
     *  place. Only all-`{}` format strings (no literal text, no `{:?}`); the inner box is exactly one balanced `format!` slot. */
    rustFlattenConcatChain(line: string): string;
    rustSplitLongLines(text: string, names: string[]): string;
    /** ral-54k: `this.safeCurrencyCode (..)` (base reader, `string` return). */
    rustSafeCurrencyCodeInit(init: any): boolean;
    /** sd / ral-55f (one key path): the written value of `m[k] = v` assigns or steps the key local `k` itself. */
    rustInsertValueRewritesKey(key: string, value: any): boolean;
    /** `m[k] = v` with `k` a `String` local whose single-key write prints a native insert. */
    rustScalarInsertKeyUse(n: any): boolean;
    /** tb: a `networkIdToCode` result keyed into a map whose written value only READS it (`networks[k] = { 'network': k }`):
     *  JS evaluates the key before the value, and so does the printed `insert(key, value)`, so the key text is taken before
     *  any box in the value. Scoped to that initialiser (other key locals keep their own rules). */
    rustTbKeyReadOnlyInValue(n: any, value: any): boolean;
    /** ral-48i: `x['lit'][k] = v` with `k` a `networkIdToCode` local and `x` a typed one-level map bearer: the chained write
     *  prints `if let Value::Dict(__d) = x.entry(\"lit\"..).or_default() { make_mut(__d).insert(<key>, v) }`, whose key is the
     *  `stringify_param` text of the boxed local (`\"null\"` for `None`, as rustScalarOptKeyText prints). The key is taken before
     *  the value, so a value that only reads the key is fine (rustTbKeyReadOnlyInValue). */
    rust48iChainKeyUse(n: any): boolean;
    /** tb: `this.networkIdToCode (..)` (the base typed `Str` reader of a network id). */
    rustTbNetworkCodeInit(init: any): boolean;
    /** A key written `m[k as string]` / `m[(k)]`: the cast and parens print nothing, so the key is `k` itself. */
    rustKeyWrapped(n: any): any;
    /** The insert key of a `String` scalar local, else undefined. */
    rustScalarInsertKeyArg(keyNode: any): string | undefined;
    /** ral-55x K1: `let id = this.safeString(o, k)` inserted as `m[id] = v` only inside an `if (id !== undefined ..)` block: the
     *  insert never sees a `None` key, so the key text is the `Str` the boxed key held (removeRepeatedTradesFromArray `id`). */
    rust55xGuardedSafeStringKey(n: any, local: any): boolean;
    rustScalarOptKeyUse(n: any): boolean;
    /** ral-62k: every element read of the map `m` (declared by `declaration`) is keyed by `n`'s own binding; write targets
     *  (and hops of one) are not reads. */
    rust62kOwnKeyOnlyRead(declaration: any, name: string, n: any): boolean;
    /** ral-61k: `n` keys a read `m[n]` inside `v` of the statement write `m[n] = v` (same map and key bindings) on a typed
     *  one-level map bearer. */
    rust61kSelfReassignRead(n: any): boolean;
    /** ral-61k: `n` keys a statement write `m[n] = v` and every element read of the map `m` (declared by `declaration`) keyed
     *  by `n`'s own binding sits inside `v` of a write `m[n] = v` (the `m[k] = f(m[k])` self-reassign). */
    rust61kSelfReassignOnlyRead(declaration: any, name: string, n: any): boolean;
    rustScalarOptKeyArg(key: any): string | undefined;
    rustScalarOptKeyCount(declaration: any): number;
    rustScalarOptKeyCostly(declaration: any, kind: string): boolean;
    /** ral-55f: `this.F[k] = v` (statement) on a plain untagged field the printer inserts natively (printNativeDictInsert's
     *  field receiver, e.g. `options`): the printer prints the key text itself (`k.as_deref().unwrap_or("null").to_string()`, the
     *  one allocation `stringify_param(&k)` made), so the ccxt build/ key pass never sees a boxed key there. The value must
     *  not rewrite the key (binance pro authenticate `this.options[type] = this.extend (options, ..)`). Non-test sources. */
    rustPlainFieldInsertKey(n: any): boolean;
    rustScalarOptKeyText(key: any): string;
    /** The key is an element-read local (`const k = keys[i]`). */
    rustOkeyLocal(n: any): boolean;
    /** An element-read local keyed into maps stays `Value` when a box sits where the `Value` moved
     *  (an assignment source, an object-literal value, a `format!` operand, the last use): the typed local would clone there. */
    rustOkeyBoxed(declaration: any, boxed: number): boolean;
    /** 'map' for a typed map receiver, 'value' for a proven-dict `Value` receiver, else undefined. */
    rustOkeyKind(receiver: any, read: any): 'map' | 'value' | undefined;
    /** ral-63e: `m[k]` as the inner link of a pure read chain `m[k][j]` / `j in m[k]` (base featureValueByType `parentKey`):
     *  the link prints the same native map read a one-level `okey` read prints (`(if let (Some(__m), Some(__k)) = ..)`), only
     *  handed to the outer `get_value` / `in_op` by reference; the chain is never a write target, delete or update. */
    rust63eChainLinkKeyRead(n: any): boolean;
    /** A one-level read `m[k]` (not a write target, not a chain link) on an `rustOkeyKind` receiver. */
    rustOkeyReadUse(n: any): boolean;
    /** ral-43c: a one-level read `m[k]` (no write, chain link, delete or update) on an identifier parameter typed `any` that no
     *  typed-container rule holds: the boxed read is `get_value(&m, &k)`; the typed key is handed to `get_value` as is
     *  (`impl ValueKey` boxes it inside, so the lookup is the same `Str` / `Null` key the boxed read took). */
    rustAnyGetValueKeyUse(n: any): boolean;
    /** ral-64e: the bind `const b = m[k]` is a single-declaration statement whose next sibling statement is a compound
     *  statement (`if` / loop / block), not an expression statement: the local's mutation sits only inside that statement
     *  (base featuresMapper `featureBlock`), so no write-back statement follows the bind directly, and the element is read
     *  with the same `get_value(&m, &k)` call whatever the key's type (`impl ValueKey`). */
    rust64eNestedOnlyMutationBind(read: any): boolean;
    /** ral-49e: the read's checker type is a declared record (`Dictionary<Dict>` receiver): its bind prints as the held
     *  `Option<Dict>` form, which ccxt's `Value`-bind write-back pass never matched, so the borrowed key changes no write-back. */
    rustOwnKeysTypedRowRead(read: any): boolean;
    /** ral-49e: `k` is `const k = keys[i]` where `keys` is `const keys = Object.keys (m)` and `m` is the receiver's own
     *  declaration (a local of the same function): every key the list holds is a key `m` had when listed. */
    rustOwnKeysElementKey(recv: any, key: any): boolean;
    /** ral-yg: `this.urls['<lit>'][k]` read only (no write, chain link, delete or update) where `this.urls['<lit>']` is the
     *  base-declared string-keyed map (`rustUrlsMapEntry`): the native read takes the borrowed key off the map the boxed
     *  read reached (a non-map entry or a `None` key reads Null, as `get_value` did on a non-map or a `Null` key). */
    rustUrlsKeyReadUse(n: any): boolean;
    /** uh: the use's local is initialised by `c ? 'a' : 'b'` (both arms string literals). */
    rustStrLiteralTernaryLocal(n: any): boolean;
    /** ral-64k: `n` is the whole key of an element read `book[n]` (through `( .. as T)` wrappers) that initialises a local,
     *  on a typed ws order-book local whose use there is its `Value` box: `get_value` takes the key as `impl ValueKey`
     *  (`&str` / `Option<&str>` box to the very `Str` / `Null` key the `Value` local held), so the lookup is unchanged. */
    rust64kBookKeyRead(n: any): boolean;
    /** ral-65k: `n` is the whole key of `r[n]` where `r` is a const typed `Tickers` / `OHLCVsBySymbol` result local read
     *  through `KeyRead` (printTypedResultElemRead): both impls answer `read(&Value::Str(k))` with `key_read(k)`, so the
     *  borrowed `String` key reads the very entry the `Value` key did. */
    rust65kTypedResultKey(n: any): boolean;
    /** ral-64k: the read of a `bkey` use: `get_value(&<book box>, k.as_str() | k.as_deref())`. */
    print64kBookKeyRead(node: any): string | undefined;
    /** Element-access hook: the native read of an `okey` use. */
    printOkeyRead(node: any): string | undefined;
    private static readonly RUST_SCALAR_VALUE_OPERAND_OPS;
    /** A number local as one operand of `+ - * /` whose other operand prints as a `Value` (ordered compares keep their own native form). */
    rustScalarValueOperandUse(parent: any, n: any, kind: string): boolean;
    /** ral-84b: a nil-declared `let` whose current scalar decision (same scope solve) is a string kind. */
    rust84bStrNilPartner(d: any): boolean;
    /** rd: some `+` chain holding this local also holds a nil-declared local (typing this one would retype that one, which
     *  belongs to the nil-declared rules). */
    rustConcatWithNilLocal(declaration: VariableDeclaration, strNilOk?: boolean): boolean;
    /** rd: a `for (let i = <int>; ..; i++)` counter read in its own loop whose only write is the step: always an `Int`. */
    rustValueIntCounter(node: any): boolean;
    /** ral-76e: `c`, `c + k` or `c - k` (parentheses skipped) where `c` is an always-`Int` for counter (rustValueIntCounter) and
     *  `k` an int literal: the runtime value is an `Int` on every path. */
    rust76eCounterStep(node: any): boolean;
    /** ral-87rb R4: `node` is (inside parentheses) the initializer of a declaration (or an operand of one) whose every
     *  `this.sum (..)` use has only int-literal partners. */
    rust87rbSumLiteralOnly(node: Node): boolean;
    /** tb: `const b = this.parseToInt (..)` (an `Int`-or-`Null` producer, `i64` / `Option<i64>`). */
    rustTbParseToIntInit(declaration: any): boolean;
    /** 40d: `const n = this.safeInteger* (.., <integer literal>)`: the reader answers an `Int` on every path (parsed or the
     *  literal default), printed `i64` by the existing int reader form: an exact `i64` bound like a `parseToInt` one. */
    rustIntReaderLitDefault(declaration: any): boolean;
    /** ral-63n: `const x = this.safeInteger* (..)` with no default argument: the reader answers an `Int` or `Null`. */
    rust63nNoDefaultIntReader(declaration: any): boolean;
    /** ral-54n: `this.safeInteger* (..)` printed as its `Value` (an `Int` or `Null` on every path). */
    rustIntReaderCall(node: any): boolean;
    /** wi: a tuple slot whose producer builds an exact Int-or-null on every return (`checkOptionInteger`): an `i64` bound too. */
    rustTbExactIntSlot(declaration: any): boolean;
    /** ub: a `this.parseToInt(..)` call printed as its boxed `Int` / `Null` (`Value::from(self.parse_to_int(..))`). */
    rustUbPtiCall(node: any): boolean;
    /** ub: a compare partner that is not another group's local: a literal, call, element / property read, parameter,
     *  `for` counter or another parseToInt local (reader, ternary and nil-declared locals keep their own decisions). */
    rustUbPartnerInBucket(node: any): boolean;
    /** ral-55e: a parseToInt local whose every partner is one the 55e arms admit (a typed parseToInt-product const, a
     *  `Math.ceil` division const) or a for counter / literal: checked by the ub partner walk itself. */
    rust55ePtiTypedPartners(d: any): boolean;
    /** ral-55e: `Math.ceil (<x> / <y>)` as a declaration's whole initializer. */
    rust55eCeilDivInit(d: any): boolean;
    /** ub: a parseToInt local whose partner uses are all ordered / equality tests the solver prints with both operands
     *  decided (`rustScalarCompareText`): its plain reads box like any other typed base call result. */
    rustUbPtiPartnersDecided(declaration: any): boolean;
    /** ral-54e: `x = this.parseToInt (x + <int literal>)` (the write target, or the operand inside it): a self step of a
     *  parseToInt local stays inside the local (no other local meets it), so it does not make the local a partner. */
    rust54ePtiSelfStep(u: any): boolean;
    /** tb: `i OP b` as the condition of `for (let i = <int>; ..; i++)` (the step is the counter's only write, so it is always
     *  an `Int`), `b` a parseToInt `i64` / `Option<i64>` local: the counter operand, else undefined. */
    rustTbCounterBound(cond: any, n: any, kind: string): any;
    /** ral-63p: `i OP n` as the condition of `for (let i = s; ..; i++)` where `n` is a local initialised by a base
     *  `this.sum (..)` whose operands the scalar rule proves `i64` (rustArithCallKind 'int': the runtime sum of two `Int`s is
     *  that `Int`), and the counter `i` starts at an int literal or at an `i64` local (ral-58n) and is written only by its
     *  step, so it always holds an `Int`. Ordered compares of two `Int` payloads (`is_less_than` / `as_f64`) are the `as f64`
     *  compare of the two `i64`s, which printTbCounterBound prints (or the i64 counter plan's own `i < n`). */
    rust63pSumCounterBound(cond: any, n: any): boolean;
    /** tb: a use of the bound outside that for-condition meets another local (an operand, a write, another local's initializer or
     *  assignment source): those partners are other groups' decisions, so the bound keeps its `Value`. */
    rustTbBoundHasPartner(declaration: any, cond: any): boolean;
    /** tb: the for-condition of a `Value` `Int` counter (its i64 plan declined) against a typed parseToInt bound. */
    printTbCounterBound(node: any): string | undefined;
    rustScalarExprHasForCounter(node: any): boolean;
    /** ral-40a: the identifier under `(x as string)` (parens and a `string` assertion only), else undefined (rustAsOperand). */
    rustStrCastLocal(node: any): any;
    /** Use forms of the expression shapes: `native` (operand / receiver printed by the shape), `targ`
     *  (typed-signature argument), `err` (error message) or `box` (alias, key, push, initializer). */
    rustScalarExpressionUseForm(n: any, kind: string): string | undefined;
    /** `(x as string).split(..)` on a string local: the split prints from the local itself (`rustStrLocalSplitText`). */
    rustCastSplitRecv(cast: any): boolean;
    /** 42b: the `(x as string).indexOf("lit") >= 0` call of a scalar contains test. */
    rust42bCastContainsTest(call: any): boolean;
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
    /** Per ancestor class (nearest first): method name -> its LAST declaration; undefined when a
     *  parent class does not resolve. */
    private rustAncestorMethodTables;
    getMethodOverride(node: Node): Node;
    /** ral-57x: the method prints `-> Option<String>` whatever its literal-seeded string locals become: the signature head
     *  admits it and every return converts, a returned own literal-seeded local (checker `string`) counted as converting
     *  (as a `String` it is `Some(x)`; as a `Value` it is a checker-string `Value`: rustStrReturnValueConverts either way). */
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
    /** Every `return` of the method's own body converts, and the body's last
     *  statement is one of them (so Rust sees no `()`-valued tail the
     *  `-> Value` post-passes would have patched with `Value::Null`). */
    rustStrReturnPathsConvert(body: Block): boolean;
    /** A `return` value of a native-`Str` method: a nullish literal, an
     *  expression already printing an `Option<String>` (a nested retyped call
     *  or a typed string local), or a `Value`-printing expression the checker
     *  types `string | undefined`. */
    rustStrReturnValueConverts(expression: Node): boolean;
    /** An expression that already prints an `Option<String>` in a `: Str`
     *  method's return position. */
    rustStrNativeExpression(expression: Node): boolean;
    unwrapParensNode(node: Node): Node | undefined;
    /** The callee declaration behind `self.<method>(..)` when it is emitted
     *  `-> Option<String>`; undefined otherwise (no proof → keep the box). */
    private rustCallDeclarations;
    rustNativeStrCalleeKind(node: Node): string | undefined;
    /** `Option<String>` → `Value` (exact inverse of the return conversion). The operand is already a
     *  typed `String`, so the conversion is the standard `From` impl — no `|__s|` closure between them. */
    rustNativeStrValueBox(text: string): string;
    /** True when a call to a native-`Str` callee must be boxed back to a
     *  `Value` at this position; the declaration and return printers run the
     *  conversion themselves. */
    rustNativeStrCallNeedsBox(node: Node): boolean;
    /** Wrap a call text when the callee returns a native `Option<String>`
     *  and the position still needs a `Value`. */
    rustBoxNativeStrCallIfNeeded(node: Node, text: string): string;
    private declaredDictLocalsCache;
    /** All `let x: Value = <dict-proven initialiser>` declarations of the current
     *  source file, keyed by local name in declaration order. */
    rustDeclaredDictLocals(): Map<string, RustDeclaredDictLocalEntry[]>;
    /** Printer hook for the helper-removal units: the proven kind of a declared
     *  local, or undefined when the local is not proven Dict at every use.
     *  Accepts the receiver node of the helper call (identifier, `x['k']` chain,
     *  `this.x` chain) or the declaration itself. */
    rustDeclaredLocalTypeResolver(node: Node): RustDeclaredLocalKind | undefined;
    /** The table entry a use site resolves to (the declaration whose binding the
     *  use refers to, proven), or undefined. */
    rustDeclaredLocalEntry(node: Node): RustDeclaredDictLocalEntry | undefined;
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
    /** ral-87rh R1: `outer` is a plain read `<inner>['k']` (string-literal key) of `inner`: no write target, update, delete,
     *  call or deeper chain link. */
    rust87rhPrecisionRead(outer: Node | undefined, inner: Node | undefined): boolean;
    /** ral-87rh R1: a market struct local R1 freed (one of its reads is `m['precision']['k']`): its listed string fields box
     *  borrowed (`Value::from(m.f.as_str())`, the same `Str` the boxed key read copied), no field clone. */
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
    /** `rustLocalUsesAll` (property names skipped) for a market local; a same-named `let`/`const` in a sibling block
     *  is another Rust binding, so its uses are left to its own decision. */
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
    /** ral-65k: the checker types `k` as plain `string` (no `undefined` / `null` member). */
    rust65kPlainStringKey(k: any): boolean;
    /** `x` is read only: not written, deleted, updated or called. */
    rustTypedResultReadOnlyAt(x: any): boolean;
    /** Element-access hook: the native read of a typed result element, boxed through its shared record handle. */
    printTypedResultElemRead(node: any): string | undefined;
    /** `n` is the list argument of a base-tier `this.safeDict (n, i[, d])` whose index is an int literal, an i64 counter,
     *  an int scalar local or a number local seeded with an int literal. */
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
    /** Every use of the parameter is a side operation statement, a `length` read, a level read or a side-slot hand-on. */
    rustBookSideUsesOnly(param: any, allowNone: boolean): boolean;
    rustBookSideParamUncached(param: any): boolean;
    /** The argument lands in a side parameter slot of a `this.<m>(..)` call. */
    rustBookSideArgSlot(n: any): boolean;
    /** Argument text for a side slot: a side handle passes whole, anything else is wrapped once. */
    printBookSideArg(arg: any, identation: number): string;
    printBookSideLocal(declaration: any, indent: string, varName: string): string | undefined;
    /** `s.length` / `s[i]` on a side handle: the marker's own length and level reads. */
    printBookSideRead(node: any): string | undefined;
    /** A record element handle handed on whole (`list.push (r)`, `return r`) boxes the row's shared handle there. */
    printRecordElemBox(node: any): string | undefined;
    /** `let mut r: Option<&crate::types::T> = rows.get(i)` for a record element handle. */
    printRecordElemLocal(declaration: any, indent: string, varName: string): string | undefined;
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
    /** ral-46e: a venue (not base-tier) method declared `Market`, not async, no override, never referenced by name as a
     *  value, whose every return is `undefined` or a `safeMarket` record and that returns at least one of each
     *  (bitstamp `getMarketFromTrade`): `Option<crate::types::Market>`, `None` for the `undefined` return. Its by-name
     *  arm boxes with `IntoRaw` (`Null` for `None`, the record's `raw` otherwise), the value the `-> Value` method gave. */
    rustVenueReturnsOptMarket(node: any): boolean;
    /** `this.getMarketFromSymbols (..)` resolving to the typed base method (or a venue `rustVenueReturnsOptMarket` one). */
    rustIsOptMarketCall(init: any): boolean;
    /** ral-50c: `super.fetchOutcome (s)` in a prediction venue override declared with the outcome record (`super_fetch_outcome` answers `Option<Market>`). */
    rustSuperFetchOutcome(call: any): boolean;
    /** ral-50c: `c ? this.outcome (s) : {}` (either arm order): the outcome arm. Its local only takes key reads, where `None` reads as `{}` did. */
    rustOptOutcomeEmptyTernary(init: any): any;
    /** `c ? undefined : this.market (s)` (either arm order): the `this.market` arm. */
    rustOptMarketTernary(init: any): any;
    /** ral-45c: `c ? this.safeMarket (..) : market` (a lent market slot) or `c ? this.safeMarket (..) : undefined` (either arm
     *  order): the `safeMarket` arm and the other one. `safeMarket` never answers Null, the slot is `Option<&Market>`. */
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
    /** `m = s` as its own statement, `s` a `const s = this.market (..)` read only by key reads, null tests and
     *  this write (syntactic, so the two decisions never wait on each other): the alias source `s`. */
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
    /** A ternary arm reading a string field off a typed (non-`smkt`) market struct local: `str` for a
     *  `String` field, `ostr` for an `Option<String>` one, else undefined. */
    rustMarketArmStrKind(node: any): string | undefined;
    /** The native text of a `rustMarketArmStrKind` read for a local of `kind`. */
    rustMarketArmStrText(kind: string, node: any): string | undefined;
    /** The struct local behind an identifier use (never the declaration name). */
    rustTypedMarketLocalOf(node: any): any;
    /** `let mut market: crate::types::Market = …` — the typed call, its `Err` re-raised as the untyped call did. */
    printTypedMarketLocal(declaration: any, indent: string, varName: string): string | undefined;
    /** ral-84e: an equality arm (`m['inverse'] === true`, `t === 'inverse'`) of a ternary initializer of a `boolean` local whose
     *  native text exists: the arm prints that `bool` (rustScalarNativeText's ternary arm), the very `Bool` its box held. */
    rust84eBoolArmKind(arm: Node): string | undefined;
    private rust87reLocalSeeds;
    /** A `const x = <comparison>` initializer whose native text exists and whose local's checker type is `boolean`. */
    rustBoolCompareSeed(node: any): boolean;
    /** `m['symbol']` / `m.id` off a loaded `crate::types::Market` local: the field's own `String` / `Option<String>`
     *  (the boxed read cloned the same field), so a local initialised from it is a typed string. */
    rustMarketFieldScalar(node: any, placed?: boolean): {
        kind: string;
        text: string;
    } | undefined;
    /** ral-57k: an arm of `x = c ? m['quote'] : m['base']` (a statement write into an initialised local, kucoin parseTrade
     *  `feeCurrency`) whose other arm is a field read of the same kind off the same typed market local: the ternary is that
     *  one kind, each arm the very `key_read` the boxed form printed (`None` where it held Null). */
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
    /** A ws `super.parseX (x, market)` to a fixed-arity parser with a lent market slot: by-value locals are cloned
     *  as on the slice path (the parent call takes them by value). */
    printSuperMarketSlotCall(node: any, methodName: string, identation: number): string | undefined;
    rustSliceArgText(a: string): string;
    rustCalleeIsRuntimeBase(node: any): boolean;
    rustCallsTestExchange(node: any): boolean;
    rustCallsRuntimeHandle(node: any): boolean;
    printImplicitApiCall(node: any, methodName: string, identation: number): string | undefined;
    printTranspiledVariadicCall(node: any, receiver: string, methodName: string, identation: number): string | undefined;
    rustTranspiledCalleeParams(node: any, methodName: string): any[] | undefined;
    printArgsForCallExpression(node: any, identation: any): string;
    /** ral-67f: true when the value of a helper write `r[..][k] = v` reads the write's root: the same local identifier, or
     *  any `this` / `super` when the root is a `this.x` field (`&mut self.x` borrows all of `self`). */
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
    /** A bare local element of a `&[..]` argument slice or a `Value::from(vec![..])` list literal is moved into the
     *  temporary: it is cloned unless the printer marked it owned (`\u0004`: a `Copy` local or its last use). */
    static cloneSliceElements(text: string): string;
    private static readonly RUST_CACHE_CALL_HEADS;
    private static readonly RUST_CACHE_CALL_HEADS_TEST;
    /** A bare local argument of a cache / order-book call on a local (`stored.append(x)`) or a ws cache constructor
     *  is moved into the callee: cloned unless the printer marked it owned (`\u0004`). */
    static cloneCacheCallArgs(text: string, on: boolean, exchange: boolean): string;
    /** `set_value` / `append_to_array` / `add_element_to_object` take the value by move: a bare local final argument
     *  is cloned unless the printer marked it owned (`\u0004`). */
    static cloneHelperWriteValues(text: string): string;
    private static rustBalancedClose;
    private static rustSplitTopLevel;
    printCallHead(node: any, parsedExpression: string, parsedArgs: string): string;
    /** First parameter of a venue override of a lent `DerivedExchange` slot (same arity as the slot): `impl Into<crate::Value>`. */
    rustLentSlotParam(param: any): boolean;
    /** Parameters a method prints: a sync venue override of a `DerivedExchange` slot drops a trailing run of optional
     *  parameters its body never names when that leaves exactly the slot's arity (foxbit `parseTransaction (t, currency,
     *  since, limit)`): the override then matches the slot and is printed once, inside the trait impl. */
    rustPrintedParams(method: any): any[];
    /** A venue (not base-tier) method overriding a lent slot with the slot's arity. */
    rustLentSlotOverride(method: any): boolean;
    /** A sync venue method overriding a `DerivedExchange` slot with the slot's arity (its body may sit in the trait impl). */
    rustSlotOverrideBody(method: any): boolean;
    /** File of the base-tier class above the venue override `method` when it declares `name` (its base trait has the method). */
    rustBaseTierDeclarer(method: any, name: string): string | undefined;
    /** Trait path of a `this.m(..)` / ws `super.m(..)` call whose callee only one trait reaches unambiguously, from the AST:
     *  the calling file's own lent slot override lives only in the `DerivedExchange` impl (the base method of the same
     *  name takes a `Value`); inside any slot override (printed in the trait impl, closures included) both traits are in
     *  scope, so a base slot or another venue override is named by its base trait (what the inherent body resolved to;
     *  its preamble reaches the override). A ws `super.m(..)` to the REST parent's lifted override goes through the
     *  trait on the parent core (`receiver` 'parent'). */
    rustSlotCallPath(node: any): {
        path: string;
        snake: string;
        receiver: 'self' | 'parent';
    } | undefined;
    /** The whole call printed through its trait path (`rustSlotCallPath`), or undefined when method syntax stays. */
    rustSlotCallHead(node: any, args: string): string | undefined;
    printCallExpression(node: any, identation: any): string;
    printFreeFnDefaultArgsCall(node: any, identation: any): string | undefined;
    printDynamicSelfRead(node: any): string | undefined;
    printDynamicSelfCall(node: any, identation: any): string | undefined;
    printThisKeyword(node: any, identation: any): string;
    private static readonly RUST_ERROR_CONSTRUCTOR_ARGS;
    printErrorConstructorArg(name: string, index: number, node: any, identation: number): string;
    rustErrorConstructorName(className: string): string;
    printNewExpression(node: any, identation: any): any;
    /** ral-76a: a routed error constructor (returns `ExchangeError`) stored straight into an untyped local, by its
     *  declaration or by a plain `x = new XError (..);` statement, is boxed by the printer: the target is a `Value`. The
     *  ral-73c reject-only local keeps the bare `ExchangeError`. Decided from the AST parent chain, not printed text. */
    rustErrorCtorValueTarget(node: any): boolean;
    /** Printed class expression of a `new` whose class is a runtime value, else undefined. */
    rustDynamicErrorClass(node: any): string | undefined;
    /** `param.member` where `param` is a class-typed parameter, the member is
     *  string-typed and the read is a plain rvalue: `get_value_k(&param, "member")`. */
    printStringMemberOfClassParam(node: any, receiverText: string): string | undefined;
    printPropertyAccessExpression(node: any, identation: any): any;
    /** Methods whose Rust counterpart takes `&mut self`: a `self.<field>` read in
     *  their args must keep the `get_value(...)` shape the ccxt post-pass hoists. */
    static readonly MUT_SELF_METHODS: Set<string>;
    /** Global parse helpers that go native (`str::parse`) on a proven string arg,
     *  keyed to the rust integer/float type their runtime helper parses into. */
    static readonly RUST_PARSE_HELPERS: Record<string, string>;
    toSnakeCaseName(name: string): string;
    escapeRustStringLiteral(text: string): string;
    getCheckedTypeOf(node: any): Type | undefined;
    typeSymbolOf(type: Type): TsSymbol | undefined;
    /** Types declared outside ts/src (Date, Response, Array, Promise, …) are never
     *  backed by a plain `Value` map in the rust port. */
    isLibDeclaredType(type: Type): boolean;
    isClassInstanceType(type: Type): boolean;
    hasCallableShape(type: Type): boolean;
    isProvenListType(type: Type): boolean;
    /** True only for object types the rust port represents as `Value::Dict`
     *  (plain interfaces / index-signature / literal types — never classes). */
    isProvenMapType(type: Type): boolean;
    /** `undefined` / `null` / `void` / `never` — a union member that carries no
     *  runtime value; `Value::Null` is the only box these ever get. */
    rustTypeIsNullish(type: Type): boolean;
    isProvenMapExpression(node: Node): boolean;
    isProvenListExpression(node: Node): boolean;
    /** RHS of a generator destructure that provably holds a `Value::Arr`: the
     *  checker-proven list, or a call whose callee returns an array literal on
     *  every path. */
    rustNativeListSource(node: Node): boolean;
    /** `x.split(sep)` → the runtime `split`, which yields an array on every
     *  path (a non-string receiver gives the empty array, never a dict). */
    rustCallPrintsRuntimeSplit(node: Node): boolean;
    /** True when the call's value is always a runtime array: the `handle*AndParams`
     *  family and its exchange overrides declare `any`, so the checker cannot
     *  prove the `[T, Dict]` tuple the body always builds — walk the resolved
     *  callee instead. */
    rustCallReturnsProvenList(node: Node): boolean;
    private rustProvenListCall;
    /** Implementation of a `x.y(..)` call, when the checker resolves one. */
    private rustCalleeDeclaration;
    /** Every `return` in the function's own body builds an array literal, or
     *  delegates to a call that does. `throw` and fall-through (the printer's
     *  `Value::Null`) read the same through both forms. */
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
    /** Every boxed read of the slot keeps its statement within the 400-char line budget once the box text is added
     *  (a longer line would make the line guard veto other typed locals on it). */
    rustStrSlotBoxesFit(element: any, fn: any): boolean;
    /** Trial of the exact-slot route for a slot whose tuple decision is pending; its cache entry is restored after. */
    rustStrSlotExactRouteTakes(element: any, fn: any): boolean;
    /** wi: a bare read under `!` / `&&` / `||` whose whole logical sits in a slot the printer already prints `bool`
     *  (a condition, `Value::Bool(..)`, a `bool` local): the slot's truthiness, `None` (Null) false as `is_true`. */
    rustBoolSlotLogicalUse(n: any): boolean;
    /** ral-68d: the whole `&&` / `||` the leaf sits in is the initializer of a single-binding local the checker types
     *  `boolean` (or `Bool`), every leaf a boolean-or-undefined identifier / call (`const isStockOrUta = (isStockSpot || uta)`):
     *  the logical prints native (`is_true` over a `bool` is the identity), so the slot's truthiness reads the same. */
    rust68dBoolSlotLogicalInit(n: any): boolean;
    /** qe: `x === true` / `x !== true` on a bool tuple slot: the slot reads `as_bool() == Some(true)`, so the native
     *  bool answers the strict test exactly (Null and a non-bool are `false` on both sides). Never `=== false`. */
    rustBoolSlotTrueTest(n: any): boolean;
    rustStrSlotBoxUse(n: any): boolean;
    /** A `+` operand of a thrown error message: the statement diverges, so the slot moves into its `format!`. */
    rustStrSlotThrownConcat(n: any): boolean;
    /** wi: a `format!` concat operand (other side always a string) reads the slot in place with the text the
     *  boxed `Value::Null` displays (`null`), within the 400-char line budget. */
    private rustStrSlotConcatUses;
    rustStrSlotConcatUse(n: any, element: any): boolean;
    /** Read hook: a concat use recorded by the slot decision (no re-print here, the decision already measured it). */
    printRustStrSlotConcat(node: any): string | undefined;
    /** `x.clone().map(Value::from).unwrap_or(Value::Null)` at a boxed use of a typed string slot. */
    printRustStrSlotBox(node: any): string | undefined;
    /** The slot's final read: no later use, no other use in its statement, no loop or closure since the destructure. */
    rustStrSlotLastUse(node: any, declaration: any): boolean;
    /** An optional `params: Dict = {}` of a transpiled `handle*` / `fetchPaginatedCall*` method (the base one or a venue
     *  override): the argument rides in the `optional_args` slice, where a dict local is the shared map (`From<&Dict>`). */
    rustOptionalParamsSlot(call: any, arg: any): boolean;
    /** `Value::from(&x)` for a handed dict local riding in an optional params slot. */
    printOptionalParamsArg(node: any, text: string): string | undefined;
    /** `let mut a: Option<String> | bool = <temp>.get(i)..` for a typed tuple slot, else undefined. */
    printRustTupleSlotLocal(element: any, printedName: string, temp: string, index: number, nativeList: boolean, indent: string): string | undefined;
    private rustExactSlotDecisions;
    private static readonly RUST_EXACT_INT_PRODUCERS;
    private static readonly RUST_EXACT_BOOL_PRODUCERS;
    rustExactSlotKind(element: any): string | undefined;
    /** ral-44f: `oint` / `obool` for a `const [ a, .. ] = this.m (..)` slot the checker types number / boolean whose producer
     *  is exact at that index (`rustExactSlotCallee`, never the loose `f64` form), else undefined. Syntactic on the producer. */
    rustExactCopySlotSeed(element: any): string | undefined;
    /** ral-44f: `n` is the whole source of `let t = n` / `t = n;` (statement), `t` another local of the same function the joint
     *  scalar solve currently types `kind` (an `Option<i64>` / `Option<bool>` copy of the slot). */
    rustCopySlotAliasTarget(n: any, kind: string, element: any): boolean;
    private rustExactSlotKindUncached;
    private static readonly RUST_HANDWRITTEN_SLOT_KINDS;
    /** 41i: the primitive (`number` / `string`) slot `at` of `init` holds on every path when the checker only says `any`:
     *  a hand-written base producer from the table above (no venue redeclares it), or a venue-local method whose every
     *  return is an array literal with, at `at`, a `const` tuple slot of its own body proven the same way (depth-bounded). */
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
    /** `get_value(&X, &i)` for a checker-proven list `X` and a dynamic integer
     *  index local `i`: the runtime's own array branch, spelled natively.
     *  `get_value` reaches its array arm for an `Arr` receiver and its default
     *  (`Value::Null`) otherwise, so the emitted match reproduces both — an
     *  `Int` index by value (a negative or out-of-range index misses), a
     *  numeric string by parse, anything else a miss. */
    printNativeDynamicListIndex(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined;
    /** True when this read initialises a local that the very next statement in
     *  the same block mutates (`x['k'] = v` -> `add_element_to_object(&mut x…)`,
     *  `x.push(v)` -> `append_to_array(&mut x…)`). */
    isWriteBackBindRead(read: Node): boolean;
    /** ral-52e: `const e = xs[k]; e['f'] = v; ..; xs[k] = e;` -- the bind is followed only by top-level writes on `e` and then the
     *  source's own write-back at the same receiver and key text, so a cloned element read writes the same element back. */
    rustExplicitWriteBackBind(read: any): boolean;
    /** yb: the ccxt write-back pass (`writeBackIndexedMutations`) only fires when the line right after the bind is a top-level
     *  element / property write or push on the bound local; any other next statement (an `if`, a plain reassignment) leaves
     *  the bind alone, so its counter key may print boxed (`get_value(&xs, &Value::Int(i))`, the same helper call and value). */
    rustWriteBackPassBind(read: any): boolean;
    /** A statement containing a write into a local (`x['k'] = v`, `x.k = v`,
     *  `x.push(v)`). */
    rustStatementMutatesLocal(node: Node, name: string): boolean;
    /** A dynamic index the printer emits as a `Value` number: a `let x = <numeric
     *  literal>` declaration of the same function (the C-style loop counter).
     *  Any other shape keeps the helper — the printed local could be a native
     *  `i64`/`f64`, which the `Value` match would not compile against. */
    isRustValueIndexKey(node: Node): boolean;
    /** Strips `( )`, `as T` and `!` wrappers. */
    /** The first ancestor of `node` that is not a parenthesis / `as` / non-null wrapper. */
    rustSkipWrappersUp(node: any): any;
    rustSkipWrappers(node: any): any;
    /** The parameter declaration behind a receiver when its *annotation* proves
     *  a plain dict; undefined otherwise (no proof → keep the helper). */
    rustProvenDictParameter(node: Node): ParameterDeclaration | undefined;
    /** `Str` (`string | undefined`) — the key box is `Value::Str` or Null. */
    rustKeyIsProvenString(node: Node): boolean;
    /** The local/parameter proof of a dynamic-key map read: a parameter whose
     *  annotation proves a plain dict, or any local whose checker type
     *  proves a plain map and which nothing in the enclosing function
     *  re-assigns (D2). Returns the proven declaration. */
    rustProvenDynamicMapReceiver(node: Node): Declaration | undefined;
    /** The element-access read a key node belongs to (`x[k]`, `x[(k)]`). */
    rustElementReadOfKey(keyNode: Node): Node | undefined;
    /** `x[k]` where `x` is a proven-dict parameter and `k` a proven string. */
    printNativeDynamicMapAccess(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined;
    /** Keys `get_value` serves from the book store / cache bucket / live
     *  snapshot instead of the dict itself — a dynamic read cannot prove the
     *  key away, so a place named after one stays boxed. */
    rustNodeIsKeyUnsafePlace(keyText: string): boolean;
    private paramShadowCache;
    /** Functions whose shadow lines were actually emitted — a read converts
     *  only inside one of those (an arrow body prints inline and gets none). */
    private paramShadowEmitted;
    private rustParamShadowEmittedSet;
    rustParamShadowTables(): Map<Node, Map<string, RustParamShadow>>;
    /** Emitted shadow lines for a function, or '' when no parameter qualifies.
     *  The caller must use this before printing the body statements (it both
     *  registers the function as shadowed and computes the lines). */
    rustParamShadowLines(fn: Node, identation: number): string;
    private rustParamShadowTable;
    /** The shadow a read receiver resolves to, or undefined (no proof → helper). */
    rustParamShadowOf(node: Node): RustParamShadow | undefined;
    /** True when the enclosing function already binds this name somewhere. */
    private rustFunctionDeclaresName;
    private collectRustParamShadows;
    /** A checker-proven array parameter type (`Vec<Value>` on the rust side);
     *  tuples are excluded (their printed shape is not a plain `Vec`). */
    isProvenShadowListType(type: Type): boolean;
    /** Every reference to the parameter must be a printable read, and at least
     *  one must exist; anything else (a write, a `Value` pass-through, a Null
     *  comparison, a marker key) answers undefined and the parameter keeps its
     *  box. */
    private rustParamShadowUseCensus;
    /** One reference of a shadow candidate: true only for a read the shadow can
     *  print exactly (same proofs the emitted forms re-check). */
    private rustParamUseIsRead;
    /** A key a shadow read can print: dicts take a bare string literal or a
     *  proven-string place, lists a literal non-negative index; the `safe_*`
     *  inline takes the literal key form only. Marker-route key names and keys
     *  whose text needs escaping are excluded. */
    private rustShadowKeyIsReadable;
    private rustShadowKeyIsLiteral;
    /** Keys whose text is safe to inline into a rust string literal. */
    private rustShadowKeyLiteral;
    /** `this.safeString`-style callee of a call, or undefined. */
    private rustShadowSafeCallee;
    /** `x['k']` / `x[i]` / `'k' in x` on a shadowed parameter: the native read, or undefined to keep
     *  the helper (the shadow proof guarantees it never happens for an emitted shadow). */
    printShadowContainerRead(shadow: RustParamShadow, keyNode: Node): string | undefined;
    /** `'k' in x` on a shadowed dict parameter. */
    printShadowInOperator(shadow: RustParamShadow, keyNode: Node): string | undefined;
    /** A shadow dict key: an inlinable literal, or a proven-string plain place. */
    private rustShadowMapKey;
    /** `x.length` on a shadowed list parameter — `get_array_length` natively. */
    printShadowLength(node: any, shadow: RustParamShadow): string | undefined;
    /** The safe-read name when `this.safe<Type>(x, 'k'[, default])` reads a shadowed dict parameter with an inlinable
     *  literal key: printShadowSafeReadCall then prints `x.get("k")` and never borrows `self` for the call. */
    rustShadowSafeReadOf(node: any): string | undefined;
    /** ral-58x: the value expression borrows `self` when printed: it names `this` / `super`, except as the callee of a
     *  shadow safe read (rustShadowSafeReadOf), which prints a native read of the parameter (its default argument still
     *  counts). Decided from the node, not from its printed text. */
    rustValueBorrowsSelf(node: any): boolean;
    /** `this.safe<Type>(x, 'k'[, default])` on a shadowed dict parameter: the
     *  runtime helper's exact semantics over `.get(..)`. */
    printShadowSafeReadCall(node: CallExpression): string | undefined;
    /** The borrowed view bound by the shadow. */
    private static readonly PRO_HANDLER_SHADOW_NAME;
    /** TS helper name -> emitted match kind. */
    private static readonly PRO_HANDLER_SHADOW_SAFE_READS;
    /** The `message: Dict` parameter of a WS handler method (2nd param of a
     *  `handle*` method), undefined when unproven or written (D2). */
    rustProHandlerMessageParam(node: Node): ParameterDeclaration | undefined;
    /** D2: a write rooted at the parameter (reassignment, element/property
     *  write, a merge/splice onto it) can reshape the dict after the shadow is
     *  taken — the shadow is skipped and every read keeps the helper. */
    rustProHandlerParamIsWritten(param: ParameterDeclaration, name: string): boolean;
    /** Shadow plan for a handler: the parameter plus the two binding lines,
     *  present only when some body read actually turns native (no dead shed). */
    rustProHandlerShadowPlan(node: Node, identation: number): {
        param: ParameterDeclaration;
        lines: string;
    } | undefined;
    /** The `safe_*` call on the shadowed parameter prints as a native
     *  `.get("k")` match, or undefined when the call is not one. In `probe`
     *  mode the shape is checked without printing (the pre-scan must not print
     *  a node twice). */
    printProHandlerShadowRead(node: Node, probe?: boolean): string | undefined;
    /** A miss-arm default the match can hold: absent (`Value::Null`) or a
     *  literal; a computed default keeps the helper (its Value is not
     *  re-printable inside an arm without re-evaluating it twice). */
    /** vd: a no-default `safeInteger` / `safeString` / `safeNumber` read of the WS-handler shadow, printed
     *  straight into an `Option<i64>` / `Option<String>` / `Option<f64>` local. Same arms as
     *  `rustProHandlerShadowReadText` (so the same Null / wrong-kind answers as the `_k` runtime helper:
     *  a missing key, `Null`, an empty string, an unparsable string or any other kind is `None`), without the
     *  `Value` round trip and its `.cloned()` (the old line exceeded 400 chars and vetoed the typed local). */
    rustProShadowScalarText(kind: string, node: Node): string | undefined;
    rustProHandlerShadowDefaultShape(node: Node): boolean;
    rustProHandlerShadowDefault(node: Node): string | undefined;
    /** Exact native form of the runtime `_k` helper: same value kinds, same
     *  empty-string-is-missing rule, same default (verified against
     *  `exchange_stubs.rs`). `.cloned()` keeps the emitted line clone-free for
     *  the ccxt clone-pruning passes; the parenthesised `match` keeps the
     *  driver's `};` trailing-block replacement off the statement's `;`. */
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
    /** One dict-read site. `free` = closure-free text, `closure` = closure text, `helper` = the helper call;
     *  `guarded` = the helper form is kept when the closure would push the line over 400 chars. */
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
    /** `this.<field>[k]` with a non-literal key: the runtime reads the key as a Str and yields
     *  Null for anything else, which is `K.as_str()`; the field container is never tagged. */
    rustFieldDynamicRead(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined;
    /** A local whose declaration and every write pin a Dict. 'plain': fresh object literals and nullish only
     *  (never tagged by the runtime); 'dicty': also dict-only base callees (content unproven). */
    rustDictLocalProof(ident: Node): 'plain' | 'dicty' | undefined;
    /** 'plain' for a fresh object literal (or nullish when `allowNullish`), 'dicty' for a dict-only base callee. */
    rustDictSource(node: any, allowNullish: boolean): 'plain' | 'dicty' | undefined;
    /** `X[k]` on a proven local with a non-literal key. */
    rustLocalDictRead(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined;
    /** `X['k']` on a proven local, for a key the runtime does not route to a marker store. */
    rustLocalDictLiteralRead(receiverText: string, receiverNode: Node, keyText: string): string | undefined;
    /** `k in D` on a base-field / field-container map or a proven local: `in_op`'s Dict arm. */
    rustDictInOp(key: Node, obj: Node): string | undefined;
    /** `this.F['k1']['k2'] = v` as a statement on a base runtime-state field: the first hop is the map's own
     *  `entry`, the write below it an `insert`; a value that reads `self` keeps the helper pair. */
    rustFieldNestedInsert(node: Node, baseExpr: any, keys: any[], keyStrs: string[], rhs: string): string | undefined;
    /** `x[k] = f(x[k])`: the read sits in the value of an assignment the printer writes as a native
     *  insert (which binds the value first, `{ let __be_tmp = ..; insert }`), so the position rule that
     *  protects the helper-form write passes does not apply to it. */
    rustDictReadInNativeInsert(acc: string, receiver: Node, key: Node, chain: Node): string | undefined;
    /** Characters the ccxt clone passes add to a printed line afterwards: every bare local passed by value in a
     *  call or array-literal argument slot gets a `.clone()` (`autoCloneCallArgs` / `cloneInArrayLiterals`). */
    rustDictCloneGrowth(line: string): number;
    /** `this.<field>['k'].length`: a read-only use of a literal-key read off a base runtime-state field. */
    rustFieldLengthRead(acc: string, receiver: Node, key: Node, chain: Node): string | undefined;
    /** Statement-like nodes whose finished lines the 400-char budget is measured on. */
    private rustDictIsOwner;
    printNode(node: any, identation?: number): string;
    private printNodeUncloned;
    /** Print a statement; when a finished line of it passes 400 chars, decide each dict site against the
     *  line it sits on (the budget the closure-free / closure / helper forms are chosen under). */
    private rustDictPrintOwner;
    printNativeMapAccess(receiverText: string, receiverNode: Node, keyText: string): string | undefined;
    /** Keys `get_value(_k)` serves from the book store, a cache bucket or a
     *  live `__live_id` snapshot instead of from the dict itself: those routes
     *  are invisible to a plain map read, so they keep the helper. */
    static readonly RUST_DICT_LOCAL_UNSAFE_KEYS: Set<string>;
    rustDeclarationOfIdentifier(node: Node): Declaration | undefined;
    /** Initializer shapes that construct or return a plain dict. */
    rustDictProducingInitializer(node: Node | undefined, seen: Set<Node>): boolean;
    /** D2: the proof holds only while nothing re-assigns the local. */
    rustLocalIsReassigned(declaration: Declaration, name: string): boolean;
    /** True when the receiver is a local declared as (or provably holding) a
     *  plain dict — `get_value(_k)` and this read agree on every key the
     *  runtime does not route elsewhere. */
    rustIsDeclaredDictLocal(node: Node): boolean;
    /** The ws `OrderBook` class (`ts/src/base/ws/OrderBook.ts`): the rust port never
     *  builds a struct for it — `order_book()` returns a `Value::Dict` — so its
     *  element reads are plain map reads on a proven map. */
    rustWsOrderBookClassType(type: Type | undefined): boolean;
    /** Types the port stores as a plain `Value::Dict`: a checker-proven map, or the
     *  ws order book class. */
    rustDictBearerType(type: Type | undefined): boolean;
    /** A parameter declared as the ws `Client` class (or a union with it). The
     *  class is the default export of `ts/src/base/ws/Client.ts`, so its type
     *  symbol is named `default`; the declaration itself carries the name. */
    rustParameterIsClientHandle(declaration: ParameterDeclaration): boolean;
    /** The ws `Client` class (or a union with it); its type symbol is the file's `default` export. */
    rustIsWsClientType(type: Type | undefined): boolean;
    /** Constant string argument of `parseInt`/`parseFloat` folded the way rust's
     *  `str::parse` would; undefined when the fold is not obviously exact. */
    foldParsedStringLiteral(name: string, text: string): string | undefined;
    /** `parseInt(x)` / `parseFloat(x)` with a single checker-proven string argument
     *  become the runtime helper's own match with native `str::parse`; every other
     *  argument shape keeps the helper call the ccxt post-pass rewrites. */
    /** ral-41a: `parseInt (x as string)` whose one argument is the cast `top` of an `Option<String>` local. */
    rustParseIntOfOptStr(call: any, top: any): boolean;
    /** ral-73h: `str` / `ostr` when `arg` is a bare identifier of a typed string local (the one argument of `parseInt` / `parseFloat`). */
    rust73hParseStrLocalKind(arg: any): string | undefined;
    /** ral-73h: `n` is the sole bare argument of a global `parseInt` / `parseFloat` call. */
    rust73hParseArgUse(n: any): boolean;
    printNativeParseCall(node: CallExpression): string | undefined;
    isNodeInsideNode(node: Node, container: Node): boolean;
    /** Root place of an access chain (`x` for `x['a']['b']`, `this.balance` for
     *  `this.balance['usdt']`), or undefined for a temporary. */
    rootPlaceText(node: Node): string | undefined;
    /** The ccxt post-passes hoist `get_value(...)` reads out of `&mut` calls by
     *  matching their text; the native form is invisible to them, so it is only
     *  emitted where no such hoist is needed. */
    isNativeAccessPositionSafe(node: Node, ignoreAssign?: Node): boolean;
    /** `(x.k as T).push(..)`: the cast wrapper hides the push receiver from the position check. */
    isCastOrParenOperand(node: Node): boolean;
    /** Receiver shapes whose printed text is a single `Value` place (`x`, `this.x`). */
    isShallowValueReceiver(node: Node): boolean;
    /** True when this read is the receiver of an element-access chain that is
     *  written (`x['a'] = v`, `x['a']['b'] = v`, `delete x['a']['b']`), or a
     *  property write itself (`x.k = v`, `delete x.k`). The ccxt write passes
     *  match the `get_value(&…)` / `x.k` text to reach the real container, so a
     *  native read would write into a discarded clone. */
    isNativeWriteTargetBase(node: Node): boolean;
    transformPropertyAcessExpressionIfNeeded(node: any): string;
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
    /** ral-58n: the start identifier of a `for (let i = x; ..)` counter when `x` is a local the scalar rule decided `int`
     *  and the counter's own declaration is no typed local (it prints `Value::from(x)`, an `Int`), else undefined. */
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
    /** ral-45d: the local's own box as an argument of its string slot write (`[x, p] = this.m (.., x)`): it boxes the value the local
     *  holds before the slot is read back, lent (`Value::from(&x)`, `From<&Option<String>>`: `None` is the Null, `Some` the Str). */
    rustStrSlotSelfDefault(n: any): boolean;
    rustBoolSlotUsesOk(declaration: any): boolean;
    /** ral-87rb R3: `x === true` / `x !== true` reads a slot-written bool exactly: the slot prints `.as_bool() == Some(true)`,
     *  which is `true` for the very values the boxed `is_equal(x, true)` matched (a `false` / `null` compare would not agree on a Null slot). */
    rust87rbTrueTest(n: Node): boolean;
    /** The destructuring statement keeps the 400-char line budget with the slot's bool read.
     *  ral-46f: measured on the open print of the write with the bool slot read swapped in (was a length estimate that
     *  refused every write over 380 chars although the printed block line is split after `; ` by build/ `splitLongRustLines`). */
    private rustBoolSlotLineMemo;
    rustBoolSlotLineLong(n: any): boolean;
    /** The `usize` index text of a `Value` list read: a registered `i64` counter indexes directly. */
    rustI64IndexText(keyNode: any, place: string): string;
    /** A registered `i64` counter as a helper key (`Value::Int(i)`). zf: a read the ccxt write-back binds takes it too
     *  (`writeBackIndexedMutations` matches `get_value(&xs, &Value::Int(i))` and writes back at the same `Int` key). */
    /** ral-62n: the boxed key text of a typed `String` / `Option<String>` local keying a borrowed index read. */
    rust62nTypedStrKey(key: any): string | undefined;
    rustI64HelperKeyText(keyNode: any, read?: any): string | undefined;
    /** xb: a use of a registered counter in its own function, outside any scalar scope solve (decisions never see a trial counter). */
    rustI64CounterOperand(node: any): boolean;
    /** The registered counter's symbol when `node` is a use of it, else undefined. */
    rustI64CounterOf(node: any): any;
    private rustI64ClosedUses;
    rustI64CounterUse(node: any): boolean;
    /** True when every occurrence of `name` in the body printed as a `.get(name as usize)` read or a `Value::Int(name)` box.
     *  wb: a body that never reads the counter is closed too (only the step and the bound see it). */
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
    /** The `&&` / `||` / `!` chain around `node` ends in a statement or ternary condition (not a value the
     *  `-> Value` post-passes box by its `is_true` operands). */
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
    /** The object-literal block on its own (`{ let mut m = …; m }`) — the payload a
     *  `Value::Map(..)` box carries and the initialiser a typed dict bearer needs. */
    rustObjectLiteralBlock(node: any, identation: any): string;
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
    /** `Object.keys/values(x)` on a typed bearer — the map's own iterators. A bearer is built
     *  from an object literal, so the helper's ws/tag filters have nothing to strip. */
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
    printJoinCall(node: any, identation: any, name?: any, parsedArg?: any): string;
    /** ral-42f: `parts.join('-')` where `parts` is a never-reassigned local `this.arraySlice(<string[] local>, ..)`: every element is a
     *  `Value::Str`, so the helper's stringify is the identity (the form ccxt rustStringNatives printed after the fact). */
    printStrSliceJoin(node: any): string | undefined;
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
    /** ral-44b: `n` is a bound (argument 0 or 1) of `recv.slice(..)` whose receiver is no typed string local (looseSlice prints
     *  it), `n` an Int / Option<i64> local (not a ws key): the bound reads as the i64 / Option<i64> the helper's looseI64 match
     *  would have produced from the `Int` / `Null` box (start: `None` is 0; end: `None` is the length). */
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
    /** ral-46i (B219): a const `this.safeValue* (..)` result (not a ws client table) whose every use is a null test in a
     *  `bool` place: the presence flag `bool` (`x != Value::Null` once), each test reading the flag. */
    rustNullTestOnlyFlag(declaration: any): boolean;
    /** `X === undefined` / `X !== undefined` that is the whole `if` condition (parens allowed): '==' / '!='. */
    rustPresenceTest(n: any): string | undefined;
    printPresenceFlagTest(left: any, right: any, op: any): string | undefined;
    rustCatchBindingIsRead(block: Node, name: string): boolean;
    printTryStatement(node: any, identation: any): string;
    printReturnStatement(node: any, identation: any): string;
    printBreakStatement(node: any, identation: any): string;
    printContinueStatement(node: any, identation: any): string;
    printConstructorDeclaration(node: any, identation: any): string;
    printSpreadElement(node: any, identation: any): string;
    /** Base-tier methods whose every return is a fresh tag-free object
     *  literal (no venue override, no hand-written stub replaces them). */
    private static readonly RUST_PLAIN_DICT_BUILDERS;
    /** Base-tier `[Dict, Dict]` tuple helpers that hand back their `request` argument (index 1). */
    private static readonly RUST_REQUEST_TUPLE_HELPERS;
    rustNativeDictInsert(baseExpr: any, keyNode: any, keyText: string, valueText: string): string | undefined;
    /** A local (single binding in its function, no closure capture of a write)
     *  whose declaration and every write is a plain-dict source or nullish. A
     *  nullish value leaves a non-Dict, which `if let Value::Dict` no-ops on
     *  exactly like the helper's `_ => {}` arm. */
    rustLocalStaysPlain(ident: Identifier, depth?: number): boolean;
    /** `const [ x, p ] = this.handleUntilOption (k, r, …)` with `r` itself a
     *  plain local: element 0 is `r` handed back, and `x` is never re-written. */
    private rustTupleBindingStaysPlain;
    /** The shipped construction proof (literal-built local / handler tuple), read-only. */
    private rustShippedPlain;
    /** A use of the local: reads and element writes keep the box; a direct
     *  assignment must store a plain source; any other write shape rejects. */
    private rustUseKeepsPlain;
    /** `[ x, … ] = this.handleUntilOption (k, x, …)` — element 0 is the request
     *  argument handed back (base-tier implementation, no override). */
    private rustRequestTupleWrite;
    /** Element 0 of `this.m (…)` is a plain dict: `m` is the base-tier
     *  `handleUntilOption` (returns its `request` argument), or a method of the
     *  calling file (Rust calls it statically) whose every `return [ X, … ]`
     *  has X a plain literal / plain local, or a parameter whose argument here is. */
    private rustTupleHeadIsPlain;
    /** A pass-through parameter: never assigned in the method body. */
    private rustParamUnassigned;
    /** A value that is a fresh plain dict, nullish, or the local itself. */
    rustPlainSource(node: Node, name: string): boolean;
    /** The checker resolves the call to the base-tier implementation (a venue
     *  override could return anything). */
    private rustCalleeIsBase;
    /** The class property declaration behind `this.<name>` when its annotation proves a plain dict. */
    rustProvenDictThisField(node: Node): Declaration | undefined;
    /** `this.<field>[a]` whose declared field type's element type is itself a plain dict
     *  (`Dictionary<Dictionary<T>>`). */
    rustProvenDictThisFieldElement(node: Node): boolean;
    /** `this.<field>[k]` with a proven-dict field and a proven string key place. */
    printNativeThisFieldDynamicMapAccess(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined;
    private rustVecLocalDecisions;
    rustVecLocalIsTyped(declaration: any): boolean;
    rustVecLocalIsTypedUncached(declaration: any): boolean;
    /** The array literal's native `vec![..]`: elements are `Value`s taken by move, so a
     *  bare local is cloned (the boxed form relied on ccxt's argument-clone pass). */
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
    /** `rustLocalUsesAll` for a literal-initialised `let`/`const`: a same-named
     *  block-scoped binding elsewhere in the function is another symbol, so its
     *  uses are skipped instead of rejecting this local. */
    literalLocalUsesAll(declaration: any, name: string, acceptUse: (n: any) => boolean): boolean;
    literalKeyWidened(keyArg: string | undefined): boolean;
    /** `return x`, bare or under a cast: the statement leaves the function, so the box moves. */
    rustReturnOperand(node: any): boolean;
    /** `return x as T` / `return (x)`: the cast only narrows the TS type, the
     *  statement still moves `x` out once. */
    rustCastReturnOperand(node: any): boolean;
    /** The key of `x[k]` on a bearer built from an object literal, when `k` is a
     *  `string` local that prints as a plain `Value` (no typed-local rule claimed it). */
    rustLiteralBearerKeyArg(receiver: any, keyNode: any): string | undefined;
    /** A `string` key local that prints as a plain `Value`: the helper's own
     *  `stringify` of the key is the map key. */
    rustValueKeyLocalArg(key: any, text: string, receiverName: string): string | undefined;
    private rustDictBearerDecisions;
    /** Bearers whose escapes all box a clone (the prediction-tier multi-escape rule). */
    private rustDictBearerCloned;
    /** The single move of a literal bearer into a list element / a ws settle or send value (`rustLiteralMoveSlot`). */
    private rustLiteralMoves;
    /** `xs.push (m)` on an array-typed local, an element of an array literal (not a destructure target), or the
     *  value of a ws `client.resolve|reject|send (m, ..)`: each takes the boxed `Value` by value, so the map's last
     *  use moves into `Value::Map(m)`, exactly the shared map the boxed local handed over. */
    rustLiteralMoveSlot(n: any): boolean;
    /** ral-76g: the admitted move is a ternary arm (rust76gTernaryArmMove); a whole re-seed (`x = { .. }`, rustBearerRebuild)
     *  before it writes the same native map, so the single move still carries the last value. */
    rust76gTernaryMoveUse(n: any): boolean;
    /** ral-76g: `c ? x : y` / `c ? y : x` (x an arm, not the condition) as the initializer of a plain `const` / `let` or the value
     *  of an object-literal property: the if-expression's arms are `Value`, so the map's last use moves into `Value::Map(x)`
     *  there, the box the helper form made (no copy; the other arm is evaluated instead, never both). */
    rust76gTernaryArmMove(up: any, n: any): boolean;
    /** ral-73a: `y = x` (statement), y another plain `let` of the same function declared `undefined` (no initializer value) and
     *  annotated `NullableDict` / `Dict`: x moves whole into y's `Option<Dict>` / `Value` box (`Value::Map(x)`, the box the helper
     *  form made at the write; no copy) at x's last use. */
    rust73aNilDictAliasWrite(n: any): boolean;
    /** ral-73a: `this.f = x` (statement, a direct property of `this`, outside the test tier): the field is a `Value` slot that
     *  stores the reference, so a native map moves into it whole as `Value::Map(x)` at x's last use. */
    rust73aThisFieldStore(n: any): boolean;
    /** `client.resolve|reject (x, ..)` on a ws handle, x the settled value. */
    rustWsSettleMove(n: any): boolean;
    /** A prediction venue: `ts/src/prediction/<id>.ts` builds nested request maps in one method. */
    private static readonly RUST_PREDICTION_VENUE_FILE;
    /** The declaration behind `node` when it is a local typed as a dict bearer. */
    rustDictBearerDeclaration(node: any): any | undefined;
    rustDictLocalIsTyped(declaration: any): boolean;
    rustDictLocalIsTypedUncached(declaration: any): boolean;
    private rustReaderTables;
    rustReaderTableLocal(declaration: any, literal: any): boolean;
    /** Base `toArray(x)` / `arrayConcat(a, b)`: the hand-written runtime answers a `Value::Arr` on every
     *  path (a cache's entries, the list itself, a dict's values, `[]` for anything else). */
    rustAlwaysListProducer(call: any): boolean;
    /** A call that builds a fresh plain map — the request/params builders, `parseJson`, and the `handle*` family.
     *  The checker proves the result Dict-shaped and every copied map operand plain, so the bearer may be declared
     *  from the call and the box is cloned out once. */
    rustDictProducer(node: any): boolean;
    /** A map operand the producer only copies into a fresh map: built by the
     *  transpiler (literal / bearer / admitted producer) or a Dict-typed place.
     *  `any` is out — its content may carry a runtime tag. */
    copyOnlyPlainMap(arg: any): boolean;
    /** `x = this.extend(..)` on a bearer — the producer hands back a
     *  fresh map, so the local keeps its `IndexMap` type and the print clones the
     *  box out at the assignment. */
    rustProducerReuse(node: any): boolean;
    private static readonly RUST_DICT_PRODUCER_CALLEES;
    /** Builders that hand back one of their own arguments: the container kind is
     *  the argument's (they only add fields to it). */
    private static readonly RUST_BUILDER_PASSTHROUGH;
    /** Same pass-through builders (they write fields into their argument and return it), admitted only while the
     *  Arc-moving returned-container rule asks (`rustFreshWide`): the copying `IndexMap` bearer rules keep the old set. */
    private static readonly RUST_BUILDER_PASSTHROUGH_WIDE;
    private rustFreshWide;
    /** A pass-through builder's own object-literal argument (`safeTicker ({ .. })`, the venue parse* shape) is a leaf:
     *  `rustPlainDictLiteral` proves it without recursing, so it costs no proof depth (Arc-moving rule only, as the
     *  literal-initializer leaf). A `parseWsX -> parseX -> safeX ({..})` chain then fits the depth budget. */
    rustPassthroughLiteralLeaf(arg: any): boolean;
    rustBuilderPassthrough(method: string): boolean;
    private static readonly RUST_LIST_PASSTHROUGH;
    /** `x` read as the list argument of a base pass-through (`filterBy* (x, ..)` / `sortBy* (x, ..)`). */
    rustListPassthroughArg(node: any): boolean;
    rustListPassthroughCall(call: any): boolean;
    /** `this.<m>(…)` whose every return is a fresh untagged
     *  container of `kind` — the method's own body, no venue override (the
     *  checker resolves the most derived declaration for `this`). */
    rustCallBuildsContainer(call: any, kind: 'map' | 'list', depth?: number): boolean;
    /** A store write's value that can never be a container: a scalar literal, or a checker-primitive
     *  (`string`/`number`/`boolean`) expression. Writing it into a `this.` store tags no returned container.
     *  Maps only: a list proof would type `Vec<Value>` locals that copy the array out (`.as_array().cloned()`). */
    rustScalarStoreValue(value: any): boolean;
    /** A call operand that hands back a live-store map: `x.hashmap()` (the ws
     *  order/subscription cache) or a `.subscriptions` / `.futures` read. The
     *  runtime tags those dicts, so a write must reach the store. */
    rustInitReadsTaggedStore(node: any): boolean;
    /** qe: `rows.push (x)` into another local list, or `m[k] = x` into a local container that is not a tagged store
     *  (never `this.*`, `client.subscriptions` or a cache `hashmap()` read): the map enters the store whole, once. */
    rustLocalStoreHandOff(n: any): boolean;
    /** `this.<field>` or `this.<field>[…]` — a store the runtime may tag. */
    /** zf: `this.balance[..]` / `this.options[..]` (any depth): the plain untagged store maps the r05 insert writes into. */
    rustBalanceOptionsPlace(node: any): boolean;
    rustThisRootedPlace(node: any): boolean;
    /** Container kind an expression the callee body builds yields, or undefined.
     *  Shapes: a tag-free literal, a local that only ever receives element
     *  writes, a `this.` builder that copies plain operands, a pass-through
     *  builder of a built argument. */
    rustBuiltContainerKind(node: any, depth?: number): 'map' | 'list' | undefined;
    /** True when the only writes to this local inside its own function are
     *  element writes and container rebuilds (no whole-local write of another
     *  shape): the container it was built as is what it holds at every use. */
    private rustLocalContainerWritesOnly;
    /** An escape the printer boxes: a `return` of the local, or an argument of a
     *  `this.`/`super.` call. Anything else (a free-function argument) has no box
     *  site. */
    boxSiteOk(node: any): boolean;
    /** `Object.keys/values/entries`, `JSON.*`, `String(x)`, `typeof`-style readers: the printer
     *  emits them from the receiver's own text, so a bearer boxed there is a wasted clone. */
    nativeReadCallee(call: any): boolean;
    private static readonly NATIVE_READ_NAMESPACES;
    /** One `x[...]` use rooted at the bearer: a key read or a single-level `x['k'] = v`
     *  write. Chained reads stay native at the first level; a chained/compound write,
     *  `delete` and a call on the read reach the container through a `&mut Value`, so
     *  they keep the box. */
    rustDictBearerElementUse(access: any, name: string): boolean;
    /** ral-int45: a plain read `m[k]` whose key is a native optional string local (`Option<&str>` / `Option<String>`,
     *  e.g. a borrowed string element) or a plain `String` local: the map lookup by its `&str`. `get_value` answers Null for a
     *  Null key, and a bearer never holds the empty key, so `""` reads Null too. Never a write-back bind (ccxt's
     *  write-back pass reads only the `as_str()` form). */
    rustBearerTypedStrReadKey(access: any): string | undefined;
    /** ral-56k: `const b = m[k]; b.push (v);` with `m` a map-literal local, `k` a plain identifier key and `b` never reassigned and
     *  not mutated again by the statement after the push. The printer prints the push AND the write-back insert itself (arrPush),
     *  so the bind no longer leans on ccxt's write-back pass (which reads only the boxed `k.as_str()` text). */
    rustOwnedWriteBackPushBind(access: any): boolean;
    /** ral-62e: `if (!(k in m)) { m[k] = []; } const b = m[k]; b.push (v);` (kucoin / okx borrow-rate buckets): the printer-owned
     *  push bind (rustOwnedWriteBackPushBind) whose only other reference is that push. The guard right before the bind wrote a list
     *  under `k`, and every element write of `m` in the function stores an array literal or an array-typed value, so the read is
     *  always an `Arr` for a present key: the bind is a `List` local. A `None` key reads an empty list where the box read Null; its
     *  push is dropped with the local and nothing is written back in either form (`if let Some(__k)`). */
    private rustOwnedBucketListDecisions;
    rustOwnedBucketListBind(declaration: any): boolean;
    rustOwnedBucketListBindUncached(declaration: any): boolean;
    /** ral-xf: `const x = m[k]` mutated by the next statement, where `m` is a map-literal local and `k` a plain
     *  identifier key: the printer's native read (`m.get(k.as_str().unwrap_or("")).cloned()..`) is a form ccxt's
     *  write-back pass (`writeBackIndexedMutations`) and push pass (`rustVecPushInline`) read as the same get. */
    rustLiteralWriteBackBindOk(access: any): boolean;
    /** ral-yf: the key text of `delete m[k]` as an expression statement on a map-literal local `m`, `k` a literal bearer key
     *  or a proven-string key place, else undefined. runtime `remove` on (Dict, Str) is `try_ws_subs_remove` (a literal
     *  holds no ws marker, so it is dead) then `shift_remove`; a missing key is a no-op in both. */
    rustBearerDeleteKey(del: any): string | undefined;
    /** ral-yf: `delete m[k]` on a typed map-literal local. */
    printBearerDelete(node: any): string | undefined;
    /** ral-xf: the `m[k]` receiver of a statement `m[k].push (v)` (one argument, no spread), else undefined. */
    rustBearerElementPushCall(call: any): any;
    /** ral-xf: `m[k].push (v)` on a map-literal local whose every stored value (literal properties and `m[k] = v` writes)
     *  is never a map: `append_to_object_array`'s book-cache route needs a tagged map at `m[k]`, so what is left of it is
     *  `entry(k).or_insert_with(empty list)` then a push when the entry is a list, on the map the type already is. The key
     *  is a literal or a proven-string `Value` place (`as_str()` is `Some` exactly when the helper's `(Dict, Str)` arm
     *  runs). */
    rustBearerElementPushText(call: any, valueText: string): string | undefined;
    /** ral-xf: the local is an argument of a `this.` / `super.` call somewhere in its function. */
    rustMapHandedToSelfCall(declaration: any, name: string): boolean;
    /** Every value the literal stores is a list or a scalar by its checker type (never `any`, never an object). */
    rustBearerValuesNeverMap(declaration: any, literal: any, name: string): boolean;
    /** ral-wf: the statement `name[k] = v` (one key, `=`) whose value holds `node`. */
    rustBearerSelfWriteHost(node: any, name: string): any;
    /** A literal string key, or a checker-proven `string` place. A by-construction
     *  object literal carries no marker key (`__book_id`, `__cacheKind`, `__live_id`)
     *  and no ws client-handle triple, so `get_value`'s store routes cannot fire and
     *  the read is the map lookup. */
    /** ral-70f: `key` is the whole key of a statement `m[key].push (v)` and reads an `Option<String>` ral-70f reader local. */
    rust70fPushKey(key: Node): boolean;
    rustDictBearerKeyOk(keyNode: any): boolean;
    /** ral-xf: a book-meta-named key place (`symbol`, `timestamp`, `datetime`, `nonce`, `checksum`) indexing a map-literal
     *  local. `get_value` / `set_value` route such a key to the book store only on a map holding `__book_id`; a literal
     *  never holds it (its keys are its own literal keys and proven-string places, the same proof as every other dynamic
     *  key), so the read is the map lookup. `cache` / `hashmap` / `subscriptions` / `futures` stay excluded. */
    rustBookMetaPlaceOnLiteral(key: any): boolean;
    /** Keys a bearer may carry: no empty/numeric key, no ws client-handle marker
     *  (`subscriptions`/`futures` serve their live registry) and nothing `__`-prefixed. */
    static rustBearerKeyTextOk(text: string): boolean;
    /** `x[k]` on a bearer with a proven `string` key place: an `IndexMap` lookup, and
     *  `get_value`'s non-`Str` key branches (always `Value::Null` here) become the
     *  `""` fallback — the bearer can never hold an empty key. */
    rustBearerDictDynamicRead(receiverText: string, receiverNode: Node, keyNode: Node): string | undefined;
    /** `x['k'] = v` on a bearer: the insert `add_element_to_object` performs on the
     *  same plain dict, minus the box (`Arc::make_mut` guard the type proves). */
    rustBearerDictInsert(baseExpr: any, keyNode: any, keyText: string, valueText: string): string | undefined;
    /** `<name>.insert(<key>, <value>)` for a receiver the type proves is a map. The
     *  insert holds the receiver's `&mut`, so a value that reads it binds first; the
     *  trailing `;` keeps the block unit-typed when it stands as a statement. */
    rustBearerInsertText(name: string, keyArg: string, valueText: string): string;
    /** The `entry` key of a chained write's first hop, or undefined when the key
     *  cannot be proven. The bearer proof and the emission share this one answer,
     *  so a local is never typed on a chain the printer then prints boxed. */
    rustBearerChainHopArg(keyNode: any, keyText: string, name: string): string | undefined;
    rustBearerChainedWrite(baseExpr: any, keys: any[], keyStrs: string[], valueText: string): string | undefined;
    /** A key the bearer write takes natively: the checker proves a `string` and
     *  the printed key is a `Value::Str(..)` whose payload is that `String`, or a
     *  native `Option<String>` place. A key that names the receiver is out (the
     *  insert holds its `&mut`). */
    rustBearerWriteKeyOk(keyNode: any, receiverName: string): boolean;
    private rustBearerSawOpenKey;
    rustKeyScalarDecisionOpen(keyNode: any): boolean;
    /** `m[k] = v` on a bearer with `k` a native `Option<String>` local. */
    placeKeyNative(key: any): boolean;
    /** The native map key for a printed bearer-write key, or undefined when the
     *  box's payload is not a `String`. Literal keys stay with the shared path. */
    rustBearerWriteKeyArg(keyNode: any, keyText: string, receiverName: string): string | undefined;
    /** A write key of any boxed type: `add_element_to_object` stores a non-`Str` key through `stringify_simple`,
     *  which `stringify_param` is, so the same call is the whole key conversion. Only `Value`-printed shapes qualify. */
    stringifiedWriteKeyArg(key: any, text: string): string | undefined;
    /** The printed text of a key place that is a `Value` and safe to evaluate in a
     *  key position: no nested statement, assignment or await. */
    keyTextIsValuePlace(key: any, text: string): boolean;
    /** `k in x` on a typed bearer: `in_op`'s own Dict arm — a key that is not a
     *  `Str` is never a hit — with the lookup on the bare map. */
    bearerInOp(key: any, obj: any): string | undefined;
    /** `k in m` with `k` an optional-string scalar local keyed natively (`kin`): `printElemKeyInOp` prints the
     *  bearer's own lookup; an open key decision leaves the bearer decision uncached, like a write key. */
    rustBearerOptKeyIn(recv: any, keyNode: any): boolean;
    /** 41i: a map-literal local handed as the request of a base `handleUntilOption`-family call (item scope: the request
     *  of a tuple producer, typed before its slot; other map literals keep their own rules). */
    rustUntilRequestLocal(declaration: any): boolean;
    /** 41i: `'k' in m` with a plain string-literal key a typed map serves (same key rule as a native bearer read):
     *  the Rust string literal, else undefined. */
    rustBearerLiteralInKey(key: any): string | undefined;
    /** The key half of `bearerInOp`, also used while the receiver's own bearer
     *  proof is still running (its declaration probe answers "not typed" then). */
    bearerInOpKeyText(key: any): string | undefined;
    /** The printed Rust for this TS type is a `Value`: `any`, an object/dict shape,
     *  or a union of those with nullish. A `string`/number/bool place prints its own
     *  Rust type instead (the caller's string proof owns those). */
    keyPrintsAsValue(type: any): boolean;
    /** A plain object literal a bearer may be rebuilt from (`x = { .. }`): no
     *  spread, literal keys only — the same rules the declaration proof applies. */
    rustBearerPlainLiteral(node: any): boolean;
    /** `x = { .. }` (or a compound rebuild) on a bearer: the value is the map. */
    rustBearerRebuild(n: any): boolean;
    /** The move of a bearer into a parent object literal's value. Shorthand
     *  (`{ x }`) is out: the literal printer clones the name without passing
     *  through the identifier printer, so the box could not be emitted. */
    rustBearerLiteralMove(node: any): boolean;
    private rustReadBearerDecisions;
    /** The container kind a local is declared as, or undefined (no proof). */
    rustReadBearerKind(node: any): 'list' | 'map' | undefined;
    rustReadBearerKindOfDeclaration(declaration: any): 'list' | 'map' | false;
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
    /** How a non-read use boxes: an argument of a plain `Value` slot of a `this.` method, the value of an object
     *  literal property or array element, or `return x`; a nullable local only feeds base `safe*` readers. */
    rustContainerBoxForm(n: any, neverNull: boolean): 'clone' | 'move' | undefined;
    /** The sole argument of a base `this.json (x)` (printed `json_stringify(&x)`, not a `self.` field). */
    rustIsJsonOperand(node: any): boolean;
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
    /** ral-61i: `let x = undefined` / `let x: T;` (a statement, one declarator) written only as statements `x = await this.<endpoint> (..)`
     *  of REST endpoints declared `Promise<Dict>` (or `x = undefined`): the optional map the declared-endpoint rule holds. */
    rustDeclaredDictEndpointLet(d: any): boolean;
    /** ral-65i: a statement `x = this.extend (x, {..})`: base runtime `extend`, two arguments, the head the local itself, the
     *  operand an object literal that does not name x (decided from the call node and the callee declaration). */
    rust65iSelfExtendLiteral(up: any, d: any): boolean;
    /** The source side: `t = n` (statement) whose target `t` holds the optional form of n's kind through rustOptAliasSourceKind. */
    rustOptAliasTargetUse(n: any, declaration: any, fn: any): boolean;
    /** ral-45f: the source side of `let t = n` whose target holds the optional form through the initialised alias rule. */
    rustOptAliasInitTargetUse(n: any, declaration: any, fn: any): boolean;
    private rustBorrowedIndexReads;
    /** `Promise.all ([..])` (an array literal operand): runtime `promise_all` hands its operand back, so it is always a list. */
    rustPromiseAllListKind(call: any): 'list' | undefined;
    /** ral-yh: the right side of `x = ..` on a never-nil container local builds the same container kind on every path. */
    rustSameKindRewrite(rhs: any, from: 'dict' | 'list'): boolean;
    /** ral-yh: a producer that answers `Value::Map` on every path, so `json` of it can never print `null` or a list:
     *  `extend` (always `Value::Map(out)`), `indexBy` / `groupBy`, `deepExtend` whose every operand is a proven map, and an
     *  `omit` of a proven map head. An `omit (params, ..)` of `sign`'s params is not one (a list body passes through). */
    rustJsonMapProducer(init: any): boolean;
    /** `x[k]`, read only (no write, call, property or nested element target), with a numeric literal key or a key local
     *  that prints as a `Value` (a literal-initialised counter, or an untyped `let`/`const` of number / string type). */
    /** ral-41h: a key whose checker type is a string / number, or `any` (a `Value` key reads exactly as `get_value` keyed it:
     *  `KeyRead::read` on the held map / list is the arm `get_value` dispatches to for every key kind). */
    rustValueKeyType(key: any): boolean;
    rustBorrowedIndexReadUse(n: any): boolean;
    /** ral-73e A: `x[k]` (x the held container local `n`) is a plain one-link read: not the head of a chain (whose outer links
     *  keep their own printed forms) and outside the test tier. */
    rust73eStrKeyRead(n: any): boolean;
    private rustExtendReuseLocals;
    /** A plain map literal (outside the test tier): every `x = ..` write must be `x = this.extend (x, y)`; the
     *  existing borrowed-dict use rules decide the rest. The `IndexMap` bearer rule claims its locals first. */
    rustExtendReuseLiteral(declaration: any, init: any): boolean;
    /** `n` is the target of a statement `n = this.extend (n, y)` (base `extend`, two operands, `y` not naming `n`). */
    rustSelfExtendWrite(n: any, declaration: any): boolean;
    private static readonly RUST_SELF_EXTEND;
    private rustReuseProducerWrites;
    /** A statement `n = <map producer>` whose right side does not name `n`. */
    rustReuseMapProducerWrite(n: any): boolean;
    private static readonly RUST_REUSE_SAFE_DICT;
    private static readonly RUST_SAFE_LIST_SELF_DEFAULT;
    /** ral-44d: `n` is the default (third) operand of a base `safeDict (o, k, n)`: the `&[Value]` default slot takes the box
     *  (`Value::from(&n)`, the Arc bump the `.clone()` paid), and `safeDict` hands that very map back when the key misses. */
    rustSafeDictDefaultUse(n: any): boolean;
    /** ral-44d: `await this.<endpoint> (..)` of a REST endpoint declared `Promise<Dict>`: the declared-endpoint initialiser
     *  already prints `.await.into_dict()`, so the same write into a reuse literal replaces the owned map with the parsed
     *  response (parsed JSON carries no runtime tag). */
    rustReuseEndpointWrite(right: any): boolean;
    /** ral-46f: `x = y as Dict` whose previous statement in the same block is `y = await this.<endpoint> (..)` of a REST endpoint
     *  declared `Promise<Dict>` (`rustReuseEndpointWrite`): `y` definitely holds that parsed response, so the write prints
     *  `x = y.clone().into_dict()` (the form a declared-endpoint write prints; a non-map answer is the empty map there too).
     *  Answers the endpoint write. */
    rustEndpointAliasWrite(write: any): any;
    /** ral-61i: `n` is the bare source of `t = n` (rustEndpointAliasWrite) and `t` another local that holds a typed reuse map. */
    rustEndpointAliasSourceUse(n: any, declaration: any): boolean;
    /** The producer of a reuse write builds from untagged operands only: `extend` / `omit` operands proven plain
     *  (`rustUntaggedMapOperand`), `indexBy` / `groupBy` fresh maps, a REST `safeDict` read off a local (parsed JSON). */
    rustReuseProducerUntagged(n: any, rhs: any): boolean;
    /** pb: the base `handleUntilOption (k, x, p)` of a statement `[ x, q ] = ..` writing slot 0 back into `x` (base
     *  `handleUntilOption` returns its own `request` argument as slot 0, so the map moves through it). */
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
    /** An untagged map operand, or a `const y = this.omit (p, keys)` of one (omit only drops keys; a list passes
     *  unchanged and `extend` merges maps only, so no tag can reach the merged map either way). */
    rustExtendReuseOperandUntagged(arg: any): boolean;
    /** A literal-key write on a reuse local: the map is the plain literal merged with untagged operands only, so the
     *  copy-on-write insert equals `add_element_to_object` (which differs only on a tagged map). */
    rustExtendReuseKeyWriteOk(n: any, declaration: any): boolean;
    /** The head of `x = this.extend (x, y)` on a reuse local: moved (the statement writes `x` back). */
    rustSelfExtendHead(node: any, declaration: any): boolean;
    /** sb: `y = self.omit(&x, ..).into_dict()` for a shared-map alias (`omit` of a proven map answers `Value::Map`: the Arc moves back). */
    private rustSbAliasWrites;
    private rustSbAliasSlotWrites;
    /** ral-54f: a slot write accepted by the shared-map alias rule, printed typed only when the alias printed as the map. */
    rustSbAliasSlotWriteOf(element: any): boolean;
    printSbAliasWrite(node: any, left: any, right: any): string | undefined;
    /** ral-wf: `x[k] = v` (one key, `=`, statement) on a reuse literal with a non-literal key whose printed form is a plain
     *  `Value` place, and the reuse writes' operands proven untagged (same proof as the literal-key writes). */
    private rustReuseDynamicWrites;
    rustReuseDynamicKeyWrite(n: any, declaration: any): boolean;
    /** `Arc::make_mut(&mut x).insert(stringify_param(&k), v)`: `add_element_to_object` on an untagged map stores `v` under
     *  `stringify_simple(k)` (a `Str` key is its own text), which `stringify_param` is. */
    printReuseDynamicKeyWrite(left: any, right: any, valueText: string): string | undefined;
    /** `x = self.extend(x, ..).into_dict()` for a reuse local (`extend` answers `Value::Map`: the Arc moves back). */
    printExtendReuseWrite(left: any, right: any): string | undefined;
    rustBuiltMapKeyWriteOk(n: any, init: any): boolean;
    rustUntaggedMapOperand(arg: any): boolean;
    /** A whole hand-off of a nullable container local (a base `safeDict*` / `safeList*` with no or a nullish default,
     *  or a `let` filled by such writes) to a lent `impl Into<crate::Value>` slot. */
    rustLentOptionalHandOff(call: any, arg: any, init: any, from: 'dict' | 'list' | 'api' | undefined, nilDeclared: boolean): boolean;
    private static readonly RUST_LENT_ENCODER_SLOTS;
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
    /** ral-67c: `x = y` where y is a `const y = { .. }` (plain map literal, never rebound) of x's function that no typed rule takes
     *  (y prints `Value` and holds a map on every path): x takes it back with `.into_opt_dict()` (moved at y's last use). */
    rust67cMapLocalSource(rhs: any, declaration: any): any;
    /** ral-67c: the head `x` of `x = this.extend (x, y)` on a nil map local: the optional map moves out (`x.take()`) and is written back. */
    rust67cNilMapExtendHead(node: any, declaration: any): boolean;
    /** og: the nil-declared map local a declaration aliases whole (`const x = y`, same function, no closure between). */
    rustNilMapAliasSource(declaration: any): any;
    /** og: `y` as the whole initializer of a nil-map alias: the handle moves at y's last use, else an Arc bump. */
    rustNilMapAliasInit(n: any): any;
    /** A list literal with no spread or bare-local element whose elements print natively (`vec![..]`). */
    rustNilListLiteralOk(rhs: any): boolean;
    /** Hand-offs past the object-literal value and return: another (untyped) local's initializer, or an argument of
     *  `this.extend` / `this.watch*`, which take `Value`. */
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
    /** ral-48b: the boxed local's write is already a native insert (asked while the local's kind is pending, i.e. the
     *  untyped view): that write is not a helper row, and its source proof is the native-insert rule's, not this one. */
    rustAeoBoxedNative(n: any): boolean;
    /** ral-50b: `n[<integer literal>] = v` (statement, one level, `=`). */
    rustListIndexLiteralWrite(n: any): boolean;
    /** ral-52e: a list index key proved i64: an integer literal, or `+` / `-` over integer literals and i64 scalar locals (at least one literal);
     *  ral-53e: or, as the whole key of a plain element read, an int / Option<i64> local (rust53eElemReadKey). */
    rustListIndexIntKey(key: any, top?: boolean): boolean;
    /** ral-84d R2: statement writes `x[k] = v` printed as a native insert on a typed `safeDict (this.options, ..)` copy. */
    private rust84dStoreWrites;
    /** ral-84d R2: `n[k] = v` (statement, one level, `=`, non-literal key) on `const n = this.safeDict (this.options, 'lit', {})`
     *  (a base reader, an object-literal default: a map on every path). `this.options` is a plain field the runtime never tags
     *  (no ws subscription, cache bucket or book id), so the untyped printer already writes it as a native copy-on-write insert
     *  (printNativeDictInsert); on the typed map the same insert runs without the `if let Value::Dict` (always a map). */
    rust84dStoreKeyWrite(n: Node, init: Node): boolean;
    /** ral-84d: a base `safeDict*` reader whose default is a map literal (a `Value::Dict` on every path: the typed map holds
     *  exactly what the box held). */
    rust84dNeverNullMapInit(init: Node): boolean;
    rust84dStoreKeyArg(n: Node, keyNode: Node): string | undefined;
    /** ral-84d R2: `delete n[k]` (statement) on the `this.options` store copy, `k` a string local printed in the `dkey` form. */
    rust84dStoreDelete(n: Node, init: Node): boolean;
    /** ral-87rd R2: `delete n['lit']` (statement) on `const n = this.safeDict (local, 'lit', {})` (a base reader with a map-literal
     *  default: a map on every path) whose head local reads no tagged container: the untyped printer already removes it with the
     *  native `shift_remove` (provenDictFieldDelete: no ws subscription route), so the typed map runs the same remove. */
    rust87rdLiteralDelete(n: Node, init: Node): boolean;
    print84dStoreDelete(node: DeleteExpression): string | undefined;
    print84dStoreKeyWrite(left: ElementAccessExpression, right: Node, valueText: string): string | undefined;
    /** ral-48b: `n['k'] = v` (statement, literal non-digit key) whose value does not read `n`. */
    rustAeoTargetWrite(n: any): boolean;
    /** The source statement of a box (`Value::Dict(x)`, +13 chars) leaves the printed line within 400 chars. */
    rustBoxLineOk(n: any): boolean;
    /** The copy-on-write insert line (indent + `Arc::make_mut(&mut x).insert(..)`) stays within the 400-char budget. */
    /** pb: `x['k'] = v` (statement, literal non-meta key) on a local initialised from a base `safeDict*` read of a REST-tier
     *  (`ts/src/<venue>.ts`) local or response: no ws subscription, cache or book store, so the map carries no runtime tag. */
    rustSafeDictKeyWriteOk(n: any, init: any): boolean;
    /** ral-40g: `row['k'] = v` (statement, literal non-meta key) on a row of a typed `Dict[]` list local (`rows[i]`, the checker
     *  proves a map element) in a REST or prediction venue file: the list comes from a parsed response (no ws subscription,
     *  cache or book tag), and the row's copy is written exactly as the boxed copy was (the list is never written back). */
    rustElementKeyWriteOk(n: any, init: any): boolean;
    /** ral-45c: `row['k'] = v` on `const row = d[k]` of a `Dictionary<Dict>` local `d` read from an untagged REST map, in a REST
     *  or prediction venue file. Write-back proof: `d` is never read again after the row is taken (its only other uses are its
     *  declaration and an `Object.keys (d)` ahead of the row's loop), so the map the boxed `add_element_to_object` left unchanged
     *  in `d` is never observed; the row's copy-on-write insert is exactly the boxed one (an untagged map, no store route). */
    rustDictRowKeyWriteBackOk(n: any, init: any): boolean;
    rustBuiltKeyWriteLineOk(n: any, extra?: number): boolean;
    rustNullTestedDictLocal(init: any, nullTests: number, writes: number): boolean;
    rustDictElementSource(init: any): boolean;
    /** ral-73d: an object interface declared only in the base `ts/src/base/types.ts` (a unified record such as `Trade`,
     *  `Position`, `Account`, `PredictionPosition`): no call signature, no array, no union. */
    rust73dBaseRecordType(type: any): boolean;
    /** te: `this.urls['<lit>']` where the base `Exchange` declaration types that entry as a string-keyed map
     *  (`urls!: { api: Dict, .. }`). The read leaves its box as the shared map (the same Arc bump the copy paid);
     *  a missing or non-map entry reads Null at every string key, exactly as the empty map `into_dict()` leaves. */
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
    /** `m.get("k").cloned().unwrap_or_default()` for a `safeDict`/`safeList` read off a borrowed message map whose default
     *  is absent, null or the empty literal (`into_dict`/`into_list` already map every other variant to that default). */
    rustWsFieldGetText(init: any, optional: boolean): string | undefined;
    /** `Value::Arr(x)` (moved) / `Value::Arr(x.clone())` at a list hand-off; dict hand-offs print through `printDictElementBox`. */
    printWsFieldBox(node: any, text: string): string | undefined;
    /** `Value::Dict(x)` / `Value::Arr(x)` at the last use (moved), else `Value::from(&x)` (the Arc bump the copied `Value` paid). */
    printDictElementBox(node: any, text: string): string | undefined;
    rustDefaultedContainerBoxUse(n: any, init: any): boolean;
    /** ral-yh: `y = x` (statement) into another plain `Value` local `y` at `x`'s last use: `y` takes the container by
     *  value, so the shared handle moves in boxed once (`Value::Dict(x)` / `Value::Arr(x)`), exactly the value the boxed
     *  `x` held. A target with its own typed rule stays out (its write proof reads its sources). */
    rustValueLocalWriteHandOff(n: any): boolean;
    /** ral-40h: phase 1 of a container alias. `const|let y = x` (single declarator, same function, no closure between)
     *  hands `x`'s container whole to `y`. `y` is decided in phase 2, once `x` has settled: a shared-map alias that is
     *  never written takes `Value::from(&x).into_dict()` (the Arc the `Value` alias bumped), any other `Value` alias the box
     *  (`Value::Dict(x)` / `Value::Arr(x)` when `x` is dead after it, else `Value::from(&x)`). Every other local's rule is
     *  untouched: the target must stay `Value` or be the shared-map alias, both read `x` only as this one box. */
    rustContainerAliasInit(n: any, own: any): boolean;
    private rustNnAliasDecls;
    rustNnAliasSourceUse(n: any, kind: 'dict' | 'list'): boolean;
    /** ral-53n: the boxed source of a never-null alias, cloned when it is read again after `at` (or `at` sits in a loop), moved otherwise. */
    rustNnAliasSourceText(src: any, at: any): string;
    /** ral-53n: the container kind of a local declared as an alias whose initializer and every whole write are identifiers of
     *  never-null container locals (rustContainerNeverNullLocal) whose root producers all answer the same kind. */
    rustNeverNullAliasKind(declaration: any): 'dict' | 'list' | undefined;
    /** ral-40h: a local whose initializer and every whole write hold a container on every path (never Null): a fresh
     *  built container, `omit` of a proven map, a `safeDict*` / `safeList*` read with an empty literal default, a
     *  never-null venue container return, or an alias of such a local (syntactic: no other local's decision is read). */
    rustContainerNeverNullLocal(declaration: any, depth: number): boolean;
    private rustContainerAliasInits;
    private rustContainerAliasAsking;
    private rustValueWriteTargets;
    private rustValueWriteOpen;
    /** ral-ra: `m['k'] = x` / `m.k = x` one level on another local `m` (not `x` itself): the store takes the value by
     *  value, so the shared container is boxed there once (moved at its last use, else the Arc bump the `Value` paid). */
    rustLocalKeyPlace(place: any, n: any, castRecv?: boolean): boolean;
    rustOptReaderBoxUse(n: any, init: any): boolean;
    /** ral-62n: the array literal is the default argument of a base `safeList*` reader, or the whole right side of a
     *  `x = [..]` / `m[k] = [..]` statement (written into a place, not handed to a call's `Value` slot). */
    rust62nListLiteralSink(list: any): boolean;
    static readonly RUST_62N_LIST_READERS: Set<string>;
    /** ral-84a: an array literal that is a whole argument of a `this.` / `super.` call at a plain `Value` slot
     *  (`this.depositWithdrawFee ([ fee ])`): the literal boxes each element, so a map row enters as the shared map. */
    rust84aListLiteralSelfArg(list: Node): boolean;
    /** ral-55h: `n` is a handler argument (not the `this` receiver slot) of `h.call (this, ..)` on an identifier `h` typed
     *  `any` (the by-name ws dispatch the ccxt build turns into `self.dispatch_ws_handler(&h, &[..])`). */
    rustWsDispatchCallArg(n: any): boolean;
    rustBorrowedKeySetUse(n: any): boolean;
    /** The key operand of `k in m`: a literal as `"k"`, else the boxed key text `bearerInOp` tests. */
    rustBorrowedInOpKey(key: any): {
        literal: boolean;
        text: string;
    } | undefined;
    /** A `string` / `Str` identifier key of `k in m`: a local whose print is decided at the test
     *  (`rustBorrowedStrKeyTest`), so the receiver's proof never waits on the key's own scalar decision. */
    rustStrKeyIdentifier(node: any): boolean;
    /** `contains_key` on the shared map for a string identifier key, printed from the key's settled decision: a
     *  `String` local by `as_str`, an `Option<String>` local by `as_deref` (`None` misses, as `in_op` on `Null`),
     *  a boxed key by the `Str` arm `in_op` takes (any other variant misses). */
    /** A parameter key prints as its signature type: a boxed `Value`, `&str` or `Option<&str>` (per-venue string slots). */
    rustStrKeyParam(declaration: any): boolean;
    rustBorrowedStrKeyTest(name: string, node: any): string;
    rustBorrowedDictName(node: any): string | undefined;
    /** ral-61n: the printed name of an optional map local admitted for key-set uses (see rustOptKeySetLocals). */
    rustOptKeySetDictName(node: any): string | undefined;
    printBorrowedKeys(node: any, kind: 'keys' | 'values'): string | undefined;
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
    /** An arm that is always a map: a base `extend`/`deepExtend`/`omit` call, or a local / `params = {}`
     *  parameter whose initializer and every write are such calls. */
    rustDictTernaryArm(arm: any): boolean;
    /** A local as one arm of a ternary that initialises another `let`, with no loop or closure in between. */
    rustDictTernaryArmPlace(node: any, declaration: any): boolean;
    /** The arm is the local's last read: every other read precedes the declaring statement or sits in the
     *  other arm (only one arm runs), so the arm moves the map. */
    rustDictTernaryArmMoves(node: any, declaration: any): boolean;
    /** A `let x = c ? <map> : <map>` local: like a params slot, it may also go whole into a plain `Value` argument. */
    rustHandedTernaryLocal(declaration: any): boolean;
    /** A typed dict local (handed slot / handed local / printed borrowed map) as such an arm: it goes in as the map. */
    rustDictTernarySlotArm(node: any, declaration: any): boolean;
    /** `let x: crate::value::Dict = if c { a } else { b }` with each arm native: a base `extend`/`omit` result unboxed
     *  once, a moved handed slot as is. Only when an arm is such a slot; other ternaries keep the boxed if-expression. */
    printDictTernaryArms(init: any, identation: number): string | undefined;
    /** ral-44g: `c ? a : b` where each arm is an empty map literal `{}` or a base map producer call (`safeDict` with a literal `{}`
     *  default, extend / omit): every path answers a map, so the local is a map producer. An `undefined` arm keeps Value. */
    rustMapTernaryInit(init: any): boolean;
    /** ral-45g: `c ? undefined : <src>` / `c ? <src> : undefined` where `<src>` is a base map source the optional form takes
     *  (`safeDict` with no / nullish / `{}` default, extend / omit): Null on one path, that map (or its Null) on the other. */
    rustOptMapTernaryInit(init: any): boolean;
    rustDictTernaryCall(call: any): boolean;
    private rustNilResponseLocals;
    /** The container kind of a write to a borrowed local; an endpoint write to an empty `let` counts as a map. */
    rustNilResponseWriteKind(rhs: any, nilDeclared: boolean, declaration: any): 'dict' | 'list' | 'api' | undefined;
    /** ral-68c R1: `await this.m (..)` of a same-class async venue method whose declared return is a never-null container
     *  (`Promise<Dict>` / `Promise<List>`, every declaration of the name alike), not a base builder. */
    rust68cVenueWriteKind(rhs: any): 'dict' | 'list' | undefined;
    /** ral-65i: `await this.<endpoint> (..)` whose abstract declaration spells `Promise<Dict>`. */
    rust65iDeclaredDictEndpointWrite(rhs: any): boolean;
    /** ral-kc: `await this.<endpoint> (..)` whose abstract declaration spells `Promise<Dict>` / `Promise<List>`. */
    rustDeclaredEndpointWrite(rhs: any): boolean;
    /** A base `safeDict*` / `safeList*` call (default absent, nullish or an empty literal of its kind), or a base `extend`/`omit`. */
    rustOptContainerSourceOk(call: any, kind: 'dict' | 'list' | 'api'): boolean;
    /** The optional form's local behind an identifier, else undefined. */
    rustOptContainerOf(node: any): {
        declaration: any;
        kind: 'dict' | 'list';
    } | undefined;
    /** `let mut x: Option<crate::value::Dict> = <init>.into_opt_dict()` (`None` when declared empty). */
    printOptContainerDeclaration(declaration: any, varName: string, indent: string): string | undefined;
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
    /** A call to a generated base reader (any overload) whose container parameter prints `impl KeyRead`. */
    rustReaderTakesContainerByReference(call: any): boolean;
    rustBuiltReturnSourceKind(call: any): 'dict' | 'list' | undefined;
    /** The printed `let mut x: crate::value::Dict = self.omit(..).into_dict();` line of a one-line omit stays under 400 chars. */
    rustOmitLineFits(call: any): boolean;
    /** `this.omit (x, [ 'a', 'b' ])` on the base helper (outside the test tier) with a non-empty list of plain string
     *  literals: the key slot takes `&[&str; N]`, which drops exactly the keys the boxed `Value::Arr` of strings dropped. */
    rustOmitLiteralKeys(call: any): boolean;
    private static readonly RUST_BUILT_BOX_RECEIVER_METHODS;
    private static readonly RUST_BUILT_HELPER_RETURNS;
    private static readonly RUST_BASE_FILTER_LISTS;
    /** The container a base list filter answers, `undefined` when it is unproven, `null` when `method` is none of them. */
    rustBaseFilterReturnKind(call: any, method: string): 'dict' | 'list' | undefined | null;
    /** A base `sortBy*` over a local that already holds a list (`crate::value::List` / `Vec<Value>`): the runtime sorts
     *  the items of a `Value::Arr` and answers a new `Value::Arr`, so the result is a list exactly. */
    rustSortOfTypedList(call: any): boolean;
    /** `this.m (..)` resolves to the base declaration and no venue redeclares `m`. */
    rustListPassthroughCallee(call: any, method: string): boolean;
    /** ral-43a: `{ 'k': x }` (a plain object literal, not a destructuring target) or `return x` of a held endpoint answer. */
    rustDeclaredEndpointWholeBox(n: any): boolean;
    /** ral-53a: a plain `Value` argument slot of a `this.` method (not extend / omit, not a lent slot, no loop between). */
    rustSbAliasValueSlot(n: any): boolean;
    /** ral-63i: `this.m (..)` whose resolved declaration is a method of the calling venue's own source file (not the base
     *  tier, not an abstract endpoint), so its argument slots print from that declaration. */
    rust63iSameFileMethod(call: any): boolean;
    /** ral-76b: `t[k] = x` (statement, one level, `t` a plain local or `this` field read) or `t = x` / `let t = x` whose
     *  target local is untyped (no typed decision of its own), so the right side is a plain `Value` place. */
    rust76bWholeHandOff(n: any): boolean;
    rust76bUntypedTarget(target: any): boolean;
    rustDeclaredEndpointBoxUse(n: any): boolean;
    /** `this.F` for a checker dict-shaped field (`fundingRates: Dictionary<FundingRate>`) the native insert writes
     *  (`printNativeDictInsert`: `rustFieldStaysDict`). The insert stores whatever handle it is given, so a built map
     *  boxes there as the field-key rule's plain fields do. */
    rustDictShapedFieldInsert(expr: any): boolean;
    rustBuiltReturnBoxUse(n: any, init: any, literalDict?: boolean): boolean;
    /** A base `this.omit (x, keys)` whose head always holds a map: a literal, a built map (`extend`, ..) or a local that
     *  prints the shared map. A `Dict`-typed parameter is not enough: a list body (`Array.isArray (params)` in `sign`)
     *  passes `omit` unchanged, and `into_dict()` would turn it into an empty map. */
    /** ral-41h: the one operand of `this.keysort (x)` is a proven map (the same head proof `omit` takes). */
    rustKeysortOfDict(call: any): boolean;
    /** ral-50a: `t[1]` read off a `const t = this.handle*AndParams (m, ..)` tuple (base helper, PARAMS_SLOT_ARG) whose params
     *  argument is a proven map (a typed / helper-proven params parameter, a handed slot map or a settled Dict local): the
     *  base answers `[x, m]` or `[x, omit (m, k)]`, a map on every path. */
    rustHandleTupleMapSlotRead(rhs: any): boolean;
    /** ral-87ra R1: `const p: Dict = t[k]` (literal index) of a never-rebound `const t = this.m (..)` whose venue callee declares
     *  slot `k` of its tuple return a bare `Dict` (rustCallDeclaresDictSlot: bitget `handleProductTypeAndParams`, binance pro
     *  `resolveAuthType`, dydx `createOrderRequest`) and whose every use is a literal-index read: the slot holds that map. */
    rust87raVenueTupleMapSlotRead(rhs: Node): boolean;
    /** ral-87ra R3: base `handleTriggerPricesAndParams (symbol, params)` answers its params map (omitted or as passed) at slot 3
     *  (declared `[Str, Str, Str, Dict]`): a map when the params argument is a proven map local / parameter (ral-51a's head proof). */
    rust87raBaseParamsSlot(call: CallExpression, at: number): boolean;
    /** ral-87ra R3: base tuple producer name -> [Dict slot, params argument index]. */
    private static readonly RUST_87RA_BASE_PARAMS_SLOT;
    /** ral-51a: `this.handleRouteAndParams (m, params)` typed by name: a venue member of the enclosing class declared
     *  `handleRouteAndParams (methodName: string, params: Dict = {}): Dict` answers the (route-omitted) params map. */
    rustRouteParamsDictCall(init: any): boolean;
    private static readonly RUST_ROUTE_PARAMS_DICT;
    /** ral-50a: a destructured `handle*AndParams` slot already handed as a map (`requestParams = paramsIsMargin`). */
    rustHandedSlotIdentifier(rhs: any): boolean;
    rustOmitOfDict(init: any): boolean;
    /** `this.deepExtend (m, p, ..)` whose every operand is a proven map: a tag-free literal, a built map, an omit of a
     *  proven map, or the `params` of a typed unified method. The runtime then merges map into map on every path. */
    rustDeepExtendOfMaps(call: any): boolean;
    /** Every other `let`/`const` of `name` in the enclosing function is initialised by a call of the same `this.` method. */
    /** lf: every same-named binding in the function is itself a `const`/`let` element read of a typed `Dict[]` (or
     *  list-of-lists) local: each block-scoped binding converts to the same Rust type (`Dict` / `List`), so ccxt
     *  passes that key on the name read the same declared type for every sibling. */
    rustElementSiblingsAlike(declaration: any, name: string, init: any): boolean;
    /** ral-zg: `y = el` where `y` is another `let` of the same function declared before the row's block, never typed by a
     *  container rule (it stays the boxed `Value` the write targets). */
    rustZgOuterLocalWrite(left: any, n: any): boolean;
    /** ral-zg: map rows admitted next to a differently sourced sibling; a whole hand-off of such a row takes the optional form
     *  (`Option<Dict>` boxes back to exactly `Null` or the map, where `into_dict()` would hand an empty map for a Null row). */
    private rustZgSiblingRows;
    /** Every other binding of `name` in the function is a `const` plain map literal declaration (ral-oc). */
    rustLiteralSiblingsAlike(declaration: any, name: string): boolean;
    rustSiblingBindingsAlike(declaration: any, name: string, init: any): boolean;
    /** The `params` of a typed unified method, never reassigned: it arrives through `impl Into<crate::Params>` and is
     *  rebound by `get_arg(.., Value::Map({}))`, so it is always a map (`From<Value> for Params` drops a non-map, and
     *  the empty set's `Value::Null` takes the `{}` default). A list body only reaches untyped `sign` / `request`. */
    rustTypedParamsParam(d: any): boolean;
    /** ONE params-map proof for an omit / keysort head (and so for 46g's slot-1 write-back, which takes the handed map
     *  whose omit head this proves): a typed unified method's `params` (rustTypedParamsParam) or, ral-47g, a venue
     *  `*Request` helper's `params` proven a map by every in-file caller (rustHelperParamsProvenMap). */
    rustProvenMapParam(d: any): boolean;
    /** ral-47g: the trailing `params: Dict = {}` of a venue's own helper (createOrderRequest and the like), never
     *  reassigned, not an override, whose every caller in the venue file, its pro file and each subclass that inherits
     *  it passes a map or leaves it out (the `{}` default): the `sign` caller proof keyed on the helper name. A dynamic
     *  `this[m] (..)` / `callDynamically` call, an extra argument or any unproven argument fails the venue closed. */
    rustHelperParamsProvenMap(d: any): boolean;
    /** The helper is called by name somewhere in its venue or pro file and is not a base Exchange method. */
    rustHelperHasCaller(root: string, venue: string, name: string): boolean;
    private static readonly RUST_SIGN_MAP_PROOF;
    private static rustSignProofApi;
    /** A venue `sign (path, api, method, params)` whose `params` is a map on every path. `params` reaches `sign` only
     *  through `fetch2` (from `request`, every implicit endpoint and the venue's own direct calls); the base declares
     *  it `Dict`, but a list body passes through untouched (`omit` hands a list back, and `into_dict()` would empty
     *  it). So the venue is proven when every request-path call in its own file, its pro file and each subclass file
     *  that inherits this `sign` hands over a map: an object literal, a map builder (`extend`, `deepExtend`,
     *  `keysort`, `ordered`, `omit` of a proven map), a `Dict` parameter, a `handle*AndParams` params slot, a method
     *  declared `Dict`, or a local whose every write is one of these. Any list literal, any dynamic `this[name] (..)`
     *  / `callDynamically` call, or anything else unproven fails the venue (fail closed). */
    private static readonly RUST_SIGN_PARAM_HANDLERS;
    rustSignParamsProvenMap(fn: any): boolean;
    rustSignParamsProofUncached(root: string, venue: string, target?: {
        name: string;
        at: number;
    }): boolean;
    /** ral-40h: the method names a dynamic `this[m]` can hold, read syntactically: `const m = 'a' + k + 'b'` where `k` is
     *  `const k = this.safeString (L, ..)` over a `const L = { .. }` literal whose every value is a string literal (a
     *  missing key leaves `k` undefined, which the venue throws on before the call), or `m` itself a string literal. */
    r40hDynNames(access: any): string[] | undefined;
    /** The `params` slot of a typed unified call (`impl Into<crate::Params> + Send`): `From<Value> for Params` takes the
     *  boxed map exactly as it took the `Value` local, so a dict local boxes there once (moved at the last use). */
    rustTypedParamsSlot(call: any, at: number): boolean;
    /** `'dict' | 'list' | 'api'` for a container source the local may hold by reference. */
    rustBorrowedSourceKind(call: any): 'dict' | 'list' | 'api' | undefined;
    private static readonly RUST_SAFE_VALUE_KEY_SOURCES;
    rustSafeValueKeyReadSource(call: any): boolean;
    /** ral-80g: `const o = this.parseJson (s)` (base `parseJson`, one argument): its answer is whatever JSON the text holds
     *  (a map, a list, a scalar) or Null. Under ral-qa's use rule (literal string-key base reads only) a non-map answer reads
     *  Null at every key exactly as the empty map `into_dict()` leaves, and a parsed value carries no store tag. */
    rust80gParseJsonKeyReadSource(call: Node): boolean;
    /** ral-45g: `c ? a : b` whose arms are each a local / parameter, a numeric-index row, an empty map literal or a ral-qa
     *  `safeValue` source: whatever kind each arm holds, a string-key read of a non-map answers Null exactly as the empty map
     *  `into_dict()` leaves, so under ral-qa's use rule (literal-key base reads only) the typed local is observably identical.
     *  No arm names ws client state nor a market / currency table. */
    rustKeyReadTernarySource(init: any): boolean;
    /** ral-42g: `xs[i]` (a numeric index) where `xs` is a local or parameter the checker types as a list (`T[]`, never a tuple, an
     *  ArrayCache or an order book side) outside the test tier: the row a counter loop binds. Read only at literal string keys (the
     *  ral-qa use rule), a non-map row (Null, list, scalar, out of range) reads Null there exactly as the empty map `into_dict()`
     *  leaves; the local owns its map (an Arc bump of the row), so nothing borrows the list while it lives. */
    rustListRowKeyReadSource(init: any): boolean;
    /** ral-73d: `this.<f>[i]` (a numeric index) where `f` is a field declared only in the base tier as a list of a unified
     *  record (`accounts!: Account[]`): the row a counter loop binds; read only at literal string keys (ral-42g's use rule). */
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
    /** `this.m(..)` of a venue method (no override, every venue declaration of the name returning `Dict`) whose every
     *  return is `this.safeDict (this.<field>, '<key>', {})`: the shared handle of a typed store entry, a map on every path. */
    rustStoreDictReturnCall(call: any): boolean;
    rustDeclaredEndpointKind(call: any): 'dict' | 'list' | undefined;
    private static readonly RUST_TEST_KEYREAD_READERS;
    printTestReaderArg(node: any, text: string): string | undefined;
    /** `&x` for a borrowed local (or a typed container local) passed to a hand-written any-key reader. */
    printBorrowedReaderArg(node: any, text: string): string | undefined;
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
    /** ral-84e: `self.safe_bool*_opt(..)` for a base safeBool / safeBool2 / safeBoolN call: `Option<bool>` as is for an
     *  `obool` local with no default, `.unwrap_or(<literal>)` for a `bool` local with a literal boolean default (the boxed
     *  reader returns the member only when it is a `Bool`, else that default: the twin's `None` then unwraps to it). */
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
    /** ral-48e: `xs[i]['k'] = v` (a statement) on a `[]`-defaulted list local, `i` an i64 counter or a non-negative integer
     *  literal: the write prints `add_element_to_object(get_value_mut(&mut xs, &Value::Int(i)), ..)` as before, and the
     *  runtime `get_value_mut` hops a held `List` exactly as the `Value::Arr` arm did (the same padded slot). */
    rustLentListRowWrite(access: any): boolean;
    /** ral-64i: a never-reassigned local initialised from a base `this.arraySlice (src, ..)` whose `src` is an identifier the
     *  checker types `string[]` (a split): every element is a `Str`, so `Display` joins exactly what the helper joined. */
    rust64iStringSliceDeclaration(declaration: any): boolean;
    /** ral-64i: `this.arraySlice (..)` of the base tier (no venue redeclares it), outside the test tier. */
    rust64iBaseSliceInit(init: any): boolean;
    /** A base `safeList*` read with an empty `[]` default: a list on every path. */
    rustDefaultedListRead(init: any): boolean;
    /** ral-87rd R1: some statement `name.push (v)` on this very binding inside its own function, and no other binding of the same
     *  name in that function (ccxt build/'s container-op prover reads the function text by name: a typed sibling `let` would make it
     *  drop a native `len()` it proves for the other, still boxed, binding). */
    rust87rdPushedLocal(declaration: VariableDeclaration, name: string): boolean;
    rustLentListLocalUncached(declaration: any): boolean;
    private static readonly RUST_TYPED_LIST_FIELDS;
    rustTypedListField(node: any): boolean;
    printTypedListFieldRead(node: any): string | undefined;
    /** rf: `x === undefined` / `x !== undefined` of a local bound to a typed list field (`this.symbols`): the field is a
     *  `List`, so the boxed `Value::Arr(..)` the local held was never `Null` and the test is a constant. */
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
    /** ral-53h: a never-rebound const list literal of `this.<method>` references, only read by `xs[i]` (as a declaration
     *  initializer) and `xs.length`: an element read is a handler name, or Null past the end. */
    rustHandlerList(declaration: any, literal: any): boolean;
    rustHandlerTableLocalOf(node: any): boolean;
    printHandlerTableLocalDeclaration(declaration: any, varName: string, indent: string): string | undefined;
    printHandlerTableNullTest(left: any, right: any, op: any): string | undefined;
    rustLentListUse(node: any): boolean;
    /** `x.join("lit")` on a lent `string[]` list: each element's `Display` text (the helper's `stringify_simple` for
     *  `Str` / `Int` / `Float` / `Bool` / `Null`) joined by the literal, with no copy of the list. */
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
    /** ral-54h: a never-written method parameter declared `string`: printed as a `Value`, it is lent to a key slot as
     *  `&Value` (`Option<&str>` via `as_str`, the same text the runtime map key reads). */
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
    /** ral-56w: the one statement `x = this.filterBy* (x, ..)` of an optional cache local `x` (a watch result) whose
     *  base filter answers a list on every path, at the declaration's own block level, `x` named once in the call:
     *  it prints as a fresh `crate::value::List` local of the same name (a Rust shadow), so the cache local before it
     *  and the list after it are two typed locals. Undefined when there is no such statement or a second write. */
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
    /** ral-54w: a slot of `const [ a, b, c ] = await this.m (..)` (a proven watch, see rustWsWatchResultKind) where every
     *  resolve that can match the awaited hash passes an array literal (or an unreassigned local bound to one) whose
     *  element at the slot's index is a cache: the slot holds that cache. Any other matching resolve (another kind,
     *  a value read through a helper parameter, a Null settle, an unknown hash) leaves the slot `Value`. */
    rustWsTupleCacheSlot(element: any): boolean;
    /** ral-84a: a slot of a proven watch tuple whose element at the slot's index is checker-typed `string` in every
     *  matching resolve (the ohlcv `[ symbol, timeframe, stored ]` tuples): the slot holds that string or Null. */
    rustWsTupleStrSlot(element: BindingElement): boolean;
    rustWsTupleSlotProof(element: BindingElement, want: 'cache' | 'str'): boolean;
    /** ral-84a: a resolved tuple element the checker types `string` (`market['symbol']`, a `Str` reader result). */
    rustWsResolvedStr(x: Node): boolean;
    /** ral-55w: a resolved value that is a plain map, never a cache / book marker: a fresh or proven map, or an entry of
     *  the base `balance` field (balances are plain maps), so a numeric slot read off it is Null. */
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
    /** A source an optional cache local takes as `Option<Cache>`: a map read, `undefined` (with `orUndefined`), a typed
     *  cache field, or a ternary of those with at least one map read or field. */
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
    /** One forget/forget2 call. In the base tier the field is the method receiver (`self.F.forget(&k)`): a `&mut self.F`
     *  argument there gets `.clone()` from the ccxt self-field rule (the base fns are not `pub`, so its strip pass skips
     *  them) and the delete hit a copy. Pro handlers keep the `&mut self.F` argument, which is what promotes them to
     *  `&mut self` in ccxt. Keys mentioning `self` are bound first so the field borrow does not overlap them. */
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
    /** ral-47h: the dispatch keys a handler local `const x = this.safeString (message, 'f')` can hold, or undefined.
     *  Proof: x is never reassigned; `message` is the handler's unwritten second parameter; the handler is a method of a
     *  ws venue class whose every `this.<handler>` mention is a value of the one `const methods = { 'k': this.h, .. }`
     *  literal of `handleMessage (client, message)`; that literal is read only by `this.safeValue (methods, K)` with
     *  K an unwritten `const K = this.safeString (message, 'f')` (same field, handleMessage's unwritten `message`),
     *  and the result is an unwritten local used only as `m.call (this, client, message)`. */
    rustWsDispatchKeyPatterns(declaration: any): Array<Array<string | null>> | undefined;
    /** Whether a parameter is written in its function (assignment, ++/--, destructuring target). */
    rustWsParamWritten(fn: any, param: any): boolean;
    /** `this.safeString (sub, 'k')` reads field k; `this.safeString (list, i)` / `list[i]` over `const list = this.safeList (sub, 'k', ..)`
     *  reads an element of field k. Undefined for any other shape. */
    rustWsSubscriptionKeyRead(init: any): {
        key: string;
        element: boolean;
        source?: any;
    } | undefined;
    /** ral-58w: guard key g when `sub` (the dict a subscription field is read from) is a never-written parameter of a
     *  method whose every mention is a direct `this.m (..)` call inside the then-branch of `if (this.safeBool (s, 'g', false))`
     *  with s (a never-written local or parameter) passed for it, and every write of key g in the class is `'g': true` in an
     *  object literal that, like every literal writing any subscription field read under g, initializes a never-written
     *  const local only handed to `this.watch` / `this.watchMultiple` as the subscription. The read dict is then one of
     *  the literals with `'g': true` (the runtime stores the subscription argument itself). Undefined otherwise. */
    rustWsSubscriptionGuardKey(sub: any): string | undefined;
    /** Patterns of every value the class writes under subscription key `key` (`{ 'key': v }`, `x['key'] = v`); a list
     *  field takes the elements of its array literals. Any other write of the key is an unknown hash. */
    rustWsSubscriptionKeyPatterns(at: any, key: string, element: boolean, depth: number, seen: Set<Node>, guard?: string): Array<Array<string | null>>;
    static rustWsPatternNorm(p: Array<string | null>): Array<string | null>;
    /** ral-55h: the hash text of a request-id echo (`rustWsRequestIdEcho`): some run of decimal digits. */
    private static readonly RUST_WS_DIGITS_HASH;
    /** ral-55h: `const h = this.safeString (message, 'K')` (never rewritten) where every write of key K in the venue file is
     *  an object-literal property `'K': v` whose value is `this.requestId ()`, its `.toString ()`, or a never-rewritten const
     *  local bound to one of those, and the venue's `requestId` is declared to return a number: the reply echoes the id the
     *  request sent, so the hash is decimal digits (the 47h request-id marker, bybit reqId). */
    rustWsRequestIdEcho(declaration: any): boolean;
    /** Whether some string matches both patterns (a sound over-approximation: prefix and suffix agree). */
    static rustWsPatternsMeet(a0: Array<string | null>, b0: Array<string | null>): boolean;
    /** The typed kind a resolved value passes as, or undefined. */
    rustWsResolvedKind(x: any): 'book' | 'cache' | 'dict' | 'list' | undefined;
    /** ral-ye: a read of a plain base cache field the class keeps as a map, typed by the field's declaration:
     *  `this.F` whose declared type is a map (`balance: Dict`, `tickers: Dictionary<Ticker>`), or `this.F[k]` right
     *  after a statement of the same block (or an enclosing one) wrote `this.F[k] = v` with v a map (a declared record /
     *  map type, a map-kinded resolve or `this.extend (..)`), the key a literal or an unreassigned local. */
    rustWsCacheFieldDictRead(n: any): boolean;
    /** ral-ze: a resolved value that is a list on every path: an array literal, a base list field (`this.symbols`), a
     *  call whose every return builds a fresh list (parse* list returns, the always-list producers), a non-nullable
     *  venue list return, or an unreassigned single local bound to one of these (pushes and element writes keep it a
     *  list) or printed as a typed list. */
    rustWsResolvedList(x: any, depth: number): boolean;
    private static readonly RUST_WS_MAP_RECORD_BUILDERS;
    /** A resolved value that is a map on every path: a base record builder call, a sync method of the same class whose
     *  every return is one, or an unreassigned single local bound to one. */
    rustWsResolvedMap(x: any, depth: number): boolean;
    /** Every return of the method body is a map on every path (rustWsResolvedMap), and there is at least one. */
    rustWsMapReturns(declaration: MethodDeclaration, depth: number): boolean;
    /** ral-84f: `declaration` is a method body of the REST venue class that the ws class of `site` directly extends
     *  (`ts/src/pro/<id>.ts` extends the default export of `ts/src/<id>.ts`). The checker resolves `this.m` to the most
     *  derived declaration, so a ws override would have been answered instead, and a ws class with ws relatives has no
     *  resolve table at all. */
    rustWsRestParentMethod(declaration: Node, site: Node): boolean;
    /** Any write of the local after its declaration (an assignment or an update). */
    rustLocalReassigned(declaration: any): boolean;
    /** ral-53h: set while the resolve table builds its `rpats` (read only by `await client.future (h)`; watch calls keep `pats`). */
    private rustWsFoundRefine;
    /** ral-53h: the literal of a never-rebound `const xs = this.findMessageHashes (client, 'lit')` local that is only read
     *  (`xs[i]`, `xs.length`); the base method keeps the futures keys whose text contains 'lit'. */
    /** ral-54h: the element argument may be any hash expression (`accountType + ':positions::'`): an element contains
     *  one text the argument's patterns match, so each pattern p gives [any, ...p, any]. */
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
    /** ral-80a: a helper's resolved value kept for the tuple-slot proof only when it is an array literal whose elements name
     *  no parameter of the helper (so reading them outside the caller's bindings reads the same nodes). */
    rustWsSiteTupleValue(x: Node | undefined): Node | undefined;
    /** ral-80a: `this.cleanUnsubscription (..)` bound to the base tier's method, whose only resolve is `client.resolve (true, unsubHash)`
     *  (a venue override may resolve anything, so it is not this). */
    rustWsBaseCleanUnsubscription(call: CallExpression): boolean;
    /** When `site` sits in a method of `cls` with parameters: the parameter bindings of every call of that method
     *  (`this.m (..)`, or `this.spawn (this.m, ..)`), so a hash or value built from a parameter reads each caller's
     *  argument. Undefined when the method is referenced any other way (a handler table entry) or never called. */
    rustWsHelperCallSites(cls: any, site: any, exprs: any[]): Array<Map<Node, {
        arg: any;
        env: Map<Node, any> | undefined;
    }>> | undefined;
    /** `this.m (..)` of a sync method of the same ws class whose every return is a hash expression: the patterns of
     *  those returns with the method's parameters bound to this call's arguments (defaults when omitted). */
    rustWsReturnPatterns(call: any, depth: number, seen: Set<Node>): Array<Array<string | null>> | undefined;
    private rustWsWsParents;
    /** A pro venue that extends (through its abstract shim) another pro venue, or that another pro venue extends.
     *  ral-57w: the same rule over the prediction tier (`ts/src/prediction/`, shims in `abstract/prediction/`). */
    rustWsHasWsRelatives(file: string, at: number): boolean;
    /** ral-56h: the resolve table across a ws class and its ws subclass (kucoin + kucoinfutures) equals the parent's
     *  own table when the subclass adds no resolve and changes no ws path: every method of the subclass other than
     *  `describe` / `describeData` is a REST-only method (no client, future, resolve, reject, spawn, delay, watch,
     *  subscribe or handler token in its text, no field declaration) that the parent ws file never calls or names. */
    rustWsRestOnlyChild(path: string, parentFile: string): boolean;
    /** A ws subclass whose only methods are `describe` / `describeData` adds no handler and no resolve. */
    rustWsDescribeOnly(path: string): boolean;
    /** The proven kind of an `await this.watch|watchMultiple (..)` initializer, else undefined. */
    rustWsWatchResultKind(init: any): 'book' | 'cache' | 'dict' | 'list' | undefined;
    /** The hash patterns a `this.watch|watchMultiple (..)` call (or a venue wrapper whose every return is one) awaits;
     *  undefined when the call is anything else. Runs with `rustWsHashEnv` binding the wrapper parameters. */
    rustWsAwaitedHashes(call: any, cls: any, depth: number): Array<Array<string | null>> | undefined;
    /** `this.m (.., list, ..)` of a sync method of the same class whose parameter at `at` is never reassigned, pushed to,
     *  element-written or handed on: only read (`p[i]`, `p.length`) or stored as an object literal value. */
    rustWsReadOnlyListArg(call: any, at: number): boolean;
    /** ral-54h: the patterns of a method parameter as the union over every caller's argument (each read in the caller's
     *  scope); undefined when the method is referenced other than by a call, never called, or the parameter is written. */
    rustWsParamCallerPatterns(param: any, read: (arg: any) => Array<Array<string | null>> | undefined, seen: Set<Node>): Array<Array<string | null>> | undefined;
    /** ral-54h: a list parameter never written in its method: each use is `p.length`, `p[i]` read, an object literal
     *  value, an `===` operand or a hash-list argument of `this.watch|watchMultiple`. */
    rustWsListParamReadOnly(param: any, within?: any): boolean;
    /** ral-54h: `this.m (.., list, ..)` of a method of the same class whose parameter at `at` is only read. */
    rustWsListArgParamReadOnly(call: any, at: number): boolean;
    /** The patterns of a watchMultiple hash list: an array literal, a wrapper parameter bound to one, or a list local
     *  initialised from a literal that only grows by `x.push (h)` statements and is read only as a watch argument. */
    rustWsHashListPatterns(harg: any, depth: number): Array<Array<string | null>> | undefined;
    /** ral-56h: `x = r` / `let x = r` in `scope` where x is a local of that method whose every other use is a rebinding
     *  (`x = ..`), a hash-list argument of `this.watch|watchMultiple`, `x.length`, a plain element read or another such copy:
     *  the copy never grows or rewrites the list r names. */
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
    /** A source an optional book local takes: a map read, `undefined` (with `orUndefined`), a constructor (boxed as
     *  `Some`), or a ternary of those with at least one map read. */
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
    /** ral-84a: `n` is the sole argument of a `x.cache.push (n)` statement whose `x` is a typed book local: the book's
     *  `cache_push(v: Value)` takes the box, so a map local enters as `Value::Dict` (or the `Null` its optional form held). */
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
    /** ral-73a: `this.f[..] = x` / `m[k] = x` (m another local or parameter, k a literal or a plain identifier other than x) at
     *  x's last use, or at its last use on its path (rustGuardedBranchLastUse: every later use sits in the else branch of the
     *  nearest if whose then-branch holds the store). */
    rust73aStoreLastUse(place: any, n: any, declaration: any): boolean;
    /** ral-56s: a base `this.arrayConcat (a, b)` (two operands, non-test tier): always a `Value::Arr`. */
    rustBuiltListConcatInit(init: any): boolean;
    /** ral-56s: `t = x` (statement) where `t` is a nil-declared (`let t: T = undefined` / `let t;`) local of the same function
     *  that no rule types (it prints `Value`), so the write takes the boxed list. */
    rustBuiltListValueAliasWrite(n: any, declaration: any): boolean;
    /** ral-56i: `x` as the only element of `x = [ x ]`, an expression statement writing the same list local. */
    rustBuiltListSelfWrap(n: any, declaration: any): boolean;
    /** ral-56i: the whole write `x = [ x ]` of a built-list local (printed `x = Arc::new(vec![Value::Arr(x)])`). */
    rustBuiltListSelfWrapWrite(write: any, declaration: any): boolean;
    /** ral-tf: no later statement of the function pushes to or writes the list, and the use is in no loop or closure. */
    rustBuiltListFrozenAfter(node: any, declaration: any, name: string): boolean;
    /** `this.inArray (needle, x)` (haystack), `this.arrayConcat (a, b)` (either operand) on the base helpers, or the row of a
     *  `stored.append (x)` statement on a ws cache local: hand-written slots taking `impl Into<Value>`. */
    rustBuiltListLentHelperSlot(call: any, n: any): 'inArray' | 'arrayConcat' | 'append' | undefined;
    /** `Promise.all(x)` with `x` its only argument (printed `promise_all(&x)`). */
    rustBuiltListPromiseAllOperand(call: any, n: any): boolean;
    /** ral-xf: `x = this.sortBy* (x, ..)` (base sort, no venue override) on the built list itself: the runtime sorts the
     *  items of the `Value::Arr` it is handed and answers a new `Value::Arr` (exchange_stubs.rs sort_by / sort_by2: any
     *  other variant is handed back as it came, and the moved-in box is always an Arr), so `.into_list()` takes exactly it. */
    rustBuiltListSelfSort(write: any, name: string): boolean;
    /** ral-57i: the target of `y = x`: a `let` local of the same function that is never a built list itself, still printed as the plain
     *  `Value` binding (no typed local, scalar, nil or borrowed decision). */
    rustBuiltListAliasTarget(left: any): boolean;
    private rustBuiltListAliasGuard;
    /** ral-57i: `this.arraySlice (..)` resolved to the base declaration and redeclared by no venue. */
    rustBaseArraySliceCall(call: any): boolean;
    /** `x = this.m(.., x, ..)` naming `x` only there and on the left: the old list moves into the call before the write. */
    rustBuiltListSelfWriteArg(n: any, name: string): boolean;
    /** A right-hand side that answers a `Value::Arr` on every path. */
    rustBuiltListWriteSource(right: any): boolean;
    /** ral-65i: a base runtime `this.filterBy (..)` (RUST_BUILT_HELPER_RETURNS: exchange_stubs.rs filter_by answers
     *  `Value::Array` on every path, the empty list for a non-list input), outside the test tier. */
    rust65iFilterByCall(call: any): boolean;
    /** ral-54i: `[await] this.m (..)` whose declaration spells an array return (`T[]`, or `Promise<T[]>` awaited here) and whose
     *  printed body answers a list on every path (rustCallBuildsContainer over its returns; a venue `Promise<Market[]>` by the zf
     *  table). The callee must not be dispatched virtually, carry a typed signature or be redeclared: a base method no venue
     *  redeclares, or a venue method with no override whose family spells the same type. Its `-> Value` result then holds a
     *  `Value::Arr`, so `.into_list()` moves exactly that list. Only a whole reassignment of a built-list local uses it
     *  (an initializer from such a call keeps its own decision). */
    private rustDeclaredArrayProof;
    rustDeclaredArrayCallWriteSource(right: any): boolean;
    /** ral-55i: `this.m (..)` that the checker resolves to a bodiless overload of a base method (marketIds, marketSymbols):
     *  the proof reads the real implementation (the same-named member with a body), never the overload's spelled type
     *  (ccxt compiles without strictNullChecks). Every `return` of the implementation must build a list, or be dead for this
     *  call: it follows `if (!flag) throw` in its block with `flag` bound to a literal `false` here, or it sits in
     *  `if (p === undefined)` with `p`'s argument proven present (rustPresentListArg). The callee must not be redeclared by a
     *  venue, dispatched virtually or typed, so its `-> Value` result holds a `Value::Arr` and `.into_list()` moves it.
     *  Only a whole reassignment of a built-list local uses it. */
    rustOverloadListCallWriteSource(right: any): boolean;
    /** ral-55i: a whole reassignment from a producer the runtime answers as a fresh `Value::Arr` on every path:
     *  `Object.keys (x)` (runtime object_keys: `Value::Array` for a map, `[]` otherwise; never a ws client handle's key list),
     *  and `s.split (sep)` (native or runtime split, an array on every path). */
    rustBuiltHelperListWriteSource(right: any): boolean;
    /** ral-55i: an identifier argument that cannot be `undefined` at the call: it is a `const` local or an unwritten parameter,
     *  and the call sits in the then branch of `if (a !== undefined)`, or follows `if (a === undefined) throw ..` in an
     *  enclosing block of the same function. */
    rustPresentListArg(call: any, arg: any): boolean;
    /** ral-55i: `await this.m (..)` of a typed unified core whose typed return is `Vec<crate::types::T>`: the printer boxes it
     *  through `IntoRaw::into_raw`, which always builds a `Value::Arr`, so `.into_list()` moves exactly that list. */
    rustTypedCoreListCallWriteSource(right: any): boolean;
    /** ral-53i: `[await] this.m (..)` whose venue declaration the printer's typed-return table (rustVenueContainerReturnKind)
     *  proves a never-null list (`Dict[]` / `any[]` / `List` / `Record[]` / literal tuple, the same type in the whole venue
     *  family, no override): the call prints `-> Value` holding a `Value::Arr`, so `.into_list()` moves exactly that list. */
    rustVenueListWriteSource(rhs: any): boolean;
    /** ral-yf: `await this.<endpoint> (..)` whose abstract declaration spells `Promise<List>` (a non-list answer reads as the
     *  empty list, the landed ral-kc `into_list()` behaviour), or `this.parse<X> (..)` whose declaration returns `T[]`
     *  (every override must return a list too): `.into_list()` moves exactly the list out of the box. */
    rustDeclaredListProducer(rhs: any): boolean;
    /** ral-57i: a base plural parser (not virtually dispatched) called from a venue file whose venue family declares no
     *  method of that name: the Rust call resolves to the base body even where another family (derive parseTrades)
     *  overrides it, so the base's declared `T[]` return holds there. */
    rustBaseParserFamilyFree(call: any, declaration: any, method: string): boolean;
    private static readonly RUST_LIST_PARSERS;
    /** ral-sf: `x = y` as the only statement under `if (Array.isArray (y))` (the then-branch, `y` a plain `Value` local or
     *  parameter never written after its declaration), at `y`'s last use: `y` holds a `Value::Arr` there, so
     *  `y.into_list()` moves exactly that list (no copy, no other variant to lose). */
    rustArrayGuardedMove(write: any): boolean;
    private rustArrayGuardedCopies;
    /** ral-58i: `x = this.safeList (o, k, x)` (safeList / safeList2 / safeListN of the base tier) with the list local itself as
     *  the default: the base body answers the read value only when it is an array and the default otherwise, so both paths
     *  hold a `Value::Arr` (the declared `any[]` overload for an array default says the same). */
    rustSelfDefaultedListRead(right: any, declaration: any): boolean;
    /** ral-58i: `c ? y : [ .. ]` where `c` is `Array.isArray (y)` or a const local initialised to it, `y` a const local or
     *  parameter of the same function and the other branch a list source: both paths answer a `Value::Arr`, so the
     *  printed ternary's `.into_list()` moves exactly that list (no other variant to lose). */
    rustArrayGuardedTernary(right: any): boolean;
    /** ral-52i: `id` names a plain `Value` local or parameter of its own function (no typed local form). */
    rustPlainValueBinding(id: any): boolean;
    /** ral-57i: a `this.X(.., x, ..)` argument in the then-branch of the nearest enclosing if whose later reads all sit in
     *  that if's else-branch (rustGuardedBranchLastUse), with no other read of x in the same statement: x moves there. */
    rustBuiltListBranchLastUse(node: any, declaration: any): boolean;
    /** ral-uf: every later read of `node`'s local lies in the else branch of `guard` (a path disjoint from the move) and
     *  nothing reads it after the if statement; no loop or closure sits between the move and the declaration. */
    rustGuardedBranchLastUse(node: any, declaration: any, guard: any): boolean;
    /** ral-uf: `x = y`, y a never-written `[]`-defaulted `safeList*` local still printed as the plain `Value` binding, at its
     *  last use (or read again only in the else branch of the if whose then-branch holds the write): y is always an Arr. */
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
    /** ral-xf: a literal with bare local elements, exactly as its `Value` box printed it (`Value::from(vec![a.clone(), ..])`):
     *  the native `vec![..]` holds the same element texts, so each copy the box made is the only one (none added). */
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
    /** ral-87rf R1: `const x = await this.m (..)` where `m` is an implicit-API endpoint (declared in `ts/src/abstract/`), outside
     *  the test tier. Whatever the endpoint answers, the split form keeps the list it held (`Some`) and the map it held, so an
     *  `Array.isArray (x)` test reads `is_some()` and every list-arm use reads the held list. */
    rust87rfEndpointSplitSource(declaration: Node, init: Node): boolean;
    /** ral-80c R1: an unwritten method parameter whose typed signature slot is a string list (decided from the signature table). */
    rust80cStrVecParamAlias(init: Expression | undefined): boolean;
    /** ral-80c R1: `this.symbols` / `this.ids`, base fields declared `string[]` (always a list). */
    rust80cBaseStrListField(node: Expression): boolean;
    /** ral-80c R1: `x.push(v)` statement on an optional list alias. */
    print80cOptListPush(node: CallExpression, parsedArg: string | undefined): string | undefined;
    /** `xs[N]` on a `string[]` parameter the body re-binds as its slice (`xs.get(N)`). */
    rustOptListParamRead(node: any): boolean;
    rustOptListParamInit(init: any): boolean;
    /** ral-80d: `n` sits in the arm where `Array.isArray (x)` held: the then-branch / true arm of `Array.isArray (x)`, or the
     *  else-branch / false arm of `!Array.isArray (x)` (an `if` statement or a conditional expression inside `fn`). */
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
    printOptListWrite(left: any, right: any): string | undefined;
    printOptListNullTest(left: any, right: any, op: any): string | undefined;
    printOptListIsArray(node: any): string | undefined;
    printOptListLength(node: any): string | undefined;
    printOptListElement(receiverNode: any, keyNode: any): string | undefined;
    /** `&x` at an any-key reader, the shared handle at a `Value` slot, a move at `return x`. */
    printOptListIdentifier(node: any, text: string): string | undefined;
    /** `[..]` without spread is always a list, so `into_opt_list` keeps exactly what the box held. */
    rustOptListLiteralWrite(node: any): boolean;
    rustOptListExtraUse(n: any, declaration: any): 'join' | 'move' | 'clone' | undefined;
    /** A plain local (not this list, no container rule of its own) that takes a whole optional list as a `Value`. */
    rustOptListAliasTarget(place: any): boolean;
    printOptListJoin(node: any): string | undefined;
    private static readonly RUST_HANDED_DICT_SOURCES;
    private rustHandedDictDecisions;
    rustHandedDictLocal(declaration: any): boolean;
    /** `this.m (..)` resolved to the base tier, `m` in `names`. */
    rustBaseCallNamed(call: any, names: Set<string>): boolean;
    rustHandedDictLocalUncached(declaration: any): boolean;
    private static readonly RUST_ALWAYS_MAP_HELPERS;
    private static readonly RUST_84G_GROUP_HELPERS;
    /** The initialiser of a reassigned handed local answers a map on every path. */
    rustHandedMapInit(declaration: any): boolean;
    /** ral-55a: `let x: Dict = this.omit (y, [ 'a', .. ])` (identifier head, literal keys, one line): the typed declaration
     *  `let mut x: crate::value::Dict = self.omit(&y, &["a", ..], &[]).into_dict();` measured as printed, indent included,
     *  stays within the 400-char line budget (the TS-text 240-char guess refuses a long key list that prints narrower). */
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
    /** ral-87rg R1: `[ v, x ] = this.handleParamBool|String|Integer[2] (x, ..)` on the base runtime helper, whose first argument
     *  is the very local the slot writes back (so slot 1 is that map, or its omit, on every path). */
    rust87rgParamSlotCall(call: CallExpression, n: Node): boolean;
    rustNilSlotDictCandidateUncached(declaration: any): boolean;
    rustNilSlotLineOk(n: any): boolean;
    rustShortDestrHeads: WeakSet<any>;
    /** ral-54f: a typed params map boxed whole (`Value::Dict(x)`, +13 over the `x.clone()` it replaces) as an argument of a
     *  `[a, b] = this.m (.., x)` destructure write: admitted when that one printed line stays within 400 (non-test sources). */
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
    /** ral-59a: a base `this.omit (x, k1, k2, ..)` with literal extra keys and no spread: the call keeps its printed
     *  `optional_args` slice, only the head is lent (`OmitSource for &Dict`). */
    rustHandedRestOmit(call: any): boolean;
    /** `let mut x: crate::value::Dict = <slot read>.into_dict()` for a handed params slot. */
    printRustHandedDictSlot(element: any, printedName: string, read: string, indent: string): string | undefined;
    /** `n` is the first operand of a two-operand base `this.extend (n, x)`. */
    rustExtendHeadUse(n: any): boolean;
    private static readonly RUST_EXTEND_HEAD_CALLS;
    private rustUntilHeadDecisions;
    /** qe: slot 0 of `const [ x, p ] = this.handleUntilOption (k, r, ..)` with `r` a map literal or a typed map local:
     *  the base helper hands `r` back (inserting the until key), so the slot is that map on every path. */
    rustUntilRequestSlot(element: any): boolean;
    rustUntilHeadSlot(element: any): boolean;
    /** Slot 0 of `const [ x, p ] = this.handleUntilOption (k, r, ..)` with `r` a map literal or a typed map local,
     *  used only as an extend head or written at literal keys (`Arc::make_mut(&mut x).insert(..)`). */
    rustUntilHeadSlotUncached(element: any): boolean;
    /** 41i: `n` is the first argument of a base borrowed-key reader (`safeInteger` / `safeString` ..) read with a literal key. */
    rustUntilHeadReaderUse(n: any): boolean;
    /** `x` (moved at its last use) or `&x` for a shared-map local as the head of a base `extend`, else undefined. */
    printExtendHeadArg(node: any, text: string): string | undefined;
    /** ral-qd: a local initialised from a `this.parse*(..)` call. */
    rustParseResultLocal(declaration: any): boolean;
    /** The literal key of a statement write `n['k'] = v` (one level, not a book-meta or replaced key). */
    rustUntilHeadKeyWrite(n: any): string | undefined;
    /** ral-40f: the literal keys of a statement write `n['k1']..['kN'] = v` (N >= 2) rooted at `n`: every key a plain string
     *  literal (no replaced, digit, book-meta or `__` tag key), the value not reading `n`. */
    rustSlotNestedInsertKeys(n: any): string[] | undefined;
    private static readonly RUST_SLOT_NESTED_TAG_ACCESS;
    /** ral-40f: the target of a nested write printSlotNestedInsert prints (a typed params slot, literal keys). */
    rustPrintedSlotNestedWrite(place: any): boolean;
    /** ral-40f: `p['k1']..['kN'] = v` on a typed params slot (`crate::value::Dict`), in place, no copy: the first hop is the
     *  map's own `entry("k1").or_insert(Value::Null)` (the very arm `get_value_mut` runs on a `Value::Dict` with a `Str`
     *  key), every hop below and the write keep their helpers (`get_value_mut` / `add_element_to_object`, so a `Null` /
     *  non-map inner is skipped and tagged inner maps keep their routes; value.rs nested_slot_insert_tests). */
    printSlotNestedInsert(left: any, right: any, valueText: string): string | undefined;
    /** `std::sync::Arc::make_mut(&mut x).insert("k".into(), v)` for a literal-key write on a typed request slot. */
    printUntilHeadKeyWrite(left: any, right: any, valueText: string): string | undefined;
    private rustLentListParamDecisions;
    rustParamIsLentList(param: any): boolean;
    private static readonly RUST_LENT_LIST_TYPES;
    private static readonly RUST_LENT_RESPONSE_READERS;
    rustParamIsLentListUncached(param: any): boolean;
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
    /** A method of a venue source (REST, pro or prediction) whose name the base tier never declares: each venue's
     *  Rust method is an inherent one, so its signature is its own (a same-named method elsewhere is independent,
     *  and the checker resolves a `this.` call to the declaration Rust picks); by-name arms pass a `Value`. */
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
    /** A declared endpoint response (`Promise<Dict>` / `Promise<List>`) handed whole to a parameter that is lent
     *  `impl Into<crate::Value>`: the shared map or list is lent as `&x`, the callee binds the `Value` once. */
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
    /** Typed slots (parameter index -> Rust type; a symbol list is lent as `impl Into<crate::Value>`) and the positional
     *  count of a base `filterBy*` method or its override. */
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
    /** A lent symbol-list slot of a typed filter method other than the `impl Rows` rows slot (ral-ib). `rustLentListSlot`
     *  asks this one: the rows slot then falls through to the callee's own first-parameter test, as before ib, while
     *  the lent-as / borrowed / endpoint rules keep their own filterByArray rows handling. */
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
    rustParamIsLentDictUncached(param: any): boolean;
    /** A method of that name is declared outside the base tier: in this program (checker-visible), or in a venue
     *  source next to the base tier, which a base-only program does not load. Either keeps the `Value` signature. */
    rustLentOverridden(name: string): boolean;
    private rustVenueMethodNamesByRoot;
    /** Method names declared by the venue sources under `srcRoot` (REST, pro, prediction). */
    rustVenueMethodNames(srcRoot: string): Set<string>;
    /** A method declared in exactly one venue source (REST, pro or prediction) and nowhere in the base tier: every
     *  call site is in that venue or its ws subclass, and its by-name dispatch arm passes a `Value`, which still fits. */
    rustVenueLocalMethod(method: any, name: string): boolean;
    private rustVenueMethodDeclCountsByRoot;
    /** Class-member method declarations per name over the base tier and the venue sources (base counts twice). */
    rustVenueMethodDeclCounts(srcRoot: string): Map<string, number>;
    /** The callee parameter a call argument lands in, when that parameter takes a lent dict. */
    rustLentParamsSlot(call: any, arg: any): boolean;
    /** `&x` for a handed dict local lent to a lent-params slot. */
    printLentParamsArg(node: any, text: string): string | undefined;
    /** `let mut params: Value = params.into();` heading a method whose params dict is lent: the body reads the `Value`. */
    rustLentParamsBinding(node: any, identation: number): string;
    /** A base `handleUntilOption` / `handleParam*` call, or any `this.handle*` call whose slot 1 the checker types as a
     *  dict: that slot is the params dict, like a `handle*AndParams` one. */
    rustLentSlotSource(init: any, element: any): boolean;
    /** The call a slot destructures, past parentheses, casts and one `await`. */
    rustAwaitedCall(node: any): any;
    rustHandedSlotBoxUse(n: any, declaration: any): boolean;
    /** ral-68d: a params slot of `const [ a, p ] = this.handle*AndParams (x, ..)` returned whole: `x` is an identifier the
     *  checker types a `Dict` (the base helper hands back that map or a copy of it), and `p` is never written at a key. */
    rust68dReturnedParamsSlot(declaration: any): boolean;
    /** ral-59a: a local initialised or rewritten whole from another identifier (`let x = y` / `x = y`): handing it to a
     *  `Value` slot moved its source before; typing it would copy the source at the write instead. */
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
    /** `ostr` for a string slot read through the scalar forms: tests, `format!` concats, string methods, typed
     *  writes, and boxes (alias, ternary arm, `Value` slots) that re-box through `From`; needs one native use. */
    rustStrSlotKind(element: any, scope: any): string | undefined;
    /** 42i: `n` (through parens) is a direct element of an array literal: the list boxes each element itself, so the
     *  local the list is written to never takes this slot's type. */
    rustStrSlotListElement(n: any): boolean;
    /** zi: `n` is an arm of `c ? a : b`, the whole initializer of a local the joint solve currently types `Option<String>`
     *  (or `String`), and the other arm prints as that kind too: the target is decided with the slot, never left `Value`. */
    rustStrSlotTernaryArmJoined(n: any, element: any): boolean;
    /** 40i: the other arm is a typed string local of the same function read here for the last time (bybit withdraw
     *  `defaultAccountType`): the arm moves it into the target, so typing the target adds no copy. */
    rustStrTernaryOtherArmMoves(other: any, ternary: any): boolean;
    /** ral-53f: a box that is a call argument or an object-literal value below another local's initializer / write
     *  (`safeDict (this.options, type, {})`, `extend ({ 'type': type }, ..)`), never that local's value itself (not reached
     *  through parentheses, ternary arms or `||` / `&&` / `??` operands only): the target's typing does not read the slot. */
    rustStrSlotBoxIsNotValueOf(n: any, feeds: any): boolean;
    /** ral-53f: the boxed read (`x.clone().map(Value::from).unwrap_or(Value::Null)`) keeps every printed line of its
     *  statement within 400 chars, so the guarded body never boxes a neighbouring typed local back to make room. */
    rustStrSlotBoxLineFits(n: any): boolean;
    /** pb: a checker-string slot of a native tuple in a method, read whole as the initializer or the statement write of
     *  another local of the same function: the slot and that local are decided together by `rustScalarSolveScope`. */
    rustSlotJoinsSolve(element: any): boolean;
    /** qe: slot `i` of `await Promise.all ([ .., x, .. ])` whose operand `x` is a local printed `crate::value::Dict`
     *  (never the optional form): `promise_all` hands each operand back as it came, so the slot is that map. */
    rustPromiseAllDictSlot(element: any): boolean;
    /** xi: the awaited call behind slot `i` of `const [ .. ] = await Promise.all (x)`: `x` an array literal (or a
     *  never-written local bound to one, read only by this call) of exactly the pattern's length, whose element `i` is
     *  that call inline or a never-reassigned local initialised by it. `promise_all` hands each element back as it came. */
    rustPromiseAllOperandProducer(element: any): any;
    /** zf: the awaited producer behind a `Promise.all` slot when it answers a list on every path (a declared
     *  `Promise<List>` endpoint, a non-overridden venue method declared `Promise<List | X[]>`, or a typed unified core
     *  whose `Vec<T>` result boxes through `IntoRaw` as an Arr); `promise_all` hands it back as it came. */
    rustPromiseAllListProducer(element: any): any;
    /** zf: a venue-private async method (no override, no typed signature) whose every family declaration returns `Promise<Market[]>`. */
    rustVenueMarketListMethod(declaration: any): boolean;
    private rustPromiseAllListKinds;
    rustPromiseAllListSlotKind(element: any): 'list' | undefined;
    /** `let mut x: crate::value::List = <slot read>.into_list()` for a Promise.all list slot (the producer is always a list). */
    printPromiseAllListSlot(element: any, printedName: string, read: string, indent: string): string | undefined;
    rustDeclaredDictSlot(element: any): boolean;
    /** zi: `const [ a, b ] = c ? this.f (..) : this.g (..)`: slot `at` is a map when each arm's own callee declares it one
     *  (the venue-pair form of `rustDeclaredDictSlot`; the temp keeps its `Vec<Value>` head). */
    rustTernaryDictSlot(element: any): boolean;
    /** ral-54f: the last slot of a base `this.handle*AndParams (..)` whose own tuple return declares it a bare `Dict`
     *  (`handleTriggerPricesAndParams`: `[Str, Str, Str, Dict]`) is the params map handed back, exactly as slot 1 of the
     *  two-slot helpers. Non-test sources only (the caller checks the tier). */
    rustBaseHandleLastDictSlot(element: any): boolean;
    /** ral-66s1: slot 1 of `const [ a, p ] = super.handle*AndParams (..)` inside a venue override, the base helper's own
     *  tuple return declaring that slot a bare `Dict`: the params map handed back, exactly as for a `this.` call. */
    rust66s1SuperHandleParamsSlot(element: any): boolean;
    rustCallDeclaresDictSlot(init: any, at: number): boolean;
    /** Every `return` of the callee's own body is an array literal whose element `at` is a map literal or a `const`
     *  local initialised with one (a map on every path, whatever keys are written into it). */
    rustReturnsBuildMapSlot(declaration: any, at: number): boolean;
    /** One element read rooted at the bearer: a plain read the native op serves. */
    rustReadBearerElementUse(access: any, kind: 'list' | 'map'): boolean;
    /** Key a read-only bearer serves natively: a literal string for a map, a
     *  literal (or proven-number `Value`) index for a list. */
    rustReadBearerKeyOk(kind: 'list' | 'map', keyNode: any): boolean;
    /** Native read of one bearer level; undefined keeps the helper. */
    printReadBearerAccess(kind: 'list' | 'map', receiverText: string, keyNode: any): string | undefined;
    /** Container kind a printed `Value` expression provably yields on every path. */
    rustContainerProducingKind(node: any, seen: Set<Node>): 'list' | 'map' | undefined;
    /** Declared element type of a container indexed by a string key. */
    rustStringIndexedElementType(node: Node | undefined): Type | undefined;
    private rustNestedBearerDecisions;
    /** The declaration behind `node` when it is a local typed as a two-level
     *  dict bearer. */
    rustNestedDictBearerDeclaration(node: any): any;
    rustNestedDictLocalIsTyped(declaration: any): boolean;
    /** `{ k: { .. }, .. }` — every value an object literal, every key a plain
     *  string: the outer map's value type is the inner `IndexMap`, never a box. */
    rustNestedDictLiteral(node: any): any;
    rustNestedDictLocalIsTypedUncached(declaration: any): boolean;
    /** One use rooted at the bearer: exactly two key levels, either read
     *  (`x[k1][k2]` in a value position) or a whole-entry write (`x[k1][k2] = v`
     *  whose value never reads the receiver, which the write holds `&mut` of). */
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
    /** `k in X` with a non-literal key on a dict-shaped receiver: `in_op`'s Dict arm.
     *  The Arr arm is the only other `true` path; the dict proof excludes it. */
    provenDictFieldInOp(key: any, obj: any): string | undefined;
    /** `delete X[k]` on a receiver the native-insert proof admits (never a ws
     *  subscriptions snapshot, so `try_ws_subs_remove` is dead): `shift_remove`. */
    provenDictFieldDelete(node: any): string | undefined;
    /** ral-59p: the borrowed `Option<&str>` text of a `dkey` string local key, else undefined. */
    rust59pDeleteKeyText(keyNode: any): string | undefined;
    /** A key the native `if let` can borrow beside `&mut RECV`: one expression
     *  (no statement), naming neither the receiver nor its owner — the tuple
     *  would borrow `self` twice — and never a bare `self`. */
    rustDeleteKeyBorrowable(keyExpr: string, recv: string): boolean;
    /** `this.<field>` with a declared plain-dict type that is no ws container: the
     *  hand-written base builds these maps itself and never tags them. */
    untaggedDictField(node: any): boolean;
    rustDeclaredPlainDictField(node: any): boolean;
    /** `Object.keys/values(X)` in REST-tier sources (`ts/src/<id>.ts`): no ws client
     *  there, so X never carries the `__ws_subs_url`/`__ws_sub_ref` tags the helper filters. */
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
    printNativeStringPadStart(node: any, receiverText: string): string | undefined;
    printNativeStringPadEnd(node: any, receiverText: string): string | undefined;
    printNativeToFixed(node: any, receiverText: string): string | undefined;
    /** ral-43b: `call` sits in the right side of a `+=` (the typed `String` target's push_str join keys on the old operand
     *  text, bitget / bybit `channel += limit.toString ()` went back to `Value` in gate 14163): keep the old path there. */
    rust43bInPlusEquals(call: any): boolean;
    /** ral-43b: `n` is the only argument of `recv.indexOf(n)`, a typed string local (not a ws key), and `recv` is a string-typed
     *  `Value` place (a plain identifier / property chain that is no typed local): the needle reads as `Option<&str>` in the
     *  `zip` find, `-1` when either side is not a string, exactly the helper's answer for the `Str` / `Null` the box held. */
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
    /** Base-tier bool readers whose Rust form returns `Value::Bool` or `Value::Null`
     *  (`safe_bool*` keep only `Value::Bool` or the default; the `check_option_bool` stub). */
    private static readonly RUST_BOOL_READERS;
    private static readonly RUST_DICT_READERS;
    /** A REST venue file (`ts/src/<id>.ts`): no base / pro / prediction tier. */
    private static readonly RUST_REST_FILE;
    /** Extra plain-dict write sources (write-history proof), REST venue files only: no
     *  runtime tagged handle (book, ws subscription, cache bucket) is reachable there. */
    private rustVisiting;
    rustPlainDictSource(node: any, depth?: number): boolean;
    /** `this.options`, a parameter, or a const local whose initializer reads no `this` field
     *  but `options` and no tagged container (`hashmap`, `subscriptions`, `futures`). */
    rustUnsharedDict(arg: any): boolean;
    /** `this.m (…)` on a sync method of the calling file whose every `return` is a plain
     *  literal, a plain local, or `this.extend|omit|keysort (plain, …unshared)`. */
    rustPlainBuilder(call: any, depth: number): boolean;
    rustPlainReturn(expr: any, depth: number): boolean;
    /** The single bodied method declaration `this.m (…)` resolves to (implementation of an
     *  overload set), in the calling file or the base tier. */
    /** A sync base method no venue source declares and outside virtual dispatch: a base-tier `self.m()` runs this body. */
    rustBaseOnlyCallee(declaration: any, name: string): boolean;
    rustMethodImpl(call: any, baseOnly?: boolean): any;
    /** The expression's Rust value is always `Value::Bool(_)` or `Value::Null`. */
    rustBoolValue(expr: any, depth?: number): boolean;
    /** A base `safeBool*` with a bool default, `checkOptionBool`, or a method (calling file or
     *  base tier) whose every `return` is such a value. */
    rustBoolCall(call: any, depth: number): boolean;
    rustEveryReturn(call: any, depth: number, ok: (e: any) => boolean): boolean;
    /** Element `index` of `this.m (…)`'s tuple is a bool value on every return path. */
    rustBoolTupleElement(expr: any, index: number, depth: number): boolean;
    /** A local whose declaration and every write store a bool value. Locals the printer or
     *  ccxt's narrowBoolLocals may declare `bool` (bool-expression initializer) are left out. */
    rustBoolLocal(ident: any, depth: number): boolean;
    /** A local whose declaration already prints `let mut x: bool` (e.g. from a typed base helper such as `valueIsDefined`,
     *  ral-le): its reads are native bools, never the `Value` truthiness form (RAL-INT-33: lh's base-only return proof
     *  made `rustBoolValue` answer true for such locals too). */
    rustNativeBoolLocal(inner: any): boolean;
    /** `if (x)` on a local or `this.m (…)` proven a bool value: `x.as_bool() == Some(true)`
     *  is `is_true` on `Value::Bool`/`Value::Null`; bool slots only (leading-token boxing). */
    rustNativeTruthiness(node: any): string | undefined;
    /** `x === true|false` with `x` proven a bool value: `is_equal` against a `Value::Bool` is
     *  the payload compare there (Null matches neither). */
    rustNativeBoolEquality(left: any, right: any, op: any): string | undefined;
    rustProvenStrSource(node: any): boolean;
    rustProvenStrIdentifier(node: any): boolean;
    /** A destructuring / for-in-of target: a write the direct-assignment check cannot see. */
    rustWriteTarget(node: any): boolean;
    /** `x` / `(x as string)` → the identifier under parens / `as`. */
    rustPeelCast(node: any): any;
    /** Printed text of an operand that is always `Value::Str` / `Value::Null`, else undefined:
     *  a proven-`Str` local, a checker-`string` declared local/param (the checker-string needle rule), or
     *  `"lit" + e` / `e + "lit"` (the `add` helper's string branch always yields `Value::Str`). */
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
    /** `x[a ± b]` on a checker-proven list, each operand a numeric literal, a `Value` loop
     *  counter or a `const n = y.length` local: the key prints as a `Value` number, so the
     *  list arm of `get_value` (Int index, else miss) is spelled natively. */
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
    /** A source that is a `Value::Arr` or `Value::Null` (both helpers agree with `len()` / a no-op
     *  push there): `[...]`, nullish, a runtime `split`, base `toArray`, or a base `safeList*`
     *  read whose default is absent, nullish or `[...]`. */
    arrSource(node: any, allowNull: boolean): boolean;
    /** A local whose every write (declaration included) is an `arrSource`, never captured by
     *  a closure: its `Value` is a plain `Value::Arr` (the runtime never tags an array). */
    arrLocal(ident: any, allowNull: boolean): boolean;
    /** `x[i]` on an Arr-only local, except the initializer shapes the native get_value
     *  post-pass already retypes to `Vec<Value>`/native reads (it owns those). */
    arrReadLocal(ident: any): boolean;
    private ownedArrayInitializer;
    /** `x.length` on an Arr-only local: `get_array_length`'s marker arms need a Dict. */
    arrLength(node: any, receiver: string): string | undefined;
    /** `x.push(v)` statement on an Arr-only local: `append_to_array`'s cache-push arm needs a Dict. */
    arrPush(node: any, name: string | undefined, parsedArg: string | undefined): string | undefined;
    /** ral-55k: a never-reassigned `Value` local initialised `f['lit']` (string-literal key), where `f` is itself a never-reassigned
     *  bearerReadLocal (an element read of a typed plain map local). ccxt's write-back pass binds identifier keys only. */
    rustLitKeyBearerReadLocal(ident: any): boolean;
    /** A `Value` local whose single declaration is an element read of a local typed as a
     *  plain `IndexMap<String, Value>`: plain data all the way down, never a book handle. */
    bearerReadLocal(ident: any): boolean;
    boolCallEquality(left: any, right: any, op: any): string | undefined;
    /** `fn(...)` whose first `(` closes at the very end (string literals skipped). */
    boolCallBalanced(text: string): boolean;
    nativeNumericAdd(op: any, left: any, right: any, leftText: string, rightText: string): string | undefined;
    /** Base-tier (`ts/src/base/**`) `Object.keys/values(x)` on a proven plain local. */
    baseEnum(node: any, parsedArg: string | undefined, kind: 'keys' | 'values'): string | undefined;
    private static readonly RUST_PURE_STRING_METHODS;
    /** `x['k'].m (…)` with `m` a non-mutating string method on a checker-`string` read: no
     *  ccxt pass rewrites that target (only `.push` / calls of the read itself). */
    pureStringMethodReceiver(node: any): boolean;
    /** Locals whose Arr-only proof is in progress (a self-referencing write proves nothing new). */
    private arrVisiting;
    /** More always-`Value::Arr` sources for the Arr-only proof: base `arrayConcat` (Array on every
     *  arm), base `sortBy`/`sortBy2` of an Arr-only local (returns its input's variant), and a
     *  plain alias of a non-nullable Arr-only local (COW: the push never reaches the alias). */
    extraArrSource(n: any): boolean;
    /** ral-87rg R4: `this.aggregate (x)` bound to the base helper (a hand-written runtime stub that returns `Value::Array(..)` for
     *  every input: the non-list case answers `[]`), so a `sortBy` over it hands a list back. */
    rust87rgAggregateCall(n: Node): boolean;
    arrAlias(ident: any): boolean;
    assumedNumericSelf(inner: any): string | undefined;
    private strVisiting;
    /** Always `Value::Str`: string-helper shapes, a `+` chain with such an operand, or an always-Str local. */
    alwaysStrOperand(node: any): boolean;
    /** A plain `Value` local, never captured by a closure, whose every write is always-Str (`x += e`
     *  keeps it), or Str|Null (proven-Str source / nullish) when the checker narrows this read to `string`. */
    alwaysStrLocal(ident: any, allowNull?: boolean): boolean;
    concatAnchor(node: any): boolean;
    strOrNullConcatIsAnchored(left: any, right: any, leftType: any, rightType: any): boolean;
    /** `Option<&str>` text of an operand that is always `Value::Str` / `Value::Null`, else undefined. */
    strOrNullOperand(node: any): string | undefined;
    strOrderedComparison(node: any, op: any, left: any, right: any): string | undefined;
    rustSourceTier(node: Node): 'rest' | 'base' | 'pro' | undefined;
    plainSourceTier(node: Node): boolean;
    /** A copied/read dict argument outside REST: in pro only `this.options` or a proven plain
     *  local; in base also a parameter annotated with a plain-dict type (no `any` caller handle). */
    tierSourceOk(arg: any): boolean;
    /** `this.extend (plain, …unshared)` / `this.omit|keysort (plain, …)` called directly
     *  (not only as a builder's return): the same fresh-copy proof as `rustPlainReturn`. */
    private copyVisiting;
    freshCopy(node: any, depth: number): boolean;
    looseF64(binding: string): string;
    plainValueOperand(node: any): boolean;
    nativeCoercingArithmetic(op: any, left: any, right: any, leftText: string, rightText: string): string | undefined;
    nativeLooseOrderedComparison(node: any, op: any, left: any, right: any): string | undefined;
    nativeStrOrNullConcat(left: any, right: any, leftText: string, rightText: string): string | undefined;
    strOrNull(node: any, depth: number): boolean;
    /** Every dict `node` can evaluate to holds `key` as Str/Null or lacks it (a read of a missing key / non-dict is Null). */
    dictFieldStrOrNull(node: any, key: string, depth: number): boolean;
    /** `this.m(..)` resolved to a same-file method with a body whose every return holds `key` as Str/Null. */
    methodFieldStrOrNull(call: any, key: string, depth: number): boolean;
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
    /** ral-63x: `&str` parameter, every call site in the file passes a string literal at its index, and some
     *  `let x = <param>` declaration of the body reads it whole. */
    rust63xLiteralSeedStrParam(method: any, param: any, rustType: string): boolean;
    /** ral-63x: a sync ws method with a declared `string` return (`-> Option<String>`, no kept arm: no by-name or ws
     *  handler arm) and no override, trait slot or typed-return entry. Its string parameters may print typed; should
     *  the return still print `Value`, a string slot is one an arm decodes (rustDispatch.wsArg `str` / `optstr`). */
    rust63xNoArmStrMethod(method: any): boolean;
    /** ral-64x: `n` is a whole argument of a `this.m (..)` call whose parameter at that index prints `Option<i64>`
     *  (rustVenueStrParamType). The slot local is passed as it is (Copy, no box). */
    rust64xOintParamArg(n: any): boolean;
    private static readonly RUST_BASE_SCALAR_PARAM_METHODS;
    private static readonly RUST_BASE_ASYNC_SCALAR_PARAM_METHODS;
    private static readonly RUST_OVERRIDE_GROUP_STR_PARAMS;
    private rustOverrideGroupAgreeByRoot;
    /** The first parameter of a listed override group when ALL declarations (base, prediction base, every venue,
     *  pro and prediction override) spell it `<name>: string`; one disagreeing declaration keeps the whole group `Value`. */
    rustOverrideGroupParam(method: any, param: any, file: string): boolean;
    /** A sync method of the base `Exchange` class with no override in any venue file, no trait slot and no typed
     *  signature: every call resolves to this one body, so typing its parameter changes no other declaration. */
    rustBaseOnlyMethod(method: any, file: string): boolean;
    /** Rust type of a scalar TS parameter type: string -> `&str`, `number` / `Num` -> `f64`, `int` / `Int` -> `i64`,
     *  boolean -> `bool`; a nullable part makes it an `Option` (never for `bool`). */
    rustVenueScalarTypeOf(type: any, typeNode: any): string | undefined;
    /** A caller argument that converts to a numeric / boolean slot without changing its value, decided on the
     *  source alone: `null` only for an `Option`, and an `i64` slot takes an integer literal or a value declared
     *  `int` / `Int` (a `number` could carry a fraction). */
    rustVenueScalarArgExact(arg: any, rustType: string): boolean;
    /** ral-64x: `arg` is the caller's own required `&str` parameter, and every read of it is either a ws url / hash
     *  slot or the argument at `at` of a call to `method` (syntactic, so deciding `method`'s slot does not ask back). */
    rust64xLentStrParamArg(arg: any, method: any, at: number): boolean;
    /** ral-64x: every read of `param` is a ws url / hash slot (ral-yc) or a call argument `other` accepts. */
    rust64xStrParamReadsLent(param: any, other: (call: any, at: number) => boolean): boolean;
    /** `this.<m>(..)` / `super.<m>(..)` calls in the method's own file that resolve to it. */
    rustVenueStrCallSites(method: any): any[];
    /** ral-ve: an identifier bound once (`const`) to a `this.urls[..]` literal-key read: a url string or Null. */
    rustWsUrlReadIdent(arg: any): boolean;
    /** ral-ve: a required `string` parameter of a per-venue ws method that every caller in its file fills with a
     *  `this.urls[..]` read: the url of a ws client (requestId / subscriptionExistsForHash / waitForPendingUnsubscribe). */
    rustVenueUrlParam(method: any, param: any): boolean;
    /** ral-yc: a required `&str` venue parameter whose every read is a ws url / hash slot (`client(x)`, `watch` /
     *  `watchMultiple` url, `watch` hashes: all `impl Into<Option<&str>>`) needs no `Value` binding: the borrow goes
     *  there as it came in. Never written, never read anywhere else. */
    private rustVenueStrUnbound;
    rustVenueStrParamUnbound(param: any): boolean;
    rustVenueStrParamUnboundUncached(param: any): boolean;
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
    /** ral-va: a typed string read in a by-value list element whose box copies (`Value::from(x.clone())`, not its last use):
     *  it leaves the local in place, so a borrow of the same local in that call needs no copy of its own. */
    rustScalarBoxCopies(u: any): boolean;
    /** A literal, an identifier, a field read, or a call: the converted argument stays short. */
    rustVenueStrSimpleArg(arg: any): boolean;
    /** The argument node lands in a per-venue string slot of its call. */
    rustVenueStrArgSlot(arg: any): boolean;
    /** Argument text for a per-venue string slot: a typed local or literal natively, any other value read once. */
    rustVenueStrArgText(arg: any, type: string, identation: number): string;
    /** Argument text for a numeric / boolean per-venue slot: literals natively, a typed parameter read back once,
     *  any other value read once from its `Value`. */
    rustVenueScalarArgText(arg: any, type: string, identation: number): string;
    /** An `f64` rebinding turns an integer argument into a `Float`: admit it only when every body read is blind to
     *  that variant (a null / truthiness test, an ordered comparison, or `numberToString` / `parseToInt`). */
    rustVenueFloatUsesStayInside(method: any, param: any): boolean;
    rustVenueArithmeticArg(arg: any): boolean;
    /** `!x` over a simple operand: a `bool` slot reads it once as a native negation. */
    rustVenueNegatedArg(arg: any): boolean;
    /** Base `parseToInt(p)` over a required numeric per-venue parameter: an `Int` for every number (`parse_int` of
     *  the float text), read once as an `i64`. */
    rustVenueParseToInt(node: any): boolean;
    /** An optional parameter may print positionally when its default is absent and every optional parameter before
     *  it does too (they form the positional prefix of the optional tail). */
    rustVenueOptionalSlotOpen(method: any, param: any): boolean;
    /** An optional per-venue parameter that prints as a typed positional `Option`. */
    rustVenuePositional(param: any): boolean;
    private static readonly RUST_CURRENCY_SLOT_METHODS;
    private rustCurrencySlotDecisions;
    rustCurrencySlotParam(param: any): boolean;
    /** `currency: Currency = undefined`, the second parameter of a listed base method (or of an override of one), never written. */
    rustCurrencySlotParamUncached(param: any): boolean;
    private static readonly RUST_CURRENCY_PARSE_METHODS;
    /** A `Currency = undefined` parameter of a listed currency parser: every parameter before it required (or itself a lent
     *  currency), never written. */
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
    /** ral-43e: a venue (not base-tier) method declared `Market` / `MarketInterface`, not async, whose every return is a
     *  `safeMarket` record (the call itself or a `const` struct local bound to it): it hands the struct back as is. */
    rustVenueReturnsMarket(node: any, file: string): boolean;
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
    /** The `market: Market = undefined` second parameter of a singular `parseX (x, market)` parser (base, venue,
     *  ws or prediction): it prints as a lent `Option<&crate::types::Market>`; every use is a key read, a null
     *  test, a market slot or a `Value` hand-off (boxed once), and the parameter is never written. */
    rustParseMarketParam(method: any, param: any): boolean;
    /** A `Market` type reference (or `MarketInterface` when `iface` is set). */
    rustIsMarketTypeNode(type: any, iface: boolean): boolean;
    private static readonly RUST_LIST_MARKET_METHODS;
    /** The `market: Market = undefined` parameter of a listed helper: read-only, every parameter before it required
     *  (or `safeMarket`'s positional `marketId`). */
    rustListMarketParam(method: any, param: any): boolean;
    /** A per-venue helper's `market: Market` parameter that it forwards to a lent market slot: lent itself when every
     *  caller in its file lends a typed market (or passes `undefined`), so no caller decodes. */
    rustVenueMarketParam(method: any, param: any): boolean;
    /** The calls of REST method `m` from `ts/src/pro/<id>.ts` (checker-resolved to `m`): none when the ws class does
     *  not call it, undefined when it does but this program does not load the ws file. */
    rustWsSiblingCallSites(method: any): any[] | undefined;
    /** `ts/src/<id>.ts`'s method `m` is called as `this.m (` / `super.m (` in `ts/src/pro/<id>.ts`. */
    rustCalledFromWsSibling(method: any): boolean;
    /** A market slot argument that lends without a decode (`rustMarketSlotArgText` takes no `FromRaw` path). */
    rustMarketArgLends(arg: any): boolean;
    /** `safeMarket`'s first parameter `marketId: Str = undefined`: a positional `Value` (padded with `Value::Null`). */
    rustPositionalValueParam(param: any): boolean;
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
    /** ral-76j: `this.m (.., s, ..)` with a `safeMarket` struct local at a plain `Value` slot of a self method: the
     *  boxed local was copied there (`s.clone()`); `crate::Value::from(&s)` shares the record's `raw` the same way. */
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
    /** ral-65e: `const l = byId[k]` where `byId` is a never-reassigned `const byId = this.markets_by_id` of the same base
     *  method and `k` a parameter. Every write of `markets_by_id` (setMarkets `mapToSafeMap (marketsById)` of a map whose
     *  every element write stores `[ value ]` or the pushed array itself, setMarketsFromExchange's copy of another
     *  exchange's store, deepcoin's `= [ market ]`, the runtime's `Value::Array` rows, the `undefined` reset) holds a list
     *  of markets per id, so the read is the typed by-id store's row slice (`&[Market]`; `Market::raw` is that very element).
     *  The local is only read: `.length`, `l[0]` returned, or `l[i]` bound to a const that is lent to any-key readers or
     *  returned. A missing row reads the empty slice, whose length and `[0]` (`first()`) answer as the boxed `Null` did. */
    rust65eByIdListLocal(declaration: any): boolean;
    rust65eByIdListLocalUncached(declaration: any): boolean;
    /** ral-65e: `k` is the counter of an enclosing `for (let k = 0; k < l.length; k++)` over the row local `l` itself, never
     *  written in the body: a non-negative integer index below the row's length (decided on the AST, no counter decision). */
    rust65eForCounterOf(k: any, list: any): boolean;
    /** ral-65e: `return e` / `return l[0]` of a by-id row (rust65eByIdListLocal) in a method whose body returns a `Value`. */
    print65eByIdReturnValue(exp: any): string | undefined;
    rustMarketStoreElementOf(node: any): any;
    printMarketStoreDeclaration(declaration: any, indent: string, varName: string): string | undefined;
    rustMarketStoreElementDecl(declaration: any): boolean;
    rustStoreIndexText(keyNode: any): string;
    /** The `crate::types::Market` a market-returning method hands back for `return <exp>`. */
    printMarketReturnValue(exp: any): string;
    /** A checker-`boolean` argument for a `bool` slot: native where it already is one, an `Option<bool>` local or a
     *  `Value` compared with `Some(true)` (its variant is `Bool` or `Null`), else its truthiness. */
    rustVenueBoolArgText(arg: any, identation: number): string;
}
export {};

import { BaseTranspiler } from "./baseTranspiler.js";
import { type Block, type CallExpression, type Declaration, type Identifier, type Node, type ParameterDeclaration, type VariableDeclaration } from "typescript/unstable/ast";
import { type Symbol as TsSymbol, type Type } from "typescript/unstable/sync";
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
    /** use census: element-access receiver / kind-preserving mutator / anything else. */
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
/** Shadow kinds: `&IndexMap<String, Value>` / `&Vec<Value>` (D-25). */
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
    constructor(config?: {});
    initConfig(): void;
    quotedStringLiteral(text: string): string;
    printStringLiteral(node: any): any;
    printNumericLiteral(node: any): string;
    printBooleanLiteral(node: any): string;
    printNullKeyword(node: any, identation: any): string;
    private static readonly BOOL_PRODUCING_OPERATORS;
    private static readonly BOOL_PRODUCING_CALLS;
    private static readonly RUST_NATIVE_INSERT_RECEIVERS;
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
    /** Operands this unit owns: `safeBool`/`safeBool2`/`safeBoolN` calls (a
     *  `Value` in the port) and element accesses (printed as `get_value`). */
    isBooleanValueFamilyOperand(node: any): boolean;
    /** The emitted `matches!` is a bare Rust `bool`: it is only valid where the
     *  whole enclosing boolean expression already sits in a bool slot. A logical
     *  expression stored in a `Value` slot gets its `Value::Bool(..)` box from the
     *  ccxt post-passes, which key on the leading helper token the operand would
     *  no longer provide. */
    isBareBoolEmissionSafe(node: any): boolean;
    /** Outermost ancestor reached through parens, `!` and `&&`/`||`. */
    rustClimbLogicalWrappers(node: any): any;
    rustConditionBoolSlot(node: any): boolean;
    /** Native truthiness text of the operand, or undefined to keep `is_true`. */
    printNativeTruthiness(node: any): string | undefined;
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
    printNativeDictInsert(baseExpr: any, keyNode: any, keyText: any, valueText: any): string | undefined;
    /** The `insert` key argument. A literal becomes `"k".into()`; a proven
     *  string place becomes `crate::runtime::stringify_param(&k)` — the exact
     *  conversion the helper's dict branch applies to a non-string key, and
     *  `k.to_string()` for a string one. */
    rustNativeInsertKeyArg(receiver: any, keyNode: any, keyText: string): string | undefined;
    rustNativeInsertReceiver(expr: any): {
        text: string;
        isField: boolean;
        plain: boolean;
        nameNode: any;
    } | undefined;
    /** Element-write receiver proof for a local: the batch-A names (rust-13,
     *  `plain: false` — the whitelist is not a construction proof) or, for any
     *  other name, the dict-shape proof plus a plain-`Value::Map` build on
     *  every path (rust-12's proof, read off the checker), or a parameter whose
     *  annotation proves a plain dict and whose writes keep that shape. The
     *  returned flag is the *by-construction* plainness (literal-init locals,
     *  handler tuples, hand-written plain fields) that a book-meta key needs. */
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
    printNativeNumericComparison(node: any, operator: any, leftText: any, rightText: any): string;
    rustNumericOperandKind(node: any): string | undefined;
    orderedComparisonOperand(node: any): any;
    printNativeOrderedComparison(node: any, op: any, left: any, right: any): string | undefined;
    rustTypeFlagsAll(type: any, flags: Set<number>): boolean;
    isNumberLikeType(type: any): boolean;
    isStringLikeType(type: any): boolean;
    private static readonly RUST_CONCAT_SAFE_FLAGS;
    isStringOrNullishType(type: any): boolean;
    isNativeStringConcatPair(leftType: any, rightType: any): boolean;
    printNativeAssignmentArithmetic(op: any, left: any, right: any, leftText: any, rightText: any): string | undefined;
    printNativeArithmetic(op: any, left: any, right: any, leftText: any, rightText: any): string | undefined;
    printNativeStringConcat(leftText: string, rightText: string): string;
    printNativeNumeric(op: any, leftText: string, rightText: string): string;
    private static readonly RUST_TYPEOF_HELPERS;
    printCustomBinaryExpressionIfAny(node: any, identation: any): string;
    printBinaryExpression(node: any, identation: any): any;
    printDateNowCall(node: any, identation: any): string;
    printPadStartCall(node: any, identation: any, name: any, parsedArg: any, parsedArg2: any): string;
    printPadEndCall(node: any, identation: any, name: any, parsedArg: any, parsedArg2: any): string;
    printVariableDeclarationList(node: any, identation: any): string;
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
    private rustNativeStrReturnDecisions;
    private static readonly RUST_BASE_TIER_FILE;
    /** `'str'` when the method is emitted `-> Option<String>`, else undefined. */
    rustNativeStrReturnKind(node: Node): string | undefined;
    private rustMethodOverrides;
    private rustClassAncestorTables;
    /** Per ancestor class (nearest first): method name -> its LAST declaration; undefined when a
     *  parent class does not resolve. */
    private rustAncestorMethodTables;
    getMethodOverride(node: Node): Node;
    private rustNativeStrReturnDecisionUncached;
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
    /** `Option<String>` → `Value` (exact inverse of the return conversion). */
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
    printRustFunctionType(node: any): string;
    printMethodDeclaration(node: any, identation: any): string;
    printFunctionDefinition(node: any, identation: any): string;
    printFunctionDeclaration(node: any, identation: any): string;
    printOutOfOrderCallExpressionIfAny(node: any, identation: any): string;
    printCallExpression(node: any, identation: any): string;
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
    printNativeListIndex(receiverText: string, index: number): string;
    /** Native read for one chain level, or undefined to keep `get_value`. */
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
    /** A statement containing a write into a local (`x['k'] = v`, `x.k = v`,
     *  `x.push(v)`). */
    rustStatementMutatesLocal(node: Node, name: string): boolean;
    /** A dynamic index the printer emits as a `Value` number: a `let x = <numeric
     *  literal>` declaration of the same function (the C-style loop counter).
     *  Any other shape keeps the helper — the printed local could be a native
     *  `i64`/`f64`, which the `Value` match would not compile against. */
    isRustValueIndexKey(node: Node): boolean;
    /** Strips `( )`, `as T` and `!` wrappers. */
    rustSkipWrappers(node: any): any;
    /** The parameter declaration behind a receiver when its *annotation* proves
     *  a plain dict; undefined otherwise (no proof → keep the helper). */
    rustProvenDictParameter(node: Node): ParameterDeclaration | undefined;
    /** `Str` (`string | undefined`) — the key box is `Value::Str` or Null. */
    rustKeyIsProvenString(node: Node): boolean;
    /** The local/parameter proof of a dynamic-key map read: a parameter whose
     *  annotation proves a plain dict (B-25), or any local whose checker type
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
    /** `x['k']` / `x[i]` / `'k' in x` on a shadowed parameter: the native read,
     *  or undefined to keep the helper (the census guarantees it never happens
     *  for an emitted shadow). */
    printShadowContainerRead(shadow: RustParamShadow, keyNode: Node): string | undefined;
    /** `'k' in x` on a shadowed dict parameter. */
    printShadowInOperator(shadow: RustParamShadow, keyNode: Node): string | undefined;
    /** A shadow dict key: an inlinable literal, or a proven-string plain place. */
    private rustShadowMapKey;
    /** `x.length` on a shadowed list parameter — `get_array_length` natively. */
    printShadowLength(shadow: RustParamShadow): string | undefined;
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
    rustProHandlerShadowDefaultShape(node: Node): boolean;
    rustProHandlerShadowDefault(node: Node): string | undefined;
    /** Exact native form of the runtime `_k` helper: same value kinds, same
     *  empty-string-is-missing rule, same default (verified against
     *  `exchange_stubs.rs`). `.cloned()` keeps the emitted line clone-free for
     *  the ccxt clone-pruning passes; the parenthesised `match` keeps the
     *  driver's `};` trailing-block replacement off the statement's `;`. */
    rustProHandlerShadowReadText(kind: string, key: string, dflt: string): string;
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
    /** A parameter declared as the ws `Client` class (or a union with it). The
     *  class is the default export of `ts/src/base/ws/Client.ts`, so its type
     *  symbol is named `default`; the declaration itself carries the name. */
    rustParameterIsClientHandle(declaration: ParameterDeclaration): boolean;
    /** Constant string argument of `parseInt`/`parseFloat` folded the way rust's
     *  `str::parse` would; undefined when the fold is not obviously exact. */
    foldParsedStringLiteral(name: string, text: string): string | undefined;
    /** `parseInt(x)` / `parseFloat(x)` with a single checker-proven string argument
     *  become the runtime helper's own match with native `str::parse`; every other
     *  argument shape keeps the helper call the ccxt post-pass rewrites. */
    printNativeParseCall(node: CallExpression): string | undefined;
    isNodeInsideNode(node: Node, container: Node): boolean;
    /** Root place of an access chain (`x` for `x['a']['b']`, `this.balance` for
     *  `this.balance['usdt']`), or undefined for a temporary. */
    rootPlaceText(node: Node): string | undefined;
    /** The ccxt post-passes hoist `get_value(...)` reads out of `&mut` calls by
     *  matching their text; the native form is invisible to them, so it is only
     *  emitted where no such hoist is needed. */
    isNativeAccessPositionSafe(node: Node): boolean;
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
    private static readonly COMPARISON_OPS;
    private static readonly NATIVE_COMPARISON_OPERATORS;
    isEqualityOp(op: any): boolean;
    isLogicalOp(op: any): boolean;
    printCondition(node: any, identation: any): any;
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
export {};

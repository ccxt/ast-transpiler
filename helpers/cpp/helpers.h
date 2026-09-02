#ifndef AST_TRANSPILER_CPP_HELPERS_H
#define AST_TRANSPILER_CPP_HELPERS_H

#include <any>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <vector>

// JS-like Error, thrown by transpiled `throw new Error(...)`
class Error : public std::runtime_error {
public:
    explicit Error(const std::string& message) : std::runtime_error(message) {}
};

// output
void consoleLog(const std::any& value);

// conversions / formatting
std::string toString(const std::any& value);
bool isTrue(const std::any& value);
int toInt(const std::any& value);
double toDouble(const std::any& value);

// arithmetic (JS semantics: + concatenates strings, / is float division)
std::any add(const std::any& a, const std::any& b);
std::any subtract(const std::any& a, const std::any& b);
std::any multiply(const std::any& a, const std::any& b);
std::any divide(const std::any& a, const std::any& b);
std::any mod(const std::any& a, const std::any& b);
std::any prefixUnaryNeg(const std::any& a);
std::any prefixUnaryPlus(const std::any& a);
std::any postFixIncrement(std::any& a);
std::any postFixDecrement(std::any& a);

// comparisons
bool isEqual(const std::any& a, const std::any& b);
bool isGreaterThan(const std::any& a, const std::any& b);
bool isGreaterThanOrEqual(const std::any& a, const std::any& b);
bool isLessThan(const std::any& a, const std::any& b);
bool isLessThanOrEqual(const std::any& a, const std::any& b);

// type checks
bool isArray(const std::any& value);
bool isDictionary(const std::any& value);
bool isString(const std::any& value);
bool isNumber(const std::any& value);
bool isBool(const std::any& value);
bool isFunction(const std::any& value);
bool isInteger(const std::any& value);
bool isUndefined(const std::any& value);

// collections
std::any getValue(const std::any& container, const std::any& key);
void setValue(std::any& container, const std::any& key, const std::any& value);
int getArrayLength(const std::any& value);
int getStringLength(const std::any& value);
std::any getObjectKeys(const std::any& obj);
std::any getObjectValues(const std::any& obj);
bool deleteKey(std::any& container, const std::any& key);
bool inOp(const std::any& obj, const std::any& key);
std::any concat(const std::any& a, const std::any& b);
bool includes(const std::any& container, const std::any& value);
int getIndexOf(const std::any& container, const std::any& target);
void arrayPush(std::any& arr, const std::any& value);
std::any shift(std::any& arr);
std::any pop(std::any& arr);
std::any reverse(std::any& arr);
std::any slice(const std::any& container, const std::any& start, const std::any& end);
std::any join(const std::any& elements, const std::any& separator);

// strings
std::any split(const std::any& str, const std::any& delimiter);
std::any toUpperCase(const std::any& str);
std::any toLowerCase(const std::any& str);
std::any trim(const std::any& str);
bool startsWith(const std::any& str, const std::any& prefix);
bool endsWith(const std::any& str, const std::any& suffix);
std::any replace(const std::any& str, const std::any& target, const std::any& replacement);
std::any replaceAll(const std::any& str, const std::any& target, const std::any& replacement);
std::any padStart(const std::any& str, const std::any& length, const std::any& pad);
std::any padEnd(const std::any& str, const std::any& length, const std::any& pad);
std::any toFixed(const std::any& value, const std::any& decimals);

// math
std::any mathMin(const std::any& a, const std::any& b);
std::any mathMax(const std::any& a, const std::any& b);
std::any mathAbs(const std::any& a);
std::any mathFloor(const std::any& a);
std::any mathCeil(const std::any& a);
std::any mathRound(const std::any& a);
std::any mathPow(const std::any& a, const std::any& b);
std::any mathLog(const std::any& a);
std::any parseIntHelper(const std::any& a);
std::any parseFloatHelper(const std::any& a);

// misc
long long getCurrentTimestamp();
void assertTrue(const std::any& condition);
[[noreturn]] void throwDynamicException(const std::any& exception, const std::any& message);
std::any promiseAll(const std::any& tasks);
std::any parseJson(const std::any& json);
std::any jsonStringify(const std::any& value);

#endif // AST_TRANSPILER_CPP_HELPERS_H

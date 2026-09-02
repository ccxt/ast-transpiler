// Runtime helpers for C++ code produced by the ast-transpiler.
//
// Transpiled code stores every value in std::any. The concrete types a
// std::any may hold are: int, long long, double, bool, std::string,
// std::vector<std::any> (JS array), std::unordered_map<std::string, std::any>
// (JS object) and the empty std::any (JS undefined/null). String literals are
// always emitted as std::string, never const char*.

#include "helpers.h"

#include <algorithm>
#include <cctype>
#include <chrono>
#include <cmath>
#include <iostream>
#include <sstream>

using AnyVector = std::vector<std::any>;
using AnyMap = std::unordered_map<std::string, std::any>;

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

static bool holdsInt(const std::any& v) {
    return v.type() == typeid(int) || v.type() == typeid(long long);
}

static long long asInt(const std::any& v) {
    if (v.type() == typeid(int)) {
        return std::any_cast<int>(v);
    }
    return std::any_cast<long long>(v);
}

bool isUndefined(const std::any& value) {
    return !value.has_value();
}

bool isString(const std::any& value) {
    return value.type() == typeid(std::string);
}

bool isBool(const std::any& value) {
    return value.type() == typeid(bool);
}

bool isNumber(const std::any& value) {
    return holdsInt(value) || value.type() == typeid(double);
}

bool isArray(const std::any& value) {
    return value.type() == typeid(AnyVector);
}

bool isDictionary(const std::any& value) {
    return value.type() == typeid(AnyMap);
}

bool isFunction(const std::any& value) {
    return false; // functions are never stored in std::any by the transpiler
}

bool isInteger(const std::any& value) {
    if (holdsInt(value)) {
        return true;
    }
    if (value.type() == typeid(double)) {
        const double d = std::any_cast<double>(value);
        return std::floor(d) == d;
    }
    return false;
}

double toDouble(const std::any& value) {
    if (holdsInt(value)) {
        return static_cast<double>(asInt(value));
    }
    if (value.type() == typeid(double)) {
        return std::any_cast<double>(value);
    }
    if (value.type() == typeid(bool)) {
        return std::any_cast<bool>(value) ? 1.0 : 0.0;
    }
    if (value.type() == typeid(std::string)) {
        try {
            return std::stod(std::any_cast<std::string>(value));
        } catch (...) {
            return std::nan("");
        }
    }
    return std::nan("");
}

int toInt(const std::any& value) {
    return static_cast<int>(toDouble(value));
}

// JS-style number formatting: integral doubles print without a decimal part
static std::string formatDouble(double d) {
    if (std::isnan(d)) {
        return "NaN";
    }
    if (std::isinf(d)) {
        return d > 0 ? "Infinity" : "-Infinity";
    }
    if (std::floor(d) == d && std::abs(d) < 1e15) {
        return std::to_string(static_cast<long long>(d));
    }
    std::ostringstream oss;
    oss.precision(15);
    oss << d;
    return oss.str();
}

std::string toString(const std::any& value) {
    if (!value.has_value()) {
        return "undefined";
    }
    if (value.type() == typeid(std::string)) {
        return std::any_cast<std::string>(value);
    }
    if (holdsInt(value)) {
        return std::to_string(asInt(value));
    }
    if (value.type() == typeid(double)) {
        return formatDouble(std::any_cast<double>(value));
    }
    if (value.type() == typeid(bool)) {
        return std::any_cast<bool>(value) ? "true" : "false";
    }
    if (value.type() == typeid(AnyVector)) {
        const auto& vec = std::any_cast<const AnyVector&>(value);
        std::string out = "[";
        for (size_t i = 0; i < vec.size(); i++) {
            out += (i ? "," : "") + toString(vec[i]);
        }
        return out + "]";
    }
    if (value.type() == typeid(AnyMap)) {
        return "[object Object]";
    }
    return "";
}

void consoleLog(const std::any& value) {
    std::cout << toString(value) << std::endl;
}

bool isTrue(const std::any& value) {
    if (!value.has_value()) {
        return false;
    }
    if (value.type() == typeid(bool)) {
        return std::any_cast<bool>(value);
    }
    if (holdsInt(value)) {
        return asInt(value) != 0;
    }
    if (value.type() == typeid(double)) {
        const double d = std::any_cast<double>(value);
        return d != 0.0 && !std::isnan(d);
    }
    if (value.type() == typeid(std::string)) {
        return !std::any_cast<const std::string&>(value).empty();
    }
    // arrays and dictionaries are always truthy, like JS objects
    return true;
}

// ---------------------------------------------------------------------------
// arithmetic
// ---------------------------------------------------------------------------

std::any add(const std::any& a, const std::any& b) {
    if (isString(a) || isString(b)) {
        return toString(a) + toString(b);
    }
    if (holdsInt(a) && holdsInt(b)) {
        return asInt(a) + asInt(b);
    }
    return toDouble(a) + toDouble(b);
}

std::any subtract(const std::any& a, const std::any& b) {
    if (holdsInt(a) && holdsInt(b)) {
        return asInt(a) - asInt(b);
    }
    return toDouble(a) - toDouble(b);
}

std::any multiply(const std::any& a, const std::any& b) {
    if (holdsInt(a) && holdsInt(b)) {
        return asInt(a) * asInt(b);
    }
    return toDouble(a) * toDouble(b);
}

std::any divide(const std::any& a, const std::any& b) {
    // JS division is always floating point; formatDouble hides the .0 on
    // integral results
    return toDouble(a) / toDouble(b);
}

std::any mod(const std::any& a, const std::any& b) {
    if (holdsInt(a) && holdsInt(b)) {
        return asInt(a) % asInt(b);
    }
    return std::fmod(toDouble(a), toDouble(b));
}

std::any prefixUnaryNeg(const std::any& a) {
    if (holdsInt(a)) {
        return -asInt(a);
    }
    return -toDouble(a);
}

std::any prefixUnaryPlus(const std::any& a) {
    if (isNumber(a)) {
        return a;
    }
    return toDouble(a);
}

std::any postFixIncrement(std::any& a) {
    const std::any previous = a;
    a = add(a, 1);
    return previous;
}

std::any postFixDecrement(std::any& a) {
    const std::any previous = a;
    a = subtract(a, 1);
    return previous;
}

// ---------------------------------------------------------------------------
// comparisons
// ---------------------------------------------------------------------------

bool isEqual(const std::any& a, const std::any& b) {
    if (!a.has_value() || !b.has_value()) {
        return !a.has_value() && !b.has_value();
    }
    if (isNumber(a) && isNumber(b)) {
        return toDouble(a) == toDouble(b);
    }
    if (isString(a) && isString(b)) {
        return std::any_cast<const std::string&>(a) == std::any_cast<const std::string&>(b);
    }
    if (isBool(a) || isBool(b)) {
        // JS loose equality coerces booleans to numbers
        if (isBool(a) && isBool(b)) {
            return std::any_cast<bool>(a) == std::any_cast<bool>(b);
        }
        if (isNumber(a) || isNumber(b)) {
            return toDouble(a) == toDouble(b);
        }
        return false;
    }
    return false;
}

bool isGreaterThan(const std::any& a, const std::any& b) {
    if (isString(a) && isString(b)) {
        return std::any_cast<const std::string&>(a) > std::any_cast<const std::string&>(b);
    }
    return toDouble(a) > toDouble(b);
}

bool isGreaterThanOrEqual(const std::any& a, const std::any& b) {
    return isGreaterThan(a, b) || isEqual(a, b);
}

bool isLessThan(const std::any& a, const std::any& b) {
    if (isString(a) && isString(b)) {
        return std::any_cast<const std::string&>(a) < std::any_cast<const std::string&>(b);
    }
    return toDouble(a) < toDouble(b);
}

bool isLessThanOrEqual(const std::any& a, const std::any& b) {
    return isLessThan(a, b) || isEqual(a, b);
}

// ---------------------------------------------------------------------------
// collections
// ---------------------------------------------------------------------------

std::any getValue(const std::any& container, const std::any& key) {
    if (!container.has_value() || !key.has_value()) {
        return {};
    }
    if (container.type() == typeid(AnyMap)) {
        const auto& map = std::any_cast<const AnyMap&>(container);
        const auto it = map.find(toString(key));
        return it != map.end() ? it->second : std::any{};
    }
    if (container.type() == typeid(AnyVector)) {
        const auto& vec = std::any_cast<const AnyVector&>(container);
        const long long index = static_cast<long long>(toDouble(key));
        if (index >= 0 && index < static_cast<long long>(vec.size())) {
            return vec[index];
        }
        return {};
    }
    if (container.type() == typeid(std::string)) {
        const auto& str = std::any_cast<const std::string&>(container);
        const long long index = static_cast<long long>(toDouble(key));
        if (index >= 0 && index < static_cast<long long>(str.size())) {
            return std::string(1, str[index]);
        }
        return {};
    }
    return {};
}

void setValue(std::any& container, const std::any& key, const std::any& value) {
    if (container.type() == typeid(AnyMap)) {
        auto& map = std::any_cast<AnyMap&>(container);
        map[toString(key)] = value;
        return;
    }
    if (container.type() == typeid(AnyVector)) {
        auto& vec = std::any_cast<AnyVector&>(container);
        const long long index = static_cast<long long>(toDouble(key));
        if (index >= 0) {
            if (index >= static_cast<long long>(vec.size())) {
                vec.resize(index + 1);
            }
            vec[index] = value;
        }
        return;
    }
    throw Error("setValue: unsupported container type");
}

int getArrayLength(const std::any& value) {
    if (value.type() == typeid(AnyVector)) {
        return static_cast<int>(std::any_cast<const AnyVector&>(value).size());
    }
    return 0;
}

int getStringLength(const std::any& value) {
    if (value.type() == typeid(std::string)) {
        return static_cast<int>(std::any_cast<const std::string&>(value).size());
    }
    return 0;
}

std::any getObjectKeys(const std::any& obj) {
    AnyVector keys;
    if (obj.type() == typeid(AnyMap)) {
        const auto& map = std::any_cast<const AnyMap&>(obj);
        for (const auto& pair : map) {
            keys.push_back(pair.first);
        }
    }
    return keys;
}

std::any getObjectValues(const std::any& obj) {
    AnyVector values;
    if (obj.type() == typeid(AnyMap)) {
        const auto& map = std::any_cast<const AnyMap&>(obj);
        for (const auto& pair : map) {
            values.push_back(pair.second);
        }
    }
    return values;
}

bool deleteKey(std::any& container, const std::any& key) {
    if (container.type() == typeid(AnyMap)) {
        auto& map = std::any_cast<AnyMap&>(container);
        return map.erase(toString(key)) > 0;
    }
    return false;
}

bool inOp(const std::any& obj, const std::any& key) {
    if (obj.type() == typeid(AnyMap)) {
        const auto& map = std::any_cast<const AnyMap&>(obj);
        return map.find(toString(key)) != map.end();
    }
    if (obj.type() == typeid(AnyVector)) {
        const long long index = static_cast<long long>(toDouble(key));
        return index >= 0 && index < static_cast<long long>(std::any_cast<const AnyVector&>(obj).size());
    }
    return false;
}

std::any concat(const std::any& a, const std::any& b) {
    if (a.type() == typeid(AnyVector) && b.type() == typeid(AnyVector)) {
        AnyVector out = std::any_cast<const AnyVector&>(a);
        const auto& second = std::any_cast<const AnyVector&>(b);
        out.insert(out.end(), second.begin(), second.end());
        return out;
    }
    return toString(a) + toString(b);
}

bool includes(const std::any& container, const std::any& value) {
    if (container.type() == typeid(std::string)) {
        return std::any_cast<const std::string&>(container).find(toString(value)) != std::string::npos;
    }
    if (container.type() == typeid(AnyVector)) {
        const auto& vec = std::any_cast<const AnyVector&>(container);
        for (const auto& element : vec) {
            if (isEqual(element, value)) {
                return true;
            }
        }
    }
    return false;
}

int getIndexOf(const std::any& container, const std::any& target) {
    if (container.type() == typeid(std::string)) {
        const auto pos = std::any_cast<const std::string&>(container).find(toString(target));
        return pos == std::string::npos ? -1 : static_cast<int>(pos);
    }
    if (container.type() == typeid(AnyVector)) {
        const auto& vec = std::any_cast<const AnyVector&>(container);
        for (size_t i = 0; i < vec.size(); i++) {
            if (isEqual(vec[i], target)) {
                return static_cast<int>(i);
            }
        }
    }
    return -1;
}

void arrayPush(std::any& arr, const std::any& value) {
    if (arr.type() != typeid(AnyVector)) {
        throw Error("arrayPush: target is not an array");
    }
    std::any_cast<AnyVector&>(arr).push_back(value);
}

std::any shift(std::any& arr) {
    if (arr.type() != typeid(AnyVector)) {
        return {};
    }
    auto& vec = std::any_cast<AnyVector&>(arr);
    if (vec.empty()) {
        return {};
    }
    std::any first = vec.front();
    vec.erase(vec.begin());
    return first;
}

std::any pop(std::any& arr) {
    if (arr.type() != typeid(AnyVector)) {
        return {};
    }
    auto& vec = std::any_cast<AnyVector&>(arr);
    if (vec.empty()) {
        return {};
    }
    std::any last = vec.back();
    vec.pop_back();
    return last;
}

std::any reverse(std::any& arr) {
    if (arr.type() == typeid(AnyVector)) {
        auto& vec = std::any_cast<AnyVector&>(arr);
        std::reverse(vec.begin(), vec.end());
    }
    return arr;
}

// JS slice semantics for strings and arrays: negative indexes count from the
// end, an undefined end means "to the end"
static void resolveSliceRange(long long size, const std::any& start, const std::any& end,
                              long long& from, long long& to) {
    from = start.has_value() ? static_cast<long long>(toDouble(start)) : 0;
    to = end.has_value() ? static_cast<long long>(toDouble(end)) : size;
    if (from < 0) {
        from = std::max<long long>(size + from, 0);
    }
    if (to < 0) {
        to = std::max<long long>(size + to, 0);
    }
    from = std::min(from, size);
    to = std::min(to, size);
    if (to < from) {
        to = from;
    }
}

std::any slice(const std::any& container, const std::any& start, const std::any& end) {
    if (container.type() == typeid(std::string)) {
        const auto& str = std::any_cast<const std::string&>(container);
        long long from, to;
        resolveSliceRange(static_cast<long long>(str.size()), start, end, from, to);
        return str.substr(from, to - from);
    }
    if (container.type() == typeid(AnyVector)) {
        const auto& vec = std::any_cast<const AnyVector&>(container);
        long long from, to;
        resolveSliceRange(static_cast<long long>(vec.size()), start, end, from, to);
        return AnyVector(vec.begin() + from, vec.begin() + to);
    }
    return {};
}

std::any join(const std::any& elements, const std::any& separator) {
    if (elements.type() != typeid(AnyVector)) {
        return std::string("");
    }
    const auto& vec = std::any_cast<const AnyVector&>(elements);
    const std::string sep = separator.has_value() ? toString(separator) : ",";
    std::string out;
    for (size_t i = 0; i < vec.size(); i++) {
        out += (i ? sep : "") + toString(vec[i]);
    }
    return out;
}

// ---------------------------------------------------------------------------
// strings
// ---------------------------------------------------------------------------

std::any split(const std::any& str, const std::any& delimiter) {
    const std::string source = toString(str);
    const std::string delim = toString(delimiter);
    AnyVector parts;
    if (delim.empty()) {
        for (const char c : source) {
            parts.push_back(std::string(1, c));
        }
        return parts;
    }
    size_t position = 0;
    while (true) {
        const size_t next = source.find(delim, position);
        if (next == std::string::npos) {
            parts.push_back(source.substr(position));
            break;
        }
        parts.push_back(source.substr(position, next - position));
        position = next + delim.size();
    }
    return parts;
}

std::any toUpperCase(const std::any& str) {
    std::string out = toString(str);
    std::transform(out.begin(), out.end(), out.begin(), [](unsigned char c) { return std::toupper(c); });
    return out;
}

std::any toLowerCase(const std::any& str) {
    std::string out = toString(str);
    std::transform(out.begin(), out.end(), out.begin(), [](unsigned char c) { return std::tolower(c); });
    return out;
}

std::any trim(const std::any& str) {
    const std::string source = toString(str);
    const auto begin = source.find_first_not_of(" \t\n\r\f\v");
    if (begin == std::string::npos) {
        return std::string("");
    }
    const auto last = source.find_last_not_of(" \t\n\r\f\v");
    return source.substr(begin, last - begin + 1);
}

bool startsWith(const std::any& str, const std::any& prefix) {
    const std::string source = toString(str);
    const std::string pre = toString(prefix);
    return source.rfind(pre, 0) == 0;
}

bool endsWith(const std::any& str, const std::any& suffix) {
    const std::string source = toString(str);
    const std::string suf = toString(suffix);
    return source.size() >= suf.size() && source.compare(source.size() - suf.size(), suf.size(), suf) == 0;
}

static std::string replaceImpl(const std::string& source, const std::string& target,
                               const std::string& replacement, bool all) {
    if (target.empty()) {
        return source;
    }
    std::string out;
    size_t position = 0;
    while (true) {
        const size_t next = source.find(target, position);
        if (next == std::string::npos) {
            out += source.substr(position);
            break;
        }
        out += source.substr(position, next - position) + replacement;
        position = next + target.size();
        if (!all) {
            out += source.substr(position);
            break;
        }
    }
    return out;
}

std::any replace(const std::any& str, const std::any& target, const std::any& replacement) {
    return replaceImpl(toString(str), toString(target), toString(replacement), false);
}

std::any replaceAll(const std::any& str, const std::any& target, const std::any& replacement) {
    return replaceImpl(toString(str), toString(target), toString(replacement), true);
}

std::any padStart(const std::any& str, const std::any& length, const std::any& pad) {
    std::string source = toString(str);
    const size_t target = static_cast<size_t>(toDouble(length));
    const std::string padding = pad.has_value() ? toString(pad) : " ";
    if (padding.empty()) {
        return source;
    }
    std::string prefix;
    while (source.size() + prefix.size() < target) {
        prefix += padding;
    }
    prefix = prefix.substr(0, target > source.size() ? target - source.size() : 0);
    return prefix + source;
}

std::any padEnd(const std::any& str, const std::any& length, const std::any& pad) {
    std::string source = toString(str);
    const size_t target = static_cast<size_t>(toDouble(length));
    const std::string padding = pad.has_value() ? toString(pad) : " ";
    if (padding.empty()) {
        return source;
    }
    while (source.size() < target) {
        source += padding;
    }
    return source.substr(0, std::max(target, toString(str).size()));
}

std::any toFixed(const std::any& value, const std::any& decimals) {
    const int digits = static_cast<int>(toDouble(decimals));
    std::ostringstream oss;
    oss.setf(std::ios::fixed);
    oss.precision(digits);
    oss << toDouble(value);
    return oss.str();
}

// ---------------------------------------------------------------------------
// math
// ---------------------------------------------------------------------------

std::any mathMin(const std::any& a, const std::any& b) {
    return isLessThan(a, b) ? a : b;
}

std::any mathMax(const std::any& a, const std::any& b) {
    return isGreaterThan(a, b) ? a : b;
}

std::any mathAbs(const std::any& a) {
    if (holdsInt(a)) {
        return std::abs(asInt(a));
    }
    return std::abs(toDouble(a));
}

std::any mathFloor(const std::any& a) {
    return std::floor(toDouble(a));
}

std::any mathCeil(const std::any& a) {
    return std::ceil(toDouble(a));
}

std::any mathRound(const std::any& a) {
    return std::round(toDouble(a));
}

std::any mathPow(const std::any& a, const std::any& b) {
    return std::pow(toDouble(a), toDouble(b));
}

std::any mathLog(const std::any& a) {
    return std::log(toDouble(a));
}

std::any parseIntHelper(const std::any& a) {
    return static_cast<long long>(toDouble(a));
}

std::any parseFloatHelper(const std::any& a) {
    return toDouble(a);
}

// ---------------------------------------------------------------------------
// misc
// ---------------------------------------------------------------------------

long long getCurrentTimestamp() {
    return std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
}

void assertTrue(const std::any& condition) {
    if (!isTrue(condition)) {
        throw Error("Assertion failed");
    }
}

void throwDynamicException(const std::any& exception, const std::any& message) {
    throw Error(toString(message));
}

std::any promiseAll(const std::any& tasks) {
    // no async runtime yet: the "promises" are already resolved values
    return tasks;
}

std::any parseJson(const std::any& json) {
    // JSON parsing is not implemented in the C++ runtime yet
    return {};
}

std::any jsonStringify(const std::any& value) {
    if (value.type() == typeid(std::string)) {
        return "\"" + std::any_cast<std::string>(value) + "\"";
    }
    return toString(value);
}

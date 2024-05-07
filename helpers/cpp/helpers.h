#include <iostream>
#include <any>
#include <string>
#include <unordered_map>
#include <vector>
#include <algorithm>

#ifndef GENERATED_HEADER_H
#define GENERATED_HEADER_H

std::any getValue(const std::any& value2, const std::any& key);
bool inOp(const std::any& obj, const std::any& key);
bool isInteger(const std::any& a);
bool isNumber(const std::any& a);
bool isEqual(const std::any& a, const std::any& b);
int getIndexOf(const std::any& collection, const std::any& target);
int getArrayLength(const std::any& value);
std::any normalizeIntIfNeeded(const std::any& value);
std::any add(const std::any& a, const std::any& b);
std::any subtract(const std::any& a, const std::any& b);
std::any multiply(const std::any& a, const std::any& b);
std::any divide(const std::any& a, const std::any& b);
bool isGreaterThan(const std::any& a, const std::any& b);
bool isLessThan(const std::any& a, const std::any& b);
bool isGreaterThanOrEqual(const std::any& a, const std::any& b);
bool isLessThanOrEqual(const std::any& a, const std::any& b);
std::any mathMax(const std::any& a, const std::any& b);
std::any mathMin(const std::any& a, const std::any& b);
int getArrayLength(const std::any& value);
std::any postFixIncrement(std::any& a);
std::any postFixDecrement(std::any& a);
std::any mod(const std::any& a, const std::any& b);
std::any parseInt(const std::any& a);
std::any parseFloat(const std::any& a);
bool isTrue(const std::any& value);
// std::any parseJson(const std::any& jsonInput);
std::any plusEqual(std::any a, std::any value);
std::any prefixUnaryNeg(std::any& a);
std::any prefixUnaryPlus(std::any& a);

#endif // GENERATED_HEADER_H

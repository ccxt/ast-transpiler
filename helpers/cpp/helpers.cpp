#include <iostream>
#include <any>
#include <string>
#include <unordered_map>
#include <vector>
#include <algorithm>
#include <map>
#include <type_traits>
#include <cmath>
#include <iostream>
#include <stdexcept>
// #include <nlohmann/json.hpp>



std::any getValue(const std::any& value2, const std::any& key) {
    // Handle null-like values
    if (!value2.has_value() || !key.has_value()) {
        return {};
    }

    try {
        // Check if value2 is a string
        if (value2.type() == typeid(std::string)) {
            const auto& str = std::any_cast<std::string>(value2);
            int index = std::any_cast<int>(key);
            if (index >= 0 && index < static_cast<int>(str.size())) {
                return std::string(1, str[index]);
            } else {
                return {};
            }
        }

        // Check if value2 is an unordered_map (dictionary)
        if (value2.type() == typeid(std::unordered_map<std::string, std::any>)) {
            const auto& dict = std::any_cast<const std::unordered_map<std::string, std::any>&>(value2);
            const std::string& keyStr = std::any_cast<std::string>(key);
            auto it = dict.find(keyStr);
            return it != dict.end() ? it->second : std::any{};
        }

        // Check if value2 is a vector (list)
        if (value2.type() == typeid(std::vector<std::any>)) {
            const auto& vec = std::any_cast<const std::vector<std::any>&>(value2);
            int index = std::any_cast<int>(key);
            return index >= 0 && index < static_cast<int>(vec.size()) ? vec[index] : std::any{};
        }

    } catch (const std::bad_any_cast&) {
        return {};
    }

    // Return null-like value if no conditions matched
    return {};
}

bool areEqual(const std::any& a, const std::any& b) {
    if (a.type() != b.type()) return false;

    try {
        if (a.type() == typeid(int)) {
            return std::any_cast<int>(a) == std::any_cast<int>(b);
        } else if (a.type() == typeid(int64_t)) {
            return std::any_cast<int64_t>(a) == std::any_cast<int64_t>(b);
        } else if (a.type() == typeid(double)) {
            return std::any_cast<double>(a) == std::any_cast<double>(b);
        } else if (a.type() == typeid(std::string)) {
            return std::any_cast<std::string>(a) == std::any_cast<std::string>(b);
        } else if (a.type() == typeid(std::vector<std::any>)) {
            const auto& vecA = std::any_cast<const std::vector<std::any>&>(a);
            const auto& vecB = std::any_cast<const std::vector<std::any>&>(b);
            return vecA.size() == vecB.size() && std::equal(vecA.begin(), vecA.end(), vecB.begin(), [](const std::any& x, const std::any& y) { return areEqual(x, y); });
        } else if (a.type() == typeid(std::vector<int64_t>)) {
            const auto& vecA = std::any_cast<const std::vector<int64_t>&>(a);
            const auto& vecB = std::any_cast<const std::vector<int64_t>&>(b);
            return vecA == vecB;
        } else if (a.type() == typeid(std::vector<std::string>)) {
            const auto& vecA = std::any_cast<const std::vector<std::string>&>(a);
            const auto& vecB = std::any_cast<const std::vector<std::string>&>(b);
            return vecA == vecB;
        }
    } catch (const std::bad_any_cast&) {
        return false; // Handle the case where type casting fails
    }
    return false;
}

bool inOp(const std::any& obj, const std::any& key) {
    if (!obj.has_value() || !key.has_value()) {
        return false;
    }

    try {
        // Use areEqual for std::vector<std::any>
        if (obj.type() == typeid(std::vector<std::any>)) {
            const auto& vec = std::any_cast<const std::vector<std::any>&>(obj);
            return std::any_of(vec.begin(), vec.end(), [&key](const std::any& element) { return areEqual(element, key); });
        }

        // Optimized search for std::vector<std::string> and std::vector<int64_t>
        if (obj.type() == typeid(std::vector<std::string>)) {
            const auto& vec = std::any_cast<const std::vector<std::string>&>(obj);
            const std::string& strKey = std::any_cast<const std::string&>(key);
            return std::find(vec.begin(), vec.end(), strKey) != vec.end();
        }

        if (obj.type() == typeid(std::vector<int64_t>)) {
            const auto& vec = std::any_cast<const std::vector<int64_t>&>(obj);
            int64_t intKey = std::any_cast<int64_t>(key);
            return std::find(vec.begin(), vec.end(), intKey) != vec.end();
        }

        // Check if key exists in an unordered_map
        if (obj.type() == typeid(std::unordered_map<std::string, std::any>)) {
            const auto& dict = std::any_cast<const std::unordered_map<std::string, std::any>&>(obj);
            const std::string& strKey = std::any_cast<const std::string&>(key);
            return dict.find(strKey) != dict.end();
        }
    } catch (const std::bad_any_cast&) {
        return false; // Handle bad cast exceptions gracefully
    }

    return false; // Default return false if no conditions matched
}

bool isInteger(const std::any& a) {
    return a.type() == typeid(int) || a.type() == typeid(int64_t) || a.type() == typeid(short) || a.type() == typeid(long) || a.type() == typeid(long long);
}

bool isNumber(const std::any& a) {
    return isInteger(a) || a.type() == typeid(double) || a.type() == typeid(float);
}

// Function to check if two std::any objects are equal
bool isEqual(const std::any& a, const std::any& b) {
    try {
        if (!a.has_value() && !b.has_value()) {
            return true;
        } else if (!a.has_value() || !b.has_value()) {
            return false;
        }

        if (a.type() != b.type() && (!isNumber(a) || !isNumber(b))) {
            return false;
        }

        if (isInteger(a) && isInteger(b)) {
            return std::any_cast<int64_t>(a) == std::any_cast<int64_t>(b);
        } else if (a.type() == typeid(double) || b.type() == typeid(double)) {
            return std::fabs(std::any_cast<double>(a) - std::any_cast<double>(b)) < std::numeric_limits<double>::epsilon();
        } else if (a.type() == typeid(std::string)) {
            return std::any_cast<std::string>(a) == std::any_cast<std::string>(b);
        } else if (a.type() == typeid(bool)) {
            return std::any_cast<bool>(a) == std::any_cast<bool>(b);
        } else {
            return false;
        }
    } catch (const std::bad_any_cast&) {
        return false;
    }
}

int getIndexOf(const std::any& collection, const std::any& target) {
    if (!collection.has_value()) return -1;

    try {
        // Check if collection is a vector of std::any
        if (collection.type() == typeid(std::vector<std::any>)) {
            const auto& vec = std::any_cast<const std::vector<std::any>&>(collection);
            auto it = std::find_if(vec.begin(), vec.end(), [&target](const std::any& elem) { return areEqual(elem, target); });
            return it != vec.end() ? std::distance(vec.begin(), it) : -1;
        }

        // Check if collection is a vector of strings
        if (collection.type() == typeid(std::vector<std::string>)) {
            const auto& vec = std::any_cast<const std::vector<std::string>&>(collection);
            const std::string& targetStr = std::any_cast<const std::string&>(target);
            auto it = std::find(vec.begin(), vec.end(), targetStr);
            return it != vec.end() ? std::distance(vec.begin(), it) : -1;
        }

        // Check if collection is a string
        if (collection.type() == typeid(std::string)) {
            const std::string& str = std::any_cast<const std::string&>(collection);
            const std::string& targetStr = std::any_cast<const std::string&>(target);
            size_t pos = str.find(targetStr);
            return pos != std::string::npos ? static_cast<int>(pos) : -1;
        }

    } catch (const std::bad_any_cast&) {
        return -1; // Handle bad cast exceptions gracefully
    }

    // If none of the conditions match, return -1
    return -1;
}

// int getArrayLength(const std::any& value) {
//     if (!value.has_value()) {
//         return 0;
//     }

//     if (value.type() == typeid(std::vector<std::any>)) {
//         return std::any_cast<std::vector<std::any>>(value).size();
//     } else if (value.type() == typeid(std::vector<std::string>)) {
//         return std::any_cast<std::vector<std::string>>(value).size();
//     } else if (value.type() == typeid(std::vector<int64_t>)) { // Equivalent of List<dict>
//         return std::any_cast<std::vector<int64_t>>(value).size();
//     } else if (value.type() == typeid(std::string)) {
//         return std::any_cast<std::string>(value).length();
//     } else {
//         return 0;
//     }
// }

std::any normalizeIntIfNeeded(const std::any& value) {
    return value;
}

// Function to add two std::any values
std::any add(const std::any& a, const std::any& b) {
    std::any norm_a = normalizeIntIfNeeded(a);
    std::any norm_b = normalizeIntIfNeeded(b);

    try {
        // Add two int64_t values
        if (norm_a.type() == typeid(int64_t) && norm_b.type() == typeid(int64_t)) {
            return std::any_cast<int64_t>(norm_a) + std::any_cast<int64_t>(norm_b);
        }

        // Add two double values or int64_t and double
        if ((norm_a.type() == typeid(double) || norm_a.type() == typeid(int64_t)) &&
            (norm_b.type() == typeid(double) || norm_b.type() == typeid(int64_t))) {
            double a_val = (norm_a.type() == typeid(double)) ? std::any_cast<double>(norm_a) : static_cast<double>(std::any_cast<int64_t>(norm_a));
            double b_val = (norm_b.type() == typeid(double)) ? std::any_cast<double>(norm_b) : static_cast<double>(std::any_cast<int64_t>(norm_b));
            return a_val + b_val;
        }

        // Concatenate two strings
        if (norm_a.type() == typeid(std::string) && norm_b.type() == typeid(std::string)) {
            return std::any_cast<std::string>(norm_a) + std::any_cast<std::string>(norm_b);
        }

    } catch (const std::bad_any_cast&) {
        // Handle bad casting
        std::cerr << "Bad any cast occurred." << std::endl;
    }

    // If no conditions matched, return empty std::any (null-like)
    return std::any{};
}

std::any subtract(const std::any& a, const std::any& b) {
    std::any norm_a = normalizeIntIfNeeded(a);
    std::any norm_b = normalizeIntIfNeeded(b);

    try {
        if (norm_a.type() == typeid(int64_t) && norm_b.type() == typeid(int64_t)) {
            return std::any_cast<int64_t>(norm_a) - std::any_cast<int64_t>(norm_b);
        }

        if ((norm_a.type() == typeid(double) || norm_a.type() == typeid(int64_t)) &&
            (norm_b.type() == typeid(double) || norm_b.type() == typeid(int64_t))) {
            double a_val = (norm_a.type() == typeid(double)) ? std::any_cast<double>(norm_a) : static_cast<double>(std::any_cast<int64_t>(norm_a));
            double b_val = (norm_b.type() == typeid(double)) ? std::any_cast<double>(norm_b) : static_cast<double>(std::any_cast<int64_t>(norm_b));
            return a_val - b_val;
        }

    } catch (const std::bad_any_cast&) {
        std::cerr << "Bad any cast occurred." << std::endl;
    }

    return std::any{};
}

// Function to multiply two std::any values
std::any multiply(const std::any& a, const std::any& b) {
    std::any norm_a = normalizeIntIfNeeded(a);
    std::any norm_b = normalizeIntIfNeeded(b);

    try {
        if (norm_a.type() == typeid(int64_t) && norm_b.type() == typeid(int64_t)) {
            return std::any_cast<int64_t>(norm_a) * std::any_cast<int64_t>(norm_b);
        }

        if ((norm_a.type() == typeid(double) || norm_a.type() == typeid(int64_t)) &&
            (norm_b.type() == typeid(double) || norm_b.type() == typeid(int64_t))) {
            double a_val = (norm_a.type() == typeid(double)) ? std::any_cast<double>(norm_a) : static_cast<double>(std::any_cast<int64_t>(norm_a));
            double b_val = (norm_b.type() == typeid(double)) ? std::any_cast<double>(norm_b) : static_cast<double>(std::any_cast<int64_t>(norm_b));
            return a_val * b_val;
        }

    } catch (const std::bad_any_cast&) {
        std::cerr << "Bad any cast occurred." << std::endl;
    }

    return std::any{};
}

// Function to divide two std::any values
std::any divide(const std::any& a, const std::any& b) {
    std::any norm_a = normalizeIntIfNeeded(a);
    std::any norm_b = normalizeIntIfNeeded(b);

    try {
        if (norm_a.type() == typeid(int64_t) && norm_b.type() == typeid(int64_t)) {
            int64_t denominator = std::any_cast<int64_t>(norm_b);
            if (denominator == 0) {
                throw std::runtime_error("Division by zero");
            }
            return std::any_cast<int64_t>(norm_a) / denominator;
        }

        if ((norm_a.type() == typeid(double) || norm_a.type() == typeid(int64_t)) &&
            (norm_b.type() == typeid(double) || norm_b.type() == typeid(int64_t))) {
            double a_val = (norm_a.type() == typeid(double)) ? std::any_cast<double>(norm_a) : static_cast<double>(std::any_cast<int64_t>(norm_a));
            double b_val = (norm_b.type() == typeid(double)) ? std::any_cast<double>(norm_b) : static_cast<double>(std::any_cast<int64_t>(norm_b));
            if (b_val == 0.0) {
                throw std::runtime_error("Division by zero");
            }
            return a_val / b_val;
        }

    } catch (const std::bad_any_cast&) {
        std::cerr << "Bad any cast occurred." << std::endl;
    } catch (const std::runtime_error& e) {
        std::cerr << e.what() << std::endl;
    }

    return std::any{};
}


bool isGreaterThan(const std::any& a, const std::any& b) {
    if (a.has_value() && !b.has_value()) {
        return true;
    } else if (!a.has_value() || !b.has_value()) {
        return false;
    }

    std::any norm_a = normalizeIntIfNeeded(a);
    std::any norm_b = normalizeIntIfNeeded(b);

    try {
        if (norm_a.type() == typeid(int64_t) && norm_b.type() == typeid(int64_t)) {
            return std::any_cast<int64_t>(norm_a) > std::any_cast<int64_t>(norm_b);
        }

        if (norm_a.type() == typeid(int) && norm_b.type() == typeid(int)) {
            return std::any_cast<int>(norm_a) > std::any_cast<int>(norm_b);
        }

        if ((norm_a.type() == typeid(double) || norm_a.type() == typeid(int64_t)) &&
            (norm_b.type() == typeid(double) || norm_b.type() == typeid(int64_t))) {
            double a_val = (norm_a.type() == typeid(double)) ? std::any_cast<double>(norm_a) : static_cast<double>(std::any_cast<int64_t>(norm_a));
            double b_val = (norm_b.type() == typeid(double)) ? std::any_cast<double>(norm_b) : static_cast<double>(std::any_cast<int64_t>(norm_b));
            return a_val > b_val;
        }

        if (norm_a.type() == typeid(std::string) && norm_b.type() == typeid(std::string)) {
            return std::any_cast<std::string>(norm_a) > std::any_cast<std::string>(norm_b);
        }

    } catch (const std::bad_any_cast&) {
        std::cerr << "Bad any cast occurred." << std::endl;
    }

    return false;
}

bool isLessThan(const std::any& a, const std::any& b) {
    return !isGreaterThan(a, b) && !isEqual(a, b);
}

// Function to check if a is greater than or equal to b
bool isGreaterThanOrEqual(const std::any& a, const std::any& b) {
    return isGreaterThan(a, b) || isEqual(a, b);
}

// Function to check if a is less than or equal to b
bool isLessThanOrEqual(const std::any& a, const std::any& b) {
    return isLessThan(a, b) || isEqual(a, b);
}

std::any mathMax(const std::any& a, const std::any& b) {
    std::any norm_a = normalizeIntIfNeeded(a);
    std::any norm_b = normalizeIntIfNeeded(b);

    try {
        if (norm_a.type() == typeid(int64_t) && norm_b.type() == typeid(int64_t)) {
            return std::any_cast<int64_t>(norm_a) > std::any_cast<int64_t>(norm_b) ? norm_a : norm_b;
        }

        if ((norm_a.type() == typeid(double) || norm_a.type() == typeid(int64_t)) &&
            (norm_b.type() == typeid(double) || norm_b.type() == typeid(int64_t))) {
            double a_val = (norm_a.type() == typeid(double)) ? std::any_cast<double>(norm_a) : static_cast<double>(std::any_cast<int64_t>(norm_a));
            double b_val = (norm_b.type() == typeid(double)) ? std::any_cast<double>(norm_b) : static_cast<double>(std::any_cast<int64_t>(norm_b));
            return a_val > b_val ? a_val : b_val;
        }

        if (norm_a.type() == typeid(std::string) && norm_b.type() == typeid(std::string)) {
            return std::any_cast<std::string>(norm_a) > std::any_cast<std::string>(norm_b) ? norm_a : norm_b;
        }

    } catch (const std::bad_any_cast&) {
        std::cerr << "Bad any cast occurred." << std::endl;
    }

    return std::any{};
}

std::any mathMin(const std::any& a, const std::any& b) {
    std::any norm_a = normalizeIntIfNeeded(a);
    std::any norm_b = normalizeIntIfNeeded(b);

    try {
        if (norm_a.type() == typeid(int64_t) && norm_b.type() == typeid(int64_t)) {
            return std::any_cast<int64_t>(norm_a) < std::any_cast<int64_t>(norm_b) ? norm_a : norm_b;
        }

        if ((norm_a.type() == typeid(double) || norm_a.type() == typeid(int64_t)) &&
            (norm_b.type() == typeid(double) || norm_b.type() == typeid(int64_t))) {
            double a_val = (norm_a.type() == typeid(double)) ? std::any_cast<double>(norm_a) : static_cast<double>(std::any_cast<int64_t>(norm_a));
            double b_val = (norm_b.type() == typeid(double)) ? std::any_cast<double>(norm_b) : static_cast<double>(std::any_cast<int64_t>(norm_b));
            return a_val < b_val ? a_val : b_val;
        }

        if (norm_a.type() == typeid(std::string) && norm_b.type() == typeid(std::string)) {
            return std::any_cast<std::string>(norm_a) < std::any_cast<std::string>(norm_b) ? norm_a : norm_b;
        }

    } catch (const std::bad_any_cast&) {
        std::cerr << "Bad any cast occurred." << std::endl;
    }

    return std::any{};
}


int getArrayLength(const std::any& value) {
    if (!value.has_value()) {
        return 0;
    }

    // Check for vector of std::any
    if (value.type() == typeid(std::vector<std::any>)) {
        return std::any_cast<const std::vector<std::any>&>(value).size();
    }

    // Check for vector of strings
    if (value.type() == typeid(std::vector<std::string>)) {
        return std::any_cast<const std::vector<std::string>&>(value).size();
    }

    // // Check for vector of dict (custom type)
    // if (value.type() == typeid(std::vector<dict>)) {
    //     return std::any_cast<const std::vector<dict>&>(value).size();
    // }

    // Check for string
    if (value.type() == typeid(std::string)) {
        return std::any_cast<const std::string&>(value).length();
    }

    return 0;
}

std::any postFixIncrement(std::any& a) {
    if (a.type() == typeid(int64_t)) {
        a = std::any_cast<int64_t>(a) + 1;
    } else if (a.type() == typeid(int)) {
        a = std::any_cast<int>(a) + 1;
    } else if (a.type() == typeid(double)) {
        a = std::any_cast<double>(a) + 1;
    } else if (a.type() == typeid(std::string)) {
        a = std::any_cast<std::string>(a) + "1";
    } else {
        return std::any{};
    }
    return a;
}

// Function to decrement a numeric value
std::any postFixDecrement(std::any& a) {
    if (a.type() == typeid(int64_t)) {
        a = std::any_cast<int64_t>(a) - 1;
    } else if (a.type() == typeid(int)) {
        a = std::any_cast<int>(a) - 1;
    } else if (a.type() == typeid(double)) {
        a = std::any_cast<double>(a) - 1;
    } else {
        return std::any{};
    }
    return a;
}

std::any mod(const std::any& a, const std::any& b) {
    if (!a.has_value() || !b.has_value()) {
        return std::any{};
    }

    std::any norm_a = normalizeIntIfNeeded(a);
    std::any norm_b = normalizeIntIfNeeded(b);

    try {
        // Convert both values to double for modulus calculation
        double a_val = std::any_cast<double>(std::any_cast<int>(norm_a));
        double b_val = std::any_cast<double>(std::any_cast<int>(norm_b));

        if (b_val == 0) {
            std::cerr << "Division by zero error" << std::endl;
            return std::any{};
        }
        return std::fmod(a_val, b_val);
    } catch (const std::bad_any_cast&) {
        return std::any{};
    }
}

std::any parseInt(const std::any& a) {
    try {
        // Try to extract and convert to int64_t
        if (a.type() == typeid(std::string)) {
            int64_t parsedValue = std::stoll(std::any_cast<std::string>(a));
            return parsedValue;
        } else if (a.type() == typeid(int64_t)) {
            return std::any_cast<int64_t>(a);
        } else if (a.type() == typeid(int)) {
            return static_cast<int64_t>(std::any_cast<int>(a));
        }
    } catch (const std::bad_any_cast& e) {
        // Handle bad casting
    } catch (const std::exception& e) {
        // Handle conversion errors
    }
    return std::any{};
}

// Function to parse a float from a std::any object
std::any parseFloat(const std::any& a) {
    try {
        // Try to extract and convert to double
        if (a.type() == typeid(std::string)) {
            double parsedValue = std::stod(std::any_cast<std::string>(a));
            return parsedValue;
        } else if (a.type() == typeid(double)) {
            return std::any_cast<double>(a);
        } else if (a.type() == typeid(int64_t)) {
            return static_cast<double>(std::any_cast<int64_t>(a));
        } else if (a.type() == typeid(int)) {
            return static_cast<double>(std::any_cast<int>(a));
        }
    } catch (const std::bad_any_cast& e) {
        // Handle bad casting
    } catch (const std::exception& e) {
        // Handle conversion errors
    }
    return std::any{};
}


bool isTrue(const std::any& value) {
    if (!value.has_value()) {
        return false;
    }

    std::any normalizedValue = normalizeIntIfNeeded(value);

    if (normalizedValue.type() == typeid(bool)) {
        return std::any_cast<bool>(normalizedValue);
    } else if (normalizedValue.type() == typeid(int64_t)) {
        return std::any_cast<int64_t>(normalizedValue) != 0;
    } else if (normalizedValue.type() == typeid(double)) {
        return std::any_cast<double>(normalizedValue) != 0.0;
    } else if (normalizedValue.type() == typeid(std::string)) {
        std::string strVal = std::any_cast<std::string>(normalizedValue);
        return !strVal.empty() && strVal != "0" && strVal != "false" && strVal != "False" && strVal != "FALSE";
    } else if (normalizedValue.type() == typeid(std::vector<std::any>)) {
        return !std::any_cast<std::vector<std::any>>(normalizedValue).empty();
    } else if (normalizedValue.type() == typeid(std::vector<std::string>)) {
        return !std::any_cast<std::vector<std::string>>(normalizedValue).empty();
    } else if (normalizedValue.type() == typeid(std::vector<int>)) {
        return !std::any_cast<std::vector<int>>(normalizedValue).empty();
    } else if (normalizedValue.type() == typeid(std::vector<int64_t>)) {
        return !std::any_cast<std::vector<int64_t>>(normalizedValue).empty();
    } else if (normalizedValue.type() == typeid(std::vector<double>)) {
        return !std::any_cast<std::vector<double>>(normalizedValue).empty();
    } else if (normalizedValue.type() == typeid(std::unordered_map<std::string, std::any>)) {
        return true; // If the map has entries, it's considered "true"
    }

    return false;
}

// using json = nlohmann::json;

// std::any parseJson(const std::any& jsonInput) {
//     if (!jsonInput.has_value() || jsonInput.type() != typeid(std::string)) {
//         return std::any{};
//     }

//     std::string jsonString = std::any_cast<std::string>(jsonInput);

//     try {
//         json parsedJson = json::parse(jsonString);

//         if (parsedJson.is_array()) {
//             // Return the JSON array as a std::vector
//             std::vector<json> result = parsedJson.get<std::vector<json>>();
//             return result;
//         } else if (parsedJson.is_object()) {
//             // Return the JSON object as a std::unordered_map
//             std::unordered_map<std::string, json> result = parsedJson.get<std::unordered_map<std::string, json>>();
//             return result;
//         }
//     } catch (const std::exception& e) {
//         std::cerr << "Error parsing JSON: " << e.what() << std::endl;
//     }

//     return std::any{};
// }

// Function to add value to a
std::any plusEqual(std::any a, std::any value) {
    a = normalizeIntIfNeeded(a);
    value = normalizeIntIfNeeded(value);

    if (!value.has_value()) {
        return std::any{};
    }

    try {
        if (a.type() == typeid(int64_t)) {
            a = std::any_cast<int64_t>(a) + std::any_cast<int64_t>(value);
        } else if (a.type() == typeid(int)) {
            a = std::any_cast<int>(a) + std::any_cast<int>(value);
        } else if (a.type() == typeid(double)) {
            a = std::any_cast<double>(a) + std::any_cast<double>(value);
        } else if (a.type() == typeid(std::string)) {
            a = std::any_cast<std::string>(a) + std::any_cast<std::string>(value);
        } else {
            return std::any{};
        }
    } catch (const std::bad_any_cast&) {
        return std::any{};
    }

    return a;
}

// Function to negate the value
std::any prefixUnaryNeg(std::any& a) {
    if (a.type() == typeid(int64_t)) {
        a = -std::any_cast<int64_t>(a);
    } else if (a.type() == typeid(int)) {
        a = -std::any_cast<int>(a);
    } else if (a.type() == typeid(double)) {
        a = -std::any_cast<double>(a);
    } else {
        return std::any{};
    }
    return a;
}

// Function to return the same value (prefix unary plus)
std::any prefixUnaryPlus(std::any& a) {
    if (a.type() == typeid(int64_t)) {
        a = +std::any_cast<int64_t>(a);
    } else if (a.type() == typeid(int)) {
        a = +std::any_cast<int>(a);
    } else if (a.type() == typeid(double)) {
        a = +std::any_cast<double>(a);
    } else {
        return std::any{};
    }
    return a;
}

std::string toString(const std::any& value) {
    if (!value.has_value()) {
        return "null";
    }

    try {
        if (value.type() == typeid(int)) {
            return std::to_string(std::any_cast<int>(value));
        } else if (value.type() == typeid(double)) {
            return std::to_string(std::any_cast<double>(value));
        } else if (value.type() == typeid(std::string)) {
            return std::any_cast<std::string>(value);
        } else if (value.type() == typeid(bool)) {
            return std::any_cast<bool>(value) ? "true" : "false";
        } else {
            return "Unsupported type";
        }
    } catch (const std::bad_any_cast&) {
        return "Error casting";
    }
}

std::string toUpper(const std::string& str) {
    std::string result = str;
    std::transform(result.begin(), result.end(), result.begin(),
                   [](unsigned char c) { return std::toupper(c); });
    return result;
}

std::string toLower(const std::string& str) {
    std::string result = str;
    std::transform(result.begin(), result.end(), result.begin(),
                   [](unsigned char c) { return std::tolower(c); });
    return result;
}


bool StartsWith(const std::string& str, const std::string& prefix) {
    return str.rfind(prefix, 0) == 0;
}

bool startsWith(std::any str_any, std::any prefix_any) {
    try {
        // Cast std::any to std::string
        std::string str = std::any_cast<std::string>(str_any);
        std::string prefix = std::any_cast<std::string>(prefix_any);

        // Check if str starts with prefix
        return StartsWith(str, prefix);
    } catch (const std::bad_any_cast&) {
        // Handle incorrect type casts
        std::cerr << "Invalid types for StartsWith function" << std::endl;
        return false;
    }
}

bool EndsWith(const std::string& str, const std::string& suffix) {
    return str.size() >= suffix.size() &&
           str.compare(str.size() - suffix.size(), suffix.size(), suffix) == 0;
}

// Function to check if a std::any string ends with another std::any string
bool endsWith(std::any str_any, std::any suffix_any) {
    try {
        // Cast std::any to std::string
        std::string str = std::any_cast<std::string>(str_any);
        std::string suffix = std::any_cast<std::string>(suffix_any);

        // Check if str ends with suffix
        return EndsWith(str, suffix);
    } catch (const std::bad_any_cast&) {
        // Handle incorrect type casts
        std::cerr << "Invalid types for EndsWith function" << std::endl;
        return false;
    }
}

// Function to trim leading and trailing whitespace
std::string trim(const std::string& str) {
    auto start = str.begin();
    while (start != str.end() && std::isspace(*start)) {
        ++start;
    }

    auto end = str.end();
    do {
        --end;
    } while (std::distance(start, end) > 0 && std::isspace(*end));

    return std::string(start, end + 1);
}

// Function to trim a string from a std::any
std::string trim(const std::any& value) {
    try {
        std::string str = std::any_cast<std::string>(value);
        return trim(str);
    } catch (const std::bad_any_cast&) {
        std::cerr << "Invalid type for trim function" << std::endl;
        return "";
    }
}


std::any shift(std::any& container_any) {
    try {
        // Attempt to cast the std::any to a vector of std::any
        auto& container = std::any_cast<std::vector<std::any>&>(container_any);

        if (container.empty()) {
            return std::any{};
        }

        // Retrieve the first element
        std::any first = container.front();

        // Remove the first element
        container.erase(container.begin());

        // Return the first element
        return first;
    } catch (const std::bad_any_cast&) {
        std::cerr << "Error: Provided value is not a std::vector<std::any>" << std::endl;
        return std::any{};
    }
}

std::any pop(std::any& container_any) {
    try {
        // Attempt to cast the std::any to a vector of std::any
        auto& container = std::any_cast<std::vector<std::any>&>(container_any);

        if (container.empty()) {
            return std::any{};
        }

        // Retrieve the last element
        std::any last = container.back();

        // Remove the last element
        container.pop_back();

        // Return the last element
        return last;
    } catch (const std::bad_any_cast&) {
        std::cerr << "Error: Provided value is not a std::vector<std::any>" << std::endl;
        return std::any{};
    }
}

std::any reverse(std::any& container_any) {
    try {
        // Attempt to cast the std::any to a vector of std::any
        auto& container = std::any_cast<std::vector<std::any>&>(container_any);

        // Reverse the container in place
        std::reverse(container.begin(), container.end());

        // Return the reversed container as a std::any
        return container;
    } catch (const std::bad_any_cast&) {
        std::cerr << "Error: Provided value is not a std::vector<std::any>" << std::endl;
        return std::any{};
    }
}


std::any join(const std::any& elements_any, const std::any& separator_any) {
    try {
        auto elements = std::any_cast<std::vector<std::string>>(elements_any);
        auto separator = std::any_cast<std::string>(separator_any);

        std::string result;
        for (size_t i = 0; i < elements.size(); ++i) {
            result += elements[i];
            if (i < elements.size() - 1) {
                result += separator;
            }
        }
        return result;
    } catch (const std::bad_any_cast&) {
        std::cerr << "Invalid type(s) provided for join function" << std::endl;
        return std::any{};
    }
}


std::any split(const std::any& str_any, const std::any& delimiter_any) {
    try {
        auto str = std::any_cast<std::string>(str_any);
        auto delimiter = std::any_cast<char>(delimiter_any);

        std::vector<std::string> result;
        std::string current;
        for (char ch : str) {
            if (ch == delimiter) {
                result.push_back(current);
                current.clear();
            } else {
                current += ch;
            }
        }
        if (!current.empty()) {
            result.push_back(current);
        }
        return result;
    } catch (const std::bad_any_cast&) {
        std::cerr << "Invalid type(s) provided for split function" << std::endl;
        return std::any{};
    }
}

std::any replace(const std::any& str_any, const std::any& target_any, const std::any& replacement_any) {
    try {
        std::string str = std::any_cast<std::string>(str_any);
        std::string target = std::any_cast<std::string>(target_any);
        std::string replacement = std::any_cast<std::string>(replacement_any);

        size_t startPos = 0;
        while ((startPos = str.find(target, startPos)) != std::string::npos) {
            str.replace(startPos, target.length(), replacement);
            startPos += replacement.length(); // Move past the last replacement
        }

        return str;
    } catch (const std::bad_any_cast&) {
        std::cerr << "Invalid type(s) provided for replace function" << std::endl;
        return std::any{};
    }
}


std::vector<std::string> getObjectKeys(const std::any& obj) {
    std::vector<std::string> keys;

    // Check if the object is a map-like structure
    if (obj.has_value() && obj.type() == typeid(std::map<std::string, std::any>)) {
        // Extract the map
        auto mapObj = std::any_cast<std::map<std::string, std::any>>(obj);
        // Extract keys from the map
        for (const auto& pair : mapObj) {
            keys.push_back(pair.first);
        }
    }

    return keys;
}

std::vector<std::any> getObjectValues(const std::any& obj) {
    std::vector<std::any> values;

    // Check if the object is a map-like structure
    if (obj.has_value() && obj.type() == typeid(std::map<std::string, std::any>)) {
        // Extract the map
        auto mapObj = std::any_cast<std::map<std::string, std::any>>(obj);

        // Extract values from the map
        for (const auto& pair : mapObj) {
            values.push_back(pair.second);
        }
    }

    return values;
}


template<typename T>
struct is_std_vector : std::false_type {};

template<typename T, typename Alloc>
struct is_std_vector<std::vector<T, Alloc>> : std::true_type {};

template<typename T>
bool isArray(const std::any& obj) {
    if (obj.has_value()) {
        try {
            if (std::any_cast<T>(&obj)) {
                return true;
            }
        } catch (const std::bad_any_cast&) {}
    }
    return false;
}

double mathFloor(const std::any& value) {
    try {
        if (value.type() == typeid(int)) {
            return std::any_cast<int>(value);
        } else if (value.type() == typeid(double)) {
            return std::floor(std::any_cast<double>(value));
        } else {
            throw std::invalid_argument("Unsupported type for mathFloor");
        }
    } catch (const std::bad_any_cast& e) {
        throw std::invalid_argument("Invalid argument for mathFloor");
    }
}

double mathRound(const std::any& value) {
    try {
        if (value.type() == typeid(int)) {
            return std::any_cast<int>(value);
        } else if (value.type() == typeid(double)) {
            return std::round(std::any_cast<double>(value));
        } else {
            throw std::invalid_argument("Unsupported type for mathRound");
        }
    } catch (const std::bad_any_cast& e) {
        throw std::invalid_argument("Invalid argument for mathRound");
    }
}

double mathCeil(const std::any& value) {
    try {
        if (value.type() == typeid(int)) {
            return std::any_cast<int>(value);
        } else if (value.type() == typeid(double)) {
            return std::ceil(std::any_cast<double>(value));
        } else {
            throw std::invalid_argument("Unsupported type for mathCeil");
        }
    } catch (const std::bad_any_cast& e) {
        throw std::invalid_argument("Invalid argument for mathCeil");
    }
}


void arrayPush(std::any& arr, const std::any& value) {
    try {
        if (arr.type() == typeid(std::vector<std::any>)) {
            auto& vec = std::any_cast<std::vector<std::any>&>(arr);
            vec.push_back(value);
        } else {
            throw std::invalid_argument("Unsupported type for arrayPush");
        }
    } catch (const std::bad_any_cast& e) {
        throw std::invalid_argument("Invalid argument for arrayPush");
    }
}

bool includes(const std::any& container, const std::any& value) {
    try {
        if (container.type() == typeid(std::vector<std::any>)) {
            // Use const reference to get data from a const std::any reference
            const auto& vec = std::any_cast<const std::vector<std::any>&>(container);
            // You can now search for 'value', though you need to handle comparison differently
            return std::find_if(vec.begin(), vec.end(), [&value](const std::any& elem) {
                // This check requires that 'value' and 'elem' can be compared,
                // which is another potential source of errors because std::any does not support comparison.
                // You will need to implement a comparison mechanism similar to your 'areEqual' function.
                return areEqual(elem, value); // Assuming 'areEqual' handles std::any comparisons.
            }) != vec.end();
        } else {
            throw std::invalid_argument("Unsupported type for includes");
        }
    } catch (const std::bad_any_cast& e) {
        throw std::invalid_argument("Invalid argument for includes");
    }
}

template<typename T>
bool deleteKey(std::any& container, const T& key) {
    try {
        if (container.type() == typeid(std::vector<T>)) {
            auto& vec = std::any_cast<std::vector<T>&>(container);
            auto it = std::find(vec.begin(), vec.end(), key);
            if (it != vec.end()) {
                vec.erase(it);
                return true;
            } else {
                return false; // Key not found
            }
        } else {
            throw std::invalid_argument("Unsupported type for deleteKey");
        }
    } catch (const std::bad_any_cast& e) {
        throw std::invalid_argument("Invalid argument for deleteKey");
    }
}
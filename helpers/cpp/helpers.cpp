#include <iostream>
#include <any>
#include <string>
#include <unordered_map>
#include <vector>
#include <algorithm>


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


bool inOp(const std::any& obj, const std::any& key) {
    if (!obj.has_value() || !key.has_value()) {
        return false;
    }

    try {
        // Check if obj is a vector of any
        if (obj.type() == typeid(std::vector<std::any>)) {
            const auto& vec = std::any_cast<const std::vector<std::any>&>(obj);
            return std::find(vec.begin(), vec.end(), key) != vec.end();
        }

        // Check if obj is a vector of strings
        if (obj.type() == typeid(std::vector<std::string>)) {
            const auto& vec = std::any_cast<const std::vector<std::string>&>(obj);
            const std::string& strKey = std::any_cast<const std::string&>(key);
            return std::find(vec.begin(), vec.end(), strKey) != vec.end();
        }

        // Check if obj is a vector of int64_t
        if (obj.type() == typeid(std::vector<int64_t>)) {
            const auto& vec = std::any_cast<const std::vector<int64_t>&>(obj);
            int64_t intKey = std::any_cast<int64_t>(key);
            return std::find(vec.begin(), vec.end(), intKey) != vec.end();
        }

        // Check if obj is an unordered_map
        if (obj.type() == typeid(std::unordered_map<std::string, std::any>)) {
            const auto& dict = std::any_cast<const std::unordered_map<std::string, std::any>&>(obj);
            const std::string& strKey = std::any_cast<const std::string&>(key);
            return dict.find(strKey) != dict.end();
        }
    } catch (const std::bad_any_cast&) {
        return false; // Handle bad cast exceptions gracefully
    }

    // Default return false if no conditions matched
    return false;
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
    // Check if collection is a vector of std::any
    if (collection.type() == typeid(std::vector<std::any>)) {
        const auto& vec = std::any_cast<const std::vector<std::any>&>(collection);
        auto it = std::find(vec.begin(), vec.end(), target);
        return it != vec.end() ? std::distance(vec.begin(), it) : -1;
    }

    // Check if collection is a vector of strings
    if (collection.type() == typeid(std::vector<std::string>)) {
        const auto& vec = std::any_cast<const std::vector<std::string>&>(collection);
        try {
            const std::string& targetStr = std::any_cast<const std::string&>(target);
            auto it = std::find(vec.begin(), vec.end(), targetStr);
            return it != vec.end() ? std::distance(vec.begin(), it) : -1;
        } catch (const std::bad_any_cast&) {
            return -1;
        }
    }

    // Check if collection is a string
    if (collection.type() == typeid(std::string)) {
        try {
            const std::string& str = std::any_cast<const std::string&>(collection);
            const std::string& targetStr = std::any_cast<const std::string&>(target);
            size_t pos = str.find(targetStr);
            return pos != std::string::npos ? static_cast<int>(pos) : -1;
        } catch (const std::bad_any_cast&) {
            return -1;
        }
    }

    // If none of the conditions match, return -1
    return -1;
}

int getArrayLength(const std::any& value) {
    if (!value.has_value()) {
        return 0;
    }

    if (value.type() == typeid(std::vector<std::any>)) {
        return std::any_cast<std::vector<std::any>>(value).size();
    } else if (value.type() == typeid(std::vector<std::string>)) {
        return std::any_cast<std::vector<std::string>>(value).size();
    } else if (value.type() == typeid(std::vector<int64_t>)) { // Equivalent of List<dict>
        return std::any_cast<std::vector<int64_t>>(value).size();
    } else if (value.type() == typeid(std::string)) {
        return std::any_cast<std::string>(value).length();
    } else {
        return 0;
    }
}

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
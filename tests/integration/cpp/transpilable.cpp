#include <iostream>
#include <any>
#include <string>
#include <vector>
#include "helpers.h"

class Second
{
    std::any stringifyNumber(std::any arg)
    {
        return toString(arg);
    }
};
class Test
{
    void test()
    {
        std::any a = 1;
        std::any b = 2;
        std::any c = add(a, b);
        std::cout << (c); // should print 3
        std::any s1 = "a";
        std::any s2 = "b";
        std::any s3 = add(s1, s2);
        std::cout << (s3); // should print "ab"
        std::any x = false;
        if (isTrue(x))
        {
            std::cout << ("x is true");
        } else
        {
            std::cout << ("x is false"); // should print "x is false"
        }
        var instance = new Second();
        std::cout << (instance.stringifyNumber(4)); // should print 4
        std::any arr = std::vector<std::any>{1, 2, 3, 4};
        std::cout << (getArrayLength(arr)); // should print 4
        std::any first = getValue(arr, 0);
        std::cout << (first); // should print 1
        std::any dict = std::unordered_map<std::string, std::any> {
            { "a", "b" },
        };
        std::cout << (getValue(dict, "a")); // should print "b"
        std::any i = 0;
        for (std::any w = 0; isLessThan(w, 10); postFixIncrement(w))
        {
            postFixIncrement(i);
        }
        std::cout << (toString(i)); // should print 10
        std::any list2 = std::vector<std::any>{1, 2, 3, 4, 5};
        reverse(list2);
        std::cout << (getValue(list2, 0)); // should print 5
        //should delete key from dict
        std::any dict2 = std::unordered_map<std::string, std::any> {
            { "a", 1 },
            { "b", 2 },
        };
        deleteKey(dict2,"a");
        std::any dictKeys = getObjectKeys(dict2);
        std::cout << (getArrayLength(dictKeys)); // should print 1
        std::cout << (getValue(dictKeys, 0)); // should print "b"
    }
};

#include "helpers.h"

class Second
{
public:
    std::any myClassProperty = std::string("classProp");
    std::any myBoolProp = false;

    virtual std::any stringifyNumber(std::any arg)
    {
        return toString(arg);
    }
};
class Test
{
public:
    virtual std::any boolToString(std::any x)
    {
        if (isTrue(x))
        {
            return std::string("true");
        } else
        {
            return std::string("false");
        }
    }

    virtual void functionWithOptionals(std::any a, std::any c = std::any{}, std::any d = 1)
    {
        consoleLog(a);
        if (isTrue(!isEqual(c, std::any{})))
        {
            consoleLog(c);
        }
        if (isTrue(!isEqual(d, std::any{})))
        {
            consoleLog(d);
        }
    }

    virtual std::any getValue(std::any x)
    {
        return x;
    }

    virtual void testJavaScope()
    {
        std::any newObject = std::unordered_map<std::string, std::any> {
            { std::string("a"), this->getValue(5) },
            { std::string("b"), this->getValue(this->getValue(this->getValue(2))) },
        };
        consoleLog(::getValue(newObject, std::string("a"))); // should print 5
        consoleLog(::getValue(newObject, std::string("b"))); // should print 2
    }

    virtual void test()
    {
        std::any a = 1;
        std::any b = 2;
        std::any c = add(a, b);
        consoleLog(c); // should print 3
        std::any s1 = std::string("a");
        std::any s2 = std::string("b");
        std::any s3 = add(s1, s2);
        std::any stringVar = std::any{};
        stringVar = std::string("hello");
        consoleLog(stringVar); // should print "hello"
        consoleLog(s3); // should print "ab"
        std::any x = false;
        if (isTrue(x))
        {
            consoleLog(std::string("x is true"));
        } else
        {
            consoleLog(std::string("x is false")); // should print "x is false"
        }
        Second instance = Second();
        consoleLog(instance.stringifyNumber(4)); // should print 4
        consoleLog(instance.myClassProperty); // should print "classProp"
        if (isTrue(isEqual(instance.myBoolProp, false)))
        {
            consoleLog(std::string("myBoolProp is false")); // should print "myBoolProp is false"
        }
        std::any arr = std::vector<std::any>{1, 2, 3, 4};
        consoleLog(getArrayLength(arr)); // should print 4
        std::any first = ::getValue(arr, 0);
        consoleLog(first); // should print 1
        std::any dict = std::unordered_map<std::string, std::any> {
            { std::string("a"), std::string("b") },
        };
        consoleLog(::getValue(dict, std::string("a"))); // should print "b"
        std::any i = 0;
        for (std::any w = 0; isLessThan(w, 10); postFixIncrement(w))
        {
            i = add(i, 1);
        }
        consoleLog(toString(i)); // should print 10
        std::any list2 = std::vector<std::any>{1, 2, 3, 4, 5};
        reverse(list2);
        consoleLog(::getValue(list2, 0)); // should print 5
        //should delete key from dict
        std::any dict2 = std::unordered_map<std::string, std::any> {
            { std::string("a"), 1 },
            { std::string("b"), 2 },
        };
        deleteKey(dict2, std::string("a"));
        std::any dictKeys = getObjectKeys(dict2);
        consoleLog(getArrayLength(dictKeys)); // should print 1
        consoleLog(::getValue(dictKeys, 0)); // should print "b"
        std::any firstConcat = std::vector<std::any>{std::string("a"), std::string("b")};
        std::any secondConcat = std::vector<std::any>{std::string("c"), std::string("d")};
        std::any both = concat(firstConcat, secondConcat);
        consoleLog(getArrayLength(both)); // should print 4
        consoleLog(::getValue(both, 2)); // should print "c"
        std::any baseString = std::string("aabba");
        std::any replacedAllString = replaceAll(baseString, std::string("a"), std::string(""));
        consoleLog(replacedAllString); // should print "bb"
        this->functionWithOptionals(std::string("hello"));
        this->functionWithOptionals(std::string("hello"), 5);
        this->functionWithOptionals(std::string("hello"), 5, 1);
        std::any list3 = std::vector<std::any>{std::string("empty")};
        ::setValue(list3, 0, std::string("first"));
        consoleLog(::getValue(list3, 0)); // should print "first"
        std::any dict3 = std::unordered_map<std::string, std::any> {};
        ::setValue(dict3, std::string("key"), std::string("value"));
        consoleLog(::getValue(dict3, std::string("key"))); // should print "value"
        this->testJavaScope();
        std::any first1second1Variable = this->handleOptionAndParamsTest();
        std::any first1 = ::getValue(first1second1Variable, 0);
        std::any second1 = ::getValue(first1second1Variable, 1);
        consoleLog(first1); // should print 1
        consoleLog(second1); // should print "a"
        std::any first2 = std::any{};
        std::any second2 = std::any{};
        std::any first2second2Variable = this->handleOptionAndParamsTest();
        first2 = ::getValue(first2second2Variable, 0);
        second2 = ::getValue(first2second2Variable, 1);
        consoleLog(first2); // should print 1
        consoleLog(second2); // should print "a"
        this->funcWithParams(std::vector<std::any>{1, 2, 3}, std::unordered_map<std::string, std::any> {
            { std::string("a"), std::string("value of a") },
        });
        this->testStringMethods();
        std::any threwError = false;
        try
        {
            this->functionThatThrows();
        } catch(const std::exception& e)
        {
            threwError = true;
        }
        consoleLog(this->boolToString(threwError)); // should print true
    }

    virtual std::any handleOptionAndParamsTest()
    {
        return std::vector<std::any>{1, std::string("a")};
    }

    virtual void funcWithParams(std::any a = std::any{}, std::any params = std::unordered_map<std::string, std::any> {})
    {
        if (isTrue(isArray(a)))
        {
            consoleLog(getArrayLength(a));
        }
        if (isTrue(inOp(params, std::string("a"))))
        {
            consoleLog(::getValue(params, std::string("a")));
        }
    }

    virtual void testStringMethods()
    {
        std::any str = std::string("hello world");
        // isEqual test
        if (isTrue(isEqual(str, std::string("hello world"))))
        {
            consoleLog(std::string("str is hello world")); // should print "str is hello world"
        }
        consoleLog(toUpperCase(str));
        std::any startsWithHello = startsWith(str, std::string("hello"));
        consoleLog(this->boolToString(startsWithHello)); // should print true
        std::any endsWithWorld = endsWith(str, std::string("world"));
        consoleLog(this->boolToString(endsWithWorld)); // should print true
        std::any stringParts = split(str, std::string(" "));
        consoleLog(getArrayLength(stringParts)); // should print 2
        consoleLog(::getValue(stringParts, 0)); // should print "hello"
        consoleLog(::getValue(stringParts, 1)); // should print "world"
        std::any indexOfResult = getIndexOf(str, std::string("o"));
        consoleLog(indexOfResult); // should print 4
        std::any strReplaced = replaceAll(str, std::string("l"), std::string("x"));
        consoleLog(strReplaced); // should print "hexxo worxd"
        // concatenation test
        std::any a = std::string("a");
        std::any b = std::string("b");
        std::any c = add(a, b);
        consoleLog(c); // should print "ab"
    }

    virtual void functionThatThrows()
    {
        throw Error(toString(std::string("This is an error")));
    }
};

int main()
{
    Test instance;
    instance.test();
    return 0;
}

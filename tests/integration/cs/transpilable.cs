namespace tests;
class Second
{
    public string myClassProperty = "classProp";
    public bool myBoolProp = false;

    public virtual object stringifyNumber(object arg)
    {
        return ((object)arg).ToString();
    }
}
partial class Test
{
    public virtual object boolToString(object x)
    {
        if (isTrue(x))
        {
            return "true";
        } else
        {
            return "false";
        }
    }

    public virtual void functionWithOptionals(object a, object c = null, object d = null)
    {
        d ??= 1;
        Console.WriteLine(a);
        if (isTrue(!isEqual(c, null)))
        {
            Console.WriteLine(c);
        }
        if (isTrue(!isEqual(d, null)))
        {
            Console.WriteLine(d);
        }
    }

    public virtual object getValue(object x)
    {
        return x;
    }

    public virtual void testJavaScope()
    {
        object newObject = new Dictionary<string, object>() {
            { "a", this.getValue(5) },
            { "b", this.getValue(this.getValue(this.getValue(2))) },
        };
        Console.WriteLine(getValue(newObject, "a")); // should print 5
        Console.WriteLine(getValue(newObject, "b")); // should print 2
    }

    public virtual void test()
    {
        object a = 1;
        object b = 2;
        object c = add(a, b);
        Console.WriteLine(c); // should print 3
        string s1 = "a";
        string s2 = "b";
        object s3 = add(s1, s2);
        object stringVar = null;
        stringVar = "hello";
        Console.WriteLine(stringVar); // should print "hello"
        Console.WriteLine(s3); // should print "ab"
        bool x = false;
        if (isTrue(x))
        {
            Console.WriteLine("x is true");
        } else
        {
            Console.WriteLine("x is false"); // should print "x is false"
        }
        var instance = new Second();
        Console.WriteLine(instance.stringifyNumber(4)); // should print 4
        Console.WriteLine(instance.myClassProperty); // should print "classProp"
        if (isTrue(isEqual(instance.myBoolProp, false)))
        {
            Console.WriteLine("myBoolProp is false"); // should print "myBoolProp is false"
        }
        object arr = new List<object>() {1, 2, 3, 4};
        Console.WriteLine(getArrayLength(arr)); // should print 4
        object first = getValue(arr, 0);
        Console.WriteLine(first); // should print 1
        object dict = new Dictionary<string, object>() {
            { "a", "b" },
        };
        Console.WriteLine(getValue(dict, "a")); // should print "b"
        object i = 0;
        for (object w = 0; isLessThan(w, 10); postFixIncrement(ref w))
        {
            i = add(i, 1);
        }
        Console.WriteLine(((object)i).ToString()); // should print 10
        object list2 = new List<object>() {1, 2, 3, 4, 5};
        list2 = (list2 as IList<object>).Reverse().ToList();
        Console.WriteLine(getValue(list2, 0)); // should print 5
        //should delete key from dict
        object dict2 = new Dictionary<string, object>() {
            { "a", 1 },
            { "b", 2 },
        };
        ((IDictionary<string,object>)dict2).Remove((string)"a");
        List<object> dictKeys = new List<object>(((IDictionary<string,object>)dict2).Keys);
        Console.WriteLine(getArrayLength(dictKeys)); // should print 1
        Console.WriteLine(getValue(dictKeys, 0)); // should print "b"
        object firstConcat = new List<object>() {"a", "b"};
        object secondConcat = new List<object>() {"c", "d"};
        object both = concat(firstConcat, secondConcat);
        Console.WriteLine(getArrayLength(both)); // should print 4
        Console.WriteLine(getValue(both, 2)); // should print "c"
        string baseString = "aabba";
        string replacedAllString = ((string)baseString).Replace((string)"a", (string)"");
        Console.WriteLine(replacedAllString); // should print "bb"
        this.functionWithOptionals("hello");
        this.functionWithOptionals("hello", 5);
        this.functionWithOptionals("hello", 5, 1);
        object list3 = new List<object>() {"empty"};
        ((List<object>)list3)[Convert.ToInt32(0)] = "first";
        Console.WriteLine(getValue(list3, 0)); // should print "first"
        object dict3 = new Dictionary<string, object>() {};
        ((IDictionary<string,object>)dict3)["key"] = "value";
        Console.WriteLine(getValue(dict3, "key")); // should print "value"
        this.testJavaScope();
        var first1second1Variable = this.handleOptionAndParamsTest();
        var first1 = ((IList<object>) first1second1Variable)[0];
        var second1 = ((IList<object>) first1second1Variable)[1];
        Console.WriteLine(first1); // should print 1
        Console.WriteLine(second1); // should print "a"
        object first2 = null;
        object second2 = null;
        var first2second2Variable = this.handleOptionAndParamsTest();
        first2 = ((IList<object>)first2second2Variable)[0];
        second2 = ((IList<object>)first2second2Variable)[1];
        Console.WriteLine(first2); // should print 1
        Console.WriteLine(second2); // should print "a"
        this.funcWithParams(new List<object>() {1, 2, 3}, new Dictionary<string, object>() {
            { "a", "value of a" },
        });
        this.testStringMethods();
        bool threwError = false;
        try
        {
            this.functionThatThrows();
        } catch(Exception e)
        {
            threwError = true;
        }
        Console.WriteLine(this.boolToString(threwError)); // should print true
    }

    public virtual object handleOptionAndParamsTest()
    {
        return new List<object>() {1, "a"};
    }

    public virtual void funcWithParams(object a = null, object parameters = null)
    {
        parameters ??= new Dictionary<string, object>();
        if (isTrue(((a is IList<object>) || (a.GetType().IsGenericType && a.GetType().GetGenericTypeDefinition().IsAssignableFrom(typeof(List<>))))))
        {
            Console.WriteLine(getArrayLength(a));
        }
        if (isTrue(inOp(parameters, "a")))
        {
            Console.WriteLine(getValue(parameters, "a"));
        }
    }

    public virtual void testStringMethods()
    {
        string str = "hello world";
        // isEqual test
        if (isTrue(isEqual(str, "hello world")))
        {
            Console.WriteLine("str is hello world"); // should print "str is hello world"
        }
        Console.WriteLine(((string)str).ToUpper());
        bool startsWithHello = ((string)str).StartsWith(((string)"hello"));
        Console.WriteLine(this.boolToString(startsWithHello)); // should print true
        bool endsWithWorld = ((string)str).EndsWith(((string)"world"));
        Console.WriteLine(this.boolToString(endsWithWorld)); // should print true
        List<object> stringParts = ((string)str).Split(new [] {((string)" ")}, StringSplitOptions.None).ToList<object>();
        Console.WriteLine(getArrayLength(stringParts)); // should print 2
        Console.WriteLine(getValue(stringParts, 0)); // should print "hello"
        Console.WriteLine(getValue(stringParts, 1)); // should print "world"
        int indexOfResult = getIndexOf(str, "o");
        Console.WriteLine(indexOfResult); // should print 4
        string strReplaced = ((string)str).Replace((string)"l", (string)"x");
        Console.WriteLine(strReplaced); // should print "hexxo worxd"
        // concatenation test
        string a = "a";
        string b = "b";
        object c = add(a, b);
        Console.WriteLine(c); // should print "ab"
    }

    public virtual void functionThatThrows()
    {
        throw new Exception ((string)"This is an error") ;
    }
}

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
        object s1 = "a";
        object s2 = "b";
        object s3 = add(s1, s2);
        object stringVar = null;
        stringVar = "hello";
        Console.WriteLine(stringVar); // should print "hello"
        Console.WriteLine(s3); // should print "ab"
        object x = false;
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
        object dictKeys = new List<object>(((IDictionary<string,object>)dict2).Keys);
        Console.WriteLine(getArrayLength(dictKeys)); // should print 1
        Console.WriteLine(getValue(dictKeys, 0)); // should print "b"
        object firstConcat = new List<object>() {"a", "b"};
        object secondConcat = new List<object>() {"c", "d"};
        object both = concat(firstConcat, secondConcat);
        Console.WriteLine(getArrayLength(both)); // should print 4
        Console.WriteLine(getValue(both, 2)); // should print "c"
        object baseString = "aabba";
        object replacedAllString = ((string)baseString).Replace((string)"a", (string)"");
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
    }
}

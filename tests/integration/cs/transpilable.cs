namespace tests;
class Second
{
    public string myClassProperty = "classProp";

    public virtual object stringifyNumber(object arg)
    {
        return ((object)arg).ToString();
    }
}
partial class Test
{
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
    }
}

package org.example;
class Second
{
    public String myClassProperty = "classProp";
    public boolean myBoolProp = false;

    public Object stringifyNumber(Object arg)
    {
        return String.valueOf(arg);
    }
}
class Test
{
    public void test()
    {
        Object a = 1;
        Object b = 2;
        Object c = Helpers.add(a, b);
        System.out.println(c); // should print 3
        Object s1 = "a";
        Object s2 = "b";
        Object s3 = Helpers.add(s1, s2);
        Object stringVar = null;
        stringVar = "hello";
        System.out.println(stringVar); // should print "hello"
        System.out.println(s3); // should print "ab"
        Object x = false;
        if (Helpers.isTrue(x))
        {
            System.out.println("x is true");
        } else
        {
            System.out.println("x is false"); // should print "x is false"
        }
        var instance = new Second();
        System.out.println(instance.stringifyNumber(4)); // should print 4
        System.out.println(instance.myClassProperty); // should print "classProp"
        if (Helpers.isTrue(Helpers.isEqual(instance.myBoolProp, false)))
        {
            System.out.println("myBoolProp is false"); // should print "myBoolProp is false"
        }
        Object arr = new java.util.ArrayList<Object>(java.util.Arrays.asList(1, 2, 3, 4));
        System.out.println(Helpers.getArrayLength(arr)); // should print 4
        Object first = Helpers.GetValue(arr, 0);
        System.out.println(first); // should print 1
        Object dict = new java.util.HashMap<String, Object>() {{
            put( "a", "b" );
        }};
        System.out.println(Helpers.GetValue(dict, "a")); // should print "b"
        Object i = 0;
        for (var w = 0; Helpers.isLessThan(w, 10); w++)
        {
            i = Helpers.add(i, 1);
        }
        System.out.println(String.valueOf(i)); // should print 10
        Object list2 = new java.util.ArrayList<Object>(java.util.Arrays.asList(1, 2, 3, 4, 5));
        java.util.Collections.reverse((java.util.List<Object>)list2);
        System.out.println(Helpers.GetValue(list2, 0)); // should print 5
        //should delete key from dict
        Object dict2 = new java.util.HashMap<String, Object>() {{
            put( "a", 1 );
            put( "b", 2 );
        }};
        ((java.util.Map<String,Object>)dict2).remove((String)"a");
        Object dictKeys = new java.util.ArrayList<Object>(((java.util.Map<String, Object>)dict2).keySet());
        System.out.println(Helpers.getArrayLength(dictKeys)); // should print 1
        System.out.println(Helpers.GetValue(dictKeys, 0)); // should print "b"
        Object firstConcat = new java.util.ArrayList<Object>(java.util.Arrays.asList("a", "b"));
        Object secondConcat = new java.util.ArrayList<Object>(java.util.Arrays.asList("c", "d"));
        Object both = Helpers.concat(firstConcat, secondConcat);
        System.out.println(Helpers.getArrayLength(both)); // should print 4
        System.out.println(Helpers.GetValue(both, 2)); // should print "c"
        Object baseString = "aabba";
        Object replacedAllString = Helpers.replaceAll((String)baseString, (String)"a", (String)"");
        System.out.println(replacedAllString); // should print "bb"
    }
}

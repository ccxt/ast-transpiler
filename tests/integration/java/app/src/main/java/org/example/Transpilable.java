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
    public Object boolToString(Object x)
    {
        if (Helpers.isTrue(x))
        {
            return "true";
        } else
        {
            return "false";
        }
    }

    public void functionWithOptionals(Object a, Object... optionalArgs)
    {
        Object c = Helpers.getArg(optionalArgs, 0, null);
        Object d = Helpers.getArg(optionalArgs, 1, 1);
        System.out.println(a);
        if (Helpers.isTrue(!Helpers.isEqual(c, null)))
        {
            System.out.println(c);
        }
        if (Helpers.isTrue(!Helpers.isEqual(d, null)))
        {
            System.out.println(d);
        }
    }

    public Object getValue(Object x)
    {
        return x;
    }

    public void testJavaScope()
    {
        Object newObject = new java.util.HashMap<String, Object>() {{
            put( "a", Test.this.getValue(5) );
            put( "b", Test.this.getValue(Test.this.getValue(Test.this.getValue(2))) );
        }};
        System.out.println(Helpers.GetValue(newObject, "a")); // should print 5
        System.out.println(Helpers.GetValue(newObject, "b")); // should print 2
    }

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
        Object dictKeys = Helpers.objectKeys(dict2);
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
        this.functionWithOptionals("hello");
        this.functionWithOptionals("hello", 5);
        this.functionWithOptionals("hello", 5, 1);
        Object list3 = new java.util.ArrayList<Object>(java.util.Arrays.asList("empty"));
        Helpers.addElementToObject(list3, 0, "first");
        System.out.println(Helpers.GetValue(list3, 0)); // should print "first"
        Object dict3 = new java.util.HashMap<String, Object>() {{}};
        Helpers.addElementToObject(dict3, "key", "value");
        System.out.println(Helpers.GetValue(dict3, "key")); // should print "value"
        this.testJavaScope();
        var first1second1Variable = this.handleOptionAndParamsTest();
        var first1 = ((java.util.List<Object>) first1second1Variable).get(0);
        var second1 = ((java.util.List<Object>) first1second1Variable).get(1);
        System.out.println(first1); // should print 1
        System.out.println(second1); // should print "a"
        Object first2 = null;
        Object second2 = null;
        var first2second2Variable = this.handleOptionAndParamsTest();
        first2 = ((java.util.List<Object>) first2second2Variable).get(0);
        second2 = ((java.util.List<Object>) first2second2Variable).get(1);
        System.out.println(first2); // should print 1
        System.out.println(second2); // should print "a"
        this.funcWithParams(new java.util.ArrayList<Object>(java.util.Arrays.asList(1, 2, 3)), new java.util.HashMap<String, Object>() {{
            put( "a", "value of a" );
        }});
        this.testStringMethods();
        Object threwError = false;
        try
        {
            this.functionThatThrows();
        } catch(Exception e)
        {
            threwError = true;
        }
        System.out.println(this.boolToString(threwError)); // should print true
    }

    public Object handleOptionAndParamsTest()
    {
        return new java.util.ArrayList<Object>(java.util.Arrays.asList(1, "a"));
    }

    public void funcWithParams(Object... optionalArgs)
    {
        Object a = Helpers.getArg(optionalArgs, 0, null);
        Object parameters = Helpers.getArg(optionalArgs, 1, new java.util.HashMap<String, Object>() {{}});
        if (Helpers.isTrue(Helpers.isArray(a)))
        {
            System.out.println(Helpers.getArrayLength(a));
        }
        if (Helpers.isTrue(Helpers.inOp(parameters, "a")))
        {
            System.out.println(Helpers.GetValue(parameters, "a"));
        }
    }

    public void testStringMethods()
    {
        Object str = "hello world";
        // isEqual test
        if (Helpers.isTrue(Helpers.isEqual(str, "hello world")))
        {
            System.out.println("str is hello world"); // should print "str is hello world"
        }
        System.out.println(((String)str).toUpperCase());
        Object startsWithHello = ((String)str).startsWith(((String)"hello"));
        System.out.println(this.boolToString(startsWithHello)); // should print true
        Object endsWithWorld = ((String)str).endsWith(((String)"world"));
        System.out.println(this.boolToString(endsWithWorld)); // should print true
        Object stringParts = Helpers.split(str, " ");
        System.out.println(Helpers.getArrayLength(stringParts)); // should print 2
        System.out.println(Helpers.GetValue(stringParts, 0)); // should print "hello"
        System.out.println(Helpers.GetValue(stringParts, 1)); // should print "world"
        Object indexOfResult = Helpers.getIndexOf(str, "o");
        System.out.println(indexOfResult); // should print 4
        Object strReplaced = Helpers.replaceAll((String)str, (String)"l", (String)"x");
        System.out.println(strReplaced); // should print "hexxo worxd"
        // concatenation test
        Object a = "a";
        Object b = "b";
        Object c = Helpers.add(a, b);
        System.out.println(c); // should print "ab"
    }

    public void functionThatThrows()
    {
        throw new RuntimeException((String)"This is an error") ;
    }
}

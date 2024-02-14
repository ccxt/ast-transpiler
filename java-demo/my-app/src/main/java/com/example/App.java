package com.example;

import java.util.HashMap;
import java.util.Map;

/**
 * Hello world!
 *
 */
public class App
{
    public static void main( String[] args )
    {
        System.out.println( "Hello World!" );
        Object a = 1;
        a = "a";
        Object c = new HashMap<String, Object>();
        var keys = ((HashMap<String, Object>) c).keySet();
        var aa = c instanceof HashMap;
        var d = 1;
    }
}

<?php
function custom_echo($x){ echo (string)$x . "
";}
class Second {
    public $myClassProperty = 'classProp';
    public $myBoolProp = false;

    public function stringifyNumber($arg) {
        return ((string) $arg);
    }
}
class Test {
    public function boolToString($x) {
        if ($x) {
            return 'true';
        } else {
            return 'false';
        }
    }

    public function functionWithOptionals($a, $c = null, $d = 1) {
        custom_echo($a);
        if ($c !== null) {
            custom_echo($c);
        }
        if ($d !== null) {
            custom_echo($d);
        }
    }

    public function getValue($x) {
        return $x;
    }

    public function testJavaScope() {
        $newObject = array(
            'a' => $this->getValue(5),
            'b' => $this->getValue($this->getValue($this->getValue(2))),
        );
        custom_echo($newObject['a']); // should print 5
        custom_echo($newObject['b']); // should print 2
    }

    public function test() {
        $a = 1;
        $b = 2;
        $c = $a + $b;
        custom_echo($c); // should print 3
        $s1 = 'a';
        $s2 = 'b';
        $s3 = $s1 . $s2;
        $stringVar = null;
        $stringVar = 'hello';
        custom_echo($stringVar); // should print "hello"
        custom_echo($s3); // should print "ab"
        $x = false;
        if ($x) {
            custom_echo('x is true');
        } else {
            custom_echo('x is false'); // should print "x is false"
        }
        $instance = new Second();
        custom_echo($instance->stringifyNumber(4)); // should print 4
        custom_echo($instance->myClassProperty); // should print "classProp"
        if ($instance->myBoolProp == false) {
            custom_echo('myBoolProp is false'); // should print "myBoolProp is false"
        }
        $arr = [1, 2, 3, 4];
        custom_echo(count($arr)); // should print 4
        $first = $arr[0];
        custom_echo($first); // should print 1
        $dict = array(
            'a' => 'b',
        );
        custom_echo($dict['a']); // should print "b"
        $i = 0;
        for ($w = 0; $w < 10; $w++) {
            $i = $i + 1;
        }
        custom_echo(((string) $i)); // should print 10
        $list2 = [1, 2, 3, 4, 5];
        $list2 = array_reverse($list2);
        custom_echo($list2[0]); // should print 5
        //should delete key from dict
        $dict2 = array(
            'a' => 1,
            'b' => 2,
        );
        unset($dict2['a']);
        $dictKeys = is_array($dict2) ? array_keys($dict2) : array();
        custom_echo(count($dictKeys)); // should print 1
        custom_echo($dictKeys[0]); // should print "b"
        $firstConcat = ['a', 'b'];
        $secondConcat = ['c', 'd'];
        $both = array_merge($firstConcat, $secondConcat);
        custom_echo(count($both)); // should print 4
        custom_echo($both[2]); // should print "c"
        $baseString = 'aabba';
        $replacedAllString = str_replace('a', '', $baseString);
        custom_echo($replacedAllString); // should print "bb"
        $this->functionWithOptionals('hello');
        $this->functionWithOptionals('hello', 5);
        $this->functionWithOptionals('hello', 5, 1);
        $list3 = ['empty'];
        $list3[0] = 'first';
        custom_echo($list3[0]); // should print "first"
        $dict3 = array();
        $dict3['key'] = 'value';
        custom_echo($dict3['key']); // should print "value"
        $this->testJavaScope();
        [$first1, $second1] = $this->handleOptionAndParamsTest();
        custom_echo($first1); // should print 1
        custom_echo($second1); // should print "a"
        $first2 = null;
        $second2 = null;
        [$first2, $second2] = $this->handleOptionAndParamsTest();
        custom_echo($first2); // should print 1
        custom_echo($second2); // should print "a"
        $this->funcWithParams([1, 2, 3], array(
            'a' => 'value of a',
        ));
        $this->testStringMethods();
        $threwError = false;
        try {
            $this->functionThatThrows();
        } catch(Exception $e) {
            $threwError = true;
        }
        custom_echo($this->boolToString($threwError)); // should print true
    }

    public function handleOptionAndParamsTest() {
        return [1, 'a'];
    }

    public function funcWithParams($a = null, $params = array()) {
        if (gettype($a) === 'array' && array_is_list($a)) {
            custom_echo(count($a));
        }
        if (is_array($params) && array_key_exists('a', $params)) {
            custom_echo($params['a']);
        }
    }

    public function testStringMethods() {
        $str = 'hello world';
        // isEqual test
        if ($str === 'hello world') {
            custom_echo('str is hello world'); // should print "str is hello world"
        }
        custom_echo(strtoupper($str));
        $startsWithHello = str_starts_with($str, 'hello');
        custom_echo($this->boolToString($startsWithHello)); // should print true
        $endsWithWorld = str_ends_with($str, 'world');
        custom_echo($this->boolToString($endsWithWorld)); // should print true
        $stringParts = explode(' ', $str);
        custom_echo(count($stringParts)); // should print 2
        custom_echo($stringParts[0]); // should print "hello"
        custom_echo($stringParts[1]); // should print "world"
        $indexOfResult = mb_strpos($str, 'o');
        custom_echo($indexOfResult); // should print 4
        $strReplaced = str_replace('l', 'x', $str);
        custom_echo($strReplaced); // should print "hexxo worxd"
        // concatenation test
        $a = 'a';
        $b = 'b';
        $c = $a . $b;
        custom_echo($c); // should print "ab"
    }

    public function functionThatThrows() {
        throw new Exception('This is an error');
    }
}

?>
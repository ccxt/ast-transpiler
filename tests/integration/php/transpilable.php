<?php
function custom_echo($x){ echo (string)$x . "
";}
class Second {
    public $myClassProperty = 'classProp';

    public function stringifyNumber($arg) {
        return ((string) $arg);
    }
}
class Test {
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
    }
}

?>
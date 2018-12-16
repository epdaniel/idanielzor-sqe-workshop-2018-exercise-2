import assert from 'assert';
import {parseAndSub, parseCode} from '../src/js/code-analyzer';

describe('The javascript parser', () => {
    it('is parsing an empty function correctly', () => {
        assert.equal(
            JSON.stringify(parseCode('')),
            '{"type":"Program","body":[],"sourceType":"script"}'
        );
    });

    it('is parsing a simple variable declaration correctly', () => {
        assert.equal(
            JSON.stringify(parseCode('let a = 1;')),
            '{"type":"Program","body":[{"type":"VariableDeclaration","declarations":[{"type":"VariableDeclarator","id":{"type":"Identifier","name":"a"},"init":{"type":"Literal","value":1,"raw":"1"}}],"kind":"let"}],"sourceType":"script"}'
        );
    });
    it('checks that local var get removed' , () => {
        assert.equal(parseAndSub('function foo(x, y, z){\n' +
            '    let a = x + 1;\n' +
            '    let b = a + y;\n' +
            '    let c = 0;\n' +
            '    \n' +
            '    if (b < z) {\n' +
            '        c = c + 5;\n' +
            '        return x + y + z + c;\n' +
            '    } else if (b < z * 2) {\n' +
            '        c = c + x + 5;\n' +
            '        return x + y + z + c;\n' +
            '    } else {\n' +
            '        c = c + z + 5;\n' +
            '        return x + y + z + c;\n' +
            '    }\n' +
            '}\n','{"x":1,"y":2,"z":3}',[],[]),
        'function foo(x, y, z) {\n' +
        '    if (x + 1 + y < z) {\n' +
        '        return x + y + z + (0 + 5);\n' +
        '    } else if (x + 1 + y < z * 2) {\n' +
        '        return x + y + z + (0 + x + 5);\n' +
        '    } else {\n' +
        '        return x + y + z + (0 + z + 5);\n' +
        '    }\n' +
        '}');

    });
    it('checks while statement replaced properly' , () => {
        assert.equal(parseAndSub('function foo(x, y, z){\n' +
            '    while (x + 1 < z) {\n' +
            '        z = (x + 1 + x + 1 + y) * 2;\n' +
            '    }\n' +
            '    \n' +
            '    return z;\n' +
            '}\n','{"x":1,"y":2,"z":3}',[],[]),
            'function foo(x, y, z) {\n' +
            '    while (x + 1 < z) {\n' +
            '        z = (x + 1 + x + 1 + y) * 2;\n' +
            '    }\n' +
            '    return (x + 1 + x + 1 + y) * 2;\n' +
            '}');

    });

    it('checks handling array as a param' , () => {
        assert.equal(parseAndSub('function foo(x, y, z){\n' +
            '    if(x[0] > x[1]){\n' +
            '        return y;\n' +
            '    }else{\n' +
            '        return z;\n' +
            '    }\n' +
            '}','{"x":[5,3],"y":2,"z":3}',[],[]),
            'function foo(x, y, z) {\n' +
            '    if (x[0] > x[1]) {\n' +
            '        return y;\n' +
            '    } else {\n' +
            '        return z;\n' +
            '    }\n' +
            '}');
    });

    it('checks handling unary exp and seq' , () => {
        assert.equal(parseAndSub('function foo(x, y, z){\n' +
            '    let a = [2,4];\n' +
            '    let b = x + 1;\n' +
            '    let c = z + 4;\n' +
            '    if(a[0] > a[1]){\n' +
            '        c = -c, b = b + 2;\n' +
            '        return y;\n' +
            '    }else{\n' +
            '        return z;\n' +
            '    }\n' +
            '}','{"x":1,"y":5,"z":3}',[],[]),
            'function foo(x, y, z) {\n' +
            '    if (2 > 4) {\n' +
            '        c = -(z + 4), b = x + 1 + 2;\n' +
            '        return y;\n' +
            '    } else {\n' +
            '        return z;\n' +
            '    }\n' +
            '}');
    });

    it('checks handling unary exp and seq' , () => {
        assert.equal(parseAndSub('function foo(x, y, z){\n' +
            '    let a = [2,4];\n' +
            '    let b = x + 1;\n' +
            '    let c = z + 4;\n' +
            '    if(-c > b || y == 4){\n' +
            '        c = -c, b = b + 2;\n' +
            '        return y;\n' +
            '    }else{\n' +
            '        return z;\n' +
            '    }\n' +
            '}','{"x":1,"y":5,"z":3}',[],[]),
            'function foo(x, y, z) {\n' +
            '    if (-(z + 4) > x + 1 || y == 4) {\n' +
            '        c = -(z + 4), b = x + 1 + 2;\n' +
            '        return y;\n' +
            '    } else {\n' +
            '        return z;\n' +
            '    }\n' +
            '}');
    });

    it('checks handling global vars and var dec inside body' , () => {
        assert.equal(parseAndSub('let u = 2;\n' +
            'function foo(x, y, z){\n' +
            '    let a = [2,4];\n' +
            '    let b = x + 1;\n' +
            '    let c = z + 4;\n' +
            '    if(-c > b || y == 4){\n' +
            '        let k = 2;\n' +
            '        c = -c, b = k + u;\n' +
            '        return y;\n' +
            '    }else{\n' +
            '        return z;\n' +
            '    }\n' +
            '}','{"x":1,"y":5,"z":3}',[],[]),
            'let u = 2;\n' +
            'function foo(x, y, z) {\n' +
            '    if (-(z + 4) > x + 1 || y == 4) {\n' +
            '        c = -(z + 4), b = 2 + 2;\n' +
            '        return y;\n' +
            '    } else {\n' +
            '        return z;\n' +
            '    }\n' +
            '}');
    });

    it('checks handling bad input' , () => {
        assert.equal(parseAndSub('for(;i<5;){}','{"x":1,"y":5,"z":3}',[],[]),
            'for (; i < 5;) {\n' +
            '}');
    });


    it('checks handling var dec with no init and no else on IF' , () => {
        assert.equal(parseAndSub('let k;\n' +
            'function foo(x, y, z){\n' +
            '    let a;\n' +
            '    a = 2\n' +
            '    if(x[0] > x[1]){\n' +
            '        return a;\n' +
            '    }\n' +
            '}','{"x":[5,3],"y":2,"z":3}',[],[]),
            'let k;\n' +
            'function foo(x, y, z) {\n' +
            '    if (x[0] > x[1]) {\n' +
            '        return 2;\n' +
            '    }\n' +
            '}');
    });
});

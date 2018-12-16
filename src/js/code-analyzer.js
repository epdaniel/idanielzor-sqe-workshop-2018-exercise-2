import * as esprima from 'esprima';
import * as escodegen from 'escodegen';

let greenLines;
let redLines;
let inputVector;

const parseCode = (codeToParse) => {
    return esprima.parseScript(codeToParse);
};

const parseAndSub = (codeToParse, vectorToParse, greenArray, redArray) => {
    greenLines = greenArray;
    redLines = redArray;
    let parsed = esprima.parseScript(codeToParse,{loc:true});
    inputVector = JSON.parse(vectorToParse);
    makeParams(inputVector);
    let savedVars = new Map();
    symbolicSub(parsed, savedVars);
    let code = escodegen.generate(parsed);
    updateIfLines(code);
    return code;
};

const symbolicSub = (parsed, vars) => {
    let handler = typeHandlers.get(parsed.type);
    return handler ? handler.call(undefined, parsed, vars) : null;
};

const updateIfLines = (code) => {
    greenLines.splice(0,greenLines.length);
    redLines.splice(0,redLines.length);
    let map = new Map();
    let json = esprima.parseScript(code,{loc:true});
    symbolicSub(json, map);
};

const makeParams = (map) => {
    Object.keys(map).forEach(function(key) {
        let p = esprima.parseScript('' + map[key]);
        let str = JSON.stringify(p.body[0].expression);
        map[key] = JSON.parse(str);
    });
};

const copyMap = (oldMap) =>{
    let newMap = new Map();
    Object.keys(oldMap).forEach(function(key) {
        newMap[key] = JSON.parse(JSON.stringify(oldMap[key]));
    });
    return newMap;
};

//--------------------- Handlers ------------------------

const handleProgram = (json, vars) =>{
    json.body.forEach((exp) => {
        if(exp.type === 'VariableDeclaration'){
            exp.declarations.forEach((dec) => {
                if (dec.init != null) {
                    let val = JSON.parse(JSON.stringify(dec.init));
                    vars[dec.id.name] = handleExp(val, vars);
                }
            });
        }else symbolicSub(exp, vars);
    });
};

const handleBlock = (json, vars) => {
    let toRemove = [];
    json.body.forEach((exp) => {
        if (exp.type === 'VariableDeclaration') {
            toRemove.push(exp);
            exp.declarations.forEach((dec) => {
                if (dec.init != null) {
                    let val = JSON.parse(JSON.stringify(dec.init));
                    vars[dec.id.name] = handleExp(val, vars);
                }});
        }
        else if(exp.type === 'ExpressionStatement' && exp.expression.type === 'AssignmentExpression'){
            vars[exp.expression.left.name] = handleExp(exp.expression.right, vars);
            if(inputVector[exp.expression.left.name] === undefined) toRemove.push(exp);
        }
        else
            symbolicSub(exp, vars);
    });
    toRemove.forEach((exp) => { json.body.splice(json.body.indexOf(exp), 1); });
};

const handleFuncDec = (json, vars) => {
    let newVars = copyMap(vars);
    symbolicSub(json.body, newVars);
};

const handleExpStatement = (json, vars) => {
    symbolicSub(json.expression, vars);
};

const handleAssExp = (json, vars) => {
    vars[json.left.name] = handleExp(json.right, vars);
};

const handleWhile = (json, vars) => {
    json.test = handleExp(json.test, vars);
    symbolicSub(json.body, vars);
};

const handleIf = (json, vars) =>{
    json.test = handleExp(json.test, vars);
    let paramTest = handleExp(JSON.parse(JSON.stringify(json.test)), inputVector);
    if(eval(stringExp(paramTest)))
        greenLines.push(json.loc.start.line);
    else
        redLines.push(json.loc.start.line);
    let newVars = copyMap(vars);
    symbolicSub(json.consequent, newVars);
    newVars.clear();
    if(json.alternate != null){
        symbolicSub(json.alternate, vars);
    }
};

const handleReturn = (json, vars) => {
    json.argument = handleExp(json.argument, vars);
};


const handleSeq = (json, vars) => {
    json.expressions.forEach((exp)=> symbolicSub(exp, vars));
};

// const handleUpdate = (json, vars) => { //no array support
//     if(json.argument.type !== 'Identifier')
//         return json;
//     if(json.operator === '++'){
//         let j = JSON.parse('{"type": "BinaryExpression","operator": "+","left": {"type": "Identifier","name": "'+ json.argument.name +'"},"right": {"type": "Literal","value": 1,"raw": "1"}}\n');
//         let val = handleExp(j, vars);
//         vars[json.argument.name] = val;
//     }else if(json.operator === '--'){
//         let j = JSON.parse('{"type": "BinaryExpression","operator": "-","left": {"type": "Identifier","name": "'+ json.argument.name +'"},"right": {"type": "Literal","value": 1,"raw": "1"}}\n');
//         let val = handleExp(j, vars);
//         vars[json.argument.name] = val;
//     }
// };

// const handleVarDec = (json, vars) => {
//     json.declarations.forEach((dec) => {
//         if(dec.init != null){
//             vars[dec.id.name] = handleExp(dec.init, vars);
//         }
//     });
// };

const typeHandlers = new Map([
    ['Program',handleProgram],
    ['FunctionDeclaration',handleFuncDec],
    ['BlockStatement',handleBlock],
    ['ExpressionStatement',handleExpStatement],
    ['AssignmentExpression',handleAssExp],
    ['WhileStatement',handleWhile],
    ['IfStatement',handleIf],
    ['ReturnStatement',handleReturn],
    ['SequenceExpression',handleSeq]
    //['VariableDeclaration',handleVarDec],
    // ['UpdateExpression',handleUpdate],
]);

// Where the replacing occurs
//-----------------Expression Handlers-------------------
const handleIdentifier = (exp, vars) => {
    if(vars[exp.name] != null){
        return vars[exp.name];
    }else
        return exp;
};
const handleLiteral = (exp) => { return exp; }; //VARS IN ARGUMENT
const handleBinaryExpression = (exp, vars) => {
    exp.left = handleExp(exp.left, vars);
    exp.right = handleExp(exp.right, vars);
    return exp;
};
const handleUnaryExpression = (exp, vars) => {
    exp.argument = handleExp(exp.argument, vars);
    return exp;
};
const handleMemberExpression = (exp, vars) => {
    exp.objetct = handleExp(exp.object, vars);
    exp.property = handleExp(exp.property, vars);
    let arr = vars[exp.object.name];
    if (arr !== undefined) {
        if (arr.type === 'ArrayExpression')
            return arr.elements[exp.property.value];
        else if (arr.type === 'SequenceExpression')
            return arr.expressions[exp.property.value];
    }else
        return exp;
};
const handleLogicalExpression = (exp, vars) => {
    exp.left = handleExp(exp.left, vars);
    exp.right = handleExp(exp.right, vars);
    return exp;
};

const handleArray = (exp, vars) => {
    let arr = exp.elements;
    for(let i = 0; i < arr.length; i++){
        arr[i] = handleExp(arr[i], vars);
    }
    return exp;
};

const expHandlers = new Map([
    ['Identifier', handleIdentifier],
    ['Literal', handleLiteral],
    ['BinaryExpression', handleBinaryExpression],
    ['UnaryExpression', handleUnaryExpression],
    ['MemberExpression', handleMemberExpression],
    ['LogicalExpression',handleLogicalExpression],
    ['ArrayExpression', handleArray]
]);

const handleExp = (exp, vars) => {
    let handler = expHandlers.get(exp.type);
    return handler.call(undefined, exp, vars);
};

//-----------------Expression to String Functions-------------------

const stringLiteral = (exp) => { return exp.value; };
const stringBinaryExpression = (exp) => { return ((exp.left.type === 'BinaryExpression' ? ('(' + (stringExp(exp.left)) + ')') : (stringExp(exp.left))) + ' ' + exp.operator + ' ' + (exp.right.type === 'BinaryExpression' ? ('(' + (stringExp(exp.right)) + ')') : (stringExp(exp.right)))); };
const stringUnaryExpression = (exp) => { return (exp.operator + stringExp(exp.argument)); };
const stringLogicalExpression = (exp) => { return (stringExp(exp.left) + ' ' + exp.operator + ' ' + stringExp(exp.right)); };
//const stringIdentifier = (exp) => { return exp.name; };
//const stringMemberExpression = (exp) => { return (stringExp(exp.object) + '[' + stringExp(exp.property) + ']'); };
// const stringArray = (exp) => {
//     let arr = exp.elements;
//     let str = '[';
//     if(arr.length > 0)
//         str += stringExp(arr[0]);
//     for(let i = 1; i < arr.length; i++){
//         str +=  ',' + stringExp(arr[i]);
//     }
//     str += ']';
//     return str;
// };

const expToStringFuncs = new Map([
    ['Literal', stringLiteral],
    ['BinaryExpression', stringBinaryExpression],
    ['UnaryExpression', stringUnaryExpression],
    ['LogicalExpression',stringLogicalExpression],
    //['Identifier', stringIdentifier],
    //['MemberExpression', stringMemberExpression],
    //['ArrayExpression',stringArray]
]);

const stringExp = (exp, vars) => {
    let handler = expToStringFuncs.get(exp.type);
    return handler.call(undefined, exp, vars);
};

export {parseCode, parseAndSub};

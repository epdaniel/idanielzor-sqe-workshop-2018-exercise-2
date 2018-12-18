import * as esprima from 'esprima';
import * as escodegen from 'escodegen';

let greenLines;
let redLines;
let inputVector;
let isParam = 0;

const parseCode = (codeToParse) => {
    return esprima.parseScript(codeToParse);
};

const parseAndSub = (codeToParse, vectorToParse, greenArray, redArray) => {
    greenLines = greenArray;
    redLines = redArray;
    let parsed = esprima.parseScript(codeToParse,{loc:true});
    inputVector = JSON.parse(vectorToParse);
    makeParams(inputVector);
    let savedVars = copyMap(inputVector);
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
    let map = copyMap(inputVector);
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
            if(!handleAssExp(exp.expression, vars))
                toRemove.push(exp);
        }
        else symbolicSub(exp, vars);
    });
    toRemove.forEach((exp) => { json.body.splice(json.body.indexOf(exp), 1); });
};

//returns true if left side of ass is param, false if local
const handleAssExp = (json, vars) => {
    if(json.left.type === 'MemberExpression') {
        let arr = vars[json.left.object.name];
        let val = handleExp(json.right, vars);
        json.right = val;
        let index = handleExp(json.left.property, vars);
        switch(arr.type){
        case 'ArrayExpression':  arr.elements[index.value] = val; break;
        case 'SequenceExpression': arr.expressions[index.value] = val; break;
        }
        vars[json.left.object.name] = arr;
        if(inputVector[json.left.object.name] != null) inputVector[json.left.object.name] = arr;
    }else{
        let val = handleExp(json.right, vars);
        vars[json.left.name] = val;
        json.right = val;
    }
    return (inputVector[json.left.name] !== undefined); //is a param
};

const handleFuncDec = (json, vars) => {
    let newVars = copyMap(vars);
    symbolicSub(json.body, newVars);
};

const handleExpStatement = (json, vars) => {
    symbolicSub(json.expression, vars);
};

const handleWhile = (json, vars) => {
    json.test = handleExp(json.test, vars);
    symbolicSub(json.body, vars);
};

const handleIf = (json, vars) =>{
    json.test = handleExp(json.test, vars);
    isParam = 1;
    let paramTest = handleExp(JSON.parse(JSON.stringify(json.test)), vars); //inputVector
    isParam = 0;
    if(eval(stringExp(paramTest, vars)))
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
    if(isParam || inputVector[exp.name] == null){
        return vars[exp.name];
    }else return exp;
};
const handleLiteral = (exp) => { return exp; };
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
    if (arr !== undefined && (isParam || inputVector[exp.object.name] == null)) {
        return handleMemberExpressionHelper(arr, exp);
    }else
        return exp;
};

const handleMemberExpressionHelper = (arr, exp) => {
    switch(arr.type){
    case 'ArrayExpression':  return arr.elements[exp.property.value];
    case 'SequenceExpression': return arr.expressions[exp.property.value];
    }
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
const stringBinaryExpression = (exp, vars) => { return ((exp.left.type === 'BinaryExpression' ? ('(' + (stringExp(exp.left, vars)) + ')') : (stringExp(exp.left, vars))) + ' ' + exp.operator + ' ' + (exp.right.type === 'BinaryExpression' ? ('(' + (stringExp(exp.right, vars)) + ')') : (stringExp(exp.right, vars)))); };
const stringUnaryExpression = (exp, vars) => { return (exp.operator + stringExp(exp.argument, vars)); };
const stringLogicalExpression = (exp, vars) => { return (stringExp(exp.left, vars) + ' ' + exp.operator + ' ' + stringExp(exp.right, vars)); };
const stringIdentifier = (exp, vars) => {
    let v = vars[exp.name];
    return stringExp(v, vars);
};
const stringMemberExpression = (exp, vars) => {
    exp.objetct = handleExp(exp.object, vars);
    exp.property = handleExp(exp.property, vars);
    let arr = vars[exp.object.name];
    // if (arr.type === 'ArrayExpression')
    //     return stringExp(arr.elements[exp.property.value], vars);
    // else if (arr.type === 'SequenceExpression')
    return stringExp(arr.expressions[exp.property.value], vars);
};
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
    ['Identifier', stringIdentifier],
    ['MemberExpression', stringMemberExpression],
    //['ArrayExpression',stringArray]
]);

const stringExp = (exp, vars) => {
    let handler = expToStringFuncs.get(exp.type);
    return handler.call(undefined, exp, vars);
};

export {parseCode, parseAndSub};

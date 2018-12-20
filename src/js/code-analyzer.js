import * as esprima from 'esprima';
import * as escodegen from 'escodegen';

let greenLines;
let redLines;
let inputVector;
let savedVars;
let isParam;

const parseCode = (codeToParse) => {
    return esprima.parseScript(codeToParse);
};

const parseAndSub = (codeToParse, vectorToParse, greenArray, redArray) => {
    isParam = 0;
    greenLines = greenArray;
    redLines = redArray;
    let parsed = esprima.parseScript(codeToParse,{loc:true});
    inputVector = JSON.parse(vectorToParse);
    makeParams(inputVector);
    savedVars = copyMap(inputVector);
    symbolicSub(parsed);
    let code = escodegen.generate(parsed);
    updateIfLines(code);
    return code;
};

const symbolicSub = (parsed) => {
    let handler = typeHandlers.get(parsed.type);
    return handler ? handler.call(undefined, parsed) : null;
};

const updateIfLines = (code) => {
    greenLines.splice(0,greenLines.length);
    redLines.splice(0,redLines.length);
    let json = esprima.parseScript(code,{loc:true});
    symbolicSub(json);
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

const handleProgram = (json) =>{
    json.body.forEach((exp) => {
        if(exp.type === 'VariableDeclaration'){
            handleVarDec(exp);
        }else symbolicSub(exp);
    });

};

const handleVarDec = (json) => {
    json.declarations.forEach((dec) => {
        if(dec.init != null){
            savedVars[dec.id.name] = handleExp(dec.init);
        }
    });
};

const handleBlock = (json) => {
    let toRemove = [];
    json.body.forEach((exp) => {
        if (exp.type === 'VariableDeclaration') {
            toRemove.push(exp);
            handleVarDec(exp);
        }
        else if(exp.type === 'ExpressionStatement' && exp.expression.type === 'AssignmentExpression'){
            if(!handleAssExp(exp.expression))
                toRemove.push(exp);
        }
        else symbolicSub(exp);
    });
    toRemove.forEach((exp) => { json.body.splice(json.body.indexOf(exp), 1); });
};

//returns true if left side of ass is param, false if local
const handleAssExp = (json) => {
    if(json.left.type === 'MemberExpression') {
        return memberAssign(json);
    }else{
        let param  = (inputVector[json.left.name] !== undefined);
        let val = handleExp(json.right);
        json.right = val;
        if(param){
            isParam = 1;
            savedVars[json.left.name] = handleExp(val);
            isParam = 0;
        }else savedVars[json.left.name] = val;
        return param;
    }
};

const memberAssign = (json) =>{
    let arr = savedVars[json.left.object.name];
    let val = handleExp(json.right);
    let index = handleExp(json.left.property);
    switch(arr.type){
    case 'ArrayExpression':  arr.elements[index.value] = val; break;
    case 'SequenceExpression': arr.expressions[index.value] = val; break;
    }
    savedVars[json.left.object.name] = arr;
    return (inputVector[json.left.object.name] !== undefined);
};

const handleFuncDec = (json) => {
    symbolicSub(json.body);
};

const handleExpStatement = (json) => {
    symbolicSub(json.expression);
};

const handleWhile = (json) => {
    json.test = handleExp(json.test);
    symbolicSub(json.body);
};

const handleIf = (json) =>{
    json.test = handleExp(json.test);
    isParam = 1;
    let paramTest = handleExp(JSON.parse(JSON.stringify(json.test)));
    isParam = 0;
    if(eval(stringExp(paramTest)))
        greenLines.push(json.loc.start.line);
    else
        redLines.push(json.loc.start.line);
    let oldVars = copyMap(savedVars);
    symbolicSub(json.consequent);
    savedVars = oldVars;
    if(json.alternate != null){
        symbolicSub(json.alternate);
    }
};

const handleReturn = (json) => {
    json.argument = handleExp(json.argument);
};

const handleSeq = (json) => {
    json.expressions.forEach((exp)=> symbolicSub(exp));
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

const typeHandlers = new Map([
    ['Program',handleProgram],
    ['FunctionDeclaration',handleFuncDec],
    ['BlockStatement',handleBlock],
    ['ExpressionStatement',handleExpStatement],
    ['AssignmentExpression',handleAssExp],
    ['WhileStatement',handleWhile],
    ['IfStatement',handleIf],
    ['ReturnStatement',handleReturn],
    ['SequenceExpression',handleSeq],
    ['VariableDeclaration',handleVarDec],
    // ['UpdateExpression',handleUpdate],
]);

// Where the replacing occurs
//-----------------Expression Handlers-------------------
const handleIdentifier = (exp) => {
    if(isParam || inputVector[exp.name] === undefined){
        return savedVars[exp.name];
    }else return exp;
};
const handleLiteral = (exp) => { return exp; };
const handleBinaryExpression = (exp) => {
    let nExp = JSON.parse(JSON.stringify(exp));
    nExp.left = handleExp(nExp.left);
    nExp.right = handleExp(nExp.right);
    return nExp;
};
const handleUnaryExpression = (exp) => {
    exp.argument = handleExp(exp.argument);
    return exp;
};
const handleMemberExpression = (expr) => {
    let exp = JSON.parse(JSON.stringify(expr));
    exp.objetct = handleExp(exp.object);
    exp.property = handleExp(exp.property);
    let arr = savedVars[exp.object.name];
    if (arr !== undefined && (isParam || inputVector[exp.object.name] === undefined)) {
        return handleMemberExpressionHelper(arr, exp);
    }else
        return exp;
};

const handleMemberExpressionHelper = (arr, exp) => {
    let index = eval(stringExp(exp.property));
    switch(arr.type){
    case 'ArrayExpression':  return arr.elements[index];
    case 'SequenceExpression': return arr.expressions[index];
    }
};

const handleLogicalExpression = (exp) => {
    exp.left = handleExp(exp.left);
    exp.right = handleExp(exp.right);
    return exp;
};

const handleArray = (exp) => {
    let arr = exp.elements;
    for(let i = 0; i < arr.length; i++){
        arr[i] = handleExp(arr[i]);
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

const handleExp = (exp) => {
    let handler = expHandlers.get(exp.type);
    return handler.call(undefined, exp);
};

//-----------------Expression to String Functions-------------------

const stringLiteral = (exp) => { return exp.value; };
const stringBinaryExpression = (exp) => { return ((exp.left.type === 'BinaryExpression' ? ('(' + (stringExp(exp.left)) + ')') : (stringExp(exp.left))) + ' ' + exp.operator + ' ' + (exp.right.type === 'BinaryExpression' ? ('(' + (stringExp(exp.right)) + ')') : (stringExp(exp.right)))); };
const stringUnaryExpression = (exp) => { return (exp.operator + stringExp(exp.argument)); };
const stringLogicalExpression = (exp) => { return (stringExp(exp.left) + ' ' + exp.operator + ' ' + stringExp(exp.right)); };
// const stringIdentifier = (exp) => {
//     let v = savedVars[exp.name];
//     return stringExp(v);
// };
// const stringMemberExpression = (exp) => {
//     console.log('yeet')
//     exp.objetct = handleExp(exp.object);
//     exp.property = handleExp(exp.property);
//     let arr = savedVars[exp.object.name];
//     // if (arr.type === 'ArrayExpression')
//     //     return stringExp(arr.elements[exp.property.value], vars);
//     // else if (arr.type === 'SequenceExpression')
//     return stringExp(arr.expressions[exp.property.value]);
// };



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

const stringExp = (exp) => {
    let handler = expToStringFuncs.get(exp.type);
    return handler.call(undefined, exp);
};

export {parseCode, parseAndSub};

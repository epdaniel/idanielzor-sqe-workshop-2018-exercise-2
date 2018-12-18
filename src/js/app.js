import $ from 'jquery';
import {parseAndSub} from './code-analyzer';

$(document).ready(function () {
    $('#codeSubmissionButton').click(() => {
        let greenLines = [], redLines = [];
        let codeToParse = $('#codePlaceholder').val();
        let vectorToParse = $('#inputVector').val();
        let subbed = parseAndSub(codeToParse, vectorToParse, greenLines, redLines);
        let lines = subbed.split('\n');
        let toPrint = '';
        for(let i = 0; i < lines.length ; i++){
            let line = lines[i];
            if(greenLines.includes(i+1)){
                toPrint += '<mark style="background-color:green">'+ line + '</mark >' + '<br>';
            }else if(redLines.includes(i+1)){
                toPrint += '<mark style="background-color: red">'+ line + '</mark >' + '<br>';
            }else
                toPrint += line + '<br>';
        }
        document.getElementById('output').innerHTML = toPrint;
    });
});
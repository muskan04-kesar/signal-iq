const fs = require('fs');

const file = 'data/civilLinesSignals.ts';
let data = fs.readFileSync(file, 'utf-8');

const targetsToRemove = ['S56', 'S55', 'S57', 'S60', 'S54', 'S61', 'S59', 'S53', 'S51', 'S49', 'S64', 'S63', 'S62', 'S47', 'S39', 'S38'];

let lines = data.split('\n');
let newLines = lines.filter(line => {
    let match = line.match(/id:\s*'([A-Z0-9]+)'/);
    if(match) {
        if(targetsToRemove.includes(match[1])) {
            console.log("Removing:", match[1]);
            return false;
        }
    }
    return true;
});

fs.writeFileSync(file, newLines.join('\n'));
console.log("Successfully removed extraneous signals.");

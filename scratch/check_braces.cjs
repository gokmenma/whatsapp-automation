
const fs = require('fs');
const content = fs.readFileSync('c:\\Users\\HP\\Desktop\\svelte-app\\src\\lib\\whatsapp.ts', 'utf8');
const lines = content.split('\n');

let balance = 0;
let inString = null;
let inComment = false;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (inComment) {
            if (char === '*' && line[j+1] === '/') {
                inComment = false;
                j++;
            }
            continue;
        }
        if (inString) {
            if (char === inString && line[j-1] !== '\\') {
                inString = null;
            }
            continue;
        }
        if (char === '/' && line[j+1] === '/') break;
        if (char === '/' && line[j+1] === '*') {
            inComment = true;
            j++;
            continue;
        }
        if (char === '"' || char === "'" || char === '`') {
            inString = char;
            continue;
        }
        if (char === '{') balance++;
        if (char === '}') balance--;
        
        if (balance < 0) {
            console.log(`Unbalanced } at line ${i+1}`);
            process.exit(1);
        }
    }
}

console.log(`Final balance: ${balance}`);
if (balance !== 0) {
    console.log("File is unbalanced!");
}

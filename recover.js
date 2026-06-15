const fs = require('fs');
const logStr = fs.readFileSync('C:/Users/Admin/.gemini/antigravity/brain/af06c4db-8532-4910-b5be-bce8f55a1ad3/.system_generated/logs/overview.txt', 'utf8');
const logLines = logStr.split('\n');

let lastMsg = '';
for(let i = logLines.length - 1; i >= 0; i--){
    if(!logLines[i].trim()) continue;
    try {
        let j = JSON.parse(logLines[i]);
        if(j.source === 'USER_EXPLICIT' && j.content.includes('@@ -1,563 +1,2 @@')){
            lastMsg = j.content;
            break;
        }
    } catch(e){}
}

const lines = lastMsg.split('\n');
let codeLines = [];
let inDiff = false;

for(let l of lines){
    if(l.startsWith('@@ -1,563')){
        inDiff = true;
        continue;
    }
    if(inDiff){
        if(l.startsWith('[diff_block_end]')) break;
        if(l.startsWith('-')) {
            codeLines.push(l.substring(l.startsWith('- ') ? 2 : 1));
        } else if(l.startsWith(' ')) {
            codeLines.push(l.substring(1));
        }
    }
}

if(codeLines.length > 0) {
    fs.writeFileSync('frontend/js/script.js', codeLines.join('\n'));
    console.log('Recovered ' + codeLines.length + ' lines');
} else {
    console.log('Failed to recover');
}

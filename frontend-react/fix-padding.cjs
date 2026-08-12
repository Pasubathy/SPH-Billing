const fs = require('fs');
const path = require('path');

const dirsToSearch = ['src/pages', 'src/components'];

function processDir(dirPath) {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
        const fullPath = path.join(dirPath, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            processDir(fullPath);
        } else if (fullPath.endsWith('.jsx') || fullPath.endsWith('.js') || fullPath.endsWith('.css')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let updated = content;

            // Replacements for JSX inline styles
            updated = updated.replace(/padding: '24px'/g, "padding: '16px'");
            updated = updated.replace(/padding: '0 24px'/g, "padding: '0 16px'");
            updated = updated.replace(/padding: '12px 24px'/g, "padding: '12px 16px'");
            updated = updated.replace(/padding: '20px 24px'/g, "padding: '20px 16px'");
            updated = updated.replace(/padding: '0 24px 0 0'/g, "padding: '0 16px 0 0'");
            updated = updated.replace(/padding: '32px 24px'/g, "padding: '32px 16px'");
            
            // Replacements for double quotes (just in case)
            updated = updated.replace(/padding: "24px"/g, 'padding: "16px"');
            updated = updated.replace(/padding: "0 24px"/g, 'padding: "0 16px"');
            updated = updated.replace(/padding: "12px 24px"/g, 'padding: "12px 16px"');
            updated = updated.replace(/padding: "20px 24px"/g, 'padding: "20px 16px"');
            updated = updated.replace(/padding: "0 24px 0 0"/g, 'padding: "0 16px 0 0"');

            // Replacements for CSS files
            if (fullPath.endsWith('.css')) {
                updated = updated.replace(/padding: 24px;/g, "padding: 16px;");
                updated = updated.replace(/padding: 0 24px;/g, "padding: 0 16px;");
                updated = updated.replace(/padding: 16px 24px;/g, "padding: 16px 16px;");
                updated = updated.replace(/padding: 12px 24px;/g, "padding: 12px 16px;");
                updated = updated.replace(/padding: 8px 24px;/g, "padding: 8px 16px;");
                updated = updated.replace(/padding: 20px 24px 0 24px;/g, "padding: 20px 16px 0 16px;");
                updated = updated.replace(/padding: 16px 24px 0;/g, "padding: 16px 16px 0;");
            }

            if (content !== updated) {
                fs.writeFileSync(fullPath, updated, 'utf8');
                console.log(`Updated ${fullPath}`);
            }
        }
    }
}

for (const dir of dirsToSearch) {
    if (fs.existsSync(dir)) {
        processDir(dir);
    }
}
console.log('Padding fix completed.');

const fs = require('fs');
let c = fs.readFileSync('src/WRG2026-Dashboard.jsx', 'utf8');

// Fix using regex to handle any indentation
const fixed = c.replace(
  /const cat=CATEGORIES\.find\(c=>c\.id===activeCat\);\s*\n\s*const accent=cat\.color;/,
  'const cat=CATEGORIES.find(c=>c.id===activeCat)||CATEGORIES[0];\n    const accent=cat?.color||"#00e664";'
);

if(fixed !== c){
  fs.writeFileSync('src/WRG2026-Dashboard.jsx', fixed);
  console.log('FIXED. Lines:', fixed.split('\n').length);
} else {
  console.log('Already fixed or pattern changed');
}

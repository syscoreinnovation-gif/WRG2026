const fs = require('fs');
let c = fs.readFileSync('src/WRG2026-Dashboard.jsx', 'utf8');

if(c.includes('const [teamGroups,setTeamGroups]')){
  console.log('Already fixed!');
} else {
  // Use regex to handle any spacing around the = sign
  const fixed = c.replace(
    /(const \[teamForm,setTeamForm\]\s*=\s*useState\([^)]+\)\s*;)/,
    '$1\n    const [teamGroups,setTeamGroups] = useState({});'
  );
  if(fixed !== c){
    fs.writeFileSync('src/WRG2026-Dashboard.jsx', fixed);
    console.log('FIXED. Lines:', fixed.split('\n').length);
  } else {
    console.log('Pattern still not matched');
  }
}

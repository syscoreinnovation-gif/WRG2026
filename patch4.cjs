const fs = require('fs');
let c = fs.readFileSync('src/WRG2026-Dashboard.jsx', 'utf8');

// Check if teamGroups is defined
if(c.includes('teamGroups')){
  console.log('teamGroups references found:', (c.match(/teamGroups/g)||[]).length);
  // Check if the STATE DECLARATION exists
  if(c.includes('const [teamGroups,setTeamGroups]')){
    console.log('State declaration EXISTS - different issue');
  } else {
    console.log('State declaration MISSING - adding it...');
    // Add it after teamForm state
    const OLD = 'const [teamForm,setTeamForm] = useState({name:"",category:"open2",players:["",""]});';
    const NEW = 'const [teamForm,setTeamForm] = useState({name:"",category:"open2",players:["",""]});\n    const [teamGroups,setTeamGroups] = useState({});';
    if(c.includes(OLD)){
      c = c.replace(OLD, NEW);
      fs.writeFileSync('src/WRG2026-Dashboard.jsx', c);
      console.log('FIXED - teamGroups state added');
    } else {
      console.log('teamForm state line not found - searching...');
      const idx = c.indexOf('teamForm,setTeamForm');
      if(idx > 0){
        const lineStart = c.lastIndexOf('\n', idx);
        const lineEnd = c.indexOf('\n', idx);
        console.log('Found at:', c.substring(lineStart, lineEnd));
      }
    }
  }
} else {
  console.log('teamGroups not referenced at all');
}

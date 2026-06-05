const fs = require('fs');
let c = fs.readFileSync('src/WRG2026-Dashboard.jsx', 'utf8');

const TV = `function TeamsPublicView({participants,activeCat,accent,TEAM_CATEGORIES}){
  const teams=participants.filter(p=>p.isTeam&&p.categories.includes(activeCat));
  if(!teams.length)return null;
  return React.createElement('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:10}},
    teams.map(tm=>React.createElement('div',{key:tm.id,style:{background:'rgba(5,14,8,0.8)',border:'1px solid rgba(0,230,100,0.2)',borderRadius:10,padding:'12px 14px'}},
      React.createElement('div',{style:{fontWeight:700,fontSize:14,color:accent,marginBottom:6}},tm.name),
      React.createElement('div',null,(tm.players||[]).map((p,i)=>React.createElement('div',{key:i,style:{fontSize:11,color:'rgba(232,245,238,0.6)'}},
        (i+1)+'. '+(typeof p==='object'?p.name:p)))))));
}`;

const AV = `function AdminScoringView({data,scoringCat,scoringField,setScoringField,FIELD_CONFIG,holdMatch,releaseMatch,openScoreModal}){
  const fc=FIELD_CONFIG[scoringCat];
  const catM=(data[scoringCat]&&data[scoringCat].matches)||[];
  const queue=catM.filter(function(m){return m.field===scoringField&&(m.status==='pending'||m.status==='held');}).slice(0,8);
  const fields=Array.from({length:fc&&fc.count||1},function(_,i){return i+1;});
  return React.createElement('div',null,
    React.createElement('div',{style:{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}},
      fields.map(function(f){return React.createElement('button',{key:f,className:'hbtn',onClick:function(){setScoringField(f);},
        style:{padding:'7px 14px',borderRadius:7,fontSize:11,fontWeight:700,cursor:'pointer',
          background:scoringField===f?'rgba(0,230,100,0.15)':'transparent',
          border:'1px solid '+(scoringField===f?'rgba(0,230,100,0.4)':'rgba(0,230,100,0.1)'),
          color:scoringField===f?'#00e664':'rgba(0,230,100,0.4)'}},
        (fc&&fc.label||'Field')+' '+f);})),
    queue.length===0?React.createElement('div',{style:{textAlign:'center',padding:30,color:'rgba(0,230,100,0.3)'}},
      'No pending matches on this field'):
    React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:8}},
      queue.map(function(m){return React.createElement('div',{key:m.id,style:{background:'rgba(0,0,0,0.3)',border:'1px solid rgba(0,230,100,0.12)',borderRadius:8,padding:'10px 14px',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}},
        React.createElement('div',{style:{flex:1}},
          React.createElement('div',{style:{fontSize:11,color:'rgba(0,230,100,0.4)',marginBottom:4}},'Group '+m.group),
          React.createElement('div',{style:{fontWeight:700,fontSize:13,color:'#e8f5ee'}},m.p1name+' vs '+m.p2name)),
        React.createElement('div',{style:{display:'flex',gap:6}},
          m.status==='pending'&&React.createElement('button',{className:'hbtn',onClick:function(){holdMatch(m.id);},style:{padding:'5px 10px',background:'rgba(251,191,36,0.1)',border:'1px solid rgba(251,191,36,0.3)',borderRadius:6,color:'#fbbf24',fontSize:10,fontWeight:700,cursor:'pointer'}},'HOLD'),
          m.status==='held'&&React.createElement('button',{className:'hbtn',onClick:function(){releaseMatch(m.id);},style:{padding:'5px 10px',background:'rgba(16,185,129,0.1)',border:'1px solid rgba(16,185,129,0.3)',borderRadius:6,color:'#10b981',fontSize:10,fontWeight:700,cursor:'pointer'}},'RELEASE'),
          React.createElement('button',{className:'hbtn',onClick:function(){openScoreModal(m);},style:{padding:'5px 14px',background:'linear-gradient(135deg,#00e664,#009944)',border:'none',borderRadius:6,color:'#050e08',fontSize:11,fontWeight:700,cursor:'pointer'}},'SCORE')));})));
}`;

if(!c.includes('function TeamsPublicView')){
  c = c.replace('function CsvImport', TV + '\n\nfunction CsvImport');
  console.log('TeamsPublicView ADDED');
} else {
  console.log('TeamsPublicView already exists');
}

if(!c.includes('function AdminScoringView')){
  c = c.replace('function CsvImport', AV + '\n\nfunction CsvImport');
  console.log('AdminScoringView ADDED');
} else {
  console.log('AdminScoringView already exists');
}

fs.writeFileSync('src/WRG2026-Dashboard.jsx', c);
console.log('DONE. Lines:', c.split('\n').length);

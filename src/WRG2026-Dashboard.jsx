import { useState, useMemo } from "react";

const PINS = { judge: "S0502", admin: "S0502" };

const FIELD_CONFIG = {
  "diy-p":  { count:7, label:"FIELD",  color:"#00d4ff" },
  "diy-s":  { count:2, label:"FIELD",  color:"#00ff88" },
  "open2":  { count:2, label:"FIELD",  color:"#ff6b35" },
  "soc4":   { count:1, label:"FIELD",  color:"#ffd700" },
  "drone":  { count:1, label:"ARENA",  color:"#ff4d8d" },
  "sia":    { count:4, label:"RING",   color:"#a78bfa" },
  "sir":    { count:4, label:"RING",   color:"#fb923c" },
  "sja":    { count:4, label:"RING",   color:"#34d399" },
  "sjr":    { count:4, label:"RING",   color:"#60a5fa" },
  "ssa":    { count:4, label:"RING",   color:"#f472b6" },
  "ssr":    { count:4, label:"RING",   color:"#e879f9" },
};

const CATEGORIES = [
  { id:"diy-p",  name:"DIY Soccer Primary",   icon:"⚽", color:"#00d4ff" },
  { id:"diy-s",  name:"DIY Soccer Secondary",  icon:"⚽", color:"#00ff88" },
  { id:"open2",  name:"Open Soccer 2×2",        icon:"⚽", color:"#ff6b35" },
  { id:"soc4",   name:"Soccer 4×4",             icon:"⚽", color:"#ffd700" },
  { id:"drone",  name:"Drone Soccer",           icon:"🚁", color:"#ff4d8d" },
  { id:"sia",    name:"Sumo Basic Auto",         icon:"🤖", color:"#a78bfa" },
  { id:"sir",    name:"Sumo Basic RC",           icon:"🤖", color:"#fb923c" },
  { id:"sja",    name:"Sumo Junior Auto",       icon:"🤖", color:"#34d399" },
  { id:"sjr",    name:"Sumo Junior RC",         icon:"🤖", color:"#60a5fa" },
  { id:"ssa",    name:"Sumo Senior Auto",       icon:"🤖", color:"#f472b6" },
  { id:"ssr",    name:"Sumo Senior RC",         icon:"🤖", color:"#e879f9" },
];

// ── Sample participants (entered by admin before event) ──────────
const DEMO_PARTICIPANTS = [
  { id:"s001", name:"Ahmad Danial",    categories:["diy-p","sjr"]       },
  { id:"s002", name:"Nurul Ain",       categories:["diy-p","diy-s"]     },
  { id:"s003", name:"Muhammad Haziq", categories:["diy-p","sia"]       },
  { id:"s004", name:"Siti Nabilah",   categories:["diy-s","sja"]       },
  { id:"s005", name:"Arjun Kumar",    categories:["open2","drone"]      },
  { id:"s006", name:"Tan Wei Ming",   categories:["diy-p","open2"]      },
  { id:"s007", name:"Fatimah Zahra",  categories:["diy-p"]              },
  { id:"s008", name:"Kevin Raj",      categories:["soc4","ssa"]         },
  { id:"s009", name:"Ain Nadhirah",   categories:["diy-s"]              },
  { id:"s010", name:"Harith Aiman",   categories:["diy-p","sir"]        },
  { id:"s011", name:"Priya Menon",    categories:["open2","sjr"]        },
  { id:"s012", name:"Zulaikha Haris", categories:["diy-p","sja"]       },
  { id:"s013", name:"Bryan Lee",      categories:["drone","ssr"]        },
  { id:"s014", name:"Irdina Sofea",   categories:["diy-s","diy-p"]     },
  { id:"s015", name:"Daniel Hakim",   categories:["soc4","sia"]         },
  { id:"s016", name:"Yasmin Noor",    categories:["diy-p"]              },
  { id:"s017", name:"Rizwan Asri",    categories:["open2","ssa"]        },
  { id:"s018", name:"Cheryl Ong",     categories:["diy-s","sjr"]       },
  { id:"s019", name:"Luqman Hakim",   categories:["diy-p","sir"]        },
  { id:"s020", name:"Mei Xin",        categories:["diy-s","drone"]      },
];

// ── Group size calculator ────────────────────────────────────────
function calcGroupSizes(n) {
  if (n <= 0) return [];
  const numGroups = Math.ceil(n / 6);
  const base = Math.floor(n / numGroups);
  const extra = n % numGroups;
  return Array.from({length:numGroups},(_,i) => base + (i < extra ? 1 : 0));
}

// ── Generate round-robin matches for a group ─────────────────────
function genRR(members) {
  const pairs = [];
  for (let i=0;i<members.length;i++)
    for (let j=i+1;j<members.length;j++)
      pairs.push([members[i],members[j]]);
  return pairs;
}

// ── Generate full tournament from confirmed attendees ────────────
function generateTournament(participants, groupFieldMaps) {
  const catData = {};
  CATEGORIES.forEach(cat => {
    const present = participants.filter(p =>
      p.attendance === "present" && p.categories.includes(cat.id)
    );
    if (!present.length) { catData[cat.id] = {groups:{}, matches:[]}; return; }
    const sizes = calcGroupSizes(present.length);
    const groups = {}, matches = [];
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let idx = 0;
    sizes.forEach((size, gi) => {
      const label = letters[gi];
      const members = present.slice(idx, idx + size);
      idx += size;
      groups[label] = members.map(p => ({
        id: p.id, name: p.name, group: label,
        P:0,W:0,D:0,L:0,GF:0,GA:0,GD:0,Pts:0
      }));
      const fieldMap = groupFieldMaps[cat.id] || {};
      const fieldCount = FIELD_CONFIG[cat.id].count;
      const field = fieldMap[label] || ((gi % fieldCount) + 1);
      genRR(members).forEach((pair, mi) => {
        matches.push({
          id:`${cat.id}-${label}-${mi}`,
          catId:cat.id, group:label,
          p1:pair[0].id, p2:pair[1].id,
          p1name:pair[0].name, p2name:pair[1].name,
          score1:null, score2:null, status:"pending", field
        });
      });
    });
    catData[cat.id] = { groups, matches };
  });
  return catData;
}

function calcStandings(groups, matches) {
  const s = {};
  Object.entries(groups).forEach(([g, members]) => {
    members.forEach(m => { s[m.id] = {...m}; });
  });
  matches.filter(m=>m.status==="completed").forEach(m=>{
    if(!s[m.p1]||!s[m.p2]) return;
    const a=s[m.p1], b=s[m.p2];
    a.P++;b.P++;a.GF+=m.score1;a.GA+=m.score2;b.GF+=m.score2;b.GA+=m.score1;
    if(m.score1>m.score2){a.W++;a.Pts+=3;b.L++;}
    else if(m.score1<m.score2){b.W++;b.Pts+=3;a.L++;}
    else{a.D++;a.Pts++;b.D++;b.Pts++;}
  });
  Object.values(s).forEach(p=>{p.GD=p.GF-p.GA;});
  const byGroup={};
  Object.values(s).forEach(p=>{
    if(!byGroup[p.group])byGroup[p.group]=[];
    byGroup[p.group].push(p);
  });
  Object.keys(byGroup).forEach(k=>byGroup[k].sort((a,b)=>b.Pts-a.Pts||b.GD-a.GD||b.GF-a.GF));
  return byGroup;
}

// ════════════════════════════════════════════════════════════
export default function WRGDashboard() {
  const BG="#080c14", SURF="#0f1525", BDR="#1e2a45";

  // ── Core state ───────────────────────────────────────────
  const [view,setView]             = useState("admin");
  const [adminTab,setAdminTab]     = useState("participants");
  const [activeCat,setActiveCat]   = useState("diy-p");
  const [pubTab,setPubTab]         = useState("fields");
  const [auth,setAuth]             = useState({judge:false,admin:false});
  const [judgeCategory,setJudgeCategory] = useState(null); // catId string
  const [judgeField,setJudgeField]    = useState(null);  // {label:'FIELD'|'RING'|'ARENA', number:1}
  const [pinModal,setPinModal]     = useState({open:false,target:null,input:"",error:false,shake:false,step:'pin'});
  const [flash,setFlash]           = useState(null);

  // ── Phase 1: Participants ────────────────────────────────
  const [participants,setParticipants] = useState(
    DEMO_PARTICIPANTS.map(p=>({...p,attendance:null}))
  );
  const [addForm,setAddForm]       = useState({name:"",cats:[]});
  const [searchQ,setSearchQ]       = useState("");

  // ── Phase 2: Attendance ──────────────────────────────────
  const [attSearch,setAttSearch]   = useState("");
  const [attFilter,setAttFilter]   = useState("all");
  const [catFilter,setCatFilter]   = useState(null); // all|present|absent|unmarked

  // ── Phase 3: Tournament ──────────────────────────────────
  const [tournamentData,setTournamentData] = useState(null);
  const [groupFieldMaps,setGroupFieldMaps] = useState({});
  const [scoreModal,setScoreModal] = useState(null);
  const [scoreInput,setScoreInput] = useState({s1:"",s2:""});

  const isGenerated = !!tournamentData;
  const cat = CATEGORIES.find(c=>c.id===activeCat);
  const accent = cat.color;
  const fieldCfg = FIELD_CONFIG[activeCat];

  const catTournament = tournamentData?.[activeCat] || {groups:{},matches:[]};
  const catMatches = catTournament.matches || [];
  const pending  = catMatches.filter(m=>m.status==="pending");
  const held     = catMatches.filter(m=>m.status==="held");
  const completed= catMatches.filter(m=>m.status==="completed");
  const standings= useMemo(()=>
    isGenerated ? calcStandings(catTournament.groups||{}, catMatches) : {}
  ,[catTournament,catMatches]);

  const busyPlayers = useMemo(()=>{
    if(!tournamentData) return new Set();
    const s=new Set();
    Object.values(tournamentData).forEach(cd=>{
      (cd.matches||[]).filter(m=>m.status==="held").forEach(m=>{s.add(m.p1);s.add(m.p2);});
    });
    return s;
  },[tournamentData]);

  const fieldData = useMemo(()=>{
    const fields={};
    for(let f=1;f<=fieldCfg.count;f++){
      const fp=pending.filter(m=>m.field===f);
      const fh=held.filter(m=>m.field===f);
      fields[f]={live:fp[0]||null,next:fp[1]||null,heldList:fh};
    }
    return fields;
  },[pending,held,fieldCfg.count]);

  const comingUp = useMemo(()=>{
    const liveIds=new Set(Object.values(fieldData).filter(f=>f.live).map(f=>f.live.id));
    const nextIds=new Set(Object.values(fieldData).filter(f=>f.next).map(f=>f.next.id));
    return pending.filter(m=>!liveIds.has(m.id)&&!nextIds.has(m.id)).slice(0,6);
  },[pending,fieldData]);

  // ── Helpers ──────────────────────────────────────────────
  function showFlash(msg,dur=3000){setFlash(msg);setTimeout(()=>setFlash(null),dur);}
  function requestView(t){
    if(t==="public"){setView("public");return;}
    if(auth[t]){setView(t);return;}
    setPinModal({open:true,target:t,input:"",error:false,shake:false});
  }
  function submitPin(){
    const{target,input}=pinModal;
    if(input===PINS[target]){
      setAuth(a=>({...a,[target]:true}));
      if(target==="judge"){
        // Go to field selection step
        setPinModal(p=>({...p,error:false,step:"field",input:""}));
      } else {
        setView(target);
        setPinModal(p=>({...p,open:false,step:"pin"}));
      }
    } else {
      setPinModal(p=>({...p,error:true,shake:true,input:""}));
      setTimeout(()=>setPinModal(p=>({...p,shake:false})),600);
    }
  }
  function selectJudgeField(label,number){
    setJudgeField({label,number});
  }
  function selectJudgeCategory(catId){
    setJudgeCategory(catId);
    setJudgeField(null);
  }
  function changeJudgeCategory(){
    setJudgeCategory(null);
    setJudgeField(null);
  }
  function lockView(){setAuth(a=>({...a,[view]:false}));setJudgeField(null);setJudgeCategory(null);setView("public");}

  // ── Phase 1: Participant management ─────────────────────
  function addParticipant(){
    if(!addForm.name.trim()||!addForm.cats.length) return;
    const id=`p${Date.now()}`;
    setParticipants(prev=>[...prev,{id,name:addForm.name.trim(),categories:addForm.cats,attendance:null}]);
    setAddForm({name:"",cats:[]});
    showFlash(`✓ ${addForm.name.trim()} added`);
  }
  function removeParticipant(id){
    setParticipants(prev=>prev.filter(p=>p.id!==id));
    showFlash("Participant removed");
  }
  function toggleAddCat(catId){
    setAddForm(f=>({...f,cats:f.cats.includes(catId)?f.cats.filter(c=>c!==catId):[...f.cats,catId]}));
  }

  // ── Phase 2: Attendance ──────────────────────────────────
  function markAttendance(id,status){
    setParticipants(prev=>prev.map(p=>p.id===id?{...p,attendance:status}:p));
  }
  function markAllPresent(){
    setParticipants(prev=>prev.map(p=>({...p,attendance:"present"})));
    showFlash("✓ All participants marked PRESENT");
  }
  function markAllAbsent(){
    setParticipants(prev=>prev.map(p=>({...p,attendance:"absent"})));
    showFlash("All participants marked ABSENT");
  }

  // ── Phase 3: Generate ────────────────────────────────────
  function generateTournamentHandler(){
    const presentCount = participants.filter(p=>p.attendance==="present").length;
    if(presentCount===0){showFlash("⚠ No participants marked present");return;}
    const data = generateTournament(participants,groupFieldMaps);
    setTournamentData(data);
    setAdminTab("overview");
    showFlash("🏆 Tournament generated! All fields are now live.");
  }
  function resetTournament(){
    setTournamentData(null);
    setParticipants(prev=>prev.map(p=>({...p,attendance:null})));
    setGroupFieldMaps({});
    setJudgeCategory(null);
    setJudgeField(null);
    setAdminTab("participants");
    showFlash("Tournament reset. Ready for new event.");
  }
  function assignGroup(catId,group,fieldNum){
    setGroupFieldMaps(prev=>({...prev,[catId]:{...(prev[catId]||{}),[group]:fieldNum}}));
  }
  function getGroupFieldMap(catId,groups,fieldCount){
    // Auto-assign groups evenly if not yet set
    const existing=groupFieldMaps[catId]||{};
    const result={};
    groups.forEach((g,i)=>{result[g]=existing[g]||(i%fieldCount)+1;});
    return result;
  }

  // ── Match actions ────────────────────────────────────────
  function holdMatch(matchId){
    updateMatch(matchId,{status:"held"});
    showFlash("⏸ Match on hold — next match is now LIVE");
  }
  function releaseMatch(matchId){
    updateMatch(matchId,{status:"pending"});
    showFlash("▶ Match released — back in queue");
  }
  function updateMatch(matchId,updates){
    setTournamentData(prev=>{
      const next={...prev};
      Object.keys(next).forEach(cid=>{
        next[cid]={...next[cid],matches:next[cid].matches.map(m=>m.id===matchId?{...m,...updates}:m)};
      });
      return next;
    });
  }
  function openScoreModal(m){setScoreModal({matchId:m.id,p1name:m.p1name,p2name:m.p2name});setScoreInput({s1:"",s2:""});}
  function submitScore(){
    const s1=parseInt(scoreInput.s1),s2=parseInt(scoreInput.s2);
    if(isNaN(s1)||isNaN(s2)||s1<0||s2<0) return;
    updateMatch(scoreModal.matchId,{score1:s1,score2:s2,status:"completed"});
    setScoreModal(null);
    showFlash("✓ Score recorded — standings updated!");
  }

  // ── Filtered participant lists ───────────────────────────
  const filteredParticipants = useMemo(()=>{
    return participants.filter(p=>
      p.name.toLowerCase().includes(searchQ.toLowerCase())
    );
  },[participants,searchQ]);

  const attFiltered = useMemo(()=>{
    return participants
      .filter(p=>p.name.toLowerCase().includes(attSearch.toLowerCase()) && (!catFilter || p.categories.includes(catFilter)))
      .filter(p=>{
        if(attFilter==="present") return p.attendance==="present";
        if(attFilter==="absent")  return p.attendance==="absent";
        if(attFilter==="unmarked")return !p.attendance;
        return true;
      });
  },[participants,attSearch,attFilter]);

  const presentCount  = participants.filter(p=>p.attendance==="present").length;
  const absentCount   = participants.filter(p=>p.attendance==="absent").length;
  const unmarkedCount = participants.filter(p=>!p.attendance).length;

  return (
    <div style={{fontFamily:"'Rajdhani',sans-serif",background:BG,minHeight:"100vh",color:"#e2e8f0"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Rajdhani:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        .hbtn{cursor:pointer;border:none;transition:all .2s;font-family:'Rajdhani',sans-serif}
        .hbtn:hover{opacity:.85;transform:translateY(-1px)}
        .mrow:hover{background:rgba(255,255,255,.04)!important}
        .fadein{animation:fi .3s ease}
        @keyframes fi{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .blink{animation:bk 1.5s infinite}
        @keyframes bk{0%,100%{opacity:1}50%{opacity:.3}}
        .shake{animation:sk .5s ease}
        @keyframes sk{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}
        input:focus{outline:none}
        input::-webkit-inner-spin-button{-webkit-appearance:none}
        ::-webkit-scrollbar{height:4px;width:4px}
        ::-webkit-scrollbar-track{background:#0f1525}
        ::-webkit-scrollbar-thumb{background:#1e2a45;border-radius:2px}
      `}</style>

      {/* ── HEADER ── */}
      <header style={{background:SURF,borderBottom:`1px solid ${BDR}`,padding:"0 20px",position:"sticky",top:0,zIndex:100}}>
        <div style={{maxWidth:1200,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",height:58}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:24,color:"#00d4ff",letterSpacing:3}}>WRG 2026</div>
            <div style={{width:1,height:28,background:BDR}}/>
            <div style={{fontSize:11,color:"#475569",fontWeight:700,letterSpacing:2}}>MALAYSIA 2026</div>
            {isGenerated&&<div style={{fontSize:10,background:"rgba(16,185,129,.15)",color:"#10b981",border:"1px solid rgba(16,185,129,.3)",padding:"3px 10px",borderRadius:20,fontWeight:700,letterSpacing:1}}>● LIVE</div>}
            {!isGenerated&&<div style={{fontSize:10,background:"rgba(245,158,11,.15)",color:"#f59e0b",border:"1px solid rgba(245,158,11,.3)",padding:"3px 10px",borderRadius:20,fontWeight:700,letterSpacing:1}}>⚙ SETUP</div>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{display:"flex",gap:4,background:BG,padding:4,borderRadius:8,border:`1px solid ${BDR}`}}>
              {[["public","👁 PUBLIC"],["judge",`${auth.judge?"📋":"🔒"} JUDGE`],["admin",`${auth.admin?"⚙":"🔒"} ADMIN`]].map(([v,label])=>(
                <button key={v} className="hbtn"
                  style={{padding:"7px 14px",borderRadius:6,fontWeight:700,fontSize:12,color:view===v?"#0f1525":"#64748b",background:view===v?"#00d4ff":"transparent"}}
                  onClick={()=>requestView(v)}>{label}</button>
              ))}
            </div>
            {(view==="judge"||view==="admin")&&(
              <button className="hbtn" style={{padding:"7px 12px",borderRadius:6,fontWeight:700,fontSize:11,color:"#ef4444",background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.25)"}} onClick={lockView}>🔒 LOCK</button>
            )}
          </div>
        </div>
      </header>

      {/* ── FLASH ── */}
      {flash&&<div className="fadein" style={{position:"fixed",top:70,right:20,background:SURF,border:"1px solid #00d4ff",color:"#00d4ff",padding:"10px 20px",borderRadius:8,fontWeight:700,zIndex:999,fontSize:13}}>{flash}</div>}

      {/* ── CATEGORY BAR (only when tournament generated) ── */}
      {isGenerated&&(
        <div style={{background:SURF,borderBottom:`1px solid ${BDR}`,overflowX:"auto"}}>
          <div style={{maxWidth:1200,margin:"0 auto",display:"flex"}}>
            {CATEGORIES.map(c=>(
              <button key={c.id} className="hbtn"
                style={{padding:"10px 14px",background:"transparent",border:"none",borderBottom:activeCat===c.id?`3px solid ${c.color}`:"3px solid transparent",color:activeCat===c.id?c.color:"#475569",fontWeight:700,fontSize:11,whiteSpace:"nowrap",cursor:"pointer"}}
                onClick={()=>setActiveCat(c.id)}>{c.icon} {c.name}
                {tournamentData?.[c.id]?.matches?.filter(m=>m.status==="held").length>0&&
                  <span style={{marginLeft:5,fontSize:9,background:"rgba(245,158,11,.3)",color:"#f59e0b",padding:"1px 5px",borderRadius:8}}>HOLD</span>
                }
              </button>
            ))}
          </div>
        </div>
      )}

      <main style={{maxWidth:1200,margin:"0 auto",padding:"20px"}}>

        {/* ════════════════════════════════════════
            ADMIN VIEW — SIMPLIFIED
        ════════════════════════════════════════ */}
        {view==="admin"&&(
          <div className="fadein">
            {/* Admin Tab Bar */}
            <div style={{display:"flex",gap:4,marginBottom:20,background:SURF,padding:4,borderRadius:10,border:`1px solid ${BDR}`,width:"fit-content"}}>
              {[
                ["participants","👥 PARTICIPANTS"],
                ["generate",isGenerated?"🏆 TOURNAMENT":"⚡ GENERATE"],
              ].map(([t,label])=>(
                <button key={t} className="hbtn"
                  style={{padding:"9px 18px",borderRadius:7,fontWeight:700,fontSize:12,letterSpacing:0.5,color:adminTab===t?"#0f1525":"#64748b",background:adminTab===t?"#00d4ff":"transparent",cursor:"pointer"}}
                  onClick={()=>setAdminTab(t)}>
                  {label}
                  {t==="participants"&&unmarkedCount>0&&!isGenerated&&<span style={{marginLeft:6,fontSize:9,background:"rgba(245,158,11,.3)",color:"#f59e0b",padding:"1px 6px",borderRadius:10}}>{unmarkedCount}</span>}
                </button>
              ))}
            </div>

            {/* ── PARTICIPANTS + ATTENDANCE combined ── */}
            {adminTab==="participants"&&(
              <div>
                {/* Stats bar */}
                <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
                  {[["TOTAL",participants.length,"#64748b"],["✓ PRESENT",presentCount,"#10b981"],["✗ ABSENT",absentCount,"#ef4444"],["— UNMARKED",unmarkedCount,"#f59e0b"]].map(([l,v,c])=>(
                    (v>0||l==="TOTAL")?<div key={l} style={{fontSize:11,color:c,fontWeight:700,background:`${c}18`,border:`1px solid ${c}30`,padding:"5px 10px",borderRadius:6}}>{l}: {v}</div>:null
                  ))}
                  <button className="hbtn" style={{marginLeft:"auto",padding:"7px 14px",background:"rgba(16,185,129,.12)",border:"1px solid rgba(16,185,129,.35)",borderRadius:7,color:"#10b981",fontWeight:700,fontSize:11,cursor:"pointer"}} onClick={markAllPresent}>✓ ALL PRESENT</button>
                  <button className="hbtn" style={{padding:"7px 14px",background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.3)",borderRadius:7,color:"#ef4444",fontWeight:700,fontSize:11,cursor:"pointer"}} onClick={markAllAbsent}>✗ ALL ABSENT</button>
                </div>

                {/* CSV IMPORT */}
                <CsvImport
                  CATEGORIES={CATEGORIES}
                  onImport={(newParticipants)=>{
                    setParticipants(prev=>[...prev,...newParticipants]);
                    showFlash(`✓ ${newParticipants.length} participants imported`);
                  }}
                  onReplace={(newParticipants)=>{
                    setParticipants(newParticipants);
                    showFlash(`✓ ${newParticipants.length} participants loaded — list replaced`);
                  }}
                  BG={BG} SURF={SURF} BDR={BDR}
                />

                {/* ADD FORM */}
                <div style={{background:SURF,border:`1px solid ${BDR}`,borderRadius:12,padding:14,marginBottom:14}}>
                  <div style={{fontSize:10,color:"#475569",fontWeight:700,letterSpacing:2,marginBottom:10}}>+ ADD NEW PARTICIPANT</div>
                  <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
                    <input value={addForm.name} onChange={e=>setAddForm(f=>({...f,name:e.target.value}))}
                      onKeyDown={e=>e.key==="Enter"&&addParticipant()} placeholder="Full name..."
                      style={{flex:"1 1 160px",background:BG,border:`1px solid ${addForm.name?"#00d4ff":BDR}`,borderRadius:8,padding:"8px 12px",color:"#e2e8f0",fontFamily:"'Rajdhani',sans-serif",fontSize:14,fontWeight:600}}/>
                    <button className="hbtn" style={{padding:"8px 16px",background:addForm.name&&addForm.cats.length?"#00d4ff":"#1e2a45",borderRadius:8,color:addForm.name&&addForm.cats.length?"#0f1525":"#475569",fontWeight:700,fontSize:12,cursor:"pointer"}} onClick={addParticipant}>+ ADD</button>
                  </div>
                  <div style={{fontSize:9,color:"#475569",fontWeight:700,letterSpacing:1,marginBottom:6}}>ASSIGN CATEGORIES</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {CATEGORIES.map(c=>(
                      <button key={c.id} className="hbtn"
                        style={{padding:"3px 8px",borderRadius:4,fontSize:9,fontWeight:700,cursor:"pointer",background:addForm.cats.includes(c.id)?`${c.color}25`:"transparent",border:`1px solid ${addForm.cats.includes(c.id)?c.color:BDR}`,color:addForm.cats.includes(c.id)?c.color:"#475569"}}
                        onClick={()=>toggleAddCat(c.id)}>{c.icon} {c.name}</button>
                    ))}
                  </div>
                </div>

                {/* SEARCH + FILTERS */}
                <div style={{background:SURF,border:`1px solid ${BDR}`,borderRadius:10,padding:"12px 14px",marginBottom:12}}>
                  <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
                    <input value={searchQ} onChange={e=>setSearchQ(e.target.value)}
                      placeholder="🔍 Search by name..."
                      style={{flex:"1 1 150px",background:BG,border:`1px solid ${searchQ?"#00d4ff":BDR}`,borderRadius:7,padding:"8px 12px",color:"#e2e8f0",fontFamily:"'Rajdhani',sans-serif",fontSize:13}}/>
                    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                      {[["all","ALL"],["present","✓ PRESENT"],["absent","✗ ABSENT"],["unmarked","UNMARKED"]].map(([v,l])=>(
                        <button key={v} className="hbtn"
                          style={{padding:"6px 10px",borderRadius:6,fontSize:10,fontWeight:700,cursor:"pointer",
                            background:attFilter===v?(v==="present"?"#10b981":v==="absent"?"#ef4444":v==="unmarked"?"#f59e0b":"#00d4ff"):"transparent",
                            border:`1px solid ${attFilter===v?(v==="present"?"#10b981":v==="absent"?"#ef4444":v==="unmarked"?"#f59e0b":"#00d4ff"):BDR}`,
                            color:attFilter===v?"#0f1525":"#64748b"}}
                          onClick={()=>setAttFilter(v)}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{fontSize:9,color:"#475569",fontWeight:700,letterSpacing:1,marginBottom:6}}>FILTER BY CATEGORY</div>
                  <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                    <button className="hbtn"
                      style={{padding:"3px 9px",borderRadius:4,fontSize:9,fontWeight:700,cursor:"pointer",background:!catFilter?"#00d4ff":"transparent",border:`1px solid ${!catFilter?"#00d4ff":BDR}`,color:!catFilter?"#0f1525":"#475569"}}
                      onClick={()=>setCatFilter(null)}>ALL</button>
                    {CATEGORIES.map(c=>(
                      <button key={c.id} className="hbtn"
                        style={{padding:"3px 8px",borderRadius:4,fontSize:9,fontWeight:700,cursor:"pointer",background:catFilter===c.id?`${c.color}30`:"transparent",border:`1px solid ${catFilter===c.id?c.color:BDR}`,color:catFilter===c.id?c.color:"#475569"}}
                        onClick={()=>setCatFilter(catFilter===c.id?null:c.id)}>{c.icon} {c.name}</button>
                    ))}
                  </div>
                  <div style={{fontSize:10,color:"#475569",marginTop:8}}>{attFiltered.length} participant{attFiltered.length!==1?"s":""} shown</div>
                </div>

                {/* PARTICIPANT LIST */}
                <div style={{background:SURF,border:`1px solid ${BDR}`,borderRadius:12,overflow:"hidden"}}>
                  {attFiltered.length===0?(
                    <div style={{padding:"28px",textAlign:"center",color:"#475569",fontSize:13}}>No participants match your filters</div>
                  ):attFiltered.map(p=>(
                    <div key={p.id} className="mrow" style={{display:"flex",alignItems:"center",padding:"11px 18px",borderBottom:`1px solid ${BDR}18`,gap:12,
                      background:p.attendance==="present"?"rgba(16,185,129,.04)":p.attendance==="absent"?"rgba(239,68,68,.04)":"transparent"}}>
                      {/* Status dot */}
                      <div style={{width:10,height:10,borderRadius:"50%",background:p.attendance==="present"?"#10b981":p.attendance==="absent"?"#ef4444":"#475569",flexShrink:0}}/>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700,fontSize:14,color:p.attendance==="absent"?"#475569":"#e2e8f0"}}>{p.name}</div>
                        <div style={{display:"flex",gap:4,marginTop:3,flexWrap:"wrap"}}>
                          {p.categories.map(cid=>{
                            const c=CATEGORIES.find(x=>x.id===cid);
                            return c?(<span key={cid} style={{fontSize:9,color:c.color,opacity:p.attendance==="absent"?0.4:1}}>{c.icon} {c.name}</span>):null;
                          })}
                        </div>
                      </div>
                      {/* Attendance + Remove */}
                      <div style={{display:"flex",gap:6,flexShrink:0}}>
                        <button className="hbtn"
                          style={{padding:"6px 12px",borderRadius:6,fontSize:11,fontWeight:700,cursor:"pointer",
                            background:p.attendance==="present"?"#10b981":"transparent",
                            border:`1px solid ${p.attendance==="present"?"#10b981":"rgba(16,185,129,.3)"}`,
                            color:p.attendance==="present"?"#0f1525":"#10b981"}}
                          onClick={()=>markAttendance(p.id,"present")}>✓</button>
                        <button className="hbtn"
                          style={{padding:"6px 12px",borderRadius:6,fontSize:11,fontWeight:700,cursor:"pointer",
                            background:p.attendance==="absent"?"#ef4444":"transparent",
                            border:`1px solid ${p.attendance==="absent"?"#ef4444":"rgba(239,68,68,.3)"}`,
                            color:p.attendance==="absent"?"#fff":"#ef4444"}}
                          onClick={()=>markAttendance(p.id,"absent")}>✗</button>
                        <button className="hbtn"
                          style={{padding:"6px 10px",borderRadius:6,fontSize:11,cursor:"pointer",background:"transparent",border:`1px solid ${BDR}`,color:"#475569"}}
                          onClick={()=>removeParticipant(p.id)}>🗑</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── GENERATE / OVERVIEW ── */}
            {adminTab==="generate"&&(
              <div>
                {!isGenerated?(
                  <div>
                    <div style={{fontFamily:"'Bebas Neue'",fontSize:20,color:"#00d4ff",letterSpacing:2,marginBottom:6}}>GENERATE TOURNAMENT</div>
                    <div style={{fontSize:12,color:"#475569",marginBottom:20}}>Review the summary below then generate. Groups are created automatically from confirmed attendees.</div>

                    {/* Summary warning */}
                    {unmarkedCount>0&&(
                      <div style={{background:"rgba(245,158,11,.1)",border:"1px solid rgba(245,158,11,.35)",borderRadius:10,padding:"12px 18px",marginBottom:16,display:"flex",gap:10,alignItems:"center"}}>
                        <span style={{fontSize:18}}>⚠️</span>
                        <div style={{fontSize:12,color:"#f59e0b"}}><strong>{unmarkedCount} participants</strong> not yet marked. Go to Attendance tab and confirm before generating.</div>
                      </div>
                    )}

                    {/* Category breakdown */}
                    <div style={{background:SURF,border:`1px solid ${BDR}`,borderRadius:12,overflow:"hidden",marginBottom:20}}>
                      <div style={{padding:"10px 18px",borderBottom:`1px solid ${BDR}`,display:"grid",gridTemplateColumns:"1fr 80px 80px 80px",gap:10}}>
                        {["CATEGORY","REGISTERED","PRESENT","GROUPS"].map(h=>(
                          <div key={h} style={{fontSize:10,color:"#475569",fontWeight:700,letterSpacing:1}}>{h}</div>
                        ))}
                      </div>
                      {CATEGORIES.map(c=>{
                        const reg=participants.filter(p=>p.categories.includes(c.id)).length;
                        const pres=participants.filter(p=>p.categories.includes(c.id)&&p.attendance==="present").length;
                        const groups=calcGroupSizes(pres).length;
                        return(
                          <div key={c.id} className="mrow" style={{padding:"10px 18px",borderBottom:`1px solid ${BDR}18`,display:"grid",gridTemplateColumns:"1fr 80px 80px 80px",gap:10,alignItems:"center"}}>
                            <div style={{fontWeight:600,fontSize:13}}>{c.icon} {c.name}</div>
                            <div style={{fontSize:13,color:"#64748b"}}>{reg}</div>
                            <div style={{fontSize:13,color:pres>0?"#10b981":"#475569",fontWeight:pres>0?700:400}}>{pres}</div>
                            <div style={{fontSize:13,color:c.color,fontWeight:700}}>{pres>0?groups:"—"}</div>
                          </div>
                        );
                      })}
                    </div>

                    {/* ── FIELD LOAD BALANCER ── */}
                    <div style={{background:SURF,border:`1px solid ${BDR}`,borderRadius:12,overflow:"hidden",marginBottom:20}}>
                      <div style={{padding:"12px 18px",borderBottom:`1px solid ${BDR}`,background:"rgba(0,212,255,.05)"}}>
                        <div style={{fontFamily:"'Bebas Neue'",fontSize:16,color:"#00d4ff",letterSpacing:2,marginBottom:2}}>🗂 ASSIGN GROUPS TO FIELDS</div>
                        <div style={{fontSize:11,color:"#475569"}}>Distribute groups evenly across fields. Tap a field number to reassign.</div>
                      </div>
                      {CATEGORIES.map(c=>{
                        const fc=FIELD_CONFIG[c.id];
                        const pres=participants.filter(p=>p.categories.includes(c.id)&&p.attendance==="present").length;
                        if(pres===0) return null;
                        const sizes=calcGroupSizes(pres);
                        const letters="ABCDEFGHIJKLMNOPQRSTUVWXYZ";
                        const groups=sizes.map((_,i)=>letters[i]);
                        const fmap=getGroupFieldMap(c.id,groups,fc.count);
                        // Count groups per field
                        const fieldLoad={};
                        for(let f=1;f<=fc.count;f++) fieldLoad[f]=groups.filter(g=>fmap[g]===f).length;
                        const maxLoad=Math.max(...Object.values(fieldLoad));
                        const minLoad=Math.min(...Object.values(fieldLoad));
                        const isBalanced=maxLoad-minLoad<=1;
                        return(
                          <div key={c.id} style={{borderBottom:`1px solid ${BDR}18`,padding:"12px 18px"}}>
                            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                              <span style={{fontSize:12,fontWeight:700}}>{c.icon} {c.name}</span>
                              <span style={{fontSize:10,color:"#475569"}}>{groups.length} groups · {fc.count} {fc.label.toLowerCase()}{fc.count>1?"s":""}</span>
                              <span style={{marginLeft:"auto",fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:10,
                                background:isBalanced?"rgba(16,185,129,.15)":"rgba(245,158,11,.15)",
                                color:isBalanced?"#10b981":"#f59e0b"}}>
                                {isBalanced?"✓ BALANCED":"⚠ UNEVEN"}
                              </span>
                            </div>
                            {/* Field load bars */}
                            <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
                              {Array.from({length:fc.count},(_,i)=>i+1).map(f=>{
                                const load=fieldLoad[f]||0;
                                const isHeavy=load===maxLoad&&maxLoad>minLoad;
                                return(
                                  <div key={f} style={{flex:"1 1 60px",background:BG,borderRadius:7,padding:"7px 10px",border:`1px solid ${isHeavy?"rgba(245,158,11,.35)":BDR}`,textAlign:"center"}}>
                                    <div style={{fontFamily:"'Bebas Neue'",fontSize:11,color:isHeavy?"#f59e0b":c.color,letterSpacing:1}}>{fc.label} {f}</div>
                                    <div style={{fontFamily:"'Bebas Neue'",fontSize:22,color:isHeavy?"#f59e0b":c.color}}>{load}</div>
                                    <div style={{fontSize:8,color:"#475569"}}>group{load!==1?"s":""}</div>
                                  </div>
                                );
                              })}
                            </div>
                            {/* Group assignment chips */}
                            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                              {groups.map(g=>(
                                <div key={g} style={{background:`${c.color}10`,border:`1px solid ${c.color}30`,borderRadius:8,padding:"6px 10px",display:"flex",alignItems:"center",gap:6}}>
                                  <span style={{fontSize:10,fontWeight:700,color:c.color}}>GRP {g}</span>
                                  <div style={{display:"flex",gap:3}}>
                                    {Array.from({length:fc.count},(_,i)=>i+1).map(f=>(
                                      <button key={f} className="hbtn"
                                        style={{width:24,height:24,borderRadius:5,fontSize:10,fontWeight:700,cursor:"pointer",
                                          background:fmap[g]===f?c.color:"transparent",
                                          border:`1px solid ${fmap[g]===f?c.color:BDR}`,
                                          color:fmap[g]===f?"#0f1525":"#475569"}}
                                        onClick={()=>{
                                          const newMap={...(groupFieldMaps[c.id]||{}),...fmap,[g]:f};
                                          setGroupFieldMaps(prev=>({...prev,[c.id]:newMap}));
                                        }}>{f}</button>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Generate button */}
                    <button className="hbtn"
                      style={{width:"100%",padding:"18px",background:presentCount>0?"linear-gradient(135deg,#00d4ff,#0099cc)":"#1e2a45",borderRadius:12,color:presentCount>0?"#0f1525":"#475569",fontFamily:"'Bebas Neue'",fontSize:22,letterSpacing:3,cursor:presentCount>0?"pointer":"not-allowed",border:"none"}}
                      onClick={generateTournamentHandler}>
                      {presentCount>0?`⚡ GENERATE — ${presentCount} CONFIRMED PARTICIPANTS`:"⚠ MARK ATTENDANCE FIRST"}
                    </button>
                  </div>
                ):(
                  <div>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
                      <div>
                        <div style={{fontFamily:"'Bebas Neue'",fontSize:20,color:"#10b981",letterSpacing:2}}>🏆 TOURNAMENT IS LIVE</div>
                        <div style={{fontSize:12,color:"#475569",marginTop:4}}>{presentCount} participants confirmed · Tournament in progress</div>
                      </div>
                      <button className="hbtn"
                        style={{padding:"10px 20px",background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.3)",borderRadius:8,color:"#ef4444",fontWeight:700,fontSize:13,cursor:"pointer"}}
                        onClick={resetTournament}>🔄 RESET TOURNAMENT</button>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))",gap:10}}>
                      {CATEGORIES.map(c=>{
                        const cd=tournamentData[c.id];
                        const total=(cd?.matches||[]).length;
                        const done=(cd?.matches||[]).filter(m=>m.status==="completed").length;
                        const onhold=(cd?.matches||[]).filter(m=>m.status==="held").length;
                        const grps=Object.keys(cd?.groups||{}).length;
                        if(!total) return(
                          <div key={c.id} style={{background:SURF,border:`1px solid ${BDR}`,borderRadius:10,padding:14,opacity:0.4}}>
                            <div style={{fontSize:12,fontWeight:700,color:"#475569"}}>{c.icon} {c.name}</div>
                            <div style={{fontSize:11,color:"#3a4a65",marginTop:4}}>No participants</div>
                          </div>
                        );
                        return(
                          <div key={c.id} style={{background:SURF,border:`1px solid ${BDR}`,borderLeft:`3px solid ${c.color}`,borderRadius:10,padding:14}}>
                            <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>{c.icon} {c.name}</div>
                            <div style={{display:"flex",gap:6}}>
                              {[["GRP",grps],["DONE",`${done}/${total}`],["HOLD",onhold]].map(([l,v])=>(
                                <div key={l} style={{flex:1,background:BG,borderRadius:6,padding:"6px 8px",textAlign:"center"}}>
                                  <div style={{fontSize:8,color:"#475569",fontWeight:700}}>{l}</div>
                                  <div style={{fontFamily:"'Bebas Neue'",fontSize:18,color:l==="HOLD"&&onhold>0?"#f59e0b":c.color}}>{v}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════
            JUDGE VIEW — CATEGORY → FIELD
        ════════════════════════════════════════ */}
        {view==="judge"&&(
          <JudgePanel
            isGenerated={isGenerated}
            judgeCategory={judgeCategory}
            judgeField={judgeField}
            CATEGORIES={CATEGORIES}
            FIELD_CONFIG={FIELD_CONFIG}
            tournamentData={tournamentData}
            groupFieldMaps={groupFieldMaps}
            participants={participants}
            selectJudgeCategory={selectJudgeCategory}
            selectJudgeField={selectJudgeField}
            changeJudgeCategory={changeJudgeCategory}
            setJudgeField={setJudgeField}
            holdMatch={holdMatch}
            releaseMatch={releaseMatch}
            openScoreModal={openScoreModal}
            BG={BG} SURF={SURF} BDR={BDR}
          />
        )}

                {/* ════════════════════════════════════════
            PUBLIC VIEW
        ════════════════════════════════════════ */}
        {view==="public"&&(
          <div className="fadein">
            {!isGenerated?(
              <div style={{textAlign:"center",padding:"80px 20px"}}>
                <div style={{fontSize:52,marginBottom:16}}>⏳</div>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:26,color:"#475569",letterSpacing:3}}>TOURNAMENT STARTING SOON</div>
                <div style={{fontSize:13,color:"#475569",marginTop:8}}>Please wait while the organizer finalizes the setup.</div>
              </div>
            ):(
              <>
                <div style={{display:"flex",gap:4,marginBottom:18,background:SURF,padding:4,borderRadius:8,border:`1px solid ${BDR}`,width:"fit-content"}}>
                  {["fields","fixtures","standings","bracket"].map(t=>(
                    <button key={t} className="hbtn"
                      style={{padding:"8px 16px",borderRadius:6,fontWeight:700,fontSize:12,letterSpacing:1,color:pubTab===t?"#0f1525":"#64748b",background:pubTab===t?accent:"transparent",textTransform:"uppercase",cursor:"pointer"}}
                      onClick={()=>setPubTab(t)}>{t==="fields"?"🏟 FIELDS":t}</button>
                  ))}
                </div>

                {/* FIELDS */}
                {pubTab==="fields"&&(
                  <div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(290px,1fr))",gap:14,marginBottom:24}}>
                      {Array.from({length:fieldCfg.count},(_,i)=>i+1).map(f=>{
                        const fd=fieldData[f];
                        const liveConflict=fd.live&&(busyPlayers.has(fd.live.p1)||busyPlayers.has(fd.live.p2));
                        return(
                          <div key={f} style={{background:SURF,border:`2px solid ${fd.heldList.length>0?"#f59e0b60":fd.live?accent+"60":BDR}`,borderRadius:12,overflow:"hidden"}}>
                            <div style={{background:`linear-gradient(135deg,${accent}22,${accent}08)`,padding:"12px 16px",borderBottom:`1px solid ${BDR}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                              <div style={{fontFamily:"'Bebas Neue'",fontSize:26,color:accent,letterSpacing:2}}>{fieldCfg.label} {f}</div>
                              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                                {liveConflict&&<div style={{fontSize:10,fontWeight:700,color:"#f59e0b",background:"rgba(245,158,11,.15)",border:"1px solid rgba(245,158,11,.4)",borderRadius:20,padding:"3px 10px"}}>⚠ CONFLICT</div>}
                                {fd.live?(
                                  <div style={{display:"flex",alignItems:"center",gap:5,background:"rgba(239,68,68,.15)",border:"1px solid rgba(239,68,68,.4)",borderRadius:20,padding:"4px 10px"}}>
                                    <div className="blink" style={{width:6,height:6,borderRadius:"50%",background:"#ef4444"}}/>
                                    <span style={{fontSize:10,fontWeight:700,color:"#ef4444",letterSpacing:1}}>LIVE</span>
                                  </div>
                                ):(<div style={{fontSize:11,fontWeight:700,color:"#475569"}}>{fd.heldList.length>0?"⏸ HELD":"STANDBY"}</div>)}
                              </div>
                            </div>
                            <div style={{padding:"14px 16px",borderBottom:`1px solid ${BDR}`}}>
                              <div style={{fontSize:9,color:"#ef4444",fontWeight:700,letterSpacing:2,marginBottom:8}}>▶ NOW PLAYING</div>
                              {fd.live?(
                                <div style={{display:"flex",alignItems:"center",gap:10}}>
                                  <div style={{flex:1,textAlign:"right"}}>
                                    <div style={{fontWeight:700,fontSize:14,color:busyPlayers.has(fd.live.p1)?"#f59e0b":"#e2e8f0"}}>{fd.live.p1name}{busyPlayers.has(fd.live.p1)&&" ⚠"}</div>
                                    <div style={{fontSize:10,color:"#475569"}}>Group {fd.live.group}</div>
                                  </div>
                                  <div style={{fontFamily:"'Bebas Neue'",fontSize:20,color:accent,letterSpacing:3,padding:"5px 10px",background:`${accent}15`,borderRadius:6}}>VS</div>
                                  <div style={{flex:1}}>
                                    <div style={{fontWeight:700,fontSize:14,color:busyPlayers.has(fd.live.p2)?"#f59e0b":"#e2e8f0"}}>{fd.live.p2name}{busyPlayers.has(fd.live.p2)&&" ⚠"}</div>
                                    <div style={{fontSize:10,color:"#475569"}}>Group {fd.live.group}</div>
                                  </div>
                                </div>
                              ):(
                                <div style={{textAlign:"center",padding:"10px 0",color:"#475569",fontSize:12}}>— No match scheduled —</div>
                              )}
                            </div>
                            <div style={{padding:"10px 16px",background:`${BG}88`}}>
                              <div style={{fontSize:9,color:"#475569",fontWeight:700,letterSpacing:2,marginBottom:5}}>NEXT UP</div>
                              {fd.next?(
                                <div style={{display:"flex",alignItems:"center",gap:6}}>
                                  <div style={{flex:1,textAlign:"right",fontSize:11,color:"#94a3b8",fontWeight:600}}>{fd.next.p1name}</div>
                                  <div style={{fontSize:10,color:"#475569"}}>vs</div>
                                  <div style={{flex:1,fontSize:11,color:"#94a3b8",fontWeight:600}}>{fd.next.p2name}</div>
                                </div>
                              ):(<div style={{fontSize:11,color:"#3a4a65"}}>— Queue empty —</div>)}
                            </div>
                            {fd.heldList.length>0&&(
                              <div style={{padding:"8px 16px",background:"rgba(245,158,11,.05)"}}>
                                <div style={{fontSize:9,color:"#f59e0b",fontWeight:700,letterSpacing:2,marginBottom:4}}>⏸ ON HOLD ({fd.heldList.length})</div>
                                {fd.heldList.map(m=><div key={m.id} style={{fontSize:11,color:"#92400e",fontWeight:600}}>{m.p1name} vs {m.p2name}</div>)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* COMING UP */}
                    <div style={{background:SURF,border:`1px solid ${BDR}`,borderRadius:12,overflow:"hidden"}}>
                      <div style={{padding:"12px 18px",borderBottom:`1px solid ${BDR}`,display:"flex",alignItems:"center",gap:10,background:`linear-gradient(90deg,${accent}12,transparent)`}}>
                        <div style={{fontFamily:"'Bebas Neue'",fontSize:18,color:accent,letterSpacing:2}}>COMING UP</div>
                        <div style={{fontSize:11,color:"#475569"}}>— Next 6 in queue</div>
                        <div style={{marginLeft:"auto",fontSize:11,color:"#475569"}}>{pending.length} pending</div>
                      </div>
                      {comingUp.length===0?(
                        <div style={{padding:"20px",textAlign:"center",color:"#475569",fontSize:13}}>✅ All matches assigned to fields</div>
                      ):comingUp.map((m,idx)=>(
                        <div key={m.id} className="mrow" style={{display:"flex",alignItems:"center",padding:"10px 18px",borderBottom:`1px solid ${BDR}18`,gap:10}}>
                          <div style={{width:24,height:24,borderRadius:6,background:`${accent}18`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Bebas Neue'",fontSize:13,color:accent,flexShrink:0}}>{idx+1}</div>
                          <div style={{fontSize:10,color:accent,fontWeight:700,background:`${accent}15`,padding:"2px 8px",borderRadius:4,flexShrink:0}}>{fieldCfg.label} {m.field}</div>
                          <div style={{flex:1,textAlign:"right",fontWeight:600,fontSize:12,color:"#94a3b8"}}>{m.p1name}</div>
                          <div style={{fontSize:10,color:"#475569"}}>vs</div>
                          <div style={{flex:1,fontWeight:600,fontSize:12,color:"#94a3b8"}}>{m.p2name}</div>
                          <div style={{fontSize:10,color:"#475569",background:BG,padding:"2px 7px",borderRadius:4,flexShrink:0}}>GRP {m.group}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* FIXTURES */}
                {pubTab==="fixtures"&&Object.keys(catTournament.groups||{}).map(g=>{
                  const gm=catMatches.filter(m=>m.group===g);
                  return(
                    <div key={g} style={{background:SURF,border:`1px solid ${BDR}`,borderRadius:10,marginBottom:14,overflow:"hidden"}}>
                      <div style={{background:`linear-gradient(90deg,${accent}18,transparent)`,padding:"10px 16px",borderBottom:`1px solid ${BDR}`,display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:28,height:28,borderRadius:6,background:accent,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Bebas Neue'",fontSize:16,color:"#0f1525"}}>{g}</div>
                        <span style={{fontWeight:700,fontSize:14}}>GROUP {g}</span>
                        <span style={{fontSize:11,color:"#475569",marginLeft:"auto"}}>{gm.filter(m=>m.status==="completed").length}/{gm.length} played</span>
                      </div>
                      {gm.map(m=>(
                        <div key={m.id} className="mrow" style={{display:"flex",alignItems:"center",padding:"9px 16px",borderBottom:`1px solid ${BDR}18`,gap:10,background:m.status==="held"?"rgba(245,158,11,.04)":"transparent"}}>
                          <div style={{flex:1,textAlign:"right",fontWeight:600,fontSize:13}}>{m.p1name}</div>
                          <div style={{width:90,textAlign:"center"}}>
                            {m.status==="completed"?(
                              <div style={{fontFamily:"'Bebas Neue'",fontSize:22,letterSpacing:4}}>
                                <span style={{color:m.score1>m.score2?accent:m.score1===m.score2?"#ffd700":"#475569"}}>{m.score1}</span>
                                <span style={{color:"#475569",margin:"0 3px"}}>–</span>
                                <span style={{color:m.score2>m.score1?accent:m.score1===m.score2?"#ffd700":"#475569"}}>{m.score2}</span>
                              </div>
                            ):m.status==="held"?(
                              <span style={{fontSize:10,color:"#f59e0b",background:"rgba(245,158,11,.15)",padding:"3px 8px",borderRadius:4,fontWeight:700}}>⏸ HELD</span>
                            ):(
                              <span style={{fontSize:10,color:"#475569",background:BG,padding:"3px 8px",borderRadius:4,fontWeight:700}}>PENDING</span>
                            )}
                          </div>
                          <div style={{flex:1,fontWeight:600,fontSize:13}}>{m.p2name}</div>
                        </div>
                      ))}
                    </div>
                  );
                })}

                {/* STANDINGS */}
                {pubTab==="standings"&&Object.keys(catTournament.groups||{}).map(g=>{
                  const rows=standings[g]||[];
                  return(
                    <div key={g} style={{background:SURF,border:`1px solid ${BDR}`,borderRadius:10,marginBottom:14,overflow:"hidden"}}>
                      <div style={{background:`linear-gradient(90deg,${accent}18,transparent)`,padding:"10px 16px",borderBottom:`1px solid ${BDR}`,display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:28,height:28,borderRadius:6,background:accent,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Bebas Neue'",fontSize:16,color:"#0f1525"}}>{g}</div>
                        <span style={{fontWeight:700,fontSize:14}}>GROUP {g} STANDINGS</span>
                      </div>
                      <div style={{overflowX:"auto"}}>
                        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                          <thead><tr style={{borderBottom:`1px solid ${BDR}`}}>{["#","PLAYER","P","W","D","L","GF","GA","GD","PTS"].map(h=><th key={h} style={{padding:"8px 12px",textAlign:h==="PLAYER"?"left":"center",color:"#475569",fontSize:10,fontWeight:700}}>{h}</th>)}</tr></thead>
                          <tbody>{rows.map((r,i)=>(
                            <tr key={r.id} style={{borderBottom:`1px solid ${BDR}18`,background:i<2?`${accent}0a`:"transparent"}}>
                              <td style={{padding:"9px 12px",textAlign:"center",color:i<2?accent:"#475569",fontWeight:700}}>{i+1}</td>
                              <td style={{padding:"9px 12px",fontWeight:600,fontSize:13}}>{i<2&&<span style={{display:"inline-block",width:6,height:6,borderRadius:"50%",background:accent,marginRight:7,verticalAlign:"middle"}}/>}{r.name}</td>
                              {["P","W","D","L","GF","GA","GD","Pts"].map(k=><td key={k} style={{padding:"9px 12px",textAlign:"center",fontWeight:k==="Pts"?700:400,color:k==="Pts"?accent:k==="GD"?(r[k]>0?"#10b981":r[k]<0?"#ef4444":"#64748b"):"#94a3b8"}}>{r[k]}</td>)}
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}

                {pubTab==="bracket"&&<BracketView accent={accent} BDR={BDR} SURF={SURF} BG={BG}/>}
              </>
            )}
          </div>
        )}
      </main>

      {/* PIN MODAL */}
      {pinModal.open&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.92)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:400,padding:20}}
          onClick={e=>e.target===e.currentTarget&&setPinModal(p=>({...p,open:false}))}>
          <div className={`fadein${pinModal.shake?" shake":""}`} style={{background:SURF,border:`2px solid ${pinModal.error?"#ef4444":BDR}`,borderRadius:16,padding:36,width:"100%",maxWidth:360,textAlign:"center"}}>
            <div style={{fontSize:36,marginBottom:12}}>🔒</div>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:22,letterSpacing:3,color:pinModal.target==="judge"?"#00d4ff":"#ffd700",marginBottom:6}}>{pinModal.target==="judge"?"JUDGE PANEL":"ADMIN PANEL"}</div>
            <div style={{fontSize:12,color:"#475569",marginBottom:24}}>Enter access password</div>
            <input type="password" value={pinModal.input} onChange={e=>setPinModal(p=>({...p,input:e.target.value,error:false}))} onKeyDown={e=>e.key==="Enter"&&submitPin()} placeholder="Password" autoFocus
              style={{width:"100%",background:BG,border:`2px solid ${pinModal.error?"#ef4444":pinModal.input?"#00d4ff":BDR}`,borderRadius:10,padding:"12px 18px",textAlign:"center",fontFamily:"'Rajdhani',sans-serif",fontSize:18,fontWeight:700,color:"#e2e8f0",marginBottom:8}}/>
            {pinModal.error&&<div style={{fontSize:12,color:"#ef4444",marginBottom:12,fontWeight:700}}>✕ Incorrect password</div>}
            {!pinModal.error&&<div style={{marginBottom:12}}/>}
            <div style={{display:"flex",gap:10}}>
              <button className="hbtn" style={{flex:1,padding:12,background:"transparent",border:`1px solid ${BDR}`,borderRadius:8,color:"#64748b",fontWeight:700,fontSize:13,cursor:"pointer"}} onClick={()=>setPinModal(p=>({...p,open:false,input:"",error:false}))}>CANCEL</button>
              <button className="hbtn" style={{flex:2,padding:12,background:pinModal.target==="judge"?"#00d4ff":"#ffd700",border:"none",borderRadius:8,color:"#0f1525",fontWeight:700,fontSize:13,cursor:"pointer"}} onClick={submitPin}>UNLOCK →</button>
            </div>
          </div>
        </div>
      )}

      {/* SCORE MODAL */}
      {scoreModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:20}}
          onClick={e=>e.target===e.currentTarget&&setScoreModal(null)}>
          <div className="fadein" style={{background:SURF,border:`1px solid ${accent}40`,borderRadius:16,padding:32,width:"100%",maxWidth:420}}>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:22,letterSpacing:3,color:accent,textAlign:"center",marginBottom:8}}>ENTER MATCH RESULT</div>
            <div style={{fontSize:11,color:"#475569",textAlign:"center",marginBottom:24}}>{scoreModal.p1name} vs {scoreModal.p2name}</div>
            <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:24}}>
              {[{key:"s1",name:scoreModal.p1name},{key:"s2",name:scoreModal.p2name}].map(({key,name})=>(
                <div key={key} style={{flex:1,textAlign:"center"}}>
                  <div style={{fontWeight:700,fontSize:13,marginBottom:10,color:"#e2e8f0"}}>{name}</div>
                  <input type="number" min="0" max="99" value={scoreInput[key]} onChange={e=>setScoreInput(s=>({...s,[key]:e.target.value}))} placeholder="0"
                    style={{width:"100%",background:BG,border:`2px solid ${scoreInput[key]!==""?accent:BDR}`,borderRadius:10,padding:"14px 0",textAlign:"center",fontFamily:"'Bebas Neue'",fontSize:52,color:accent,outline:"none"}}/>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:10}}>
              <button className="hbtn" onClick={()=>setScoreModal(null)} style={{flex:1,padding:13,background:"transparent",border:`1px solid ${BDR}`,borderRadius:8,color:"#64748b",fontWeight:700,fontSize:13,cursor:"pointer"}}>CANCEL</button>
              <button className="hbtn" onClick={submitScore} style={{flex:2,padding:13,background:accent,border:"none",borderRadius:8,color:"#0f1525",fontWeight:700,fontSize:13,cursor:"pointer"}}>✓ CONFIRM SCORE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
// CSV IMPORT COMPONENT
// ═══════════════════════════════════════════════════════════
function CsvImport({CATEGORIES, onImport, onReplace, BG, SURF, BDR}){
  const [open, setOpen]       = useState(false);
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState([]);
  const [error, setError]     = useState("");
  const [mode, setMode]       = useState("add"); // add | replace

  // ── CSV FORMAT:
  // Name, Category1, Category2, ...
  // Ahmad Danial, diy-p, sjr
  // Nurul Ain, diy-p, diy-s

  const CAT_ALIASES = {
    "diy soccer primary":"diy-p",   "diy-p":"diy-p",   "diy soccer 1":"diy-p",
    "diy soccer secondary":"diy-s", "diy-s":"diy-s",   "diy soccer 2":"diy-s",
    "open soccer 2x2":"open2",      "open2":"open2",   "2x2":"open2",   "open 2x2":"open2",
    "soccer 4x4":"soc4",            "soc4":"soc4",     "4x4":"soc4",    "open soccer 4x4":"soc4",
    "drone soccer":"drone",         "drone":"drone",
    "sumo basic auto":"sia",        "sia":"sia",       "sumo inex auto":"sia",
    "sumo basic rc":"sir",          "sir":"sir",       "sumo inex rc":"sir",
    "sumo junior auto":"sja",       "sja":"sja",
    "sumo junior rc":"sjr",         "sjr":"sjr",
    "sumo senior auto":"ssa",       "ssa":"ssa",
    "sumo senior rc":"ssr",         "ssr":"ssr",
  };

  function parseCSV(text){
    setError("");
    const lines = text.trim().split("\n").filter(l=>l.trim());
    if(!lines.length){ setPreview([]); return; }

    // Detect if first line is a header
    const firstLower = lines[0].toLowerCase();
    const isHeader = firstLower.includes("name") || firstLower.includes("student") || firstLower.includes("participant");
    const dataLines = isHeader ? lines.slice(1) : lines;

    const parsed = [];
    const errs = [];

    dataLines.forEach((line, i)=>{
      const cols = line.split(",").map(c=>c.trim()).filter(Boolean);
      if(!cols.length) return;
      const name = cols[0];
      if(!name){ errs.push(`Row ${i+2}: missing name`); return; }

      const cats = [];
      cols.slice(1).forEach(col=>{
        const key = col.toLowerCase().trim();
        const catId = CAT_ALIASES[key];
        if(catId && !cats.includes(catId)) cats.push(catId);
        else if(!catId) errs.push(`Row ${i+2}: unknown category "${col}"`);
      });

      if(!cats.length){ errs.push(`Row ${i+2}: "${name}" has no valid categories`); return; }
      parsed.push({ id:`csv_${Date.now()}_${i}`, name, categories:cats, attendance:null });
    });

    if(errs.length) setError(errs.slice(0,3).join(" · ") + (errs.length>3?` +${errs.length-3} more`:""));
    setPreview(parsed);
  }

  function handleImport(){
    if(!preview.length) return;
    if(mode==="replace") onReplace(preview);
    else onImport(preview);
    setCsvText(""); setPreview([]); setError(""); setOpen(false);
  }

  if(!open) return(
    <div style={{background:SURF,border:`1px solid ${BDR}`,borderRadius:12,padding:14,marginBottom:14,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
      <div>
        <div style={{fontSize:12,fontWeight:700,color:"#e2e8f0"}}>📥 BULK IMPORT VIA CSV</div>
        <div style={{fontSize:11,color:"#475569",marginTop:2}}>Paste your full participant list from Excel in one go</div>
      </div>
      <button
        style={{marginLeft:"auto",padding:"8px 18px",background:"rgba(0,212,255,.15)",border:"1px solid rgba(0,212,255,.4)",borderRadius:8,color:"#00d4ff",fontWeight:700,fontSize:12,cursor:"pointer"}}
        onClick={()=>setOpen(true)}>OPEN IMPORT</button>
    </div>
  );

  return(
    <div style={{background:SURF,border:`2px solid rgba(0,212,255,.3)`,borderRadius:12,padding:18,marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
        <div style={{fontFamily:"'Bebas Neue'",fontSize:18,color:"#00d4ff",letterSpacing:2}}>📥 BULK CSV IMPORT</div>
        <button style={{padding:"5px 12px",background:"transparent",border:`1px solid ${BDR}`,borderRadius:6,color:"#475569",fontSize:11,fontWeight:700,cursor:"pointer"}} onClick={()=>{setOpen(false);setCsvText("");setPreview([]);setError("");}}>✕ CLOSE</button>
      </div>

      {/* FORMAT GUIDE */}
      <div style={{background:BG,borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:11}}>
        <div style={{color:"#00d4ff",fontWeight:700,marginBottom:6}}>CSV FORMAT — one student per row:</div>
        <div style={{color:"#475569",fontFamily:"monospace",lineHeight:1.8}}>
          <div style={{color:"#94a3b8"}}>Name, Category1, Category2</div>
          <div>Ahmad Danial, diy-p, sjr</div>
          <div>Nurul Ain, diy-p, diy-s</div>
          <div>Kevin Raj, soc4, ssa</div>
        </div>
        <div style={{marginTop:8,color:"#475569"}}>
          Category codes: <span style={{color:"#00d4ff"}}>diy-p</span> · <span style={{color:"#00ff88"}}>diy-s</span> · <span style={{color:"#ff6b35"}}>open2</span> · <span style={{color:"#ffd700"}}>soc4</span> · <span style={{color:"#ff4d8d"}}>drone</span> · <span style={{color:"#a78bfa"}}>sia</span> · <span style={{color:"#fb923c"}}>sir</span> · <span style={{color:"#34d399"}}>sja</span> · <span style={{color:"#60a5fa"}}>sjr</span> · <span style={{color:"#f472b6"}}>ssa</span> · <span style={{color:"#e879f9"}}>ssr</span>
        </div>
      </div>

      {/* MODE */}
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        {[["add","➕ ADD to existing list"],["replace","🔄 REPLACE entire list"]].map(([v,l])=>(
          <button key={v}
            style={{flex:1,padding:"8px",borderRadius:7,fontSize:11,fontWeight:700,cursor:"pointer",
              background:mode===v?(v==="replace"?"rgba(239,68,68,.2)":"rgba(0,212,255,.15)"):"transparent",
              border:`1px solid ${mode===v?(v==="replace"?"#ef4444":"#00d4ff"):BDR}`,
              color:mode===v?(v==="replace"?"#ef4444":"#00d4ff"):"#64748b"}}
            onClick={()=>setMode(v)}>{l}</button>
        ))}
      </div>
      {mode==="replace"&&<div style={{fontSize:11,color:"#ef4444",marginBottom:12}}>⚠ Replace will remove ALL existing participants and load the new list.</div>}

      {/* PASTE AREA */}
      <textarea
        value={csvText}
        onChange={e=>{setCsvText(e.target.value);parseCSV(e.target.value);}}
        placeholder={"Paste your CSV data here...\n\nAhmad Danial, diy-p, sjr\nNurul Ain, diy-p, diy-s\nKevin Raj, soc4, ssa"}
        style={{width:"100%",height:160,background:BG,border:`1px solid ${csvText?"#00d4ff":BDR}`,borderRadius:8,padding:"10px 14px",color:"#e2e8f0",fontFamily:"monospace",fontSize:12,resize:"vertical",outline:"none"}}
      />

      {/* ERROR */}
      {error&&<div style={{fontSize:11,color:"#ef4444",marginTop:6,marginBottom:6}}>⚠ {error}</div>}

      {/* PREVIEW */}
      {preview.length>0&&(
        <div style={{marginTop:12}}>
          <div style={{fontSize:10,color:"#10b981",fontWeight:700,letterSpacing:1,marginBottom:8}}>✓ PREVIEW — {preview.length} participants ready to import</div>
          <div style={{background:BG,borderRadius:8,maxHeight:180,overflowY:"auto"}}>
            {preview.slice(0,8).map((p,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 12px",borderBottom:`1px solid ${BDR}18`}}>
                <div style={{fontWeight:600,fontSize:13,flex:1}}>{p.name}</div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                  {p.categories.map(cid=>{
                    const c=CATEGORIES.find(x=>x.id===cid);
                    return c?<span key={cid} style={{fontSize:9,color:c.color,background:`${c.color}15`,padding:"1px 6px",borderRadius:3,fontWeight:700}}>{c.icon} {c.name}</span>:null;
                  })}
                </div>
              </div>
            ))}
            {preview.length>8&&<div style={{padding:"6px 12px",fontSize:11,color:"#475569"}}>...and {preview.length-8} more</div>}
          </div>
          <button
            style={{width:"100%",marginTop:12,padding:"12px",background:"linear-gradient(135deg,#00d4ff,#0099cc)",border:"none",borderRadius:8,color:"#0f1525",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:14,cursor:"pointer",letterSpacing:1}}
            onClick={handleImport}>
            {mode==="replace"?`🔄 REPLACE WITH ${preview.length} PARTICIPANTS`:`➕ ADD ${preview.length} PARTICIPANTS`}
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// JUDGE PANEL COMPONENT
// ═══════════════════════════════════════════════════════════
function JudgePanel({isGenerated,judgeCategory,judgeField,CATEGORIES,FIELD_CONFIG,tournamentData,groupFieldMaps,participants,selectJudgeCategory,selectJudgeField,changeJudgeCategory,setJudgeField,holdMatch,releaseMatch,openScoreModal,BG,SURF,BDR}){

  if(!isGenerated) return(
    <div style={{textAlign:"center",padding:"80px 20px"}}>
      <div style={{fontSize:48,marginBottom:16}}>⚙</div>
      <div style={{fontFamily:"'Bebas Neue'",fontSize:24,color:"#475569",letterSpacing:3}}>TOURNAMENT NOT YET GENERATED</div>
      <div style={{fontSize:13,color:"#475569",marginTop:8}}>Admin must complete setup and generate the tournament first.</div>
    </div>
  );

  // ── STEP 1: SELECT CATEGORY ──────────────────────────────
  if(!judgeCategory) return(
    <div className="fadein">
      <div style={{textAlign:"center",marginBottom:28}}>
        <div style={{fontSize:36,marginBottom:8}}>📋</div>
        <div style={{fontFamily:"'Bebas Neue'",fontSize:22,color:"#00d4ff",letterSpacing:3}}>SELECT YOUR CATEGORY</div>
        <div style={{fontSize:12,color:"#475569",marginTop:4}}>Tap the category you are refereeing today</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:12}}>
        {CATEGORIES.map(c=>{
          const cd=tournamentData[c.id];
          const total=(cd?.matches||[]).length;
          if(!total) return null;
          const pend=(cd?.matches||[]).filter(m=>m.status==="pending").length;
          const hld=(cd?.matches||[]).filter(m=>m.status==="held").length;
          const done=(cd?.matches||[]).filter(m=>m.status==="completed").length;
          const fc=FIELD_CONFIG[c.id];
          return(
            <div key={c.id}
              style={{background:SURF,border:`2px solid ${c.color}40`,borderRadius:12,padding:18,cursor:"pointer",transition:"all .2s"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=c.color;e.currentTarget.style.background=`${c.color}0e`;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=`${c.color}40`;e.currentTarget.style.background=SURF;}}
              onClick={()=>selectJudgeCategory(c.id)}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                <div style={{fontSize:24}}>{c.icon}</div>
                <div>
                  <div style={{fontWeight:700,fontSize:14,color:"#e2e8f0"}}>{c.name}</div>
                  <div style={{fontSize:10,color:"#475569",marginTop:2}}>{fc.count} {fc.label.toLowerCase()}{fc.count>1?"s":""}</div>
                </div>
              </div>
              <div style={{display:"flex",gap:6}}>
                {[["PENDING",pend,"#64748b"],["ON HOLD",hld,"#f59e0b"],["DONE",done,"#10b981"]].map(([l,v,col])=>(
                  <div key={l} style={{flex:1,background:BG,borderRadius:6,padding:"6px 8px",textAlign:"center"}}>
                    <div style={{fontSize:8,color:col,fontWeight:700,letterSpacing:0.5}}>{l}</div>
                    <div style={{fontFamily:"'Bebas Neue'",fontSize:20,color:col}}>{v}</div>
                  </div>
                ))}
              </div>
              {pend===0&&hld===0&&(
                <div style={{marginTop:10,fontSize:10,color:"#10b981",fontWeight:700,textAlign:"center"}}>✓ ALL COMPLETE</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const selCat=CATEGORIES.find(c=>c.id===judgeCategory);
  const selFc=FIELD_CONFIG[judgeCategory];
  const selColor=selCat.color;

  // ── STEP 2: SELECT FIELD WITHIN CATEGORY ─────────────────
  if(!judgeField) return(
    <div className="fadein">
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
        <button
          style={{padding:"7px 14px",borderRadius:7,fontSize:11,fontWeight:700,color:"#64748b",background:"transparent",border:`1px solid ${BDR}`,cursor:"pointer"}}
          onClick={changeJudgeCategory}>← BACK</button>
        <div>
          <div style={{fontFamily:"'Bebas Neue'",fontSize:20,color:selColor,letterSpacing:2}}>{selCat.icon} {selCat.name}</div>
          <div style={{fontSize:11,color:"#475569"}}>Select your assigned {selFc.label.toLowerCase()}</div>
        </div>
      </div>
      <div style={{display:"flex",gap:14,flexWrap:"wrap",justifyContent:"center"}}>
        {Array.from({length:selFc.count},(_,i)=>i+1).map(num=>{
          const catMap=groupFieldMaps[judgeCategory]||{};
          const cd=tournamentData[judgeCategory];
          const assignedGroups=Object.entries(catMap).filter(([g,f])=>Number(f)===num).map(([g])=>g);
          const pendCount=(cd?.matches||[]).filter(m=>m.field===num&&m.status==="pending").length;
          const heldCount=(cd?.matches||[]).filter(m=>m.field===num&&m.status==="held").length;
          return(
            <div key={num}
              style={{background:SURF,border:`2px solid ${selColor}40`,borderRadius:14,padding:"22px 28px",minWidth:150,cursor:"pointer",transition:"all .2s",textAlign:"center"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=selColor;e.currentTarget.style.background=`${selColor}10`;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=`${selColor}40`;e.currentTarget.style.background=SURF;}}
              onClick={()=>selectJudgeField(selFc.label,num)}>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:56,color:selColor,letterSpacing:2,lineHeight:1}}>{num}</div>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:14,color:selColor,letterSpacing:2,marginBottom:10}}>{selFc.label}</div>
              {assignedGroups.length>0&&(
                <div style={{marginBottom:8}}>
                  {assignedGroups.map(g=>(
                    <span key={g} style={{display:"inline-block",fontSize:9,background:`${selColor}20`,color:selColor,border:`1px solid ${selColor}30`,padding:"2px 7px",borderRadius:4,fontWeight:700,margin:"2px"}}>GRP {g}</span>
                  ))}
                </div>
              )}
              <div style={{display:"flex",gap:4,justifyContent:"center",flexWrap:"wrap"}}>
                {pendCount>0&&<span style={{fontSize:9,background:`${selColor}20`,color:selColor,padding:"2px 8px",borderRadius:8,fontWeight:700}}>{pendCount} pending</span>}
                {heldCount>0&&<span style={{fontSize:9,background:"rgba(245,158,11,.2)",color:"#f59e0b",padding:"2px 8px",borderRadius:8,fontWeight:700}}>⏸ {heldCount} held</span>}
                {pendCount===0&&heldCount===0&&<span style={{fontSize:9,color:"#10b981",fontWeight:700}}>✓ Clear</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── STEP 3: MATCH QUEUE ───────────────────────────────────
  const fieldNum=judgeField.number;
  const cd=tournamentData[judgeCategory];
  const fieldPending=(cd?.matches||[]).filter(m=>m.field===fieldNum&&m.status==="pending");
  const fieldHeld=(cd?.matches||[]).filter(m=>m.field===fieldNum&&m.status==="held");
  const fieldDone=(cd?.matches||[]).filter(m=>m.field===fieldNum&&m.status==="completed");
  const fieldBusy=new Set();
  fieldHeld.forEach(m=>{fieldBusy.add(m.p1);fieldBusy.add(m.p2);});

  return(
    <div className="fadein">
      {/* Field header */}
      <div style={{background:`${selColor}10`,border:`1px solid ${selColor}30`,borderRadius:12,padding:"14px 18px",marginBottom:20,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <div style={{fontFamily:"'Bebas Neue'",fontSize:44,color:selColor,letterSpacing:2,lineHeight:1}}>{fieldNum}</div>
        <div style={{flex:1}}>
          <div style={{fontFamily:"'Bebas Neue'",fontSize:16,color:selColor,letterSpacing:2}}>{selFc.label} {fieldNum} — {selCat.icon} {selCat.name}</div>
          <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{fieldPending.length} pending · {fieldHeld.length} held · {fieldDone.length} done</div>
        </div>
        <div style={{display:"flex",gap:6,flexShrink:0}}>
          <button style={{padding:"6px 12px",borderRadius:6,fontSize:10,fontWeight:700,color:"#64748b",background:"transparent",border:`1px solid ${BDR}`,cursor:"pointer"}} onClick={()=>setJudgeField(null)}>← {selFc.label}</button>
          <button style={{padding:"6px 12px",borderRadius:6,fontSize:10,fontWeight:700,color:"#64748b",background:"transparent",border:`1px solid ${BDR}`,cursor:"pointer"}} onClick={changeJudgeCategory}>← CATEGORY</button>
        </div>
      </div>

      {/* Conflict banner */}
      {fieldBusy.size>0&&(
        <div style={{background:"rgba(245,158,11,.08)",border:"1px solid rgba(245,158,11,.35)",borderRadius:8,padding:"10px 16px",marginBottom:16,fontSize:12,color:"#f59e0b"}}>
          ⚠️ <strong>CONFLICT —</strong> {[...fieldBusy].map(id=>{const p=participants.find(x=>x.id===id);return p?.name;}).filter(Boolean).join(", ")} — may be active in another category
        </div>
      )}

      {/* PENDING */}
      {fieldPending.length>0&&(
        <div style={{marginBottom:24}}>
          <div style={{fontSize:10,color:"#475569",fontWeight:700,letterSpacing:2,marginBottom:10}}>PENDING — SCORE OR HOLD</div>
          {fieldPending.map(m=>{
            const conflict=fieldBusy.has(m.p1)||fieldBusy.has(m.p2);
            return(
              <div key={m.id} style={{background:conflict?"rgba(245,158,11,.07)":SURF,border:`1px solid ${conflict?"rgba(245,158,11,.35)":BDR}`,borderRadius:10,padding:"12px 16px",marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                  <span style={{fontSize:9,color:"#475569",fontWeight:700,background:BG,padding:"2px 7px",borderRadius:4}}>GROUP {m.group}</span>
                  {conflict&&<span style={{fontSize:9,color:"#f59e0b",fontWeight:700}}>⚠ CONFLICT</span>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                  <div style={{flex:1,minWidth:80}}>
                    <div style={{fontWeight:700,fontSize:15,color:fieldBusy.has(m.p1)?"#f59e0b":"#e2e8f0"}}>{m.p1name}</div>
                  </div>
                  <div style={{fontFamily:"'Bebas Neue'",fontSize:18,color:"#475569",letterSpacing:3}}>VS</div>
                  <div style={{flex:1,minWidth:80,textAlign:"right"}}>
                    <div style={{fontWeight:700,fontSize:15,color:fieldBusy.has(m.p2)?"#f59e0b":"#e2e8f0"}}>{m.p2name}</div>
                  </div>
                  <div style={{display:"flex",gap:8,flexShrink:0}}>
                    <button style={{padding:"8px 12px",background:"rgba(245,158,11,.15)",border:"1px solid rgba(245,158,11,.4)",borderRadius:6,color:"#f59e0b",fontSize:11,fontWeight:700,cursor:"pointer"}} onClick={()=>holdMatch(m.id)}>⏸ HOLD</button>
                    <button style={{padding:"8px 14px",background:selColor,border:"none",borderRadius:6,color:"#0f1525",fontSize:11,fontWeight:700,cursor:"pointer"}} onClick={()=>openScoreModal(m)}>▶ SCORE</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ON HOLD */}
      {fieldHeld.length>0&&(
        <div style={{marginBottom:24}}>
          <div style={{fontSize:10,color:"#f59e0b",fontWeight:700,letterSpacing:2,marginBottom:10}}>⏸ ON HOLD — RELEASE WHEN PLAYER RETURNS</div>
          {fieldHeld.map(m=>(
            <div key={m.id} style={{background:"rgba(245,158,11,.07)",border:"1px solid rgba(245,158,11,.3)",borderRadius:10,padding:"12px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:80}}>
                <div style={{fontWeight:700,fontSize:14,color:"#f59e0b"}}>{m.p1name}</div>
                <div style={{fontSize:10,color:"#92400e",marginTop:2}}>Group {m.group}</div>
              </div>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:14,color:"#92400e",letterSpacing:2}}>VS</div>
              <div style={{flex:1,minWidth:80,textAlign:"right"}}>
                <div style={{fontWeight:700,fontSize:14,color:"#f59e0b"}}>{m.p2name}</div>
              </div>
              <button style={{padding:"8px 14px",background:"rgba(245,158,11,.2)",border:"1px solid rgba(245,158,11,.5)",borderRadius:6,color:"#f59e0b",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0}} onClick={()=>releaseMatch(m.id)}>▶ RELEASE</button>
            </div>
          ))}
        </div>
      )}

      {/* All clear */}
      {fieldPending.length===0&&fieldHeld.length===0&&(
        <div style={{textAlign:"center",padding:"50px 20px"}}>
          <div style={{fontSize:48,marginBottom:12}}>✅</div>
          <div style={{fontFamily:"'Bebas Neue'",fontSize:22,letterSpacing:3,color:"#94a3b8"}}>ALL CLEAR</div>
          <div style={{fontSize:12,marginTop:8,color:"#475569"}}>{selFc.label} {fieldNum} · {fieldDone.length} matches completed</div>
          <div style={{marginTop:20,display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
            <button style={{padding:"10px 20px",background:`${selColor}18`,border:`1px solid ${selColor}40`,borderRadius:8,color:selColor,fontWeight:700,fontSize:12,cursor:"pointer"}} onClick={()=>setJudgeField(null)}>← CHANGE {selFc.label}</button>
            <button style={{padding:"10px 20px",background:"rgba(0,212,255,.1)",border:"1px solid rgba(0,212,255,.3)",borderRadius:8,color:"#00d4ff",fontWeight:700,fontSize:12,cursor:"pointer"}} onClick={changeJudgeCategory}>← NEXT CATEGORY</button>
          </div>
        </div>
      )}

      {/* Recently completed */}
      {fieldDone.length>0&&(
        <div style={{marginTop:8}}>
          <div style={{fontSize:10,color:"#475569",fontWeight:700,letterSpacing:2,marginBottom:8}}>RECENTLY COMPLETED</div>
          {fieldDone.slice(-4).reverse().map(m=>(
            <div key={m.id} style={{background:SURF,border:`1px solid ${BDR}18`,borderRadius:8,padding:"9px 16px",marginBottom:6,display:"flex",alignItems:"center",gap:12,opacity:0.6}}>
              <div style={{flex:1,fontSize:13,fontWeight:600}}>{m.p1name}</div>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:20,letterSpacing:4}}>{m.score1} – {m.score2}</div>
              <div style={{flex:1,textAlign:"right",fontSize:13,fontWeight:600}}>{m.p2name}</div>
              <div style={{fontSize:10,color:"#10b981",fontWeight:700}}>✓</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BracketView({accent,BDR,SURF,BG}){
  return(
    <div style={{background:SURF,border:`1px solid ${BDR}`,borderRadius:10,padding:20,overflowX:"auto"}}>
      <div style={{fontFamily:"'Bebas Neue'",fontSize:14,color:"#475569",letterSpacing:2,marginBottom:20}}>KNOCKOUT BRACKET — GENERATED AFTER GROUP STAGE</div>
      <div style={{display:"flex",gap:16,alignItems:"center",minWidth:600}}>
        {[["R16",8,"sm"],["QF",4,"md"],["SF",2,"lg"]].map(([label,count,size])=>(
          <div key={label}>
            <div style={{fontSize:9,color:"#475569",letterSpacing:2,fontWeight:700,marginBottom:6}}>{label==="R16"?"ROUND OF 16":label==="QF"?"QUARTER FINALS":"SEMI FINALS"}</div>
            <div style={{display:"flex",flexDirection:"column",gap:size==="sm"?6:size==="md"?14:28}}>
              {Array.from({length:count}).map((_,i)=>(
                <div key={i} style={{background:BG,border:`1px solid ${BDR}`,borderRadius:6,padding:"6px 10px",width:100}}>
                  <div style={{borderBottom:`1px solid ${BDR}22`,paddingBottom:3,marginBottom:3,color:"#475569",fontSize:11}}>TBD</div>
                  <div style={{color:"#3a4a65",fontSize:11}}>TBD</div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div style={{color:"#2d3d55",fontSize:18}}>›</div>
        <div>
          <div style={{fontSize:9,color:"#475569",letterSpacing:2,fontWeight:700,marginBottom:4}}>FINAL</div>
          <div style={{background:`${accent}15`,border:`2px solid ${accent}50`,borderRadius:8,padding:"10px 12px",width:110}}>
            <div style={{borderBottom:`1px solid ${accent}30`,paddingBottom:4,marginBottom:4,color:accent,fontWeight:700,fontSize:12}}>TBD</div>
            <div style={{color:"#475569",fontSize:12}}>TBD</div>
          </div>
        </div>
        <div style={{color:accent,fontSize:22}}>›</div>
        <div style={{textAlign:"center"}}>
          <div style={{width:70,height:70,borderRadius:"50%",background:`${accent}18`,border:`2px solid ${accent}60`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,margin:"0 auto"}}>🏆</div>
          <div style={{fontFamily:"'Bebas Neue'",fontSize:11,color:accent,marginTop:8,letterSpacing:2}}>CHAMPION</div>
        </div>
      </div>
    </div>
  );
}

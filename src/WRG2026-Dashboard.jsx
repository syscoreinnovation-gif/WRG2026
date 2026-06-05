import { useState, useMemo, useEffect } from "react";
import { db } from "./firebase.js";
import { doc, onSnapshot, setDoc, getDoc } from "firebase/firestore";

// Firestore document reference
const STATE_REF = doc(db, "wrg2026", "state");

const PINS = { judge: "S0502", admin: "S0502" };

// Team categories with player counts
const TEAM_CATEGORIES = {
  "open2": { playerCount: 2, label: "Open Soccer 2×2" },
  "soc4":  { playerCount: 4, label: "Soccer 4×4" },
  "drone": { playerCount: 3, label: "Drone Soccer" },
};

// DIY Soccer sides configuration
// DIY Soccer sides config
const DIY_SIDES = {
  "diy-p": {
    A:{ label:"Sathish Anne", fields:[1,2,3,4] },
    B:{ label:"Param Sir",    fields:[5,6,7,8] }
  },
  "diy-s": {
    A:{ label:"Sathish Anne", fields:[1] },
    B:{ label:"Param Sir",    fields:[2] }
  }
};

const FIELD_CONFIG = {
  "diy-p":  { count:8, label:"FIELD",  color:"#00e664" },
  "diy-s":  { count:2, label:"FIELD",  color:"#00d4ff" },
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
  { id:"diy-p",  name:"DIY Soccer Primary",   short:"DIY Primary",   icon:"⚽", color:"#00e664" },
  { id:"diy-s",  name:"DIY Soccer Secondary",  short:"DIY Secondary", icon:"⚽", color:"#00d4ff" },
  { id:"open2",  name:"Open Soccer 2×2",        short:"Open 2×2",      icon:"⚽", color:"#ff6b35" },
  { id:"soc4",   name:"Soccer 4×4",             short:"Soccer 4×4",    icon:"⚽", color:"#ffd700" },
  { id:"drone",  name:"Drone Soccer",           short:"Drone",         icon:"🚁", color:"#ff4d8d" },
  { id:"sia",    name:"Sumo Basic Auto",        short:"Sumo Basic A",  icon:"🤖", color:"#a78bfa" },
  { id:"sir",    name:"Sumo Basic RC",          short:"Sumo Basic RC", icon:"🤖", color:"#fb923c" },
  { id:"sja",    name:"Sumo Junior Auto",       short:"Junior Auto",   icon:"🤖", color:"#34d399" },
  { id:"sjr",    name:"Sumo Junior RC",         short:"Junior RC",     icon:"🤖", color:"#60a5fa" },
  { id:"ssa",    name:"Sumo Senior Auto",       short:"Senior Auto",   icon:"🤖", color:"#f472b6" },
  { id:"ssr",    name:"Sumo Senior RC",         short:"Senior RC",     icon:"🤖", color:"#e879f9" },
];

// Participants loaded from Firebase — no hardcoded demo data

function calcGroupSizes(n){
  if(n<=0)return[];
  const g=Math.ceil(n/6),b=Math.floor(n/g),e=n%g;
  return Array.from({length:g},(_,i)=>b+(i<e?1:0));
}
// ── Berger table round-robin scheduling ─────────────────────
// Generates rounds where NO player appears twice in the same round
// Players get maximum rest between matches
function genRRRounds(members){
  const n=members.length;
  if(n<2)return[];
  // Pad to even number
  const players=n%2===0?[...members]:[...members,null];
  const m=players.length;
  const fixed=players[0];
  const rest=players.slice(1); // m-1 players, will rotate
  const rounds=[];
  for(let r=0;r<m-1;r++){
    // Rotate rest array by r positions (Berger / circle method)
    const rotated=rest.map((_,i)=>rest[(i+r)%rest.length]);
    const round=[];
    // Fixed player vs last in rotation
    const opp=rotated[rotated.length-1];
    if(fixed&&opp)round.push([fixed,opp]);
    // Pair first half vs mirrored second half
    const halfLen=Math.floor((rotated.length-1)/2);
    for(let i=0;i<halfLen;i++){
      const p1=rotated[i];
      const p2=rotated[rotated.length-2-i];
      if(p1&&p2)round.push([p1,p2]);
    }
    if(round.length>0)rounds.push(round);
  }
  return rounds;
}

function generateTournament(participants,groupFieldMaps,manualGroups,diyAreas){
  const catData={};
  const DIY_CATS_LOCAL=["diy-p","diy-s"];
  const L="ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  CATEGORIES.forEach(cat=>{
    const present=participants.filter(p=>p.attendance==="present"&&p.categories.includes(cat.id));
    if(!present.length){catData[cat.id]={groups:{},matches:[]};return;}

    // ── Manual group assignment (non-DIY) ─────────────────
    if(!DIY_CATS_LOCAL.includes(cat.id)&&manualGroups&&manualGroups[cat.id]){
      const assignments=manualGroups[cat.id];
      const groupLetters=[...new Set(Object.values(assignments))].sort();
      if(groupLetters.length>0){
        const groups={};const fieldGroupRounds={};
        groupLetters.forEach(letter=>{
          const members=present.filter(p=>assignments[p.id]===letter);
          if(!members.length)return;
          groups[letter]=members.map(p=>({id:p.id,name:p.name,group:letter,P:0,W:0,D:0,L:0,GF:0,GA:0,GD:0,Pts:0}));
          const fc=FIELD_CONFIG[cat.id].count;
          const field=(groupFieldMaps[cat.id]||{})[letter]||(L.indexOf(letter)%fc)+1;
          if(!fieldGroupRounds[field])fieldGroupRounds[field]={};
          fieldGroupRounds[field][letter]=genRRRounds(members).map((round,ri)=>
            round.map((pair,mi)=>({
              id:`${cat.id}-${letter}-${ri}-${mi}`,catId:cat.id,group:letter,
              p1:pair[0].id,p2:pair[1].id,p1name:pair[0].name,p2name:pair[1].name,
              score1:null,score2:null,status:"pending",field
            }))
          );
        });
        const interleavedMatches=[];
        Object.keys(fieldGroupRounds).sort((a,b)=>Number(a)-Number(b)).forEach(field=>{
          const groupLabels=Object.keys(fieldGroupRounds[field]);
          const allGroupRounds=fieldGroupRounds[field];
          const maxRounds=Math.max(...groupLabels.map(g=>allGroupRounds[g].length));
          for(let ri=0;ri<maxRounds;ri++){
            const roundPerGroup=groupLabels.map(g=>allGroupRounds[g][ri]||[]);
            const maxMatchesInRound=Math.max(...roundPerGroup.map(m=>m.length));
            for(let mi=0;mi<maxMatchesInRound;mi++){
              roundPerGroup.forEach(gm=>{if(gm[mi])interleavedMatches.push(gm[mi]);});
            }
          }
        });
        catData[cat.id]={groups,matches:interleavedMatches};
        return;
      }
    }

    // ── DIY Soccer area split ──────────────────────────────
    if(DIY_CATS_LOCAL.includes(cat.id)&&diyAreas&&diyAreas[cat.id]){
      const areaMap=diyAreas[cat.id];
      const area1=present.filter(p=>areaMap[p.id]==="1");
      const area2=present.filter(p=>areaMap[p.id]==="2");
      const unassigned=present.filter(p=>!areaMap[p.id]);
      // Merge unassigned into whichever area is smaller
      unassigned.forEach((p,i)=>{if(i%2===0)area1.push(p);else area2.push(p);});
      const fc=FIELD_CONFIG[cat.id].count;
      const halfFields=Math.floor(fc/2);
      const area1Fields=Array.from({length:halfFields},(_,i)=>i+1);
      const area2Fields=Array.from({length:fc-halfFields},(_,i)=>i+halfFields+1);
      const groups={};const fieldGroupRounds={};
      const processArea=(members,fields)=>{
        if(!members.length)return;
        const sizes=calcGroupSizes(members.length);
        let idx=0;
        sizes.forEach((size,gi)=>{
          const letter=L[gi+(groups?Object.keys(groups).length:0)];
          const aMembers=members.slice(idx,idx+size);idx+=size;
          groups[letter]=aMembers.map(p=>({id:p.id,name:p.name,group:letter,P:0,W:0,D:0,L:0,GF:0,GA:0,GD:0,Pts:0}));
          const field=fields[gi%fields.length];
          if(!fieldGroupRounds[field])fieldGroupRounds[field]={};
          fieldGroupRounds[field][letter]=genRRRounds(aMembers).map((round,ri)=>
            round.map((pair,mi)=>({
              id:`${cat.id}-${letter}-${ri}-${mi}`,catId:cat.id,group:letter,
              p1:pair[0].id,p2:pair[1].id,p1name:pair[0].name,p2name:pair[1].name,
              score1:null,score2:null,status:"pending",field
            }))
          );
        });
      };
      processArea(area1,area1Fields);
      processArea(area2,area2Fields);
      const interleavedMatches=[];
      Object.keys(fieldGroupRounds).sort((a,b)=>Number(a)-Number(b)).forEach(field=>{
        const groupLabels=Object.keys(fieldGroupRounds[field]);
        const allGroupRounds=fieldGroupRounds[field];
        const maxRounds=Math.max(...groupLabels.map(g=>allGroupRounds[g].length));
        for(let ri=0;ri<maxRounds;ri++){
          const roundPerGroup=groupLabels.map(g=>allGroupRounds[g][ri]||[]);
          const maxMatchesInRound=Math.max(...roundPerGroup.map(m=>m.length));
          for(let mi=0;mi<maxMatchesInRound;mi++){
            roundPerGroup.forEach(gm=>{if(gm[mi])interleavedMatches.push(gm[mi]);});
          }
        }
      });
      catData[cat.id]={groups,matches:interleavedMatches};
      return;
    }

    // ── Default auto-generate ──────────────────────────────
    const sizes=calcGroupSizes(present.length),groups={};
    let idx=0;
    const fieldGroupRounds={}; // {field: {groupLabel: [[match,...], [match,...], ...]}}
    sizes.forEach((size,gi)=>{
      const label=L[gi],members=present.slice(idx,idx+size);idx+=size;
      // Assign side for DIY Soccer categories
      const catSides=DIY_SIDES[cat.id];
      let side="";
      if(catSides){
        const sideAFields=catSides.sideA.fields;
        const fmap2=groupFieldMaps[cat.id]||{},fc2=FIELD_CONFIG[cat.id].count;
        const fieldForGroup=fmap2[label]||(gi%fc2)+1;
        side=sideAFields.includes(fieldForGroup)?"A":"B";
      }
      groups[label]=members.map(p=>({id:p.id,name:p.name,group:label,side,P:0,W:0,D:0,L:0,GF:0,GA:0,GD:0,Pts:0}));
      const fmap=groupFieldMaps[cat.id]||{},fc=FIELD_CONFIG[cat.id].count,field=fmap[label]||(gi%fc)+1;
      if(!fieldGroupRounds[field])fieldGroupRounds[field]={};
      // Generate Berger rounds for this group
      fieldGroupRounds[field][label]=genRRRounds(members).map((round,ri)=>
        round.map((pair,mi)=>({
          id:`${cat.id}-${label}-${ri}-${mi}`,catId:cat.id,group:label,
          p1:pair[0].id,p2:pair[1].id,p1name:pair[0].name,p2name:pair[1].name,
          score1:null,score2:null,status:"pending",field
        }))
      );
    });
    // Interleave by ROUND then by MATCH within round
    // Round 1: GroupA-M1, GroupH-M1, GroupA-M2, GroupH-M2, GroupA-M3, GroupH-M3
    // Round 2: GroupA-M1, GroupH-M1, GroupA-M2, GroupH-M2, ...
    // This ensures max rest: player rests for (groupCount * matchesPerRound) - 1 matches
    const interleavedMatches=[];
    Object.keys(fieldGroupRounds).sort((a,b)=>Number(a)-Number(b)).forEach(field=>{
      const groupLabels=Object.keys(fieldGroupRounds[field]);
      const allGroupRounds=fieldGroupRounds[field];
      const maxRounds=Math.max(...groupLabels.map(g=>allGroupRounds[g].length));
      for(let ri=0;ri<maxRounds;ri++){
        // Get this round's match arrays for each group
        const roundPerGroup=groupLabels.map(g=>allGroupRounds[g][ri]||[]);
        const maxMatchesInRound=Math.max(...roundPerGroup.map(m=>m.length));
        // Interleave: for each match slot, take one from each group
        for(let mi=0;mi<maxMatchesInRound;mi++){
          roundPerGroup.forEach(groupMatches=>{
            if(groupMatches[mi])interleavedMatches.push(groupMatches[mi]);
          });
        }
      }
    });
    catData[cat.id]={groups,matches:interleavedMatches};
  });
  return catData;
}

// ── Knockout bracket helpers ──────────────────────────────
function getRoundName(matchCount){
  if(matchCount>=16)return`Round of ${matchCount*2}`;
  if(matchCount===8)return"Round of 16";
  if(matchCount===4)return"Quarter Finals";
  if(matchCount===2)return"Semi Finals";
  return"Final";
}
function generateKnockoutBracket(catId,catData){
  const cd=catData[catId];
  if(!cd?.matches?.length)return null;
  if(!cd.matches.every(m=>m.status==="completed"))return null;
  const standings=calcStandings(cd.groups,cd.matches);
  const groups=Object.keys(standings).sort();
  if(groups.length<2)return null;
  const totalQual=groups.length*2;
  let bracketSize=2;while(bracketSize<totalQual)bracketSize*=2;
  // FIFA cross seeding: pair groups (A,B),(C,D)...
  // 1st A vs 2nd B, 1st B vs 2nd A, 1st C vs 2nd D, 1st D vs 2nd C
  const r1=[];
  for(let i=0;i<groups.length;i+=2){
    const gA=groups[i],gB=groups[i+1];
    const sA=standings[gA]||[],sB=gB?(standings[gB]||[]):[];
    if(gB){
      r1.push({id:`ko-${catId}-0-${r1.length}`,
        p1:sA[0]?{id:sA[0].id,name:sA[0].name,seed:`1${gA}`}:null,
        p2:sB[1]?{id:sB[1].id,name:sB[1].name,seed:`2${gB}`}:null,
        score1:null,score2:null,status:"pending",winnerId:null,winnerName:null,winnerSeed:null});
      r1.push({id:`ko-${catId}-0-${r1.length}`,
        p1:sB[0]?{id:sB[0].id,name:sB[0].name,seed:`1${gB}`}:null,
        p2:sA[1]?{id:sA[1].id,name:sA[1].name,seed:`2${gA}`}:null,
        score1:null,score2:null,status:"pending",winnerId:null,winnerName:null,winnerSeed:null});
    } else {
      const bp=sA[0];
      r1.push({id:`ko-${catId}-0-${r1.length}`,
        p1:bp?{id:bp.id,name:bp.name,seed:`1${gA}`}:null,p2:null,
        score1:1,score2:0,status:"bye",winnerId:bp?.id,winnerName:bp?.name,winnerSeed:`1${gA}`});
    }
  }
  while(r1.length<bracketSize/2){
    r1.push({id:`ko-${catId}-0-${r1.length}`,p1:null,p2:null,score1:null,score2:null,status:"bye",winnerId:null,winnerName:null,winnerSeed:null});
  }
  const rounds=[r1];
  let prev=r1;
  while(prev.length>1){
    const nextCount=Math.ceil(prev.length/2);
    const next=Array.from({length:nextCount},(_,i)=>({
      id:`ko-${catId}-${rounds.length}-${i}`,p1:null,p2:null,
      score1:null,score2:null,status:"waiting",winnerId:null,winnerName:null,winnerSeed:null
    }));
    prev.forEach((m,mi)=>{
      if((m.status==="bye"||m.status==="completed")&&m.winnerId){
        const ni=Math.floor(mi/2),slot=mi%2===0?"p1":"p2";
        next[ni][slot]={id:m.winnerId,name:m.winnerName,seed:m.winnerSeed};
        if(next[ni].p1&&next[ni].p2)next[ni].status="pending";
      }
    });
    rounds.push(next);prev=next;
  }
  return{bracketSize,rounds,generated:true};
}
function calcStandings(groups,matches){
  const s={};
  Object.entries(groups).forEach(([g,members])=>{members.forEach(m=>{s[m.id]={...m};});});
  matches.filter(m=>m.status==="completed").forEach(m=>{
    if(!s[m.p1]||!s[m.p2])return;
    const a=s[m.p1],b=s[m.p2];
    a.P++;b.P++;a.GF+=m.score1;a.GA+=m.score2;b.GF+=m.score2;b.GA+=m.score1;
    if(m.score1>m.score2){a.W++;a.Pts+=3;b.L++;}
    else if(m.score1<m.score2){b.W++;b.Pts+=3;a.L++;}
    else{a.D++;a.Pts++;b.D++;b.Pts++;}
  });
  Object.values(s).forEach(p=>{p.GD=p.GF-p.GA;});
  const byGroup={};
  Object.values(s).forEach(p=>{if(!byGroup[p.group])byGroup[p.group]=[];byGroup[p.group].push(p);});
  Object.keys(byGroup).forEach(k=>byGroup[k].sort((a,b)=>b.Pts-a.Pts||b.GD-a.GD||b.GF-a.GF));
  return byGroup;
}
function defaultGroupFieldMaps(){
  const maps={};
  CATEGORIES.forEach(cat=>{const fc=FIELD_CONFIG[cat.id];maps[cat.id]={};["A","B","C"].forEach((g,i)=>{maps[cat.id][g]=(i%fc.count)+1;});});
  return maps;
}

// ═══════════════════════════════════════════════════════════
export default function WRGDashboard(){
  const [view,setView]             = useState("public");
  const [adminTab,setAdminTab]     = useState("participants");
  const [activeCat,setActiveCat]   = useState("diy-p");
  const [pubTab,setPubTab]         = useState("fields");
  const [activeSide,setActiveSide]   = useState("A");
  const [manualGroups,setManualGroups] = useState({});   // {catId: {pid: "A"|"B"|"C"...}}
  const [diyAreas,setDiyAreas]         = useState({});   // {catId: {pid: "1"|"2"}}
  const [setupCat,setSetupCat]         = useState(null); // which cat is being configured
  const [data,setData]             = useState(null);
  const [auth,setAuth]             = useState({judge:false,admin:false});
  const [pinModal,setPinModal]     = useState({open:false,target:null,input:"",error:false,shake:false});
  const [flash,setFlash]           = useState(null);
  const [participants,setParticipants] = useState([]);
  const [addForm,setAddForm]       = useState({name:"",cats:[],studentId:"",side:""});
  const [editingId,setEditingId]   = useState(null);
  const [searchQ,setSearchQ]       = useState("");
  const [attFilter,setAttFilter]   = useState("all");
  const [catFilter,setCatFilter]   = useState(null);
  const [groupFieldMaps,setGroupFieldMaps] = useState(()=>defaultGroupFieldMaps());
  const [scoreModal,setScoreModal] = useState(null);
  const [scoreInput,setScoreInput] = useState({s1:"",s2:""});
  const [judgeCategory,setJudgeCategory] = useState(null);
  const [judgeField,setJudgeField] = useState(null);
  const [sidebarOpen,setSidebarOpen] = useState(false);
  const [scoringCat,setScoringCat]   = useState(CATEGORIES[0]?.id||"diy-p");
  const [scoringField,setScoringField] = useState(1);
  const [teamForm,setTeamForm]     = useState({name:"",category:"open2",players:["",""]});
  const [teamTab,setTeamTab]       = useState("list");
  const [syncing,setSyncing]       = useState(true);
  const [playerSearch,setPlayerSearch] = useState("");
  const [searchResults,setSearchResults] = useState([]);
  const [showSearch,setShowSearch] = useState(false);
  const [knockoutData,setKnockoutData]   = useState({});
  const [scoreCat,setScoreCat]           = useState(null);
  const [scoreField,setScoreField]       = useState(null);
  const [koScoreModal,setKoScoreModal] = useState(null);
  const [koScoreInput,setKoScoreInput] = useState({s1:"",s2:""});

  // ── Save to Firebase ─────────────────────────────────────
  const saveState = async (stateData) => {
    try {
      await setDoc(STATE_REF, {
        participants: stateData.participants || [],
        groupFieldMaps: stateData.groupFieldMaps || {},
        tournamentData: stateData.tournamentData || null,
        knockoutData: stateData.knockoutData || {},
        updatedAt: Date.now()
      });
    } catch(e) {
      console.error("Firebase save error:", e);
      showFlash("⚠ Save failed");
    }
  };

  // ── Firebase real-time sync ──────────────────────────────
  useEffect(()=>{
    const unsub = onSnapshot(STATE_REF, (snap)=>{
      if(snap.exists()){
        const d = snap.data();
        if(d.participants) setParticipants(d.participants);
        if(d.groupFieldMaps) setGroupFieldMaps(d.groupFieldMaps);
        setData(d.tournamentData || null);
        if(d.knockoutData) setKnockoutData(d.knockoutData);
      } else {
        // First time — initialise with empty state
        setParticipants([]);
        setGroupFieldMaps(defaultGroupFieldMaps());
        setData(null);
      }
      setSyncing(false);
    }, (err)=>{
      console.error("Sync error:", err);
      setSyncing(false);
    });
    return ()=>unsub();
  },[]);

  const isGenerated=!!data;
  const cat=CATEGORIES.find(c=>c.id===activeCat);
  const accent=cat.color;
  const fieldCfg=FIELD_CONFIG[activeCat];
  const catData=data?.[activeCat]||{groups:{},matches:[]};
  const catMatches=catData.matches||[];
  const pending=catMatches.filter(m=>m.status==="pending");
  const held=catMatches.filter(m=>m.status==="held");
  const completed=catMatches.filter(m=>m.status==="completed");
  const standings=useMemo(()=>isGenerated?calcStandings(catData.groups||{},catMatches):{},[catData,catMatches]);
  const busyPlayers=useMemo(()=>{
    if(!data)return new Set();
    const s=new Set();
    Object.values(data).forEach(cd=>{(cd.matches||[]).filter(m=>m.status==="held").forEach(m=>{s.add(m.p1);s.add(m.p2);});});
    return s;
  },[data]);
  const fieldData=useMemo(()=>{
    const fields={};
    for(let f=1;f<=fieldCfg.count;f++){
      const fp=pending.filter(m=>m.field===f),fh=held.filter(m=>m.field===f);
      fields[f]={live:fp[0]||null,next:fp[1]||null,heldList:fh};
    }
    return fields;
  },[pending,held,fieldCfg.count]);
  const comingUp=useMemo(()=>{
    const li=new Set(Object.values(fieldData).filter(f=>f.live).map(f=>f.live.id));
    const ni=new Set(Object.values(fieldData).filter(f=>f.next).map(f=>f.next.id));
    return pending.filter(m=>!li.has(m.id)&&!ni.has(m.id)).slice(0,6);
  },[pending,fieldData]);
  const presentCount=participants.filter(p=>p.attendance==="present").length;
  const absentCount=participants.filter(p=>p.attendance==="absent").length;
  const unmarkedCount=participants.filter(p=>!p.attendance).length;
  const attFiltered=useMemo(()=>participants
    .filter(p=>p.name.toLowerCase().includes(searchQ.toLowerCase())||(p.studentId||"").toLowerCase().includes(searchQ.toLowerCase()))
    .filter(p=>!catFilter||p.categories.includes(catFilter))
    .filter(p=>attFilter==="all"||(attFilter==="present"&&p.attendance==="present")||(attFilter==="absent"&&p.attendance==="absent")||(attFilter==="unmarked"&&!p.attendance))
  ,[participants,searchQ,catFilter,attFilter]);

  function showFlash(msg){setFlash(msg);setTimeout(()=>setFlash(null),3000);}

  // ── Player search across all categories ─────────────────
  function searchPlayer(query){
    setPlayerSearch(query);
    if(!query.trim()||!data){setSearchResults([]);return;}
    const q=query.toLowerCase().trim();
    const results=[];
    CATEGORIES.forEach(cat=>{
      const cd=data[cat.id];
      if(!cd)return;
      const fc=FIELD_CONFIG[cat.id];
      // Find all matches involving this player
      (cd.matches||[]).forEach(m=>{
        const p1match=m.p1name?.toLowerCase().includes(q);
        const p2match=m.p2name?.toLowerCase().includes(q);
        if(!p1match&&!p2match)return;
        const playerName=p1match?m.p1name:m.p2name;
        // Check if already added this player for this category
        if(!results.find(r=>r.playerId===(p1match?m.p1:m.p2)&&r.catId===cat.id)){
          // Get standings for this player
          const grpStandings=[];
          Object.entries(cd.groups||{}).forEach(([g,members])=>{
            const member=members.find(mb=>mb.id===(p1match?m.p1:m.p2));
            if(member){
              const allMatches=(cd.matches||[]).filter(mx=>mx.group===g&&mx.status==="completed");
              let P=0,W=0,D=0,L=0,GF=0,GA=0,Pts=0;
              allMatches.forEach(mx=>{
                const isP1=mx.p1===(p1match?m.p1:m.p2);
                const isP2=mx.p2===(p1match?m.p1:m.p2);
                if(!isP1&&!isP2)return;
                P++;
                const s=isP1?mx.score1:mx.score2;
                const o=isP1?mx.score2:mx.score1;
                GF+=s;GA+=o;
                if(s>o){W++;Pts+=3;}
                else if(s<o){L++;}
                else{D++;Pts++;}
              });
              grpStandings.push({group:g,P,W,D,L,GF,GA,GD:GF-GA,Pts});
            }
          });
          // Find next match
          const nextMatch=(cd.matches||[]).find(mx=>
            (mx.p1===(p1match?m.p1:m.p2)||mx.p2===(p1match?m.p1:m.p2))&&mx.status==="pending"
          );
          const heldMatch=(cd.matches||[]).find(mx=>
            (mx.p1===(p1match?m.p1:m.p2)||mx.p2===(p1match?m.p1:m.p2))&&mx.status==="held"
          );
          const allPlayerMatches=(cd.matches||[]).filter(mx=>
            mx.p1===(p1match?m.p1:m.p2)||mx.p2===(p1match?m.p1:m.p2)
          );
          const completedMatches=allPlayerMatches.filter(mx=>mx.status==="completed");
          results.push({
            playerId:p1match?m.p1:m.p2,
            playerName,
            catId:cat.id,
            catName:cat.name,
            catIcon:cat.icon,
            catColor:cat.color,
            group:m.group,
            field:m.field,
            fieldLabel:fc.label,
            nextMatch,
            heldMatch,
            totalMatches:allPlayerMatches.length,
            completedMatches:completedMatches.length,
            standings:grpStandings[0]||null,
          });
        }
      });
    });
    setSearchResults(results);
  }
  // ── Knockout functions ──────────────────────────────────
  function triggerGenerateKnockout(catId){
    if(!data)return;
    const bracket=generateKnockoutBracket(catId,data);
    if(!bracket){showFlash("⚠ Complete all group matches first");return;}
    const updated={...knockoutData,[catId]:bracket};
    setKnockoutData(updated);
    saveState({participants,groupFieldMaps,tournamentData:data,knockoutData:updated});
    showFlash("🏆 Knockout bracket generated!");
  }
  function updateKnockoutScore(catId,roundIdx,matchIdx){
    const s1=parseInt(koScoreInput.s1),s2=parseInt(koScoreInput.s2);
    if(isNaN(s1)||isNaN(s2)||s1===s2){showFlash("⚠ No draws in knockout — one must win");return;}
    const ko=knockoutData[catId];if(!ko)return;
    const newRounds=ko.rounds.map(r=>[...r]);
    const m=newRounds[roundIdx][matchIdx];
    const winnerId=s1>s2?m.p1.id:m.p2.id;
    const winnerName=s1>s2?m.p1.name:m.p2.name;
    const winnerSeed=s1>s2?m.p1.seed:m.p2.seed;
    newRounds[roundIdx][matchIdx]={...m,score1:s1,score2:s2,status:"completed",winnerId,winnerName,winnerSeed};
    // Auto-advance winner
    if(newRounds[roundIdx+1]){
      const ni=Math.floor(matchIdx/2),slot=matchIdx%2===0?"p1":"p2";
      newRounds[roundIdx+1][ni]={...newRounds[roundIdx+1][ni],[slot]:{id:winnerId,name:winnerName,seed:winnerSeed}};
      if(newRounds[roundIdx+1][ni].p1&&newRounds[roundIdx+1][ni].p2)newRounds[roundIdx+1][ni].status="pending";
    }
    const updated={...knockoutData,[catId]:{...ko,rounds:newRounds}};
    setKnockoutData(updated);
    saveState({participants,groupFieldMaps,tournamentData:data,knockoutData:updated});
    setKoScoreModal(null);
    showFlash("✓ Score saved — winner advances!");
  }

  function confirmManualDraw(catId, slots){
    // Build bracket from manual slot assignment
    const rounds=[];
    const r1=slots.map((slot,idx)=>({
      id:`ko-${catId}-0-${idx}`,
      p1:slot?{id:slot.id,name:slot.name,seed:slot.seed}:null,
      p2:null,score1:null,score2:null,status:"pending",
      winnerId:null,winnerName:null,winnerSeed:null
    }));
    // Pair slots: slot 0 vs slot 1, slot 2 vs slot 3, etc.
    const r1Paired=[];
    for(let i=0;i<r1.length;i+=2){
      r1Paired.push({
        id:`ko-${catId}-0-${i/2}`,
        p1:r1[i]?.p1||null,
        p2:r1[i+1]?.p1||null,
        score1:null,score2:null,status:"pending",
        winnerId:null,winnerName:null,winnerSeed:null
      });
    }
    rounds.push(r1Paired);
    let prev=r1Paired;
    while(prev.length>1){
      const next=Array.from({length:Math.ceil(prev.length/2)},(_,i)=>({
        id:`ko-${catId}-${rounds.length}-${i}`,p1:null,p2:null,
        score1:null,score2:null,status:"waiting",winnerId:null,winnerName:null,winnerSeed:null
      }));
      rounds.push(next);prev=next;
    }
    const updated={...knockoutData,[catId]:{bracketSize:slots.length,rounds,generated:true,manualDraw:true}};
    setKnockoutData(updated);
    saveState({participants,groupFieldMaps,tournamentData:data,knockoutData:updated});
    showFlash("🏆 Bracket confirmed!");
  }

  // ── Manual group & area helpers ─────────────────────────
  const DIY_CATS = ["diy-p","diy-s"];
  const MANUAL_CATS = CATEGORIES.filter(c=>!DIY_CATS.includes(c.id)).map(c=>c.id);

  function assignToGroup(catId, pid, group){
    setManualGroups(prev=>{
      const updated={...prev,[catId]:{...(prev[catId]||{}),[pid]:group}};
      return updated;
    });
  }
  function assignToDiyArea(catId, pid, area){
    setDiyAreas(prev=>({...prev,[catId]:{...(prev[catId]||{}),[pid]:area}}));
  }
  function getParticipantsForCat(catId){
    return participants.filter(p=>p.attendance==="present"&&p.categories.includes(catId));
  }
  function getGroupsForCat(catId){
    const assignments=manualGroups[catId]||{};
    const groups={};
    Object.entries(assignments).forEach(([pid,grp])=>{
      if(!groups[grp])groups[grp]=[];
      groups[grp].push(pid);
    });
    return groups;
  }
  function autoSplitDIY(catId){
    const pList=getParticipantsForCat(catId);
    const half=Math.ceil(pList.length/2);
    const areas={};
    pList.forEach((p,i)=>{areas[p.id]=i<half?"1":"2";});
    setDiyAreas(prev=>({...prev,[catId]:areas}));
    showFlash("Auto-split evenly between Area 1 & Area 2");
  }
  function clearGroupAssignments(catId){
    setManualGroups(prev=>{const n={...prev};delete n[catId];return n;});
    showFlash("Group assignments cleared");
  }

  function requestView(t){
    if(t==="public"){setView("public");setSidebarOpen(false);return;}
    if(auth[t]){setView(t);setSidebarOpen(false);return;}
    setPinModal({open:true,target:t,input:"",error:false,shake:false});
  }
  function submitPin(){
    const{target,input}=pinModal;
    if(input===PINS[target]){setAuth(a=>({...a,[target]:true}));setView(target);setPinModal(p=>({...p,open:false}));}
    else{setPinModal(p=>({...p,error:true,shake:true,input:""}));setTimeout(()=>setPinModal(p=>({...p,shake:false})),600);}
  }
  function lockView(){setAuth(a=>({...a,[view]:false}));setJudgeField(null);setJudgeCategory(null);setView("public");}
  function addParticipant(){
    if(!addForm.name.trim()||!addForm.cats.length)return;
    // Duplicate check by name or ID
    const nameLower=addForm.name.trim().toLowerCase();
    const dup=participants.find(p=>
      p.name.toLowerCase()===nameLower||
      (addForm.studentId&&p.studentId&&p.studentId===addForm.studentId)
    );
    if(dup){
      // Merge categories instead of adding duplicate
      const merged=[...new Set([...dup.categories,...addForm.cats])];
      const updated=participants.map(p=>p.id===dup.id?{...p,categories:merged,studentId:addForm.studentId||dup.studentId}:p);
      setParticipants(updated);
      saveState({participants:updated,groupFieldMaps,tournamentData:data,knockoutData});
      setAddForm({name:"",cats:[],studentId:"",side:""});
      showFlash(`↗ Merged categories into existing "${dup.name}"`);
      return;
    }
    const newP={id:`p${Date.now()}`,name:addForm.name.trim(),studentId:addForm.studentId||"",side:addForm.side||"",categories:addForm.cats,attendance:null};
    const updated=[...participants,newP];
    setParticipants(updated);
    saveState({participants:updated,groupFieldMaps,tournamentData:data});
    setAddForm({name:"",cats:[]});showFlash(`✓ ${addForm.name.trim()} added`);
  }
  function removeParticipant(id){
    const updated=participants.filter(p=>p.id!==id);
    setParticipants(updated);
    saveState({participants:updated,groupFieldMaps,tournamentData:data});
    showFlash("Participant removed");
  }
  function toggleAddCat(cid){setAddForm(f=>({...f,cats:f.cats.includes(cid)?f.cats.filter(c=>c!==cid):[...f.cats,cid]}));}
  function markAttendance(id,status){
    const updated=participants.map(p=>p.id===id?{...p,attendance:status}:p);
    setParticipants(updated);
    saveState({participants:updated,groupFieldMaps,tournamentData:data});
  }
  function markAllPresent(){
    const updated=participants.map(p=>({...p,attendance:"present"}));
    setParticipants(updated);
    saveState({participants:updated,groupFieldMaps,tournamentData:data});
    showFlash("✓ All marked PRESENT");
  }
  function markAllAbsent(){
    const updated=participants.map(p=>({...p,attendance:"absent"}));
    setParticipants(updated);
    saveState({participants:updated,groupFieldMaps,tournamentData:data});
  }
  function generateTournamentHandler(){
    if(presentCount===0){showFlash("⚠ No participants marked present");return;}
    const tournament=generateTournament(participants,groupFieldMaps,manualGroups,diyAreas);
    setData(tournament);
    saveState({participants,groupFieldMaps,tournamentData:tournament});
    setAdminTab("overview");showFlash("🏆 Tournament is LIVE!");
  }
  function resetTournament(){
    const resetParts=participants.map(p=>({...p,attendance:null}));
    const resetMaps=defaultGroupFieldMaps();
    setData(null);
    setParticipants(resetParts);
    setGroupFieldMaps(resetMaps);
    setJudgeCategory(null);setJudgeField(null);setAdminTab("participants");
    saveState({participants:resetParts,groupFieldMaps:resetMaps,tournamentData:null});
    showFlash("Tournament reset");
  }
  function clearAllParticipants(){
    setParticipants([]);
    saveState({participants:[],groupFieldMaps:defaultGroupFieldMaps(),tournamentData:null});
    setData(null);
    showFlash("✓ All participants cleared");
  }
  // ── Team functions ──────────────────────────────────────
  function selectTeamCategory(catId){
    const count=TEAM_CATEGORIES[catId]?.playerCount||2;
    setTeamForm(f=>({...f,category:catId,players:Array(count).fill("")}));
  }
  function addTeam(){
    const{name,category,players}=teamForm;
    if(!name.trim())return;
    const validPlayers=players.filter(p=>p.trim());
    const team={
      id:`team_${Date.now()}`,
      name:name.trim(),
      categories:[category],
      attendance:null,
      isTeam:true,
      players:validPlayers
    };
    const updated=[...participants,team];
    setParticipants(updated);
    saveState({participants:updated,groupFieldMaps,tournamentData:data,knockoutData});
    setTeamForm(f=>({...f,name:"",players:Array(TEAM_CATEGORIES[f.category]?.playerCount||2).fill("")}));
    showFlash(`✓ Team "${name.trim()}" registered`);
  }
  function updateTeamPlayer(idx,val){
    setTeamForm(f=>({...f,players:f.players.map((p,i)=>i===idx?val:p)}));
  }

  function assignGroup(catId,group,fieldNum){
    const updated={...groupFieldMaps,[catId]:{...(groupFieldMaps[catId]||{}),[group]:fieldNum}};
    setGroupFieldMaps(updated);
    saveState({participants,groupFieldMaps:updated,tournamentData:data});
  }
  function getGroupFieldMap(catId,groups,fieldCount){
    const existing=groupFieldMaps[catId]||{};const result={};
    groups.forEach((g,i)=>{result[g]=existing[g]||(i%fieldCount)+1;});return result;
  }
  function updateMatch(matchId,updates){
    setData(prev=>{
      const next={...prev};
      Object.keys(next).forEach(cid=>{next[cid]={...next[cid],matches:next[cid].matches.map(m=>m.id===matchId?{...m,...updates}:m)};});
      saveState({participants,groupFieldMaps,tournamentData:next});
      return next;
    });
  }
  function holdMatch(id){updateMatch(id,{status:"held"});showFlash("⏸ Match on hold");}
  function releaseMatch(id){updateMatch(id,{status:"pending"});showFlash("▶ Match released");}
  function openScoreModal(m){setScoreModal({matchId:m.id,p1name:m.p1name,p2name:m.p2name});setScoreInput({s1:"",s2:""});}
  function submitScore(){
    const s1=parseInt(scoreInput.s1),s2=parseInt(scoreInput.s2);
    if(isNaN(s1)||isNaN(s2)||s1<0||s2<0)return;
    updateMatch(scoreModal.matchId,{score1:s1,score2:s2,status:"completed"});
    setScoreModal(null);showFlash("✓ Score recorded!");
  }
  function selectJudgeCategory(cid){setJudgeCategory(cid);setJudgeField(null);}
  function selectJudgeField(label,number){setJudgeField({label,number});}
  function changeJudgeCategory(){setJudgeCategory(null);setJudgeField(null);}

  const G="#00e664"; // primary green
  const BG="#050e08";
  const S1="rgba(8,20,12,0.95)";
  const S2="rgba(12,28,16,0.9)";
  const BD="rgba(0,230,100,0.08)";
  const BDH="rgba(0,230,100,0.2)";

  if(syncing) return(
    <div style={{background:"#050e08",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Barlow',sans-serif"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontFamily:"'Bebas Neue'",fontSize:48,color:"#00e664",letterSpacing:6,opacity:0.3,marginBottom:16}}>WRG 2026</div>
        <div style={{width:40,height:40,border:"3px solid rgba(0,230,100,0.2)",borderTop:"3px solid #00e664",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto"}}/>
        <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
        <div style={{fontSize:12,color:"rgba(0,230,100,0.4)",marginTop:14,letterSpacing:2}}>CONNECTING...</div>
      </div>
    </div>
  );

  return(
    <div style={{fontFamily:"'Barlow',sans-serif",background:BG,minHeight:"100vh",color:"#e8f5ee",display:"flex",flexDirection:"column"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        html,body,#root{background:#050e08;overscroll-behavior:none;-webkit-text-size-adjust:100%;}
        body::before{content:'';position:fixed;inset:0;
          background:radial-gradient(ellipse at 0% 50%,rgba(0,230,100,0.04) 0%,transparent 50%),
            radial-gradient(ellipse at 100% 0%,rgba(0,212,255,0.03) 0%,transparent 50%);
          pointer-events:none;z-index:0;}
        #root{position:relative;z-index:1;}

        /* ── BASE ── */
        .hbtn{cursor:pointer;border:none;font-family:'Barlow',sans-serif;transition:all .18s;position:relative;overflow:hidden;}
        .hbtn:hover{filter:brightness(1.1);}
        .hbtn:active{transform:scale(.97);}
        .mrow{transition:background .12s;}
        .mrow:hover{background:rgba(0,230,100,0.04)!important;}
        .fadein{animation:fi .3s ease both;}
        @keyframes fi{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .scalein{animation:sc .28s cubic-bezier(.34,1.56,.64,1) both;}
        @keyframes sc{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}
        .blink{animation:bk 1.8s ease-in-out infinite;}
        @keyframes bk{0%,100%{opacity:1}50%{opacity:.15}}
        .pulse{animation:pu 2s ease-in-out infinite;}
        @keyframes pu{0%{box-shadow:0 0 0 0 rgba(239,68,68,.5)}70%{box-shadow:0 0 0 10px rgba(239,68,68,0)}100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}}
        .shake{animation:sh .4s ease both;}
        @keyframes sh{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}
        input:focus,textarea:focus{outline:none;}
        input::-webkit-inner-spin-button{-webkit-appearance:none;}
        ::-webkit-scrollbar{width:3px;height:3px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:rgba(0,230,100,0.2);border-radius:4px;}

        /* ── PLAYER NAME — handles 40-45 char Malaysian names ── */
        .player-name{
          font-weight:700;
          font-family:'Barlow',sans-serif;
          line-height:1.25;
          word-break:break-word;
          hyphens:auto;
        }
        .player-name-lg{font-size:clamp(13px,1.6vw,16px);}
        .player-name-md{font-size:clamp(11px,1.3vw,14px);}
        .player-name-sm{font-size:clamp(10px,1.1vw,12px);}
        .name-clamp2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
        .name-clamp1{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}

        /* ── LAYOUT CONTAINERS ── */
        .app-body{display:flex;flex:1;position:relative;}
        .sidebar-wrap{
          width:210px;background:rgba(5,12,8,0.98);
          backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
          border-right:1px solid rgba(0,230,100,0.08);
          position:fixed;top:54px;bottom:0;left:0;z-index:100;
          display:flex;flex-direction:column;overflow-y:auto;
          transition:transform .25s cubic-bezier(.4,0,.2,1);
        }
        .main-wrap{
          flex:1;
          transition:margin .25s;
          min-height:calc(100vh - 54px);
        }
        .main-inner{margin:0 auto;padding:20px 24px;}

        /* ── FIELD GRID ── */
        .field-grid{display:grid;gap:12px;}

        /* ── MATCH CARD LAYOUT — vertical stack for long names ── */
        .match-vs-block{display:flex;flex-direction:column;gap:6px;width:100%;}
        .match-player{
          width:100%;
          padding:6px 10px;
          background:rgba(0,0,0,0.25);
          border-radius:7px;
          border:1px solid rgba(0,230,100,0.08);
        }
        .match-player.p2{border-color:rgba(0,230,100,0.06);}
        .vs-center{
          display:flex;align-items:center;justify-content:center;
          gap:8px;padding:2px 0;
        }
        .vs-badge{
          background:rgba(0,230,100,0.1);
          border:1px solid rgba(0,230,100,0.2);
          border-radius:6px;padding:3px 14px;
          font-family:'Bebas Neue';font-size:13px;
          color:rgba(0,230,100,0.7);letter-spacing:3px;
        }
        .vs-line{flex:1;height:1px;background:rgba(0,230,100,0.08);}
        /* Compact single-line for lists */
        .match-row-compact{display:flex;align-items:center;gap:6px;width:100%;min-width:0;}
        .match-row-compact .pname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .match-row-compact .pvs{flex-shrink:0;font-size:9px;color:rgba(0,230,100,0.3);font-weight:700;}

        /* ── HORIZONTAL CAT SCROLL (mobile) ── */
        .cat-scroll{
          overflow-x:auto;background:rgba(5,12,8,0.95);
          border-bottom:1px solid rgba(0,230,100,0.08);
          padding:0 12px;position:sticky;top:54px;z-index:99;
          -webkit-overflow-scrolling:touch;
          scrollbar-width:none;
        }
        .cat-scroll::-webkit-scrollbar{display:none;}
        .cat-scroll-inner{display:flex;min-width:max-content;}

        /* ── STAT GRID ── */
        .stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px;}

        /* ══════════════════════════════════════
           BREAKPOINTS
        ══════════════════════════════════════ */

        /* ── PHONE PORTRAIT (< 640px) ── */
        @media(max-width:639px){
          .sidebar-wrap{display:none!important;}
          .cat-scroll{display:block!important;}
          .main-wrap{margin-left:0!important;}
          .main-inner{padding:12px 12px;}
          .field-grid{grid-template-columns:1fr!important;}
          /* match layout is already vertical — no override needed */
          .player-name-lg{font-size:14px!important;}
          .player-name-md{font-size:12px!important;}
          .stat-grid{grid-template-columns:repeat(2,1fr)!important;}
          .judge-cat-grid{grid-template-columns:1fr!important;}
          .judge-field-grid{grid-template-columns:repeat(2,1fr)!important;}
          .admin-grid{grid-template-columns:1fr!important;}
          .hide-mobile{display:none!important;}
          .hero-bar{flex-direction:column!important;gap:10px!important;}
          .coming-up-row{flex-wrap:wrap;}
          .pub-tabs{flex-wrap:wrap;}
          .pub-tabs button{font-size:10px!important;padding:6px 10px!important;}
          .search-results-grid{grid-template-columns:1fr!important;}
        }

        /* ── PHONE LANDSCAPE & SMALL TABLET (640px - 768px) ── */
        @media(min-width:640px) and (max-width:767px){
          .sidebar-wrap{display:none!important;}
          .cat-scroll{display:block!important;}
          .main-wrap{margin-left:0!important;}
          .main-inner{padding:14px 16px;}
          .field-grid{grid-template-columns:repeat(2,1fr)!important;}
          .stat-grid{grid-template-columns:repeat(4,1fr)!important;}
          .judge-cat-grid{grid-template-columns:repeat(2,1fr)!important;}
          .judge-field-grid{grid-template-columns:repeat(3,1fr)!important;}
          .admin-grid{grid-template-columns:repeat(2,1fr)!important;}
          .search-results-grid{grid-template-columns:1fr!important;}
        }

        /* ── TABLET PORTRAIT (768px - 1023px) ── */
        @media(min-width:768px) and (max-width:1023px){
          .sidebar-wrap{display:none!important;}
          .cat-scroll{display:block!important;}
          .main-wrap{margin-left:0!important;}
          .main-inner{padding:16px 20px;}
          .field-grid{grid-template-columns:repeat(2,1fr)!important;}
          .stat-grid{grid-template-columns:repeat(4,1fr)!important;}
          .judge-cat-grid{grid-template-columns:repeat(2,1fr)!important;}
          .judge-field-grid{grid-template-columns:repeat(4,1fr)!important;}
          .admin-grid{grid-template-columns:repeat(2,1fr)!important;}
          .search-results-grid{grid-template-columns:repeat(2,1fr)!important;}
        }

        /* ── TABLET LANDSCAPE & LAPTOP (1024px - 1279px) ── */
        @media(min-width:1024px) and (max-width:1279px){
          .sidebar-wrap{display:flex!important;}
          .cat-scroll{display:none!important;}
          .main-inner{padding:20px 22px;}
          .field-grid{grid-template-columns:repeat(2,1fr)!important;}
          .stat-grid{grid-template-columns:repeat(4,1fr)!important;}
          .judge-cat-grid{grid-template-columns:repeat(3,1fr)!important;}
          .judge-field-grid{grid-template-columns:repeat(4,1fr)!important;}
          .admin-grid{grid-template-columns:repeat(2,1fr)!important;}
          .search-results-grid{grid-template-columns:repeat(2,1fr)!important;}
        }

        /* ── DESKTOP (1280px+) ── */
        @media(min-width:1280px){
          .sidebar-wrap{display:flex!important;}
          .cat-scroll{display:none!important;}
          .main-inner{padding:24px 28px;}
          .field-grid{grid-template-columns:repeat(3,1fr)!important;}
          .stat-grid{grid-template-columns:repeat(4,1fr)!important;}
          .judge-cat-grid{grid-template-columns:repeat(4,1fr)!important;}
          .judge-field-grid{grid-template-columns:repeat(5,1fr)!important;}
          .admin-grid{grid-template-columns:repeat(3,1fr)!important;}
          .search-results-grid{grid-template-columns:repeat(3,1fr)!important;}
        }
      `}</style>

      {/* ── TOP HEADER ── */}
      <header style={{background:"rgba(5,14,8,0.95)",backdropFilter:"blur(20px)",borderBottom:"1px solid rgba(0,230,100,0.12)",padding:"0 16px",height:54,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:200,boxShadow:"0 2px 20px rgba(0,0,0,0.5)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          {/* Mobile menu toggle */}
          <button className="hbtn" style={{display:"none",padding:"6px 8px",background:"transparent",color:G,fontSize:18}} onClick={()=>setSidebarOpen(!sidebarOpen)}>☰</button>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:32,height:32,borderRadius:8,background:`linear-gradient(135deg,${G},#009944)`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Bebas Neue'",fontSize:14,color:"#050e08",letterSpacing:1,boxShadow:`0 0 12px ${G}50`}}>WRG</div>
            <div>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:"clamp(16px,2vw,22px)",color:G,letterSpacing:3,lineHeight:1,textShadow:`0 0 16px ${G}60`}}>WRG 2026</div>
              <div className="header-subtitle" style={{fontSize:9,color:"rgba(0,230,100,0.45)",letterSpacing:3,fontWeight:600,textTransform:"uppercase",lineHeight:1}}>Malaysia Tournament</div>
            </div>
          </div>
          {isGenerated&&<div style={{display:"flex",alignItems:"center",gap:5,background:"rgba(239,68,68,0.12)",border:"1px solid rgba(239,68,68,0.3)",padding:"3px 10px",borderRadius:20,marginLeft:4}}>
            <div className="blink" style={{width:5,height:5,borderRadius:"50%",background:"#ef4444",boxShadow:"0 0 6px #ef4444"}}/>
            <span style={{fontSize:9,color:"#ef4444",fontWeight:700,letterSpacing:2}}>LIVE</span>
          </div>}
          {!isGenerated&&<div style={{fontSize:9,background:"rgba(245,158,11,0.1)",color:"#f59e0b",border:"1px solid rgba(245,158,11,0.2)",padding:"3px 10px",borderRadius:20,fontWeight:700,letterSpacing:1.5}}>⚙ SETUP</div>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <div style={{display:"flex",gap:2,background:"rgba(0,0,0,0.5)",padding:3,borderRadius:8,border:"1px solid rgba(0,230,100,0.1)"}}>
            {[["public","👁","PUBLIC"],["admin",auth.admin?"⚙":"🔒","ADMIN"]].map(([v,icon,label])=>(
              <button key={v} className="hbtn"
                style={{padding:"6px 12px",borderRadius:6,fontWeight:700,fontSize:"clamp(9px,1vw,11px)",letterSpacing:0.5,
                  color:view===v?"#050e08":"rgba(0,230,100,0.5)",
                  background:view===v?G:"transparent"}}
                onClick={()=>requestView(v)}>{icon} {label}</button>
            ))}
          </div>
          {(view==="judge"||view==="admin")&&(
            <button className="hbtn" style={{padding:"6px 10px",borderRadius:6,fontWeight:700,fontSize:10,color:"#ef4444",background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.2)"}} onClick={lockView}>🔒</button>
          )}
        </div>
      </header>

      <div className="app-body">

        {/* ── SIDEBAR (desktop via CSS) ── */}
        {isGenerated&&(
          <aside className="sidebar-wrap">
            {/* Category list header */}
            <div style={{padding:"14px 16px 8px",fontSize:9,color:"rgba(0,230,100,0.4)",fontWeight:700,letterSpacing:3,textTransform:"uppercase",borderBottom:"1px solid rgba(0,230,100,0.06)"}}>Categories</div>
            {CATEGORIES.map(c=>{
              const cd=data?.[c.id];
              const total=(cd?.matches||[]).length;
              const pend=(cd?.matches||[]).filter(m=>m.status==="pending").length;
              const hld=(cd?.matches||[]).filter(m=>m.status==="held").length;
              const done=(cd?.matches||[]).filter(m=>m.status==="completed").length;
              const isActive=activeCat===c.id;
              return(
                <button key={c.id} className="hbtn"
                  style={{width:"100%",padding:"10px 16px",background:isActive?`linear-gradient(90deg,${c.color}18,transparent)`:"transparent",
                    borderLeft:`3px solid ${isActive?c.color:"transparent"}`,
                    borderRight:"none",borderTop:"none",borderBottom:"1px solid rgba(0,230,100,0.04)",
                    display:"flex",alignItems:"center",gap:10,cursor:"pointer",textAlign:"left"}}
                  onClick={()=>setActiveCat(c.id)}>
                  <span style={{fontSize:16,lineHeight:1}}>{c.icon}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:11,fontWeight:700,color:isActive?c.color:"rgba(232,245,238,0.7)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",letterSpacing:0.2}}>{c.short}</div>
                    {total>0&&(
                      <div style={{fontSize:9,color:"rgba(0,230,100,0.35)",marginTop:2}}>{done}/{total} done{hld>0?` · ${hld} held`:""}</div>
                    )}
                  </div>
                  {hld>0&&<div style={{width:6,height:6,borderRadius:"50%",background:"#f59e0b",flexShrink:0}}/>}
                </button>
              );
            })}
          </aside>
        )}

        {/* ── MOBILE CATEGORY SCROLL ── */}
        {isGenerated&&(
          <div className="cat-scroll">
            <div className="cat-scroll-inner">
              {CATEGORIES.map(c=>{
                const isActive=activeCat===c.id;
                return(
                  <button key={c.id} className="hbtn"
                    style={{padding:"9px 12px",background:"transparent",border:"none",
                      borderBottom:isActive?`2px solid ${c.color}`:"2px solid transparent",
                      color:isActive?c.color:"rgba(0,230,100,0.35)",fontSize:10,fontWeight:700,
                      whiteSpace:"nowrap",cursor:"pointer",letterSpacing:0.3}}
                    onClick={()=>setActiveCat(c.id)}>{c.icon} {c.short}</button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── MAIN CONTENT ── */}
        <main className="main-wrap" style={{marginLeft:isGenerated?"210px":"0"}}>
          <div className="main-inner" style={{maxWidth:"1200px",margin:"0 auto"}}>

          {/* FLASH */}
          {flash&&(
            <div className="fadein" style={{position:"fixed",top:64,right:16,background:"rgba(0,230,100,0.1)",backdropFilter:"blur(20px)",border:"1px solid rgba(0,230,100,0.3)",color:G,padding:"10px 18px",borderRadius:10,fontWeight:700,zIndex:999,fontSize:12,boxShadow:"0 8px 32px rgba(0,0,0,0.4)",letterSpacing:0.3}}>{flash}</div>
          )}

          {/* ═══ PUBLIC VIEW ═══ */}
          {view==="public"&&(
            <div className="fadein">
              {!isGenerated?(
                <div style={{textAlign:"center",padding:"80px 20px"}}>
                  <div style={{fontFamily:"'Bebas Neue'",fontSize:"clamp(40px,8vw,80px)",color:G,letterSpacing:6,opacity:0.15,lineHeight:1}}>WRG 2026</div>
                  <div style={{fontFamily:"'Bebas Neue'",fontSize:"clamp(18px,3vw,28px)",color:"rgba(232,245,238,0.5)",letterSpacing:4,marginTop:8}}>TOURNAMENT STARTING SOON</div>
                  <div style={{fontSize:13,color:"rgba(0,230,100,0.4)",marginTop:12}}>Please wait while the organiser finalises the setup</div>
                </div>
              ):(
                <div>
                  {/* Category hero bar */}
                  <div style={{background:`linear-gradient(135deg,${accent}15,transparent)`,border:`1px solid ${accent}25`,borderRadius:14,padding:"14px 18px",marginBottom:18}}>
                    <div className="hero-bar" style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
                      <div style={{fontFamily:"'Bebas Neue'",fontSize:"clamp(20px,3vw,36px)",color:accent,letterSpacing:3,lineHeight:1,textShadow:`0 0 20px ${accent}50`}}>{cat.icon} {cat.name}</div>
                      {isGenerated&&<div style={{fontSize:9,color:accent,background:`${accent}15`,border:`1px solid ${accent}25`,padding:"3px 10px",borderRadius:20,fontWeight:700,letterSpacing:1}}>{fieldCfg.count} {fieldCfg.label}{fieldCfg.count>1?"S":""}</div>}
                    </div>
                    <div className="stat-grid">
                      {[["PENDING",pending.length,"#94a3b8"],["DONE",completed.length,"#10b981"],["ON HOLD",held.length,held.length>0?"#f59e0b":"#4a7a5a"],[`${fieldCfg.label}S`,fieldCfg.count,accent]].map(([l,v,c])=>(
                        <div key={l} style={{textAlign:"center",padding:"8px 6px",background:"rgba(0,0,0,0.3)",borderRadius:8,border:`1px solid ${c}20`}}>
                          <div style={{fontSize:"clamp(7px,0.8vw,9px)",color:c,fontWeight:700,letterSpacing:1,opacity:0.7}}>{l}</div>
                          <div style={{fontFamily:"'Bebas Neue'",fontSize:"clamp(18px,2.5vw,26px)",color:c,lineHeight:1.1}}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Public tabs */}
                  <div style={{display:"flex",gap:4,marginBottom:18,background:"rgba(0,0,0,0.4)",padding:4,borderRadius:10,border:"1px solid rgba(0,230,100,0.08)",width:"fit-content"}}>
                    {[["fields","🏟","FIELDS"],["fixtures","📋","FIXTURES"],["standings","📊","STANDINGS"],["bracket","🏆","BRACKET"],...(["open2","soc4","drone"].includes(activeCat)?[["teams","👥","TEAMS"]]:[])].map(([t,icon,label])=>(
                      <button key={t} className="hbtn"
                        style={{padding:"7px 14px",borderRadius:8,fontWeight:700,fontSize:"clamp(9px,1vw,11px)",letterSpacing:0.8,
                          color:pubTab===t?"#050e08":"rgba(0,230,100,0.45)",
                          background:pubTab===t?G:"transparent",
                          boxShadow:pubTab===t?`0 2px 10px ${G}40`:"none"}}
                        onClick={()=>setPubTab(t)}>{icon} {label}</button>
                    ))}
                  </div>

                  {/* FIELDS TAB */}
                  {pubTab==="fields"&&(
                    <div>
                      <div className="field-grid" style={{display:"grid",gap:14,marginBottom:20}}>
                        {Array.from({length:fieldCfg.count},(_,i)=>i+1).map(f=>{
                          const fd=fieldData[f];
                          const hasConflict=fd.live&&(busyPlayers.has(fd.live.p1)||busyPlayers.has(fd.live.p2));
                          return(
                            <div key={f} style={{background:S1,backdropFilter:"blur(20px)",borderRadius:14,overflow:"hidden",
                              border:`1px solid ${fd.live?`${accent}40`:"rgba(0,230,100,0.08)"}`,
                              boxShadow:fd.live?`0 4px 24px rgba(0,0,0,0.4),0 0 20px ${accent}10`:"0 2px 12px rgba(0,0,0,0.3)",
                              transition:"all .3s"}}>
                              {/* Top accent line */}
                              <div style={{height:3,background:fd.live?`linear-gradient(90deg,${accent},${accent}88,transparent)`:"linear-gradient(90deg,rgba(0,230,100,0.15),transparent)"}}/>
                              {/* Field header */}
                              <div style={{padding:"10px 14px",borderBottom:"1px solid rgba(0,230,100,0.07)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                                <div style={{fontFamily:"'Bebas Neue'",fontSize:"clamp(20px,3vw,28px)",color:accent,letterSpacing:3,textShadow:fd.live?`0 0 12px ${accent}50`:"none"}}>{fieldCfg.label} {f}</div>
                                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                                  {hasConflict&&<div style={{fontSize:9,fontWeight:700,color:"#f59e0b",background:"rgba(245,158,11,0.1)",border:"1px solid rgba(245,158,11,0.3)",borderRadius:20,padding:"2px 8px"}}>⚠ CONFLICT</div>}
                                  {fd.live?(
                                    <div className="pulse" style={{display:"flex",alignItems:"center",gap:5,background:"rgba(239,68,68,0.12)",border:"1px solid rgba(239,68,68,0.35)",borderRadius:20,padding:"3px 10px"}}>
                                      <div className="blink" style={{width:5,height:5,borderRadius:"50%",background:"#ef4444",boxShadow:"0 0 6px #ef4444"}}/>
                                      <span style={{fontSize:9,fontWeight:700,color:"#ef4444",letterSpacing:1.5}}>LIVE</span>
                                    </div>
                                  ):(<div style={{fontSize:10,fontWeight:600,color:"rgba(0,230,100,0.3)",letterSpacing:1}}>{fd.heldList.length>0?"⏸ HELD":"STANDBY"}</div>)}
                                </div>
                              </div>
                              {/* Now Playing — VERTICAL STACK */}
                              <div style={{padding:"12px 14px",borderBottom:"1px solid rgba(0,230,100,0.05)"}}>
                                <div style={{fontSize:8,color:"#ef4444",fontWeight:700,letterSpacing:2,marginBottom:10,textTransform:"uppercase"}}>▶ Now Playing</div>
                                {fd.live?(
                                  <div>
                                    {/* P1 */}
                                    <div style={{marginBottom:8}}>
                                      <div style={{fontWeight:700,fontSize:"clamp(13px,1.5vw,15px)",color:busyPlayers.has(fd.live.p1)?"#f59e0b":"#e8f5ee",lineHeight:1.3,wordBreak:"break-word"}}>{fd.live.p1name}</div>
                                      <div style={{fontSize:9,color:"rgba(0,230,100,0.4)",marginTop:2}}>Group {fd.live.group}</div>
                                    </div>
                                    {/* VS divider */}
                                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                                      <div style={{flex:1,height:1,background:"rgba(0,230,100,0.08)"}}/>
                                      <div style={{fontFamily:"'Bebas Neue'",fontSize:11,color:accent,letterSpacing:3,padding:"2px 10px",background:`${accent}10`,border:`1px solid ${accent}20`,borderRadius:20}}>VS</div>
                                      <div style={{flex:1,height:1,background:"rgba(0,230,100,0.08)"}}/>
                                    </div>
                                    {/* P2 */}
                                    <div>
                                      <div style={{fontWeight:700,fontSize:"clamp(13px,1.5vw,15px)",color:busyPlayers.has(fd.live.p2)?"#f59e0b":"#e8f5ee",lineHeight:1.3,wordBreak:"break-word"}}>{fd.live.p2name}</div>
                                      <div style={{fontSize:9,color:"rgba(0,230,100,0.4)",marginTop:2}}>Group {fd.live.group}</div>
                                    </div>
                                  </div>
                                ):(
                                  <div style={{textAlign:"center",padding:"8px",color:"rgba(0,230,100,0.25)",fontSize:12}}>— No match in progress —</div>
                                )}
                              </div>
                              {/* Next Up — compact single line with truncation */}
                              <div style={{padding:"8px 14px",background:"rgba(0,0,0,0.2)"}}>
                                <div style={{fontSize:8,color:"rgba(0,230,100,0.3)",fontWeight:700,letterSpacing:2,marginBottom:5}}>NEXT UP</div>
                                {fd.next?(
                                  <div>
                                    <div style={{fontSize:"clamp(10px,1.2vw,12px)",fontWeight:600,color:"rgba(232,245,238,0.55)",lineHeight:1.3,wordBreak:"break-word",marginBottom:3}}>{fd.next.p1name}</div>
                                    <div style={{fontSize:9,color:"rgba(0,230,100,0.2)",marginBottom:3}}>vs</div>
                                    <div style={{fontSize:"clamp(10px,1.2vw,12px)",fontWeight:600,color:"rgba(232,245,238,0.55)",lineHeight:1.3,wordBreak:"break-word"}}>{fd.next.p2name}</div>
                                  </div>
                                ):(<div style={{fontSize:11,color:"rgba(0,230,100,0.2)"}}>— Queue empty —</div>)}
                              </div>
                              {fd.heldList.length>0&&(
                                <div style={{padding:"7px 14px",background:"rgba(245,158,11,0.05)",borderTop:"1px solid rgba(245,158,11,0.1)"}}>
                                  <div style={{fontSize:8,color:"#f59e0b",fontWeight:700,letterSpacing:2,marginBottom:3}}>⏸ ON HOLD ({fd.heldList.length})</div>
                                  {fd.heldList.map(m=><div key={m.id} style={{fontSize:10,color:"rgba(245,158,11,0.6)",wordBreak:"break-word"}}>{m.p1name} vs {m.p2name}</div>)}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {/* Coming Up - ALL fields */}
                      <div style={{background:S1,backdropFilter:"blur(16px)",borderRadius:14,overflow:"hidden",border:"1px solid rgba(0,230,100,0.08)"}}>
                        <div style={{padding:"12px 16px",borderBottom:"1px solid rgba(0,230,100,0.07)",display:"flex",alignItems:"center",gap:10,background:"linear-gradient(90deg,rgba(0,230,100,0.06),transparent)"}}>
                          <div style={{fontFamily:"'Bebas Neue'",fontSize:16,color:G,letterSpacing:3}}>UPCOMING MATCHES — ALL FIELDS</div>
                          <div style={{marginLeft:"auto",fontSize:10,color:"rgba(0,230,100,0.3)"}}>{pending.length} pending</div>
                        </div>
                        {pending.length===0?(
                          <div style={{padding:"20px",textAlign:"center",color:"rgba(0,230,100,0.25)",fontSize:12}}>✅ All matches complete</div>
                        ):(
                          Array.from({length:fieldCfg.count},(_,i)=>i+1).map(f=>{
                            const fp=pending.filter(m=>m.field===f);
                            if(!fp.length) return null;
                            const fpShow=fp.slice(0,3);
                            return(
                              <div key={f}>
                                <div style={{padding:"7px 16px",background:`${accent}07`,borderBottom:"1px solid rgba(0,230,100,0.05)",borderTop:"1px solid rgba(0,230,100,0.04)",display:"flex",alignItems:"center",gap:8}}>
                                  <div style={{fontFamily:"'Bebas Neue'",fontSize:13,color:accent,letterSpacing:2}}>{fieldCfg.label} {f}</div>
                                  <div style={{fontSize:9,color:"rgba(0,230,100,0.3)",fontWeight:700}}>Next {fpShow.length} of {fp.length}</div>
                                </div>
                                {fpShow.map((m,idx)=>(
                                  <div key={m.id} className="mrow" style={{padding:"10px 16px",borderBottom:"1px solid rgba(0,230,100,0.03)",background:idx===0?"rgba(0,230,100,0.025)":"transparent"}}>
                                    {/* Header row */}
                                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                                      <div style={{width:18,height:18,borderRadius:3,background:idx===0?`${accent}20`:"rgba(0,0,0,0.3)",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Bebas Neue'",fontSize:10,color:idx===0?accent:"rgba(0,230,100,0.25)",flexShrink:0}}>{idx+1}</div>
                                      <div style={{fontSize:9,color:"rgba(0,230,100,0.3)",fontWeight:700,background:"rgba(0,0,0,0.3)",padding:"1px 6px",borderRadius:3}}>GRP {m.group}</div>
                                      {idx===0&&<div style={{fontSize:8,color:accent,fontWeight:700,background:`${accent}15`,border:`1px solid ${accent}25`,padding:"1px 6px",borderRadius:3,marginLeft:"auto"}}>▶ NEXT</div>}
                                    </div>
                                    {/* Player 1 */}
                                    <div style={{fontWeight:600,fontSize:"clamp(11px,1.2vw,13px)",color:idx===0?"rgba(232,245,238,0.85)":"rgba(232,245,238,0.45)",lineHeight:1.3,wordBreak:"break-word"}}>{m.p1name}</div>
                                    {/* vs */}
                                    <div style={{fontSize:9,color:"rgba(0,230,100,0.25)",fontWeight:700,letterSpacing:1,margin:"3px 0"}}>VS</div>
                                    {/* Player 2 */}
                                    <div style={{fontWeight:600,fontSize:"clamp(11px,1.2vw,13px)",color:idx===0?"rgba(232,245,238,0.85)":"rgba(232,245,238,0.45)",lineHeight:1.3,wordBreak:"break-word"}}>{m.p2name}</div>
                                  </div>
                                ))}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}


                  {/* FIXTURES */}

                  {pubTab==="fixtures"&&Object.keys(catData.groups||{}).sort()
                    .filter(g=>{
                      if(!DIY_SIDES[activeCat])return true;
                      const m=catData.matches?.find(mm=>mm.group===g);
                      if(!m)return true;
                      return(DIY_SIDES[activeCat][activeSide]?.fields||[]).includes(m.field);
                    }).map(g=>{
                    const gm=catMatches.filter(m=>m.group===g);
                    return(
                      <div key={g} style={{background:S1,border:"1px solid rgba(0,230,100,0.08)",borderRadius:14,marginBottom:12,overflow:"hidden"}}>
                        <div style={{background:`linear-gradient(90deg,${accent}14,transparent)`,padding:"10px 16px",borderBottom:"1px solid rgba(0,230,100,0.06)",display:"flex",alignItems:"center",gap:10}}>
                          <div style={{width:26,height:26,borderRadius:6,background:accent,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Bebas Neue'",fontSize:15,color:"#050e08"}}>{g}</div>
                          <span style={{fontWeight:700,fontSize:13,letterSpacing:0.5}}>GROUP {g}</span>
                          <span style={{marginLeft:"auto",fontSize:10,color:"rgba(0,230,100,0.35)"}}>{gm.filter(m=>m.status==="completed").length}/{gm.length} played</span>
                        </div>
                        {gm.map(m=>(
                          <div key={m.id} className="mrow" style={{display:"flex",alignItems:"center",padding:"9px 16px",borderBottom:"1px solid rgba(0,230,100,0.03)",gap:10,background:m.status==="held"?"rgba(245,158,11,0.03)":"transparent"}}>
                            <div className="player-name player-name-md name-clamp2" style={{flex:1,textAlign:"right",color:"#e8f5ee"}}>{m.p1name}</div>
                            <div style={{width:84,textAlign:"center"}}>
                              {m.status==="completed"?(
                                <div style={{fontFamily:"'Bebas Neue'",fontSize:"clamp(18px,2.5vw,26px)",letterSpacing:4}}>
                                  <span style={{color:m.score1>m.score2?accent:m.score1===m.score2?"#ffd700":"rgba(232,245,238,0.25)"}}>{m.score1}</span>
                                  <span style={{color:"rgba(0,230,100,0.2)",margin:"0 2px"}}>–</span>
                                  <span style={{color:m.score2>m.score1?accent:m.score1===m.score2?"#ffd700":"rgba(232,245,238,0.25)"}}>{m.score2}</span>
                                </div>
                              ):m.status==="held"?(
                                <span style={{fontSize:9,color:"#f59e0b",background:"rgba(245,158,11,0.12)",padding:"2px 7px",borderRadius:4,fontWeight:700}}>⏸</span>
                              ):(
                                <span style={{fontSize:9,color:"rgba(0,230,100,0.25)",background:"rgba(0,230,100,0.05)",padding:"2px 7px",borderRadius:4,fontWeight:700}}>PENDING</span>
                              )}
                            </div>
                            <div className="player-name player-name-md name-clamp2" style={{flex:1,color:"#e8f5ee"}}>{m.p2name}</div>
                          </div>
                        ))}
                      </div>
                    );
                  })}

                  {/* STANDINGS */}

                  {pubTab==="standings"&&Object.keys(catData.groups||{}).sort()
                    .filter(g=>{
                      if(!DIY_SIDES[activeCat])return true;
                      const m=catData.matches?.find(mm=>mm.group===g);
                      if(!m)return true;
                      return(DIY_SIDES[activeCat][activeSide]?.fields||[]).includes(m.field);
                    }).map(g=>{
                    const rows=standings[g]||[];
                    return(
                      <div key={g} style={{background:S1,border:"1px solid rgba(0,230,100,0.08)",borderRadius:14,marginBottom:12,overflow:"hidden"}}>
                        <div style={{background:`linear-gradient(90deg,${accent}14,transparent)`,padding:"10px 16px",borderBottom:"1px solid rgba(0,230,100,0.06)",display:"flex",alignItems:"center",gap:10}}>
                          <div style={{width:26,height:26,borderRadius:6,background:accent,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Bebas Neue'",fontSize:15,color:"#050e08"}}>{g}</div>
                          <span style={{fontWeight:700,fontSize:13}}>GROUP {g}</span>
                          {DIY_SIDES[activeCat]&&(
                            <span style={{fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:4,marginLeft:4,
                              background:activeSide==="A"?"rgba(0,230,100,0.1)":"rgba(255,215,0,0.1)",
                              color:activeSide==="A"?"#00e664":"#ffd700",
                              border:`1px solid ${activeSide==="A"?"rgba(0,230,100,0.25)":"rgba(255,215,0,0.25)"}`}}>
                              SIDE {activeSide} · {DIY_SIDES[activeCat][activeSide]?.label}
                            </span>
                          )}
                        </div>
                        <div style={{overflowX:"auto"}}>
                          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                            <thead><tr style={{borderBottom:"1px solid rgba(0,230,100,0.08)"}}>
                              {["#","PLAYER","P","W","D","L","GF","GA","GD","PTS"].map(h=>(
                                <th key={h} style={{padding:"8px 10px",textAlign:h==="PLAYER"?"left":"center",color:"rgba(0,230,100,0.4)",fontSize:9,fontWeight:700,letterSpacing:1.5}}>{h}</th>
                              ))}
                            </tr></thead>
                            <tbody>{rows.map((r,i)=>(
                              <tr key={r.id} style={{borderBottom:"1px solid rgba(0,230,100,0.03)",background:i<2?`${accent}06`:"transparent"}}>
                                <td style={{padding:"8px 10px",textAlign:"center",color:i<2?accent:"rgba(0,230,100,0.3)",fontWeight:700,fontSize:13}}>{i+1}</td>
                                <td style={{padding:"8px 10px",fontWeight:600,fontSize:12}}>
                                  {i<2&&<span style={{display:"inline-block",width:5,height:5,borderRadius:"50%",background:accent,marginRight:7,verticalAlign:"middle"}}/>}
                                  <span className="player-name player-name-sm name-clamp2">{r.name}</span>
                                </td>
                                {["P","W","D","L","GF","GA","GD","Pts"].map(k=>(
                                  <td key={k} style={{padding:"8px 10px",textAlign:"center",fontWeight:k==="Pts"?700:400,
                                    color:k==="Pts"?accent:k==="GD"?(r[k]>0?"#10b981":r[k]<0?"#ef4444":"rgba(0,230,100,0.3)"):"rgba(232,245,238,0.45)"}}>{r[k]}</td>
                                ))}
                              </tr>
                            ))}</tbody>
                          </table>
                        </div>
                        <div style={{padding:"6px 14px",fontSize:9,color:"rgba(0,230,100,0.3)",borderTop:"1px solid rgba(0,230,100,0.04)"}}>
                          🟢 Top 2 advance · <strong style={{color:accent}}>{rows[0]?.name}</strong> &amp; <strong style={{color:accent}}>{rows[1]?.name}</strong>
                        </div>
                      </div>
                    );
                  })}


                  {/* ── PLAYER SEARCH BAR — hidden on TEAMS tab ── */}
                  {pubTab!=="teams"&&(<div style={{marginBottom:18}}>
                    <div style={{position:"relative"}}>
                      <input
                        value={playerSearch}
                        onChange={e=>searchPlayer(e.target.value)}
                        onFocus={()=>setShowSearch(true)}
                        placeholder="🔍  Search your child's name..."
                        style={{width:"100%",background:"rgba(0,0,0,0.5)",backdropFilter:"blur(12px)",
                          border:`1px solid ${playerSearch?"rgba(0,230,100,0.4)":"rgba(0,230,100,0.15)"}`,
                          borderRadius:10,padding:"12px 16px",color:"#e8f5ee",
                          fontFamily:"'Barlow',sans-serif",fontSize:"clamp(13px,1.4vw,15px)",
                          transition:"all .2s",boxShadow:playerSearch?"0 0 16px rgba(0,230,100,0.1)":"none"}}/>
                      {playerSearch&&(
                        <button onClick={()=>{setPlayerSearch("");setSearchResults([]);setShowSearch(false);}}
                          style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",
                            background:"transparent",border:"none",color:"rgba(0,230,100,0.4)",
                            fontSize:18,cursor:"pointer",lineHeight:1}}>×</button>
                      )}
                    </div>

                    {/* Search Results */}
                    {showSearch&&searchResults.length>0&&(
                      <div className="fadein" style={{background:"rgba(5,14,8,0.98)",backdropFilter:"blur(20px)",
                        border:"1px solid rgba(0,230,100,0.2)",borderRadius:12,marginTop:8,overflow:"hidden",
                        boxShadow:"0 8px 32px rgba(0,0,0,0.5)"}}>
                        <div style={{padding:"10px 16px",borderBottom:"1px solid rgba(0,230,100,0.08)",
                          fontSize:10,color:"rgba(0,230,100,0.4)",fontWeight:700,letterSpacing:2}}>
                          {searchResults.length} RESULT{searchResults.length!==1?"S":""} FOUND
                        </div>
                        {searchResults.map((r,i)=>(
                          <div key={i} style={{padding:"14px 16px",borderBottom:"1px solid rgba(0,230,100,0.06)",
                            background:i%2===0?"transparent":"rgba(0,230,100,0.02)"}}>
                            {/* Player name + category */}
                            <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:10}}>
                              <div style={{flex:1}}>
                                <div style={{fontWeight:700,fontSize:"clamp(15px,2vw,18px)",color:"#e8f5ee",lineHeight:1.2,marginBottom:4}}>
                                  {r.playerName}
                                </div>
                                <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                                  <span style={{fontSize:10,color:r.catColor,background:`${r.catColor}15`,
                                    border:`1px solid ${r.catColor}30`,padding:"2px 8px",borderRadius:4,fontWeight:700}}>
                                    {r.catIcon} {r.catName}
                                  </span>
                                  <span style={{fontSize:10,color:"rgba(0,230,100,0.4)",fontWeight:600}}>
                                    Group {r.group}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Status cards */}
                            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8}}>
                              {/* Current / Next match */}
                              {r.nextMatch?(
                                <div style={{background:"rgba(0,230,100,0.06)",border:"1px solid rgba(0,230,100,0.15)",
                                  borderRadius:8,padding:"10px 12px"}}>
                                  <div style={{fontSize:8,color:"rgba(0,230,100,0.5)",fontWeight:700,letterSpacing:1.5,marginBottom:6}}>NEXT MATCH</div>
                                  <div style={{fontSize:9,color:"rgba(0,230,100,0.4)",marginBottom:4,fontWeight:600}}>
                                    {r.fieldLabel} {r.nextMatch.field} · Group {r.nextMatch.group}
                                  </div>
                                  <div style={{fontSize:"clamp(11px,1.3vw,13px)",fontWeight:700,color:"#e8f5ee",lineHeight:1.3}}>
                                    vs {r.nextMatch.p1===r.playerId?r.nextMatch.p2name:r.nextMatch.p1name}
                                  </div>
                                </div>
                              ):r.heldMatch?(
                                <div style={{background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.2)",
                                  borderRadius:8,padding:"10px 12px"}}>
                                  <div style={{fontSize:8,color:"#f59e0b",fontWeight:700,letterSpacing:1.5,marginBottom:6}}>⏸ ON HOLD</div>
                                  <div style={{fontSize:"clamp(11px,1.3vw,13px)",fontWeight:700,color:"#f59e0b",lineHeight:1.3}}>
                                    vs {r.heldMatch.p1===r.playerId?r.heldMatch.p2name:r.heldMatch.p1name}
                                  </div>
                                </div>
                              ):(
                                <div style={{background:"rgba(16,185,129,0.06)",border:"1px solid rgba(16,185,129,0.15)",
                                  borderRadius:8,padding:"10px 12px"}}>
                                  <div style={{fontSize:8,color:"#10b981",fontWeight:700,letterSpacing:1.5,marginBottom:6}}>GROUP STAGE</div>
                                  <div style={{fontSize:"clamp(11px,1.3vw,13px)",color:"#10b981",fontWeight:700}}>
                                    ✓ All matches complete
                                  </div>
                                </div>
                              )}

                              {/* Standings */}
                              {r.standings&&(
                                <div style={{background:"rgba(0,0,0,0.3)",border:"1px solid rgba(0,230,100,0.1)",
                                  borderRadius:8,padding:"10px 12px"}}>
                                  <div style={{fontSize:8,color:"rgba(0,230,100,0.4)",fontWeight:700,letterSpacing:1.5,marginBottom:6}}>STANDINGS</div>
                                  <div style={{display:"flex",gap:8}}>
                                    {[["PTS",r.standings.Pts,"#00e664"],["W",r.standings.W,"#10b981"],["D",r.standings.D,"#94a3b8"],["L",r.standings.L,"#ef4444"]].map(([l,v,c])=>(
                                      <div key={l} style={{textAlign:"center"}}>
                                        <div style={{fontFamily:"'Bebas Neue'",fontSize:20,color:c,lineHeight:1}}>{v}</div>
                                        <div style={{fontSize:7,color:c,opacity:0.6,fontWeight:700,letterSpacing:0.5}}>{l}</div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Progress */}
                              <div style={{background:"rgba(0,0,0,0.3)",border:"1px solid rgba(0,230,100,0.08)",
                                borderRadius:8,padding:"10px 12px"}}>
                                <div style={{fontSize:8,color:"rgba(0,230,100,0.4)",fontWeight:700,letterSpacing:1.5,marginBottom:6}}>PROGRESS</div>
                                <div style={{fontSize:"clamp(12px,1.5vw,15px)",color:"#e8f5ee",fontWeight:700}}>{r.completedMatches}/{r.totalMatches}</div>
                                <div style={{fontSize:9,color:"rgba(0,230,100,0.35)",marginTop:2}}>matches played</div>
                                <div style={{marginTop:6,height:4,background:"rgba(0,230,100,0.1)",borderRadius:2,overflow:"hidden"}}>
                                  <div style={{height:"100%",width:`${r.totalMatches>0?(r.completedMatches/r.totalMatches)*100:0}%`,
                                    background:"linear-gradient(90deg,#00e664,#009944)",borderRadius:2,transition:"width .3s"}}/>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {showSearch&&playerSearch&&searchResults.length===0&&(
                      <div className="fadein" style={{background:"rgba(5,14,8,0.95)",border:"1px solid rgba(0,230,100,0.1)",
                        borderRadius:10,marginTop:8,padding:"20px",textAlign:"center"}}>
                        <div style={{fontSize:24,marginBottom:8}}>🔍</div>
                        <div style={{fontSize:13,color:"rgba(0,230,100,0.4)",fontWeight:600}}>No student found for "{playerSearch}"</div>
                        <div style={{fontSize:11,color:"rgba(0,230,100,0.25)",marginTop:4}}>Check spelling or try a shorter name</div>
                      </div>
                    )}

                    {!isGenerated&&playerSearch&&(
                      <div style={{fontSize:11,color:"rgba(0,230,100,0.3)",marginTop:8,textAlign:"center"}}>
                        Search will be available once the tournament is generated
                      </div>
                    )}
                  </div>)}

                  {pubTab==="teams"&&(
                    <div className="fadein">
                      <TeamsPublicView participants={participants} activeCat={activeCat} accent={accent} TEAM_CATEGORIES={TEAM_CATEGORIES}/>
                    </div>
                  )}

                  {pubTab==="bracket"&&(
                    <LiveKnockoutBracket catId={activeCat} knockoutData={knockoutData} cat={cat} accent={accent} G={G} S1={S1}
                      onScoreMatch={(roundIdx,matchIdx)=>{setKoScoreModal({catId:activeCat,roundIdx,matchIdx});setKoScoreInput({s1:"",s2:""});}}
                      isAdmin={view==="admin"||view==="judge"}
                      onGenerateKnockout={()=>triggerGenerateKnockout(activeCat)}
                      groupStageComplete={catMatches.length>0&&catMatches.every(m=>m.status==="completed")}/>
                  )}
                </div>
              )}
            </div>
          )}


          {/* ═══ JUDGE VIEW ═══ */}
          {view==="judge"&&(
            <JudgePanel isGenerated={isGenerated} judgeCategory={judgeCategory} judgeField={judgeField}
              CATEGORIES={CATEGORIES} FIELD_CONFIG={FIELD_CONFIG} tournamentData={data}
              groupFieldMaps={groupFieldMaps} participants={participants}
              selectJudgeCategory={selectJudgeCategory} selectJudgeField={selectJudgeField}
              changeJudgeCategory={changeJudgeCategory} setJudgeField={setJudgeField}
              holdMatch={holdMatch} releaseMatch={releaseMatch} openScoreModal={openScoreModal}
              G={G} S1={S1} BD={BD} BG={BG}/>
          )}

          {/* ═══ ADMIN VIEW ═══ */}
          {view==="admin"&&(
            <div className="fadein">
              <div style={{display:"flex",gap:4,marginBottom:20,background:"rgba(0,0,0,0.4)",padding:4,borderRadius:10,border:"1px solid rgba(0,230,100,0.08)",width:"fit-content"}}>
                {[["participants","👥 PARTICIPANTS"],["teams","🏆 TEAMS"],["score","⚽ SCORING"],["generate",isGenerated?"📊 TOURNAMENT":"⚡ GENERATE"]].map(([t,label])=>(
                  <button key={t} className="hbtn"
                    style={{padding:"8px 16px",borderRadius:7,fontWeight:700,fontSize:"clamp(10px,1.1vw,12px)",letterSpacing:0.5,
                      color:adminTab===t?"#050e08":"rgba(0,230,100,0.4)",
                      background:adminTab===t?G:"transparent"}}
                    onClick={()=>setAdminTab(t)}>
                    {label}
                    {t==="participants"&&unmarkedCount>0&&!isGenerated&&<span style={{marginLeft:6,fontSize:9,background:"rgba(245,158,11,0.25)",color:"#f59e0b",padding:"1px 6px",borderRadius:8}}>{unmarkedCount}</span>}
                  </button>
                ))}
              </div>

              {adminTab==="participants"&&(
                <div>
                  {/* Stats */}
                  <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
                    {[["TOTAL",participants.length,"rgba(0,230,100,0.5)"],["✓ PRESENT",presentCount,"#10b981"],["✗ ABSENT",absentCount,"#ef4444"],["UNMARKED",unmarkedCount,"#f59e0b"]].map(([l,v,c])=>(
                      v>0||l==="TOTAL"?<div key={l} style={{fontSize:11,color:c,fontWeight:700,background:"rgba(0,0,0,0.4)",border:`1px solid ${c}25`,padding:"5px 12px",borderRadius:6}}>{l}: {v}</div>:null
                    ))}
                  </div>
                  {/* Action buttons */}
                  <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
                    <button className="hbtn" style={{padding:"8px 16px",background:"rgba(16,185,129,0.1)",border:"1px solid rgba(16,185,129,0.3)",borderRadius:7,color:"#10b981",fontWeight:700,fontSize:11,cursor:"pointer"}} onClick={markAllPresent}>✓ ALL PRESENT</button>
                    <button className="hbtn" style={{padding:"8px 16px",background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:7,color:"#ef4444",fontWeight:700,fontSize:11,cursor:"pointer"}} onClick={markAllAbsent}>✗ ALL ABSENT</button>
                    <button className="hbtn"
                      style={{padding:"8px 18px",background:"rgba(239,68,68,0.06)",border:"2px solid rgba(239,68,68,0.4)",borderRadius:7,color:"#ef4444",fontWeight:700,fontSize:12,cursor:"pointer",marginLeft:"auto"}}
                      onClick={()=>{if(window.confirm("Clear ALL "+participants.length+" participants? This cannot be undone.")){clearAllParticipants();}}}>
                      🗑 CLEAR ALL PARTICIPANTS
                    </button>
                  </div>

                  {/* CSV Import */}
                  <CsvImport CATEGORIES={CATEGORIES}
                    onImport={(p)=>{
                      let merged=0,added=0;
                      const result=[...participants];
                      p.forEach(newP=>{
                        // Find existing by same ID or same name
                        const existIdx=result.findIndex(ex=>
                          (newP.studentId&&ex.studentId&&ex.studentId===newP.studentId)||
                          ex.name.toLowerCase().trim()===newP.name.toLowerCase().trim()
                        );
                        if(existIdx>=0){
                          // Merge categories
                          const ex=result[existIdx];
                          result[existIdx]={...ex,
                            categories:[...new Set([...ex.categories,...newP.categories])],
                            studentId:ex.studentId||newP.studentId||""
                          };
                          merged++;
                        } else {
                          result.push(newP);
                          added++;
                        }
                      });
                      setParticipants(result);
                      saveState({participants:result,groupFieldMaps,tournamentData:data,knockoutData});
                      showFlash(`✓ ${added} added · ${merged} merged`);
                    }}
                    onReplace={(p)=>{
                      setParticipants(p);
                      saveState({participants:p,groupFieldMaps,tournamentData:data});
                      showFlash(`✓ ${p.length} loaded`);
                    }}
                    G={G} S1={S1} BD={BD} BG={BG}/>

                  {/* Add form */}
                  <div style={{background:S1,border:"1px solid rgba(0,230,100,0.08)",borderRadius:12,padding:14,marginBottom:14}}>
                    <div style={{fontSize:10,color:"rgba(0,230,100,0.4)",fontWeight:700,letterSpacing:1.5,marginBottom:10,textTransform:"uppercase"}}>+ Add Participant</div>
                    <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
                      <input value={addForm.name} onChange={e=>setAddForm(f=>({...f,name:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addParticipant()}
                        placeholder="Full name..."
                        style={{flex:"1 1 160px",background:"rgba(0,0,0,0.4)",border:`1px solid ${addForm.name?"rgba(0,230,100,0.4)":"rgba(0,230,100,0.1)"}`,borderRadius:8,padding:"9px 12px",color:"#e8f5ee",fontFamily:"'Barlow',sans-serif",fontSize:13,fontWeight:500}}/>
                      <input value={addForm.studentId||""} onChange={e=>setAddForm(f=>({...f,studentId:e.target.value}))}
                        placeholder="Student ID (optional)..."
                        style={{flex:"0 1 160px",background:"rgba(0,0,0,0.4)",border:`1px solid ${addForm.studentId?"rgba(0,230,100,0.3)":"rgba(0,230,100,0.08)"}`,borderRadius:8,padding:"9px 12px",color:"#e8f5ee",fontFamily:"'Barlow',sans-serif",fontSize:12}}/>
                      <button className="hbtn" style={{padding:"9px 16px",background:addForm.name&&addForm.cats.length?G:"rgba(0,230,100,0.08)",borderRadius:8,color:addForm.name&&addForm.cats.length?"#050e08":"rgba(0,230,100,0.3)",fontWeight:700,fontSize:12,cursor:"pointer",boxShadow:addForm.name&&addForm.cats.length?`0 4px 14px ${G}35`:"none"}} onClick={addParticipant}>+ ADD</button>
                    </div>
                    <div style={{fontSize:9,color:"rgba(0,230,100,0.35)",fontWeight:700,letterSpacing:1.5,marginBottom:7,textTransform:"uppercase"}}>Categories</div>
                    <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                      {CATEGORIES.map(c=>(
                        <button key={c.id} className="hbtn"
                          style={{padding:"4px 10px",borderRadius:5,fontSize:10,fontWeight:700,cursor:"pointer",background:addForm.cats.includes(c.id)?`${c.color}22`:"transparent",border:`1px solid ${addForm.cats.includes(c.id)?c.color:"rgba(0,230,100,0.1)"}`,color:addForm.cats.includes(c.id)?c.color:"rgba(0,230,100,0.35)"}}
                          onClick={()=>toggleAddCat(c.id)}>{c.icon} {c.short}</button>
                      ))}
                    </div>
                  </div>

                  {/* Search + filters */}
                  <div style={{background:S1,border:"1px solid rgba(0,230,100,0.07)",borderRadius:10,padding:"12px 14px",marginBottom:12}}>
                    <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
                      <input value={searchQ} onChange={e=>setSearchQ(e.target.value)} placeholder="🔍 Search by name..."
                        style={{flex:"1 1 150px",background:"rgba(0,0,0,0.4)",border:`1px solid ${searchQ?"rgba(0,230,100,0.35)":"rgba(0,230,100,0.1)"}`,borderRadius:7,padding:"8px 12px",color:"#e8f5ee",fontFamily:"'Barlow',sans-serif",fontSize:13}}/>
                      <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                        {[["all","ALL"],["present","✓"],["absent","✗"],["unmarked","?"]].map(([v,l])=>(
                          <button key={v} className="hbtn"
                            style={{padding:"7px 12px",borderRadius:6,fontSize:11,fontWeight:700,cursor:"pointer",
                              background:attFilter===v?(v==="present"?"rgba(16,185,129,0.2)":v==="absent"?"rgba(239,68,68,0.2)":v==="unmarked"?"rgba(245,158,11,0.2)":"rgba(0,230,100,0.15)"):"transparent",
                              border:`1px solid ${attFilter===v?(v==="present"?"rgba(16,185,129,0.5)":v==="absent"?"rgba(239,68,68,0.5)":v==="unmarked"?"rgba(245,158,11,0.5)":"rgba(0,230,100,0.3)"):"rgba(0,230,100,0.08)"}`,
                              color:attFilter===v?(v==="present"?"#10b981":v==="absent"?"#ef4444":v==="unmarked"?"#f59e0b":G):"rgba(0,230,100,0.35)"}}
                            onClick={()=>setAttFilter(v)}>{l}</button>
                        ))}
                      </div>
                    </div>
                    <div style={{fontSize:9,color:"rgba(0,230,100,0.3)",fontWeight:700,letterSpacing:1.5,marginBottom:6,textTransform:"uppercase"}}>Filter by Category</div>
                    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                      <button className="hbtn" style={{padding:"4px 9px",borderRadius:4,fontSize:10,fontWeight:700,cursor:"pointer",background:!catFilter?"rgba(0,230,100,0.15)":"transparent",border:`1px solid ${!catFilter?"rgba(0,230,100,0.3)":"rgba(0,230,100,0.08)"}`,color:!catFilter?G:"rgba(0,230,100,0.3)"}} onClick={()=>setCatFilter(null)}>ALL</button>
                      {CATEGORIES.map(c=>(
                        <button key={c.id} className="hbtn"
                          style={{padding:"4px 9px",borderRadius:4,fontSize:10,fontWeight:700,cursor:"pointer",background:catFilter===c.id?`${c.color}20`:"transparent",border:`1px solid ${catFilter===c.id?c.color:"rgba(0,230,100,0.08)"}`,color:catFilter===c.id?c.color:"rgba(0,230,100,0.3)"}}
                          onClick={()=>setCatFilter(catFilter===c.id?null:c.id)}>{c.icon} {c.short}</button>
                      ))}
                    </div>
                    <div style={{fontSize:10,color:"rgba(0,230,100,0.25)",marginTop:8}}>{attFiltered.length} shown</div>
                  </div>

                  {/* Participant list */}
                  <div style={{background:S1,border:"1px solid rgba(0,230,100,0.07)",borderRadius:12,overflow:"hidden"}}>
                    {attFiltered.length===0?(
                      <div style={{padding:"28px",textAlign:"center",color:"rgba(0,230,100,0.25)",fontSize:13}}>No participants match</div>
                    ):attFiltered.map(p=>(
                      <div key={p.id} className="mrow" style={{display:"flex",alignItems:"center",padding:"10px 16px",borderBottom:"1px solid rgba(0,230,100,0.04)",gap:10,flexWrap:"wrap",
                        background:p.attendance==="present"?"rgba(16,185,129,0.03)":p.attendance==="absent"?"rgba(239,68,68,0.03)":"transparent"}}>
                        <div style={{width:7,height:7,borderRadius:"50%",flexShrink:0,background:p.attendance==="present"?"#10b981":p.attendance==="absent"?"#ef4444":"rgba(0,230,100,0.2)"}}/>
                        <div style={{flex:1,minWidth:120}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                            <div style={{fontWeight:700,fontSize:"clamp(12px,1.3vw,14px)",color:p.attendance==="absent"?"rgba(232,245,238,0.3)":"#e8f5ee"}}>{p.name}</div>
                            {p.studentId&&<span style={{fontSize:10,color:"rgba(0,230,100,0.5)",background:"rgba(0,230,100,0.06)",border:"1px solid rgba(0,230,100,0.12)",padding:"1px 7px",borderRadius:3,fontWeight:700,flexShrink:0,letterSpacing:0.5}}>{p.studentId}</span>}
                          </div>
                          <div style={{display:"flex",gap:3,marginTop:3,flexWrap:"wrap"}}>
                            {p.categories.map(cid=>{const c=CATEGORIES.find(x=>x.id===cid);return c?(<span key={cid} style={{fontSize:9,color:c.color,background:`${c.color}12`,padding:"1px 6px",borderRadius:3,fontWeight:700,opacity:p.attendance==="absent"?0.3:1}}>{c.icon} {c.short}</span>):null;})}
                          </div>
                        </div>
                        <div style={{display:"flex",gap:5,flexShrink:0}}>
                          <button className="hbtn" style={{padding:"6px 12px",borderRadius:6,fontSize:11,fontWeight:700,cursor:"pointer",background:p.attendance==="present"?"rgba(16,185,129,0.2)":"transparent",border:`1px solid ${p.attendance==="present"?"rgba(16,185,129,0.5)":"rgba(16,185,129,0.15)"}`,color:p.attendance==="present"?"#10b981":"rgba(16,185,129,0.4)"}} onClick={()=>markAttendance(p.id,"present")}>✓</button>
                          <button className="hbtn" style={{padding:"6px 12px",borderRadius:6,fontSize:11,fontWeight:700,cursor:"pointer",background:p.attendance==="absent"?"rgba(239,68,68,0.2)":"transparent",border:`1px solid ${p.attendance==="absent"?"rgba(239,68,68,0.5)":"rgba(239,68,68,0.15)"}`,color:p.attendance==="absent"?"#ef4444":"rgba(239,68,68,0.4)"}} onClick={()=>markAttendance(p.id,"absent")}>✗</button>
                          <button className="hbtn" style={{padding:"6px 10px",borderRadius:6,fontSize:11,cursor:"pointer",background:editingId===p.id?"rgba(0,230,100,0.1)":"transparent",border:`1px solid ${editingId===p.id?"rgba(0,230,100,0.3)":"rgba(0,230,100,0.1)"}`,color:editingId===p.id?"#00e664":"rgba(0,230,100,0.3)"}} onClick={()=>setEditingId(editingId===p.id?null:p.id)}>✏</button>
                          <button className="hbtn" style={{padding:"6px 10px",borderRadius:6,fontSize:11,cursor:"pointer",background:"transparent",border:"1px solid rgba(0,230,100,0.08)",color:"rgba(0,230,100,0.25)"}} onClick={()=>removeParticipant(p.id)}>🗑</button>
                        </div>
                        {editingId===p.id&&(
                          <div style={{marginTop:8,padding:"10px 12px",background:"rgba(0,0,0,0.3)",borderRadius:8,border:"1px solid rgba(0,230,100,0.12)"}}>
                            <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                              <input defaultValue={p.name} id={`ename-${p.id}`}
                                style={{flex:"1 1 140px",background:"rgba(0,0,0,0.4)",border:"1px solid rgba(0,230,100,0.2)",borderRadius:6,padding:"7px 10px",color:"#e8f5ee",fontFamily:"'Barlow',sans-serif",fontSize:12}}
                                placeholder="Full name"/>
                              <input defaultValue={p.studentId||""} id={`esid-${p.id}`}
                                style={{flex:"0 1 120px",background:"rgba(0,0,0,0.4)",border:"1px solid rgba(0,230,100,0.1)",borderRadius:6,padding:"7px 10px",color:"#e8f5ee",fontFamily:"'Barlow',sans-serif",fontSize:12}}
                                placeholder="Student ID"/>
                            </div>
                            <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
                              {CATEGORIES.map(c=>(
                                <button key={c.id} className="hbtn"
                                  style={{padding:"3px 8px",borderRadius:4,fontSize:10,fontWeight:700,cursor:"pointer",
                                    background:p.categories.includes(c.id)?`${c.color}20`:"transparent",
                                    border:`1px solid ${p.categories.includes(c.id)?c.color:"rgba(0,230,100,0.1)"}`,
                                    color:p.categories.includes(c.id)?c.color:"rgba(0,230,100,0.3)"}}
                                  onClick={()=>{
                                    const cats=p.categories.includes(c.id)?p.categories.filter(x=>x!==c.id):[...p.categories,c.id];
                                    const updated=participants.map(x=>x.id===p.id?{...x,categories:cats}:x);
                                    setParticipants(updated);saveState({participants:updated,groupFieldMaps,tournamentData:data,knockoutData});
                                  }}>{c.icon} {c.short}</button>
                              ))}
                            </div>
                            <button className="hbtn"
                              style={{padding:"6px 14px",background:"linear-gradient(135deg,#00e664,#009944)",border:"none",borderRadius:6,color:"#050e08",fontWeight:700,fontSize:11,cursor:"pointer"}}
                              onClick={()=>{
                                const nm=document.getElementById(`ename-${p.id}`)?.value||p.name;
                                const sid=document.getElementById(`esid-${p.id}`)?.value||"";
                                const updated=participants.map(x=>x.id===p.id?{...x,name:nm.trim(),studentId:sid.trim()}:x);
                                setParticipants(updated);saveState({participants:updated,groupFieldMaps,tournamentData:data,knockoutData});
                                setEditingId(null);showFlash("✓ Updated");
                              }}>SAVE CHANGES</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {adminTab==="teams"&&(
                <div className="fadein">
                  {/* Teams header stats */}
                  <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
                    {Object.entries(TEAM_CATEGORIES).map(([catId,cfg])=>{
                      const catTeams=participants.filter(p=>p.isTeam&&p.categories.includes(catId));
                      const cat=CATEGORIES.find(c=>c.id===catId);
                      return(
                        <div key={catId} style={{fontSize:11,color:cat?.color||"#00e664",fontWeight:700,background:"rgba(0,0,0,0.4)",border:`1px solid ${cat?.color||"#00e664"}25`,padding:"5px 12px",borderRadius:6}}>
                          {cat?.icon} {cfg.label}: {catTeams.length} teams
                        </div>
                      );
                    })}
                  </div>

                  {/* Team Registration Form */}
                  <div style={{background:"rgba(0,0,0,0.3)",border:"1px solid rgba(0,230,100,0.12)",borderRadius:12,padding:18,marginBottom:16}}>
                    <div style={{fontSize:10,color:"rgba(0,230,100,0.4)",fontWeight:700,letterSpacing:1.5,marginBottom:14,textTransform:"uppercase"}}>Register New Team</div>

                    {/* Category selector */}
                    <div style={{marginBottom:14}}>
                      <div style={{fontSize:9,color:"rgba(0,230,100,0.35)",fontWeight:700,letterSpacing:1,marginBottom:8,textTransform:"uppercase"}}>Category</div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        {Object.entries(TEAM_CATEGORIES).map(([catId,cfg])=>{
                          const cat=CATEGORIES.find(c=>c.id===catId);
                          const isSelected=teamForm.category===catId;
                          return(
                            <button key={catId} className="hbtn"
                              style={{padding:"7px 14px",borderRadius:7,fontSize:11,fontWeight:700,cursor:"pointer",
                                background:isSelected?`${cat?.color||"#00e664"}20`:"transparent",
                                border:`1px solid ${isSelected?cat?.color||"#00e664":"rgba(0,230,100,0.15)"}`,
                                color:isSelected?cat?.color||"#00e664":"rgba(0,230,100,0.4)"}}
                              onClick={()=>selectTeamCategory(catId)}>
                              {cat?.icon} {cfg.label}
                              <span style={{marginLeft:6,fontSize:9,opacity:0.7}}>({cfg.playerCount} players)</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Team name */}
                    <div style={{marginBottom:14}}>
                      <div style={{fontSize:9,color:"rgba(0,230,100,0.35)",fontWeight:700,letterSpacing:1,marginBottom:8,textTransform:"uppercase"}}>Team Name</div>
                      <input value={teamForm.name}
                        onChange={e=>setTeamForm(f=>({...f,name:e.target.value}))}
                        onKeyDown={e=>e.key==="Enter"&&addTeam()}
                        placeholder="e.g. SMK Penang Utama / Team Eagle..."
                        style={{width:"100%",background:"rgba(0,0,0,0.4)",border:`1px solid ${teamForm.name?"rgba(0,230,100,0.4)":"rgba(0,230,100,0.1)"}`,borderRadius:8,padding:"10px 14px",color:"#e8f5ee",fontFamily:"'Barlow',sans-serif",fontSize:13,fontWeight:500}}/>
                    </div>

                    {/* Player names */}
                    <div style={{marginBottom:16}}>
                      <div style={{fontSize:9,color:"rgba(0,230,100,0.35)",fontWeight:700,letterSpacing:1,marginBottom:8,textTransform:"uppercase"}}>
                        Player Names ({TEAM_CATEGORIES[teamForm.category]?.playerCount} players)
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:8}}>
                        {teamForm.players.map((player,idx)=>(
                          <PlayerSearchInput key={idx} idx={idx} value={player}
                            participants={participants}
                            onChange={val=>updateTeamPlayer(idx,val)}
                            accent={accent}/>
                        ))}
                      </div>
                    </div>

                    <button className="hbtn"
                      style={{padding:"10px 24px",background:teamForm.name?`linear-gradient(135deg,#00e664,#009944)`:"rgba(0,230,100,0.05)",border:teamForm.name?"none":"1px solid rgba(0,230,100,0.1)",borderRadius:8,color:teamForm.name?"#050e08":"rgba(0,230,100,0.25)",fontWeight:700,fontSize:12,cursor:teamForm.name?"pointer":"not-allowed",boxShadow:teamForm.name?"0 4px 14px rgba(0,230,100,0.3)":"none"}}
                      onClick={addTeam}>
                      + REGISTER TEAM
                    </button>
                  </div>

                  {/* Registered teams list */}
                  {Object.entries(TEAM_CATEGORIES).map(([catId,cfg])=>{
                    const catTeams=participants.filter(p=>p.isTeam&&p.categories.includes(catId));
                    const cat=CATEGORIES.find(c=>c.id===catId);
                    if(!catTeams.length) return null;
                    return(
                      <div key={catId} style={{background:"rgba(5,14,8,0.8)",border:`1px solid ${cat?.color||"#00e664"}20`,borderRadius:12,overflow:"hidden",marginBottom:12}}>
                        <div style={{padding:"10px 16px",background:`${cat?.color||"#00e664"}08`,borderBottom:`1px solid ${cat?.color||"#00e664"}15`,display:"flex",alignItems:"center",gap:10}}>
                          <div style={{fontFamily:"'Bebas Neue'",fontSize:14,color:cat?.color||"#00e664",letterSpacing:2}}>{cat?.icon} {cfg.label}</div>
                          <div style={{fontSize:10,color:"rgba(0,230,100,0.4)",fontWeight:700}}>{catTeams.length} team{catTeams.length!==1?"s":""} registered</div>
                          <div style={{marginLeft:"auto",fontSize:9,color:"rgba(0,230,100,0.3)"}}>Each team = 1 entry in tournament</div>
                        </div>
                        {catTeams.map((team,ti)=>(
                          <div key={team.id} className="mrow" style={{padding:"12px 16px",borderBottom:"1px solid rgba(0,230,100,0.04)",display:"flex",alignItems:"flex-start",gap:12,
                            background:team.attendance==="present"?"rgba(16,185,129,0.03)":team.attendance==="absent"?"rgba(239,68,68,0.03)":"transparent"}}>
                            <div style={{width:7,height:7,borderRadius:"50%",flexShrink:0,marginTop:5,background:team.attendance==="present"?"#10b981":team.attendance==="absent"?"#ef4444":"rgba(0,230,100,0.2)"}}/>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontWeight:700,fontSize:14,color:"#e8f5ee",marginBottom:6}}>{team.name}</div>
                              {team.players?.length>0&&(
                                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                                  {team.players.map((p,pi)=>(
                                    <span key={pi} style={{fontSize:10,color:"rgba(0,230,100,0.5)",background:"rgba(0,230,100,0.06)",border:"1px solid rgba(0,230,100,0.1)",padding:"2px 8px",borderRadius:4}}>
                                      {pi+1}. {p}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div style={{display:"flex",gap:5,flexShrink:0}}>
                              <button className="hbtn" style={{padding:"6px 10px",borderRadius:6,fontSize:11,fontWeight:700,cursor:"pointer",background:team.attendance==="present"?"rgba(16,185,129,0.2)":"transparent",border:`1px solid ${team.attendance==="present"?"rgba(16,185,129,0.5)":"rgba(16,185,129,0.15)"}`,color:team.attendance==="present"?"#10b981":"rgba(16,185,129,0.4)"}} onClick={()=>markAttendance(team.id,"present")}>✓</button>
                              <button className="hbtn" style={{padding:"6px 10px",borderRadius:6,fontSize:11,fontWeight:700,cursor:"pointer",background:team.attendance==="absent"?"rgba(239,68,68,0.2)":"transparent",border:`1px solid ${team.attendance==="absent"?"rgba(239,68,68,0.5)":"rgba(239,68,68,0.15)"}`,color:team.attendance==="absent"?"#ef4444":"rgba(239,68,68,0.4)"}} onClick={()=>markAttendance(team.id,"absent")}>✗</button>
                              <button className="hbtn" style={{padding:"6px 10px",borderRadius:6,fontSize:11,cursor:"pointer",background:"transparent",border:"1px solid rgba(0,230,100,0.08)",color:"rgba(0,230,100,0.25)"}} onClick={()=>removeParticipant(team.id)}>🗑</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}

                  {!participants.some(p=>p.isTeam)&&(
                    <div style={{textAlign:"center",padding:"40px 20px",color:"rgba(0,230,100,0.25)",fontSize:13}}>
                      No teams registered yet. Use the form above to add teams.
                    </div>
                  )}
                </div>
              )}

              {adminTab==="score"&&(
                <div className="fadein">
                  {/* Admin Scoring Panel - replaces judge view */}
                  <div style={{fontFamily:"'Bebas Neue'",fontSize:22,color:G,letterSpacing:3,marginBottom:16}}>⚽ FIELD SCORING</div>
                  {!isGenerated?(
                    <div style={{textAlign:"center",padding:40,color:"rgba(0,230,100,0.3)"}}>Generate the tournament first.</div>
                  ):(
                    <div>
                      {/* Category + Field selector */}
                      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
                        <div style={{flex:1}}>
                          <div style={{fontSize:9,color:"rgba(0,230,100,0.35)",fontWeight:700,letterSpacing:1,marginBottom:6}}>CATEGORY</div>
                          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                            {CATEGORIES.map(c=>{
                              const cd=data[c.id];
                              if(!cd?.matches?.length)return null;
                              return(
                                <button key={c.id} className="hbtn"
                                  style={{padding:"6px 12px",borderRadius:7,fontSize:11,fontWeight:700,cursor:"pointer",
                                    background:scoringCat===c.id?`${c.color}20`:"transparent",
                                    border:`1px solid ${scoringCat===c.id?c.color:"rgba(0,230,100,0.1)"}`,
                                    color:scoringCat===c.id?c.color:"rgba(0,230,100,0.35)"}}
                                  onClick={()=>{setScoringCat(c.id);setScoringField(1);}}>
                                  {c.icon} {c.short}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      <AdminScoringView data={data} scoringCat={scoringCat} scoringField={scoringField} setScoringField={setScoringField} FIELD_CONFIG={FIELD_CONFIG} holdMatch={holdMatch} releaseMatch={releaseMatch} openScoreModal={openScoreModal}/>
                    </div>
                  )}
                </div>
              )}

                            {adminTab==="score"&&(
                <div className="fadein">
                  {!isGenerated?(
                    <div style={{textAlign:"center",padding:"40px 20px",color:"rgba(0,230,100,0.25)",fontSize:13}}>
                      <div style={{fontSize:40,marginBottom:12}}>🎯</div>
                      <div>Generate the tournament first to start scoring.</div>
                    </div>
                  ):(
                    <JudgePanel
                      isGenerated={isGenerated}
                      judgeCategory={scoreCat}
                      judgeField={scoreField}
                      CATEGORIES={CATEGORIES}
                      FIELD_CONFIG={FIELD_CONFIG}
                      tournamentData={data}
                      groupFieldMaps={groupFieldMaps}
                      participants={participants}
                      selectJudgeCategory={cat=>{setScoreCat(cat);setScoreField(null);}}
                      selectJudgeField={setScoreField}
                      changeJudgeCategory={()=>{setScoreCat(null);setScoreField(null);}}
                      setJudgeField={setScoreField}
                      holdMatch={(catId,matchId)=>holdMatch(catId,matchId)}
                      releaseMatch={(catId,matchId)=>releaseMatch(catId,matchId)}
                      openScoreModal={openScoreModal}
                      G={G} S1={S1} BD={BD} BG={BG}
                    />
                  )}
                </div>
              )}

              {adminTab==="generate"&&(
                <div>
                  {/* ── GROUP SETUP SECTION ── */}
                  <div style={{marginBottom:20}}>
                    <div style={{fontFamily:"'Bebas Neue'",fontSize:18,color:G,letterSpacing:2,marginBottom:12}}>⚙ GROUP SETUP</div>
                    {/* Category selector */}
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
                      {CATEGORIES.filter(c=>getParticipantsForCat(c.id).length>0).map(c=>{
                        const isDIY=DIY_CATS.includes(c.id);
                        const catPpts=getParticipantsForCat(c.id);
                        const assigned=isDIY
                          ?Object.keys(diyAreas[c.id]||{}).length
                          :Object.keys(manualGroups[c.id]||{}).length;
                        const allDone=catPpts.length>0&&assigned>=catPpts.length;
                        return(
                          <button key={c.id} className="hbtn"
                            style={{padding:"7px 14px",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer",
                              background:setupCat===c.id?`${c.color}20`:allDone?"rgba(16,185,129,0.08)":"rgba(0,0,0,0.3)",
                              border:`1px solid ${setupCat===c.id?c.color:allDone?"rgba(16,185,129,0.3)":"rgba(0,230,100,0.1)"}`,
                              color:setupCat===c.id?c.color:allDone?"#10b981":"rgba(0,230,100,0.4)"}}
                            onClick={()=>setSetupCat(setupCat===c.id?null:c.id)}>
                            {c.icon} {c.short}
                            <span style={{marginLeft:5,fontSize:9,opacity:0.7}}>
                              {allDone?"✓ done":`${assigned}/${catPpts.length}`}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* DIY Soccer Area Split */}
                    {setupCat&&DIY_CATS.includes(setupCat)&&(()=>{
                      const cat=CATEGORIES.find(c=>c.id===setupCat);
                      const ppts=getParticipantsForCat(setupCat);
                      const areas=diyAreas[setupCat]||{};
                      const area1=ppts.filter(p=>areas[p.id]==="1");
                      const area2=ppts.filter(p=>areas[p.id]==="2");
                      const unassigned=ppts.filter(p=>!areas[p.id]);
                      return(
                        <div style={{background:"rgba(5,14,8,0.8)",border:`1px solid ${cat.color}20`,borderRadius:12,padding:16}}>
                          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12,flexWrap:"wrap"}}>
                            <div style={{fontFamily:"'Bebas Neue'",fontSize:14,color:cat.color,letterSpacing:2}}>{cat.icon} {cat.name} — AREA SPLIT</div>
                            <div style={{fontSize:10,color:"rgba(0,230,100,0.4)"}}>{ppts.length} participants · {unassigned.length} unassigned</div>
                            <button className="hbtn" onClick={()=>autoSplitDIY(setupCat)}
                              style={{padding:"5px 12px",background:"rgba(0,230,100,0.08)",border:"1px solid rgba(0,230,100,0.2)",borderRadius:6,color:G,fontSize:10,fontWeight:700,cursor:"pointer",marginLeft:"auto"}}>
                              ⚡ AUTO-SPLIT EVENLY
                            </button>
                          </div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                            {/* Unassigned */}
                            <div>
                              <div style={{fontSize:9,color:"rgba(0,230,100,0.4)",fontWeight:700,letterSpacing:1,marginBottom:6}}>UNASSIGNED ({unassigned.length})</div>
                              <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:300,overflowY:"auto"}}>
                                {unassigned.map(p=>(
                                  <div key={p.id} style={{display:"flex",gap:4,alignItems:"center",background:"rgba(0,0,0,0.3)",borderRadius:6,padding:"5px 8px"}}>
                                    <div style={{flex:1,fontSize:11,color:"rgba(232,245,238,0.7)",lineHeight:1.2,wordBreak:"break-word"}}>{p.name}</div>
                                    <button className="hbtn" onClick={()=>assignToDiyArea(setupCat,p.id,"1")} style={{padding:"2px 7px",borderRadius:4,fontSize:9,fontWeight:700,cursor:"pointer",background:"rgba(0,230,100,0.1)",border:"1px solid rgba(0,230,100,0.2)",color:G,flexShrink:0}}>→1</button>
                                    <button className="hbtn" onClick={()=>assignToDiyArea(setupCat,p.id,"2")} style={{padding:"2px 7px",borderRadius:4,fontSize:9,fontWeight:700,cursor:"pointer",background:"rgba(255,215,0,0.1)",border:"1px solid rgba(255,215,0,0.2)",color:"#ffd700",flexShrink:0}}>→2</button>
                                  </div>
                                ))}
                              </div>
                            </div>
                            {/* Area 1 */}
                            <div>
                              <div style={{fontSize:9,color:G,fontWeight:700,letterSpacing:1,marginBottom:6}}>AREA 1 — SATHISH ({area1.length}) · Fields 1-4+S1</div>
                              <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:300,overflowY:"auto"}}>
                                {area1.map(p=>(
                                  <div key={p.id} style={{display:"flex",gap:4,alignItems:"center",background:"rgba(0,230,100,0.05)",border:"1px solid rgba(0,230,100,0.1)",borderRadius:6,padding:"5px 8px"}}>
                                    <div style={{flex:1,fontSize:11,color:"rgba(232,245,238,0.8)",lineHeight:1.2,wordBreak:"break-word"}}>{p.name}</div>
                                    <button className="hbtn" onClick={()=>assignToDiyArea(setupCat,p.id,"2")} style={{padding:"2px 6px",borderRadius:4,fontSize:9,cursor:"pointer",background:"transparent",border:"1px solid rgba(255,215,0,0.2)",color:"#ffd700",flexShrink:0}}>→2</button>
                                    <button className="hbtn" onClick={()=>assignToDiyArea(setupCat,p.id,null)} style={{padding:"2px 6px",borderRadius:4,fontSize:9,cursor:"pointer",background:"transparent",border:"1px solid rgba(0,230,100,0.1)",color:"rgba(0,230,100,0.3)",flexShrink:0}}>✕</button>
                                  </div>
                                ))}
                              </div>
                            </div>
                            {/* Area 2 */}
                            <div>
                              <div style={{fontSize:9,color:"#ffd700",fontWeight:700,letterSpacing:1,marginBottom:6}}>AREA 2 — PARAM ({area2.length}) · Fields 5-8+S2</div>
                              <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:300,overflowY:"auto"}}>
                                {area2.map(p=>(
                                  <div key={p.id} style={{display:"flex",gap:4,alignItems:"center",background:"rgba(255,215,0,0.04)",border:"1px solid rgba(255,215,0,0.1)",borderRadius:6,padding:"5px 8px"}}>
                                    <div style={{flex:1,fontSize:11,color:"rgba(232,245,238,0.8)",lineHeight:1.2,wordBreak:"break-word"}}>{p.name}</div>
                                    <button className="hbtn" onClick={()=>assignToDiyArea(setupCat,p.id,"1")} style={{padding:"2px 6px",borderRadius:4,fontSize:9,cursor:"pointer",background:"transparent",border:"1px solid rgba(0,230,100,0.2)",color:G,flexShrink:0}}>→1</button>
                                    <button className="hbtn" onClick={()=>assignToDiyArea(setupCat,p.id,null)} style={{padding:"2px 6px",borderRadius:4,fontSize:9,cursor:"pointer",background:"transparent",border:"1px solid rgba(255,215,0,0.1)",color:"rgba(255,215,0,0.3)",flexShrink:0}}>✕</button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Manual Group Assignment (non-DIY) */}
                    {setupCat&&!DIY_CATS.includes(setupCat)&&(()=>{
                      const cat=CATEGORIES.find(c=>c.id===setupCat);
                      const ppts=getParticipantsForCat(setupCat);
                      const assignments=manualGroups[setupCat]||{};
                      const unassigned=ppts.filter(p=>!assignments[p.id]);
                      const groupLetters=[...new Set(Object.values(assignments))].sort();
                      const allLetters="ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
                      const nextLetter=allLetters.find(l=>!groupLetters.includes(l))||"A";
                      const fieldCfg=FIELD_CONFIG[setupCat];
                      return(
                        <div style={{background:"rgba(5,14,8,0.8)",border:`1px solid ${cat.color}20`,borderRadius:12,padding:16}}>
                          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12,flexWrap:"wrap"}}>
                            <div style={{fontFamily:"'Bebas Neue'",fontSize:14,color:cat.color,letterSpacing:2}}>{cat.icon} {cat.name} — GROUP ASSIGNMENT</div>
                            <div style={{fontSize:10,color:"rgba(0,230,100,0.4)"}}>{ppts.length} participants · {unassigned.length} unassigned</div>
                            <div style={{marginLeft:"auto",display:"flex",gap:6}}>
                              <button className="hbtn"
                                onClick={()=>{
                                  // Auto-distribute evenly across existing groups (or create groups)
                                  const numGroups=Math.max(groupLetters.length||Math.ceil(ppts.length/6),1);
                                  const newAssign={...assignments};
                                  unassigned.forEach((p,i)=>{newAssign[p.id]=allLetters[i%numGroups];});
                                  setManualGroups(prev=>({...prev,[setupCat]:newAssign}));
                                  showFlash("Auto-distributed unassigned participants");
                                }}
                                style={{padding:"5px 12px",background:"rgba(0,230,100,0.08)",border:"1px solid rgba(0,230,100,0.2)",borderRadius:6,color:G,fontSize:10,fontWeight:700,cursor:"pointer"}}>
                                ⚡ AUTO-FILL
                              </button>
                              <button className="hbtn" onClick={()=>clearGroupAssignments(setupCat)}
                                style={{padding:"5px 12px",background:"rgba(239,68,68,0.06)",border:"1px solid rgba(239,68,68,0.15)",borderRadius:6,color:"#ef4444",fontSize:10,fontWeight:700,cursor:"pointer"}}>
                                🗑 CLEAR
                              </button>
                            </div>
                          </div>
                          {/* Unassigned pool */}
                          {unassigned.length>0&&(
                            <div style={{marginBottom:14}}>
                              <div style={{fontSize:9,color:"rgba(0,230,100,0.4)",fontWeight:700,letterSpacing:1,marginBottom:6}}>UNASSIGNED ({unassigned.length}) — tap a group button to assign</div>
                              <div style={{display:"flex",flexDirection:"column",gap:3}}>
                                {unassigned.map(p=>(
                                  <div key={p.id} style={{display:"flex",alignItems:"center",gap:6,background:"rgba(0,0,0,0.3)",borderRadius:6,padding:"6px 10px",flexWrap:"wrap"}}>
                                    <div style={{flex:1,fontSize:12,fontWeight:600,color:"rgba(232,245,238,0.7)",lineHeight:1.2,wordBreak:"break-word",minWidth:100}}>
                                      {p.name}{p.studentId&&<span style={{marginLeft:6,fontSize:9,color:"rgba(0,230,100,0.4)",background:"rgba(0,230,100,0.06)",padding:"1px 5px",borderRadius:3}}>{p.studentId}</span>}
                                    </div>
                                    <div style={{display:"flex",gap:4,flexWrap:"wrap",flexShrink:0}}>
                                      {allLetters.slice(0,Math.max(groupLetters.length+1,2)).map(letter=>(
                                        <button key={letter} className="hbtn"
                                          onClick={()=>assignToGroup(setupCat,p.id,letter)}
                                          style={{padding:"3px 10px",borderRadius:4,fontSize:11,fontWeight:700,cursor:"pointer",
                                            background:`${cat.color}15`,border:`1px solid ${cat.color}40`,color:cat.color}}>
                                          {letter}
                                        </button>
                                      ))}
                                      <button className="hbtn"
                                        onClick={()=>assignToGroup(setupCat,p.id,nextLetter)}
                                        style={{padding:"3px 10px",borderRadius:4,fontSize:11,fontWeight:700,cursor:"pointer",
                                          background:"rgba(0,230,100,0.04)",border:"1px dashed rgba(0,230,100,0.2)",color:"rgba(0,230,100,0.4)"}}>
                                        +{nextLetter}
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {/* Assigned groups */}
                          {groupLetters.length>0&&(
                            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:8}}>
                              {groupLetters.map(letter=>{
                                const members=ppts.filter(p=>assignments[p.id]===letter);
                                const fieldNum=groupFieldMaps[setupCat]?.[letter]||(allLetters.indexOf(letter)%fieldCfg.count)+1;
                                return(
                                  <div key={letter} style={{background:"rgba(0,0,0,0.3)",border:`1px solid ${cat.color}20`,borderRadius:8,overflow:"hidden"}}>
                                    <div style={{padding:"7px 10px",background:`${cat.color}10`,borderBottom:`1px solid ${cat.color}15`,display:"flex",alignItems:"center",gap:8}}>
                                      <div style={{fontFamily:"'Bebas Neue'",fontSize:14,color:cat.color,letterSpacing:2}}>GROUP {letter}</div>
                                      <div style={{fontSize:9,color:"rgba(0,230,100,0.4)",fontWeight:700}}>{members.length} players</div>
                                      <select value={fieldNum}
                                        onChange={e=>{
                                          const fv=Number(e.target.value);
                                          const updated={...(groupFieldMaps[setupCat]||{}),[letter]:fv};
                                          const newMaps={...groupFieldMaps,[setupCat]:updated};
                                          setGroupFieldMaps(newMaps);
                                          saveState({participants,groupFieldMaps:newMaps,tournamentData:data,knockoutData});
                                        }}
                                        style={{marginLeft:"auto",background:"rgba(0,0,0,0.4)",border:"1px solid rgba(0,230,100,0.15)",borderRadius:4,color:G,fontSize:9,padding:"2px 4px",cursor:"pointer"}}>
                                        {Array.from({length:fieldCfg.count},(_,i)=>i+1).map(f=>(
                                          <option key={f} value={f}>{fieldCfg.label} {f}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div style={{padding:"6px 8px",display:"flex",flexDirection:"column",gap:3}}>
                                      {members.map(p=>(
                                        <div key={p.id} style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"rgba(232,245,238,0.7)"}}>
                                          <span style={{flex:1,lineHeight:1.2,wordBreak:"break-word"}}>{p.name}</span>
                                          <button className="hbtn" onClick={()=>assignToGroup(setupCat,p.id,null)}
                                            style={{fontSize:9,color:"rgba(0,230,100,0.3)",background:"transparent",border:"none",cursor:"pointer",flexShrink:0}}>✕</button>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {!isGenerated?(
                    <div>
                      <div style={{fontFamily:"'Bebas Neue'",fontSize:"clamp(18px,2.5vw,24px)",color:G,letterSpacing:3,marginBottom:6}}>GENERATE TOURNAMENT</div>
                      <div style={{fontSize:12,color:"rgba(0,230,100,0.4)",marginBottom:20}}>Confirm attendance below then generate all fixtures.</div>
                      {unmarkedCount>0&&(
                        <div style={{background:"rgba(245,158,11,0.07)",border:"1px solid rgba(245,158,11,0.2)",borderRadius:10,padding:"11px 16px",marginBottom:16,fontSize:12,color:"#f59e0b"}}>
                          ⚠ {unmarkedCount} participants still unmarked — go to Participants tab first.
                        </div>
                      )}
                      {/* Field assignment */}
                      <div style={{background:S1,border:"1px solid rgba(0,230,100,0.07)",borderRadius:12,overflow:"hidden",marginBottom:16}}>
                        <div style={{padding:"11px 16px",borderBottom:"1px solid rgba(0,230,100,0.06)",background:"rgba(0,230,100,0.04)"}}>
                          <div style={{fontFamily:"'Bebas Neue'",fontSize:15,color:G,letterSpacing:2}}>🗂 ASSIGN GROUPS TO FIELDS</div>
                          <div style={{fontSize:10,color:"rgba(0,230,100,0.35)",marginTop:2}}>Tap field numbers to reassign groups</div>
                        </div>
                        {CATEGORIES.map(c=>{
                          const fc=FIELD_CONFIG[c.id];
                          const pres=participants.filter(p=>p.categories.includes(c.id)&&p.attendance==="present").length;
                          if(pres===0)return null;
                          const sizes=calcGroupSizes(pres),L="ABCDEFGHIJKLMNOPQRSTUVWXYZ",groups=sizes.map((_,i)=>L[i]);
                          const fmap=getGroupFieldMap(c.id,groups,fc.count);
                          const fieldLoad={};for(let f=1;f<=fc.count;f++)fieldLoad[f]=groups.filter(g=>fmap[g]===f).length;
                          const maxLoad=Math.max(...Object.values(fieldLoad)),minLoad=Math.min(...Object.values(fieldLoad));
                          return(
                            <div key={c.id} style={{borderBottom:"1px solid rgba(0,230,100,0.04)",padding:"10px 16px"}}>
                              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                                <span style={{fontSize:11,fontWeight:700,color:"rgba(232,245,238,0.7)"}}>{c.icon} {c.name}</span>
                                <span style={{fontSize:9,color:"rgba(0,230,100,0.3)"}}>{groups.length} groups · {fc.count} {fc.label.toLowerCase()}{fc.count>1?"s":""}</span>
                                <span style={{marginLeft:"auto",fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:8,background:(maxLoad-minLoad)<=1?"rgba(16,185,129,0.12)":"rgba(245,158,11,0.12)",color:(maxLoad-minLoad)<=1?"#10b981":"#f59e0b"}}>{(maxLoad-minLoad)<=1?"✓ BALANCED":"⚠ UNEVEN"}</span>
                              </div>
                              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                                {groups.map(g=>(
                                  <div key={g} style={{background:`${c.color}10`,border:`1px solid ${c.color}20`,borderRadius:7,padding:"5px 8px",display:"flex",alignItems:"center",gap:5}}>
                                    <span style={{fontSize:10,fontWeight:700,color:c.color}}>GRP {g}</span>
                                    {Array.from({length:fc.count},(_,i)=>i+1).map(f=>(
                                      <button key={f} className="hbtn"
                                        style={{width:22,height:22,borderRadius:4,fontSize:10,fontWeight:700,cursor:"pointer",background:fmap[g]===f?c.color:"transparent",border:`1px solid ${fmap[g]===f?c.color:"rgba(0,230,100,0.15)"}`,color:fmap[g]===f?"#050e08":"rgba(0,230,100,0.4)"}}
                                        onClick={()=>{const nm={...(groupFieldMaps[c.id]||{}),...fmap,[g]:f};setGroupFieldMaps(prev=>({...prev,[c.id]:nm}));}}>{f}</button>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {/* Category summary */}
                      <div style={{background:S1,border:"1px solid rgba(0,230,100,0.07)",borderRadius:12,overflow:"hidden",marginBottom:16}}>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 80px 80px 70px",gap:10,padding:"9px 16px",borderBottom:"1px solid rgba(0,230,100,0.06)"}}>
                          {["CATEGORY","REGISTERED","PRESENT","GROUPS"].map(h=><div key={h} style={{fontSize:9,color:"rgba(0,230,100,0.35)",fontWeight:700,letterSpacing:1}}>{h}</div>)}
                        </div>
                        {CATEGORIES.map(c=>{
                          const reg=participants.filter(p=>p.categories.includes(c.id)).length;
                          const pres=participants.filter(p=>p.categories.includes(c.id)&&p.attendance==="present").length;
                          return(
                            <div key={c.id} className="mrow" style={{padding:"9px 16px",borderBottom:"1px solid rgba(0,230,100,0.03)",display:"grid",gridTemplateColumns:"1fr 80px 80px 70px",gap:10,alignItems:"center"}}>
                              <div style={{fontWeight:600,fontSize:12}}>{c.icon} {c.name}</div>
                              <div style={{fontSize:12,color:"rgba(232,245,238,0.4)"}}>{reg}</div>
                              <div style={{fontSize:12,color:pres>0?"#10b981":"rgba(0,230,100,0.25)",fontWeight:pres>0?700:400}}>{pres}</div>
                              <div style={{fontSize:12,color:c.color,fontWeight:700}}>{pres>0?calcGroupSizes(pres).length:"—"}</div>
                            </div>
                          );
                        })}
                      </div>
                      <button className="hbtn"
                        style={{width:"100%",padding:"18px",background:presentCount>0?`linear-gradient(135deg,${G},#009944)`:"rgba(0,230,100,0.05)",borderRadius:12,color:presentCount>0?"#050e08":"rgba(0,230,100,0.25)",fontFamily:"'Bebas Neue'",fontSize:"clamp(16px,2vw,22px)",letterSpacing:3,cursor:presentCount>0?"pointer":"not-allowed",border:presentCount>0?"none":"1px solid rgba(0,230,100,0.08)",boxShadow:presentCount>0?`0 8px 28px ${G}35`:"none"}}
                        onClick={generateTournamentHandler}>
                        {presentCount>0?`⚡ GENERATE — ${presentCount} CONFIRMED`:"⚠ MARK ATTENDANCE FIRST"}
                      </button>
                    </div>
                  ):(
                    <div>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:10}}>
                        <div>
                          <div style={{fontFamily:"'Bebas Neue'",fontSize:"clamp(18px,2.5vw,24px)",color:"#10b981",letterSpacing:2}}>🏆 TOURNAMENT IS LIVE</div>
                          <div style={{fontSize:12,color:"rgba(0,230,100,0.4)",marginTop:4}}>{presentCount} participants confirmed</div>
                        </div>
                        <button className="hbtn" style={{padding:"9px 18px",background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:8,color:"#ef4444",fontWeight:700,fontSize:12,cursor:"pointer"}} onClick={resetTournament}>🔄 RESET</button>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>
                        {CATEGORIES.map(c=>{
                          const cd=data[c.id],total=(cd?.matches||[]).length,done=(cd?.matches||[]).filter(m=>m.status==="completed").length,hld=(cd?.matches||[]).filter(m=>m.status==="held").length,grps=Object.keys(cd?.groups||{}).length;
                          if(!total)return<div key={c.id} style={{background:"rgba(0,0,0,0.2)",border:"1px solid rgba(0,230,100,0.04)",borderRadius:10,padding:14,opacity:0.3}}><div style={{fontSize:11,fontWeight:700,color:"rgba(0,230,100,0.3)"}}>{c.icon} {c.name}</div><div style={{fontSize:10,color:"rgba(0,230,100,0.2)",marginTop:4}}>No participants</div></div>;
                          const allDone=total>0&&done===total;
                          const koGenerated=!!knockoutData?.[c.id]?.generated;
                          return(
                            <div key={c.id} style={{background:S1,border:`1px solid ${c.color}20`,borderLeft:`3px solid ${c.color}`,borderRadius:10,padding:14}}>
                              <div style={{fontSize:11,fontWeight:700,marginBottom:8,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.icon} {c.name}</div>
                              <div style={{display:"flex",gap:6,marginBottom:total>0?8:0}}>
                                {[["GRP",grps],["DONE",`${done}/${total}`],["HOLD",hld]].map(([l,v])=>(
                                  <div key={l} style={{flex:1,background:"rgba(0,0,0,0.3)",borderRadius:5,padding:"5px 6px",textAlign:"center"}}>
                                    <div style={{fontSize:8,color:l==="HOLD"&&hld>0?"#f59e0b":"rgba(0,230,100,0.3)",fontWeight:700}}>{l}</div>
                                    <div style={{fontFamily:"'Bebas Neue'",fontSize:16,color:l==="HOLD"&&hld>0?"#f59e0b":c.color}}>{v}</div>
                                  </div>
                                ))}
                              </div>
                              {total>0&&(
                                koGenerated?(
                                  <div style={{fontSize:9,color:"#ffd700",fontWeight:700,background:"rgba(255,215,0,0.08)",border:"1px solid rgba(255,215,0,0.2)",borderRadius:5,padding:"4px 8px",textAlign:"center"}}>🏆 KNOCKOUT READY</div>
                                ):(
                                  <button className="hbtn" onClick={()=>triggerGenerateKnockout(c.id)}
                                    style={{width:"100%",padding:"6px",background:allDone?`${c.color}20`:"rgba(0,230,100,0.05)",
                                      border:`1px solid ${allDone?c.color+"50":"rgba(0,230,100,0.15)"}`,
                                      borderRadius:5,color:allDone?c.color:"rgba(0,230,100,0.35)",fontWeight:700,fontSize:10,cursor:"pointer"}}>
                                    {allDone?"⚡ GENERATE KNOCKOUT":"⚡ GENERATE KNOCKOUT (Group stage incomplete)"}
                                  </button>
                                )
                              )}
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
          </div>
        </main>
      </div>

      {/* KO SCORE MODAL */}
      {koScoreModal&&knockoutData?.[koScoreModal.catId]?.rounds?.[koScoreModal.roundIdx]?.[koScoreModal.matchIdx]&&(
        <KOScoreModal
          match={knockoutData[koScoreModal.catId].rounds[koScoreModal.roundIdx][koScoreModal.matchIdx]}
          koScoreInput={koScoreInput}
          setKoScoreInput={setKoScoreInput}
          onCancel={()=>setKoScoreModal(null)}
          onConfirm={()=>updateKnockoutScore(koScoreModal.catId,koScoreModal.roundIdx,koScoreModal.matchIdx)}
        />
      )}

      {/* PIN MODAL */}
      {pinModal.open&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.95)",backdropFilter:"blur(12px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:500,padding:20}}
          onClick={e=>e.target===e.currentTarget&&setPinModal(p=>({...p,open:false}))}>
          <div className={`scalein${pinModal.shake?" shake":""}`}
            style={{background:"rgba(5,14,8,0.98)",backdropFilter:"blur(30px)",border:`2px solid ${pinModal.error?"rgba(239,68,68,0.4)":pinModal.target==="judge"?"rgba(0,230,100,0.2)":"rgba(255,215,0,0.2)"}`,borderRadius:20,padding:"36px 28px",width:"100%",maxWidth:360,textAlign:"center",
              boxShadow:pinModal.target==="judge"?`0 24px 80px rgba(0,0,0,0.8),0 0 40px rgba(0,230,100,0.06)`:`0 24px 80px rgba(0,0,0,0.8),0 0 40px rgba(255,215,0,0.04)`}}>
            <div style={{fontSize:38,marginBottom:14}}>🔒</div>
            <div style={{fontFamily:"'Bebas Neue'",fontSize:"clamp(18px,2.5vw,24px)",letterSpacing:4,color:pinModal.target==="judge"?G:"#ffd700",marginBottom:6,
              textShadow:pinModal.target==="judge"?`0 0 20px rgba(0,230,100,0.4)`:`0 0 20px rgba(255,215,0,0.3)`}}>
              {pinModal.target==="judge"?"JUDGE PANEL":"ADMIN PANEL"}
            </div>
            <div style={{fontSize:12,color:"rgba(0,230,100,0.3)",marginBottom:24,letterSpacing:0.3}}>Enter access password to continue</div>
            <input type="password" value={pinModal.input}
              onChange={e=>setPinModal(p=>({...p,input:e.target.value,error:false}))}
              onKeyDown={e=>e.key==="Enter"&&submitPin()}
              placeholder="••••••••••" autoFocus
              style={{width:"100%",background:"rgba(0,0,0,0.5)",
                border:`2px solid ${pinModal.error?"rgba(239,68,68,0.5)":pinModal.input?(pinModal.target==="judge"?"rgba(0,230,100,0.4)":"rgba(255,215,0,0.4)"):"rgba(0,230,100,0.08)"}`,
                borderRadius:10,padding:"13px 18px",textAlign:"center",fontFamily:"'Barlow',sans-serif",fontSize:18,fontWeight:600,color:"#e8f5ee",marginBottom:8,letterSpacing:4,
                boxShadow:pinModal.input?(pinModal.target==="judge"?`0 0 16px rgba(0,230,100,0.12)`:`0 0 16px rgba(255,215,0,0.08)`):"none",transition:"all .2s"}}/>
            {pinModal.error&&<div style={{fontSize:12,color:"#ef4444",marginBottom:12,fontWeight:600}}>✕ Incorrect password — try again</div>}
            {!pinModal.error&&<div style={{marginBottom:12}}/>}
            <div style={{display:"flex",gap:10}}>
              <button className="hbtn" style={{flex:1,padding:"12px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(0,230,100,0.08)",borderRadius:10,color:"rgba(0,230,100,0.3)",fontWeight:700,fontSize:12,cursor:"pointer"}} onClick={()=>setPinModal(p=>({...p,open:false,input:"",error:false}))}>CANCEL</button>
              <button className="hbtn" style={{flex:2,padding:"12px",background:pinModal.target==="judge"?`linear-gradient(135deg,${G},#009944)`:"linear-gradient(135deg,#ffd700,#f59e0b)",border:"none",borderRadius:10,color:"#050e08",fontWeight:700,fontSize:12,cursor:"pointer",letterSpacing:0.5,
                boxShadow:pinModal.target==="judge"?`0 4px 18px rgba(0,230,100,0.3)`:`0 4px 18px rgba(255,215,0,0.25)`}}
                onMouseDown={submitPin}>UNLOCK →</button>
            </div>
          </div>
        </div>
      )}

      {/* SCORE MODAL */}
      {scoreModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.94)",backdropFilter:"blur(10px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:20}}
          onClick={e=>e.target===e.currentTarget&&setScoreModal(null)}>
          <div className="scalein" style={{background:"rgba(5,14,8,0.98)",backdropFilter:"blur(30px)",border:"1px solid rgba(0,230,100,0.2)",borderRadius:20,padding:"28px 24px",width:"100%",maxWidth:400,boxShadow:"0 24px 80px rgba(0,0,0,0.7),0 0 40px rgba(0,230,100,0.06)"}}>
            <div style={{textAlign:"center",marginBottom:20}}>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:22,letterSpacing:4,color:G,textShadow:"0 0 20px rgba(0,230,100,0.4)"}}>MATCH RESULT</div>
            </div>
            {/* Score inputs — fixed width, names above */}
            <div style={{display:"flex",alignItems:"flex-end",justifyContent:"center",gap:16,marginBottom:24}}>
              {/* Player 1 */}
              <div style={{textAlign:"center",width:120}}>
                <div style={{fontSize:11,fontWeight:700,color:"rgba(232,245,238,0.6)",marginBottom:8,lineHeight:1.3,minHeight:34,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
                  <span style={{display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{scoreModal.p1name}</span>
                </div>
                <input type="number" min="0" max="99" value={scoreInput.s1}
                  onChange={e=>setScoreInput(s=>({...s,s1:e.target.value}))}
                  placeholder="0" autoFocus
                  style={{width:120,background:"rgba(0,0,0,0.5)",
                    border:`2px solid ${scoreInput.s1!==""?"rgba(0,230,100,0.5)":"rgba(0,230,100,0.15)"}`,
                    borderRadius:12,padding:"14px 0",textAlign:"center",
                    fontFamily:"'Bebas Neue'",fontSize:64,color:G,
                    boxShadow:scoreInput.s1!==""?"0 0 20px rgba(0,230,100,0.2)":"none",transition:"all .2s"}}/>
              </div>
              {/* VS divider */}
              <div style={{textAlign:"center",paddingBottom:14}}>
                <div style={{fontFamily:"'Bebas Neue'",fontSize:20,color:"rgba(0,230,100,0.3)",letterSpacing:3}}>VS</div>
              </div>
              {/* Player 2 */}
              <div style={{textAlign:"center",width:120}}>
                <div style={{fontSize:11,fontWeight:700,color:"rgba(232,245,238,0.6)",marginBottom:8,lineHeight:1.3,minHeight:34,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
                  <span style={{display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{scoreModal.p2name}</span>
                </div>
                <input type="number" min="0" max="99" value={scoreInput.s2}
                  onChange={e=>setScoreInput(s=>({...s,s2:e.target.value}))}
                  placeholder="0"
                  style={{width:120,background:"rgba(0,0,0,0.5)",
                    border:`2px solid ${scoreInput.s2!==""?"rgba(0,230,100,0.5)":"rgba(0,230,100,0.15)"}`,
                    borderRadius:12,padding:"14px 0",textAlign:"center",
                    fontFamily:"'Bebas Neue'",fontSize:64,color:G,
                    boxShadow:scoreInput.s2!==""?"0 0 20px rgba(0,230,100,0.2)":"none",transition:"all .2s"}}/>
              </div>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button className="hbtn" onClick={()=>setScoreModal(null)} style={{flex:1,padding:"12px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(0,230,100,0.08)",borderRadius:10,color:"rgba(0,230,100,0.3)",fontWeight:700,fontSize:12,cursor:"pointer"}}>CANCEL</button>
              <button className="hbtn" onMouseDown={submitScore} style={{flex:2,padding:"12px",background:"linear-gradient(135deg,#00e664,#009944)",border:"none",borderRadius:10,color:"#050e08",fontWeight:700,fontSize:12,cursor:"pointer",boxShadow:"0 4px 18px rgba(0,230,100,0.3)"}}>✓ CONFIRM SCORE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// JUDGE PANEL
// ═══════════════════════════════════════════════════════════
function JudgePanel({isGenerated,judgeCategory,judgeField,CATEGORIES,FIELD_CONFIG,tournamentData,groupFieldMaps,participants,selectJudgeCategory,selectJudgeField,changeJudgeCategory,setJudgeField,holdMatch,releaseMatch,openScoreModal,G,S1,BD,BG}){
  const g=G||"#00e664";

  if(!isGenerated)return(
    <div style={{textAlign:"center",padding:"80px 20px"}}>
      <div style={{fontFamily:"'Bebas Neue'",fontSize:"clamp(24px,4vw,36px)",color:"rgba(0,230,100,0.2)",letterSpacing:4}}>TOURNAMENT NOT GENERATED</div>
      <div style={{fontSize:13,color:"rgba(0,230,100,0.3)",marginTop:8}}>Admin must generate the tournament first.</div>
    </div>
  );

  // STEP 1: SELECT CATEGORY
  if(!judgeCategory)return(
    <div className="fadein">
      <div style={{textAlign:"center",marginBottom:28}}>
        <div style={{fontFamily:"'Bebas Neue'",fontSize:"clamp(22px,3vw,32px)",color:g,letterSpacing:4,textShadow:`0 0 20px rgba(0,230,100,0.3)`}}>SELECT YOUR CATEGORY</div>
        <div style={{fontSize:12,color:"rgba(0,230,100,0.35)",marginTop:4}}>Tap the category you are refereeing</div>
      </div>
      <div className="judge-cat-grid" style={{display:"grid",gap:12}}>
        {CATEGORIES.map(c=>{
          const cd=tournamentData[c.id],total=(cd?.matches||[]).length;
          if(!total)return null;
          const pend=(cd?.matches||[]).filter(m=>m.status==="pending").length;
          const hld=(cd?.matches||[]).filter(m=>m.status==="held").length;
          const done=(cd?.matches||[]).filter(m=>m.status==="completed").length;
          const fc=FIELD_CONFIG[c.id];
          return(
            <div key={c.id} style={{background:S1,border:`2px solid ${c.color}25`,borderRadius:14,padding:18,cursor:"pointer",transition:"all .2s"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=c.color+"60";e.currentTarget.style.background=`${c.color}0a`;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=`${c.color}25`;e.currentTarget.style.background=S1;}}
              onClick={()=>selectJudgeCategory(c.id)}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                <div style={{fontSize:26,lineHeight:1}}>{c.icon}</div>
                <div>
                  <div style={{fontWeight:700,fontSize:14,color:"#e8f5ee"}}>{c.name}</div>
                  <div style={{fontSize:10,color:"rgba(0,230,100,0.35)",marginTop:2}}>{fc.count} {fc.label.toLowerCase()}{fc.count>1?"s":""}</div>
                </div>
              </div>
              <div style={{display:"flex",gap:6}}>
                {[["PENDING",pend,"rgba(232,245,238,0.4)"],["ON HOLD",hld,"#f59e0b"],["DONE",done,"#10b981"]].map(([l,v,col])=>(
                  <div key={l} style={{flex:1,background:"rgba(0,0,0,0.3)",borderRadius:6,padding:"6px 8px",textAlign:"center"}}>
                    <div style={{fontSize:8,color:col,fontWeight:700,opacity:0.7,letterSpacing:0.5}}>{l}</div>
                    <div style={{fontFamily:"'Bebas Neue'",fontSize:20,color:col}}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const selCat=CATEGORIES.find(c=>c.id===judgeCategory);
  const selFc=FIELD_CONFIG[judgeCategory];
  const col=selCat.color;

  // STEP 2: SELECT FIELD
  if(!judgeField)return(
    <div className="fadein">
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
        <button style={{padding:"7px 14px",borderRadius:7,fontSize:11,fontWeight:700,color:"rgba(0,230,100,0.4)",background:"transparent",border:"1px solid rgba(0,230,100,0.1)",cursor:"pointer"}} onClick={changeJudgeCategory}>← BACK</button>
        <div>
          <div style={{fontFamily:"'Bebas Neue'",fontSize:"clamp(18px,2.5vw,24px)",color:col,letterSpacing:2}}>{selCat.icon} {selCat.name}</div>
          <div style={{fontSize:11,color:"rgba(0,230,100,0.35)"}}>Select your {selFc.label.toLowerCase()}</div>
        </div>
      </div>
      <div className="judge-field-grid" style={{display:"grid",gap:14}}>
        {Array.from({length:selFc.count},(_,i)=>i+1).map(num=>{
          const catMap=groupFieldMaps[judgeCategory]||{};
          const cd=tournamentData[judgeCategory];
          const assignedGroups=Object.entries(catMap).filter(([g,f])=>Number(f)===num).map(([g])=>g);
          const pendCount=(cd?.matches||[]).filter(m=>m.field===num&&m.status==="pending").length;
          const heldCount=(cd?.matches||[]).filter(m=>m.field===num&&m.status==="held").length;
          return(
            <div key={num} style={{background:S1,border:`2px solid ${col}25`,borderRadius:14,padding:"22px 20px",cursor:"pointer",transition:"all .2s",textAlign:"center"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=col+"60";e.currentTarget.style.background=`${col}0a`;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=`${col}25`;e.currentTarget.style.background=S1;}}
              onClick={()=>selectJudgeField(selFc.label,num)}>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:"clamp(48px,7vw,72px)",color:col,letterSpacing:2,lineHeight:1,textShadow:`0 0 20px ${col}40`}}>{num}</div>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:13,color:col,letterSpacing:3,marginBottom:12,opacity:0.7}}>{selFc.label}</div>
              {assignedGroups.length>0&&(
                <div style={{marginBottom:10}}>
                  {assignedGroups.map(g=><span key={g} style={{display:"inline-block",fontSize:9,background:`${col}18`,color:col,border:`1px solid ${col}25`,padding:"2px 7px",borderRadius:4,fontWeight:700,margin:"2px"}}>{g}</span>)}
                </div>
              )}
              <div style={{display:"flex",gap:4,justifyContent:"center",flexWrap:"wrap"}}>
                {pendCount>0&&<span style={{fontSize:9,background:`${col}18`,color:col,padding:"2px 8px",borderRadius:8,fontWeight:700}}>{pendCount} pending</span>}
                {heldCount>0&&<span style={{fontSize:9,background:"rgba(245,158,11,0.15)",color:"#f59e0b",padding:"2px 8px",borderRadius:8,fontWeight:700}}>⏸ {heldCount}</span>}
                {pendCount===0&&heldCount===0&&<span style={{fontSize:9,color:"#10b981",fontWeight:700}}>✓ Clear</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // STEP 3: MATCH QUEUE
  const fieldNum=judgeField.number;
  const cd=tournamentData[judgeCategory];
  const fieldPending=(cd?.matches||[]).filter(m=>m.field===fieldNum&&m.status==="pending");
  const fieldHeld=(cd?.matches||[]).filter(m=>m.field===fieldNum&&m.status==="held");
  const fieldDone=(cd?.matches||[]).filter(m=>m.field===fieldNum&&m.status==="completed");
  const fieldBusy=new Set();fieldHeld.forEach(m=>{fieldBusy.add(m.p1);fieldBusy.add(m.p2);});

  return(
    <div className="fadein">
      {/* Field header */}
      <div style={{background:`linear-gradient(135deg,${col}14,transparent)`,border:`1px solid ${col}30`,borderRadius:14,padding:"14px 18px",marginBottom:20,display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
        <div style={{fontFamily:"'Bebas Neue'",fontSize:"clamp(40px,6vw,56px)",color:col,letterSpacing:2,lineHeight:1,textShadow:`0 0 20px ${col}40`}}>{fieldNum}</div>
        <div style={{flex:1}}>
          <div style={{fontFamily:"'Bebas Neue'",fontSize:"clamp(14px,2vw,20px)",color:col,letterSpacing:2}}>{selFc.label} {fieldNum} — {selCat.icon} {selCat.name}</div>
          <div style={{fontSize:11,color:"rgba(0,230,100,0.35)",marginTop:2}}>{fieldPending.length} pending · {fieldHeld.length} held · {fieldDone.length} done</div>
        </div>
        <div style={{display:"flex",gap:6,flexShrink:0}}>
          <button style={{padding:"6px 12px",borderRadius:6,fontSize:10,fontWeight:700,color:"rgba(0,230,100,0.35)",background:"transparent",border:"1px solid rgba(0,230,100,0.1)",cursor:"pointer"}} onClick={()=>setJudgeField(null)}>← {selFc.label}</button>
          <button style={{padding:"6px 12px",borderRadius:6,fontSize:10,fontWeight:700,color:"rgba(0,230,100,0.35)",background:"transparent",border:"1px solid rgba(0,230,100,0.1)",cursor:"pointer"}} onClick={changeJudgeCategory}>← CATEGORY</button>
        </div>
      </div>

      {fieldBusy.size>0&&(
        <div style={{background:"rgba(245,158,11,0.06)",border:"1px solid rgba(245,158,11,0.2)",borderRadius:8,padding:"10px 16px",marginBottom:16,fontSize:12,color:"#f59e0b"}}>
          ⚠️ <strong>CONFLICT</strong> — {[...fieldBusy].map(id=>{const p=participants.find(x=>x.id===id);return p?.name;}).filter(Boolean).join(", ")} may be active in another category
        </div>
      )}

      {fieldPending.length>0&&(
        <div style={{marginBottom:24}}>
          <div style={{fontSize:9,color:"rgba(0,230,100,0.35)",fontWeight:700,letterSpacing:2,marginBottom:10,textTransform:"uppercase"}}>Pending — Score or Hold</div>
          {fieldPending.map(m=>{
            const conflict=fieldBusy.has(m.p1)||fieldBusy.has(m.p2);
            return(
              <div key={m.id} style={{background:conflict?"rgba(245,158,11,0.05)":S1,border:`1px solid ${conflict?"rgba(245,158,11,0.25)":"rgba(0,230,100,0.07)"}`,borderRadius:12,padding:"14px 16px",marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <span style={{fontSize:9,color:"rgba(0,230,100,0.35)",fontWeight:700,background:"rgba(0,230,100,0.06)",padding:"2px 7px",borderRadius:4}}>GROUP {m.group}</span>
                  {conflict&&<span style={{fontSize:9,color:"#f59e0b",fontWeight:700}}>⚠ CONFLICT</span>}
                </div>
                <div className="match-card-inner" style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{flex:1,minWidth:80}}>
                    <div style={{fontWeight:700,fontSize:"clamp(13px,1.5vw,16px)",color:fieldBusy.has(m.p1)?"#f59e0b":"#e8f5ee"}}>{m.p1name}</div>
                  </div>
                  <div style={{background:"rgba(0,230,100,0.08)",border:"1px solid rgba(0,230,100,0.15)",borderRadius:8,padding:"6px 12px",fontFamily:"'Bebas Neue'",fontSize:16,color:"rgba(0,230,100,0.5)",letterSpacing:3}}>VS</div>
                  <div style={{flex:1,minWidth:80,textAlign:"right"}}>
                    <div style={{fontWeight:700,fontSize:"clamp(13px,1.5vw,16px)",color:fieldBusy.has(m.p2)?"#f59e0b":"#e8f5ee"}}>{m.p2name}</div>
                  </div>
                  <div className="match-actions" style={{display:"flex",gap:8,flexShrink:0}}>
                    <button style={{padding:"8px 12px",background:"rgba(245,158,11,0.1)",border:"1px solid rgba(245,158,11,0.3)",borderRadius:7,color:"#f59e0b",fontSize:11,fontWeight:700,cursor:"pointer"}} onClick={()=>holdMatch(m.id)}>⏸ HOLD</button>
                    <button style={{padding:"8px 16px",background:`linear-gradient(135deg,${col},${col}aa)`,border:"none",borderRadius:7,color:"#050e08",fontSize:11,fontWeight:700,cursor:"pointer",boxShadow:`0 3px 12px ${col}30`}} onClick={()=>openScoreModal(m)}>▶ SCORE</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {fieldHeld.length>0&&(
        <div style={{marginBottom:24}}>
          <div style={{fontSize:9,color:"#f59e0b",fontWeight:700,letterSpacing:2,marginBottom:10,textTransform:"uppercase"}}>⏸ On Hold — Release When Ready</div>
          {fieldHeld.map(m=>(
            <div key={m.id} style={{background:"rgba(245,158,11,0.04)",border:"1px solid rgba(245,158,11,0.15)",borderRadius:10,padding:"12px 16px",marginBottom:8,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:80}}><div className="player-name player-name-md name-clamp2" style={{color:"#f59e0b"}}>{m.p1name}</div><div style={{fontSize:9,color:"rgba(245,158,11,0.4)",marginTop:2}}>Group {m.group}</div></div>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:14,color:"rgba(245,158,11,0.3)",letterSpacing:2}}>VS</div>
              <div style={{flex:1,minWidth:80,textAlign:"right"}}><div className="player-name player-name-md name-clamp2" style={{color:"#f59e0b"}}>{m.p2name}</div></div>
              <button style={{padding:"8px 16px",background:"rgba(245,158,11,0.12)",border:"1px solid rgba(245,158,11,0.3)",borderRadius:7,color:"#f59e0b",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0}} onClick={()=>releaseMatch(m.id)}>▶ RELEASE</button>
            </div>
          ))}
        </div>
      )}

      {fieldPending.length===0&&fieldHeld.length===0&&(
        <div style={{textAlign:"center",padding:"50px 20px"}}>
          <div style={{fontSize:48,marginBottom:12}}>✅</div>
          <div style={{fontFamily:"'Bebas Neue'",fontSize:"clamp(20px,3vw,28px)",letterSpacing:3,color:"rgba(0,230,100,0.3)"}}>ALL CLEAR</div>
          <div style={{fontSize:12,marginTop:8,color:"rgba(0,230,100,0.25)"}}>{selFc.label} {fieldNum} · {fieldDone.length} completed</div>
          <div style={{marginTop:20,display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
            <button style={{padding:"10px 18px",background:`${col}14`,border:`1px solid ${col}30`,borderRadius:8,color:col,fontWeight:700,fontSize:12,cursor:"pointer"}} onClick={()=>setJudgeField(null)}>← CHANGE {selFc.label}</button>
            <button style={{padding:"10px 18px",background:"rgba(0,230,100,0.08)",border:"1px solid rgba(0,230,100,0.2)",borderRadius:8,color:g,fontWeight:700,fontSize:12,cursor:"pointer"}} onClick={changeJudgeCategory}>← NEXT CATEGORY</button>
          </div>
        </div>
      )}

      {fieldDone.length>0&&(
        <div style={{marginTop:8}}>
          <div style={{fontSize:9,color:"rgba(0,230,100,0.25)",fontWeight:700,letterSpacing:2,marginBottom:8,textTransform:"uppercase"}}>Recently Completed</div>
          {fieldDone.slice(-4).reverse().map(m=>(
            <div key={m.id} style={{background:"rgba(0,0,0,0.2)",border:"1px solid rgba(0,230,100,0.04)",borderRadius:8,padding:"9px 16px",marginBottom:5,display:"flex",alignItems:"center",gap:12,opacity:0.55}}>
              <div style={{flex:1,fontSize:12,fontWeight:600}}>{m.p1name}</div>
              <div style={{fontFamily:"'Bebas Neue'",fontSize:20,letterSpacing:4,color:"rgba(0,230,100,0.5)"}}>{m.score1} – {m.score2}</div>
              <div style={{flex:1,textAlign:"right",fontSize:12,fontWeight:600}}>{m.p2name}</div>
              <div style={{fontSize:10,color:"#10b981",fontWeight:700}}>✓</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// KO SCORE MODAL COMPONENT
// ═══════════════════════════════════════════════════════════
function KOScoreModal({match,koScoreInput,setKoScoreInput,onCancel,onConfirm}){
  const m=match;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.94)",backdropFilter:"blur(10px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:20}}
      onClick={e=>e.target===e.currentTarget&&onCancel()}>
      <div className="scalein" style={{background:"rgba(5,14,8,0.98)",backdropFilter:"blur(30px)",border:"2px solid rgba(255,215,0,0.25)",borderRadius:20,padding:"28px 24px",width:"100%",maxWidth:400,boxShadow:"0 24px 80px rgba(0,0,0,0.7)"}}>
        <div style={{textAlign:"center",marginBottom:6}}>
          <div style={{fontFamily:"'Bebas Neue'",fontSize:22,letterSpacing:4,color:"#ffd700",textShadow:"0 0 20px rgba(255,215,0,0.4)"}}>KNOCKOUT MATCH</div>
          <div style={{fontSize:10,color:"rgba(255,215,0,0.4)",marginTop:4,letterSpacing:1}}>No draws allowed — one must win</div>
        </div>
        <div style={{display:"flex",alignItems:"flex-end",justifyContent:"center",gap:16,margin:"20px 0"}}>
          <div style={{textAlign:"center",width:120}}>
            <div style={{fontSize:11,fontWeight:700,color:"rgba(232,245,238,0.6)",marginBottom:8,lineHeight:1.3,minHeight:34,wordBreak:"break-word"}}>{m.p1?.name||"TBD"}</div>
            <input type="number" min="0" max="99" value={koScoreInput.s1} autoFocus
              onChange={e=>setKoScoreInput(s=>({...s,s1:e.target.value}))} placeholder="0"
              style={{width:120,background:"rgba(0,0,0,0.5)",border:`2px solid ${koScoreInput.s1!==""?"rgba(255,215,0,0.5)":"rgba(255,215,0,0.15)"}`,borderRadius:12,padding:"14px 0",textAlign:"center",fontFamily:"'Bebas Neue'",fontSize:64,color:"#ffd700",transition:"all .2s"}}/>
          </div>
          <div style={{paddingBottom:14,fontFamily:"'Bebas Neue'",fontSize:20,color:"rgba(255,215,0,0.3)",letterSpacing:3}}>VS</div>
          <div style={{textAlign:"center",width:120}}>
            <div style={{fontSize:11,fontWeight:700,color:"rgba(232,245,238,0.6)",marginBottom:8,lineHeight:1.3,minHeight:34,wordBreak:"break-word"}}>{m.p2?.name||"TBD"}</div>
            <input type="number" min="0" max="99" value={koScoreInput.s2}
              onChange={e=>setKoScoreInput(s=>({...s,s2:e.target.value}))} placeholder="0"
              style={{width:120,background:"rgba(0,0,0,0.5)",border:`2px solid ${koScoreInput.s2!==""?"rgba(255,215,0,0.5)":"rgba(255,215,0,0.15)"}`,borderRadius:12,padding:"14px 0",textAlign:"center",fontFamily:"'Bebas Neue'",fontSize:64,color:"#ffd700",transition:"all .2s"}}/>
          </div>
        </div>
        <div style={{display:"flex",gap:10}}>
          <button className="hbtn" onClick={onCancel} style={{flex:1,padding:"12px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:10,color:"rgba(232,245,238,0.3)",fontWeight:700,fontSize:12,cursor:"pointer"}}>CANCEL</button>
          <button className="hbtn" onMouseDown={onConfirm} style={{flex:2,padding:"12px",background:"linear-gradient(135deg,#ffd700,#f59e0b)",border:"none",borderRadius:10,color:"#050e08",fontWeight:700,fontSize:12,cursor:"pointer",boxShadow:"0 4px 18px rgba(255,215,0,0.3)"}}>CONFIRM — ADVANCE WINNER</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// LIVE KNOCKOUT BRACKET
// ═══════════════════════════════════════════════════════════
function LiveKnockoutBracket({catId,knockoutData,cat,accent,G,S1,onScoreMatch,isAdmin,onGenerateKnockout,groupStageComplete}){
  const ko=knockoutData?.[catId];
  const col=accent||G||"#00e664";

  if(!ko?.generated){
    return(
      <div style={{background:S1||"rgba(5,14,8,0.95)",border:"1px solid rgba(0,230,100,0.08)",borderRadius:14,padding:32,textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:12}}>🏆</div>
        <div style={{fontFamily:"'Bebas Neue'",fontSize:24,color:col,letterSpacing:3,marginBottom:8}}>KNOCKOUT BRACKET</div>
        {groupStageComplete?(
          <div>
            <div style={{fontSize:13,color:"rgba(0,230,100,0.5)",marginBottom:20}}>Group stage complete! Ready to generate knockout bracket.</div>
            {isAdmin&&(
              <button onClick={onGenerateKnockout}
                style={{padding:"12px 28px",background:`linear-gradient(135deg,${col},#009944)`,border:"none",borderRadius:10,color:"#050e08",fontFamily:"'Bebas Neue'",fontSize:18,letterSpacing:2,cursor:"pointer",boxShadow:`0 4px 20px ${col}40`}}>
                ⚡ GENERATE KNOCKOUT BRACKET
              </button>
            )}
            {!isAdmin&&<div style={{fontSize:12,color:"rgba(0,230,100,0.35)"}}>Waiting for organiser to generate the bracket...</div>}
          </div>
        ):(
          <div style={{fontSize:13,color:"rgba(0,230,100,0.3)"}}>Bracket will be generated after all group matches complete.</div>
        )}
      </div>
    );
  }

  const roundNames={16:"Round of 32",8:"Round of 16",4:"Quarter Finals",2:"Semi Finals",1:"Final"};
  const getRoundName=(matchCount)=>roundNames[matchCount]||`Round of ${matchCount*2}`;

  return(
    <div style={{overflowX:"auto",paddingBottom:12}}>
      {/* Bracket info */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        <div style={{fontFamily:"'Bebas Neue'",fontSize:18,color:col,letterSpacing:2}}>🏆 {cat?.name} — KNOCKOUT</div>
        <div style={{fontSize:10,color:"rgba(0,230,100,0.4)",background:"rgba(0,230,100,0.08)",padding:"3px 10px",borderRadius:20,fontWeight:700}}>
          Round of {ko.bracketSize}
        </div>
      </div>

      {/* Bracket rounds — horizontal scroll */}
      <div style={{display:"flex",gap:16,alignItems:"flex-start",minWidth:"max-content",paddingBottom:8}}>
        {ko.rounds.map((round,ri)=>{
          const matchCount=round.length;
          const isLastRound=ri===ko.rounds.length-1;
          return(
            <div key={ri} style={{display:"flex",flexDirection:"column",gap:isLastRound?0:Math.pow(2,ri)*8}}>
              {/* Round header */}
              <div style={{fontFamily:"'Bebas Neue'",fontSize:11,color:isLastRound?"#ffd700":col,letterSpacing:2,marginBottom:8,textAlign:"center"}}>
                {isLastRound?"🏆 FINAL":getRoundName(matchCount)}
              </div>
              {/* Matches */}
              {round.map((m,mi)=>{
                const canScore=isAdmin&&m.status==="pending"&&m.p1&&m.p2;
                const isFinal=isLastRound;
                return(
                  <div key={m.id} style={{
                    width:160,
                    background:m.status==="completed"?"rgba(0,230,100,0.06)":m.status==="bye"?"rgba(0,0,0,0.2)":"rgba(5,14,8,0.95)",
                    border:`1px solid ${m.status==="completed"?col+"40":m.status==="bye"?"rgba(0,230,100,0.04)":isFinal?"rgba(255,215,0,0.2)":"rgba(0,230,100,0.12)"}`,
                    borderRadius:8,overflow:"hidden",
                    boxShadow:m.status==="pending"&&m.p1&&m.p2?`0 2px 12px rgba(0,0,0,0.3)`:"none",
                    opacity:m.status==="waiting"?0.4:1,
                    marginBottom:ri===0?0:Math.pow(2,ri)*4
                  }}>
                    {/* Match ID tag */}
                    {m.status!=="bye"&&(
                      <div style={{padding:"4px 8px",borderBottom:"1px solid rgba(0,230,100,0.06)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:8,color:"rgba(0,230,100,0.3)",fontWeight:700}}>MATCH {mi+1}</span>
                        {m.status==="completed"&&<span style={{fontSize:8,color:col,fontWeight:700}}>✓ DONE</span>}
                        {m.status==="pending"&&m.p1&&m.p2&&<span style={{fontSize:8,color:"#f59e0b",fontWeight:700}}>PENDING</span>}
                        {m.status==="bye"&&<span style={{fontSize:8,color:"rgba(0,230,100,0.25)"}}>BYE</span>}
                      </div>
                    )}
                    {/* Player 1 */}
                    <div style={{padding:"6px 8px",borderBottom:"1px solid rgba(0,230,100,0.06)",
                      background:m.status==="completed"&&m.winnerId===m.p1?.id?`${col}15`:"transparent"}}>
                      {m.p1?(
                        <div>
                          <div style={{fontSize:9,color:col,fontWeight:700,letterSpacing:0.5,marginBottom:2}}>{m.p1.seed}</div>
                          <div style={{fontSize:11,fontWeight:700,color:m.status==="completed"&&m.winnerId===m.p1.id?col:"rgba(232,245,238,0.8)",lineHeight:1.3,wordBreak:"break-word"}}>{m.p1.name}</div>
                          {m.status==="completed"&&<div style={{fontFamily:"'Bebas Neue'",fontSize:18,color:m.winnerId===m.p1.id?col:"rgba(232,245,238,0.3)",marginTop:2}}>{m.score1}</div>}
                        </div>
                      ):(
                        <div style={{fontSize:10,color:"rgba(0,230,100,0.2)",padding:"4px 0"}}>— TBD —</div>
                      )}
                    </div>
                    {/* Player 2 */}
                    <div style={{padding:"6px 8px",
                      background:m.status==="completed"&&m.winnerId===m.p2?.id?`${col}15`:"transparent"}}>
                      {m.p2?(
                        <div>
                          <div style={{fontSize:9,color:col,fontWeight:700,letterSpacing:0.5,marginBottom:2}}>{m.p2.seed}</div>
                          <div style={{fontSize:11,fontWeight:700,color:m.status==="completed"&&m.winnerId===m.p2.id?col:"rgba(232,245,238,0.8)",lineHeight:1.3,wordBreak:"break-word"}}>{m.p2.name}</div>
                          {m.status==="completed"&&<div style={{fontFamily:"'Bebas Neue'",fontSize:18,color:m.winnerId===m.p2.id?col:"rgba(232,245,238,0.3)",marginTop:2}}>{m.score2}</div>}
                        </div>
                      ):(
                        <div style={{fontSize:10,color:"rgba(0,230,100,0.2)",padding:"4px 0"}}>— TBD —</div>
                      )}
                    </div>
                    {/* Score button */}
                    {canScore&&(
                      <div style={{padding:"6px 8px",borderTop:"1px solid rgba(0,230,100,0.08)"}}>
                        <button onClick={()=>onScoreMatch(ri,mi)}
                          style={{width:"100%",padding:"5px",background:`${isFinal?"rgba(255,215,0,0.12)":"rgba(0,230,100,0.1)"}`,border:`1px solid ${isFinal?"rgba(255,215,0,0.3)":col+"30"}`,borderRadius:5,color:isFinal?"#ffd700":col,fontWeight:700,fontSize:10,cursor:"pointer",letterSpacing:0.5}}>
                          ▶ SCORE
                        </button>
                      </div>
                    )}
                    {/* Winner crown */}
                    {isLastRound&&m.status==="completed"&&m.winnerName&&(
                      <div style={{padding:"8px",background:"rgba(255,215,0,0.06)",borderTop:"1px solid rgba(255,215,0,0.15)",textAlign:"center"}}>
                        <div style={{fontSize:16}}>🏆</div>
                        <div style={{fontSize:9,color:"#ffd700",fontWeight:700,marginTop:2,letterSpacing:1}}>CHAMPION</div>
                        <div style={{fontSize:11,color:"#ffd700",fontWeight:700,marginTop:2,lineHeight:1.3,wordBreak:"break-word"}}>{m.winnerName}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MANUAL BRACKET DRAW — Drag & Drop qualifier seeding
// ═══════════════════════════════════════════════════════════
function ManualBracketDraw({catId,catData,knockoutData,accent,G,S1,onConfirmDraw}){
  const cd=catData?.[catId];
  const [slots,setSlots]=React.useState([]);
  const [dragging,setDragging]=React.useState(null);
  const [initialized,setInitialized]=React.useState(false);

  // Build qualifiers list from standings
  const standings=cd?calcStandings(cd.groups,cd.matches):{};
  const groups=Object.keys(standings).sort();
  const qualifiers=[];
  groups.forEach(g=>{
    const sorted=standings[g]||[];
    if(sorted[0])qualifiers.push({...sorted[0],seed:`1${g}`,rank:1,group:g});
    if(sorted[1])qualifiers.push({...sorted[1],seed:`2${g}`,rank:2,group:g});
  });

  const totalQual=qualifiers.length;
  let bracketSize=2;while(bracketSize<totalQual)bracketSize*=2;
  const slotCount=bracketSize/2;

  React.useEffect(()=>{
    if(!initialized&&slotCount>0){
      setSlots(Array(slotCount).fill(null));
      setInitialized(true);
    }
  },[slotCount,initialized]);

  const usedIds=new Set(slots.filter(Boolean).map(s=>s.id));
  const available=qualifiers.filter(q=>!usedIds.has(q.id));

  function handleDrop(slotIdx){
    if(dragging===null)return;
    const newSlots=[...slots];
    // If dragging from slot, clear it
    if(typeof dragging==="object"&&dragging.fromSlot!==undefined){
      newSlots[dragging.fromSlot]=null;
      newSlots[slotIdx]=dragging.qualifier;
    } else {
      // Dragging from qualifiers list
      newSlots[slotIdx]=dragging;
    }
    setSlots(newSlots);setDragging(null);
  }

  function handleSlotDragStart(slotIdx){
    if(slots[slotIdx])setDragging({fromSlot:slotIdx,qualifier:slots[slotIdx]});
  }

  function clearSlot(idx){setSlots(s=>s.map((v,i)=>i===idx?null:v));}

  const allFilled=slots.length>0&&slots.every(Boolean);

  if(!cd?.matches?.length)return<div style={{textAlign:"center",padding:40,color:"rgba(0,230,100,0.3)"}}>No tournament data yet.</div>;

  return(
    <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
      {/* Qualifiers Panel */}
      <div style={{width:220,flexShrink:0}}>
        <div style={{fontSize:10,color:"rgba(0,230,100,0.4)",fontWeight:700,letterSpacing:1.5,marginBottom:10}}>QUALIFIERS ({qualifiers.length})</div>
        <div style={{fontSize:9,color:"rgba(0,230,100,0.25)",marginBottom:10}}>Drag into bracket slots →</div>
        {groups.map(g=>{
          const gQuals=qualifiers.filter(q=>q.group===g);
          return(
            <div key={g} style={{marginBottom:8}}>
              <div style={{fontSize:9,color:"rgba(0,230,100,0.3)",fontWeight:700,letterSpacing:1,marginBottom:4}}>GROUP {g}</div>
              {gQuals.map(q=>{
                const used=usedIds.has(q.id);
                return(
                  <div key={q.id}
                    draggable={!used}
                    onDragStart={()=>setDragging(q)}
                    onDragEnd={()=>setDragging(null)}
                    style={{padding:"7px 10px",marginBottom:4,borderRadius:7,cursor:used?"default":"grab",
                      background:used?"rgba(0,0,0,0.2)":`${accent}12`,
                      border:`1px solid ${used?"rgba(0,230,100,0.05)":accent+"30"}`,
                      opacity:used?0.4:1,transition:"all .2s"}}>
                    <div style={{fontSize:9,color:used?"rgba(0,230,100,0.2)":accent,fontWeight:700}}>{q.rank===1?"🥇":"🥈"} {q.seed}</div>
                    <div style={{fontSize:11,fontWeight:600,color:used?"rgba(232,245,238,0.3)":"rgba(232,245,238,0.8)",wordBreak:"break-word",lineHeight:1.3,marginTop:2}}>{q.name}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Bracket Slots */}
      <div style={{flex:1,minWidth:220}}>
        <div style={{fontSize:10,color:"rgba(0,230,100,0.4)",fontWeight:700,letterSpacing:1.5,marginBottom:10}}>
          BRACKET DRAW — Round of {bracketSize} ({slotCount} matches)
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:8,marginBottom:16}}>
          {slots.map((slot,idx)=>(
            <div key={idx}
              onDragOver={e=>e.preventDefault()}
              onDrop={()=>handleDrop(idx)}
              style={{borderRadius:10,border:`2px dashed ${slot?accent+"50":"rgba(0,230,100,0.15)"}`,
                background:slot?`${accent}08`:"rgba(0,0,0,0.2)",
                minHeight:72,transition:"all .2s",position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",top:5,left:8,fontSize:9,color:"rgba(0,230,100,0.3)",fontWeight:700}}>SLOT {idx+1}</div>
              {slot?(
                <div style={{padding:"18px 10px 8px"}}>
                  <div style={{fontSize:9,color:accent,fontWeight:700,marginBottom:2}}>{slot.seed}</div>
                  <div style={{fontWeight:700,fontSize:12,color:"#e8f5ee",wordBreak:"break-word",lineHeight:1.3,cursor:"grab"}}
                    draggable onDragStart={()=>handleSlotDragStart(idx)}>{slot.name}</div>
                  <button onClick={()=>clearSlot(idx)} style={{marginTop:4,fontSize:9,color:"rgba(239,68,68,0.5)",background:"none",border:"none",cursor:"pointer",padding:0}}>✕ remove</button>
                </div>
              ):(
                <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:72,color:"rgba(0,230,100,0.2)",fontSize:11}}>
                  Drop here
                </div>
              )}
            </div>
          ))}
        </div>
        <button
          style={{padding:"10px 24px",background:allFilled?`linear-gradient(135deg,${accent},#009944)`:"rgba(0,0,0,0.3)",
            border:allFilled?"none":"1px solid rgba(0,230,100,0.1)",borderRadius:8,
            color:allFilled?"#050e08":"rgba(0,230,100,0.25)",fontWeight:700,fontSize:13,
            cursor:allFilled?"pointer":"not-allowed",boxShadow:allFilled?`0 4px 18px ${accent}35`:"none"}}
          onClick={()=>allFilled&&onConfirmDraw(slots)}>
          {allFilled?"⚡ CONFIRM DRAW & GENERATE BRACKET":"Fill all slots to confirm draw"}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PLAYER SEARCH INPUT — for team registration
// ═══════════════════════════════════════════════════════════
function PlayerSearchInput({idx,value,participants,onChange,accent}){
  const [query,setQuery] = React.useState(value||"");
  const [showList,setShowList] = React.useState(false);
  const G=accent||"#00e664";

  const matches=query.length>=2?participants.filter(p=>
    p.name.toLowerCase().includes(query.toLowerCase())||
    (p.studentId&&p.studentId.toLowerCase().includes(query.toLowerCase()))
  ).slice(0,6):[];

  function select(p){
    setQuery(p.name);
    onChange(p.name);
    setShowList(false);
  }

  return(
    <div style={{position:"relative"}}>
      <div style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:10,color:"rgba(0,230,100,0.4)",fontWeight:700,fontFamily:"'Bebas Neue'",letterSpacing:1,zIndex:1}}>{idx+1}</div>
      <input value={query}
        onChange={e=>{setQuery(e.target.value);onChange(e.target.value);setShowList(true);}}
        onFocus={()=>setShowList(true)}
        onBlur={()=>setTimeout(()=>setShowList(false),150)}
        placeholder={`Player ${idx+1} — type name or ID`}
        style={{width:"100%",background:"rgba(0,0,0,0.35)",
          border:`1px solid ${query?"rgba(0,230,100,0.3)":"rgba(0,230,100,0.08)"}`,
          borderRadius:7,padding:"9px 12px 9px 28px",
          color:"#e8f5ee",fontFamily:"'Barlow',sans-serif",fontSize:12}}/>
      {showList&&matches.length>0&&(
        <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:100,
          background:"rgba(5,14,8,0.98)",border:"1px solid rgba(0,230,100,0.2)",
          borderRadius:8,overflow:"hidden",boxShadow:"0 8px 24px rgba(0,0,0,0.6)",marginTop:2}}>
          {matches.map(p=>(
            <div key={p.id}
              onMouseDown={()=>select(p)}
              style={{padding:"8px 12px",cursor:"pointer",borderBottom:"1px solid rgba(0,230,100,0.05)",
                display:"flex",alignItems:"center",gap:8}}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(0,230,100,0.06)"}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div style={{flex:1}}>
                <div style={{fontSize:12,fontWeight:600,color:"#e8f5ee",lineHeight:1.2}}>{p.name}</div>
                <div style={{display:"flex",gap:4,marginTop:3,flexWrap:"wrap"}}>
                  {p.categories.map(cid=>{
                    const c=[{id:"diy-p",short:"DIY Pri",color:"#00e664"},{id:"diy-s",short:"DIY Sec",color:"#00d4ff"},{id:"sia",short:"Sumo BA",color:"#a78bfa"},{id:"sir",short:"Sumo BR",color:"#fb923c"},{id:"sja",short:"Jr Auto",color:"#34d399"},{id:"sjr",short:"Jr RC",color:"#60a5fa"},{id:"ssa",short:"Sr Auto",color:"#f472b6"},{id:"ssr",short:"Sr RC",color:"#e879f9"}].find(x=>x.id===cid);
                    return c?<span key={cid} style={{fontSize:8,color:c.color,background:`${c.color}12`,padding:"1px 4px",borderRadius:3,fontWeight:700}}>{c.short}</span>:null;
                  })}
                </div>
              </div>
              {p.studentId&&<span style={{fontSize:9,color:"rgba(0,230,100,0.5)",background:"rgba(0,230,100,0.06)",border:"1px solid rgba(0,230,100,0.1)",padding:"1px 6px",borderRadius:3,fontWeight:700,flexShrink:0}}>{p.studentId}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// CSV IMPORT
// ═══════════════════════════════════════════════════════════
function CsvImport({CATEGORIES,onImport,onReplace,G,S1,BD,BG}){
  const [open,setOpen]=useState(false);
  const [csvText,setCsvText]=useState("");
  const [preview,setPreview]=useState([]);
  const [error,setError]=useState("");
  const [mode,setMode]=useState("add");
  const g=G||"#00e664";

  const CAT_ALIASES={"diy soccer primary":"diy-p","diy-p":"diy-p","diy soccer secondary":"diy-s","diy-s":"diy-s","open soccer 2x2":"open2","open2":"open2","2x2":"open2","soccer 4x4":"soc4","soc4":"soc4","4x4":"soc4","open soccer 4x4":"soc4","drone soccer":"drone","drone":"drone","sumo basic auto":"sia","sia":"sia","sumo inex auto":"sia","sumo basic rc":"sir","sir":"sir","sumo inex rc":"sir","sumo junior auto":"sja","sja":"sja","sumo junior rc":"sjr","sjr":"sjr","sumo senior auto":"ssa","ssa":"ssa","sumo senior rc":"ssr","ssr":"ssr"};

  function parseCSV(text){
    setError("");
    const lines=text.trim().split("\n").filter(l=>l.trim());
    if(!lines.length){setPreview([]);return;}
    const firstLower=lines[0].toLowerCase();
    const isHeader=firstLower.includes("name")||firstLower.includes("student")||firstLower.includes("participant");
    const dataLines=isHeader?lines.slice(1):lines;
    const parsed=[],errs=[];
    dataLines.forEach((line,i)=>{
      const cols=line.split(",").map(c=>c.trim()).filter(Boolean);
      if(!cols.length)return;
      const name=cols[0];if(!name){errs.push(`Row ${i+2}: missing name`);return;}
      // Auto-detect Student ID: if col[1] is not a category code, treat it as ID
      let studentId="",catStart=1;
      if(cols.length>1){const col1key=cols[1].toLowerCase().trim();if(!CAT_ALIASES[col1key]){studentId=cols[1];catStart=2;}}
      const cats=[];
      cols.slice(catStart).forEach(col=>{const key=col.toLowerCase().trim(),catId=CAT_ALIASES[key];if(catId&&!cats.includes(catId))cats.push(catId);else if(!catId&&col)errs.push(`Row ${i+2}: unknown category "${col}"`);});
      if(!cats.length){errs.push(`Row ${i+2}: "${name}" has no valid categories`);return;}
      // Check for duplicate — merge if same name or same ID
      parsed.push({id:`csv_${Date.now()}_${i}`,name,studentId:studentId||"",categories:cats,attendance:null});
    });
    if(errs.length)setError(errs.slice(0,3).join(" · ")+(errs.length>3?` +${errs.length-3} more`:""));
    setPreview(parsed);
  }
  function handleImport(){if(!preview.length)return;if(mode==="replace")onReplace(preview);else onImport(preview);setCsvText("");setPreview([]);setError("");setOpen(false);}

  if(!open)return(
    <div style={{background:"rgba(0,230,100,0.03)",border:"1px solid rgba(0,230,100,0.1)",borderRadius:12,padding:14,marginBottom:14,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
      <div>
        <div style={{fontSize:12,fontWeight:700,color:"rgba(232,245,238,0.7)"}}>📥 BULK IMPORT VIA CSV</div>
        <div style={{fontSize:11,color:"rgba(0,230,100,0.3)",marginTop:2}}>Load all participant names from Excel in one go</div>
      </div>
      <button style={{marginLeft:"auto",padding:"8px 16px",background:"rgba(0,230,100,0.1)",border:"1px solid rgba(0,230,100,0.25)",borderRadius:8,color:g,fontWeight:700,fontSize:11,cursor:"pointer"}} onClick={()=>setOpen(true)}>OPEN IMPORT</button>
    </div>
  );

  return(
    <div style={{background:"rgba(0,0,0,0.3)",border:`2px solid rgba(0,230,100,0.15)`,borderRadius:12,padding:18,marginBottom:14}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
        <div style={{fontFamily:"'Bebas Neue'",fontSize:16,color:g,letterSpacing:2}}>📥 BULK CSV IMPORT</div>
        <button style={{padding:"4px 10px",background:"transparent",border:"1px solid rgba(0,230,100,0.1)",borderRadius:6,color:"rgba(0,230,100,0.35)",fontSize:10,fontWeight:700,cursor:"pointer"}} onClick={()=>{setOpen(false);setCsvText("");setPreview([]);setError("");}}>✕ CLOSE</button>
      </div>
      <div style={{background:"rgba(0,0,0,0.3)",borderRadius:8,padding:"10px 12px",marginBottom:12,fontSize:11}}>
        <div style={{color:g,fontWeight:700,marginBottom:5,fontSize:10,letterSpacing:1}}>FORMAT — ONE STUDENT PER ROW:</div>
        <div style={{color:"rgba(0,230,100,0.4)",fontFamily:"monospace",lineHeight:1.9,fontSize:11}}>
          <div style={{color:"rgba(0,230,100,0.5)",fontFamily:"monospace"}}>Name, StudentID, Category</div>
          <div style={{fontFamily:"monospace"}}>Ahmad Danial, PNG001, diy-p</div>
          <div style={{fontFamily:"monospace"}}>Nurul Ain, PNG002, diy-p, diy-s</div>
          <div style={{fontSize:9,color:"rgba(0,230,100,0.25)",marginTop:4}}>ID is auto-detected · codes: diy-p · diy-s · open2 · soc4 · drone · sia · sir · sja · sjr · ssa · ssr</div>
        </div>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:10}}>
        {[["add","➕ ADD to list"],["replace","🔄 REPLACE all"]].map(([v,l])=>(
          <button key={v} style={{flex:1,padding:"8px",borderRadius:7,fontSize:11,fontWeight:700,cursor:"pointer",background:mode===v?(v==="replace"?"rgba(239,68,68,0.12)":"rgba(0,230,100,0.1)"):"transparent",border:`1px solid ${mode===v?(v==="replace"?"rgba(239,68,68,0.3)":"rgba(0,230,100,0.25)"):"rgba(0,230,100,0.08)"}`,color:mode===v?(v==="replace"?"#ef4444":g):"rgba(0,230,100,0.3)"}} onClick={()=>setMode(v)}>{l}</button>
        ))}
      </div>
      <textarea value={csvText} onChange={e=>{setCsvText(e.target.value);parseCSV(e.target.value);}}
        placeholder={"Paste CSV data here...\n\nAhmad Danial, PNG001, diy-p\nNurul Ain, PNG002, diy-p, diy-s"}
        style={{width:"100%",height:140,background:"rgba(0,0,0,0.4)",border:`1px solid ${csvText?"rgba(0,230,100,0.3)":"rgba(0,230,100,0.08)"}`,borderRadius:8,padding:"10px 12px",color:"#e8f5ee",fontFamily:"monospace",fontSize:12,resize:"vertical"}}/>
      {error&&<div style={{fontSize:10,color:"#ef4444",marginTop:6}}>⚠ {error}</div>}
      {preview.length>0&&(
        <div style={{marginTop:12}}>
          <div style={{fontSize:10,color:"#10b981",fontWeight:700,letterSpacing:1,marginBottom:8}}>✓ PREVIEW — {preview.length} ready</div>
          <div style={{background:"rgba(0,0,0,0.3)",borderRadius:7,maxHeight:160,overflowY:"auto"}}>
            {preview.slice(0,7).map((p,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderBottom:"1px solid rgba(0,230,100,0.04)"}}>
                <div style={{fontWeight:600,fontSize:12,flex:1}}>{p.name}</div>
                <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                  {p.categories.map(cid=>{const c=CATEGORIES.find(x=>x.id===cid);return c?<span key={cid} style={{fontSize:9,color:c.color,background:`${c.color}12`,padding:"1px 5px",borderRadius:3,fontWeight:700}}>{c.icon}</span>:null;})}
                </div>
              </div>
            ))}
            {preview.length>7&&<div style={{padding:"5px 10px",fontSize:10,color:"rgba(0,230,100,0.3)"}}>...and {preview.length-7} more</div>}
          </div>
          <button style={{width:"100%",marginTop:10,padding:"12px",background:`linear-gradient(135deg,${g},#009944)`,border:"none",borderRadius:8,color:"#050e08",fontFamily:"'Barlow',sans-serif",fontWeight:700,fontSize:13,cursor:"pointer",boxShadow:`0 4px 16px rgba(0,230,100,0.25)`}} onClick={handleImport}>
            {mode==="replace"?`🔄 REPLACE WITH ${preview.length} PARTICIPANTS`:`➕ ADD ${preview.length} PARTICIPANTS`}
          </button>
        </div>
      )}
    </div>
  );
}

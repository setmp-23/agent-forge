(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const KEY = 'agent-forge-workspace-v1';
  const types = {
    agent: { label: 'Agent', icon: '✳', color: 'agent-icon', desc: 'An LLM reasoning step that uses a model and instructions.', fields: ['instructions','model','temperature'] },
    tool: { label: 'Tool call', icon: '⌘', color: 'tool-icon', desc: 'Run a tool or function with structured input.', fields: ['tool','description'] },
    condition: { label: 'Condition', icon: '◇', color: 'condition-icon', desc: 'Route execution based on an expression.', fields: ['expression'] },
    human: { label: 'Human review', icon: '♙', color: 'human-icon', desc: 'Pause the workflow for a human decision.', fields: ['prompt'] },
    parallel: { label: 'Parallel', icon: '⑂', color: 'parallel-icon', desc: 'Run multiple downstream branches concurrently.', fields: ['branches'] },
    output: { label: 'Output', icon: '↗', color: 'output-icon', desc: 'Return a value from this workflow.', fields: ['output'] }
  };
  const defaults = {
    agent: {name:'Research agent',instructions:'Research the topic and summarize the most useful findings.',model:'claude-3-5-sonnet',temperature:'0.3'},
    tool: {name:'Web search',tool:'web_search',description:'Search the web for relevant sources.',input:'{{ topic }}'},
    condition: {name:'Has enough sources?',expression:'{{ search_results.length }} >= 3'},
    human: {name:'Review findings',prompt:'Review the research before creating the final summary.',required:true},
    parallel: {name:'Analyze in parallel',branches:'2'},
    output: {name:'Final answer',output:'{{ summary }}'}
  };
  const starter = () => ({title:'Research assistant',nodes:[
    {id:'n1',type:'agent',x:70,y:160,...structuredClone(defaults.agent),name:'Understand request',instructions:'Identify the topic, key questions, and scope for this research.'},
    {id:'n2',type:'tool',x:330,y:160,...structuredClone(defaults.tool)},
    {id:'n3',type:'condition',x:590,y:160,...structuredClone(defaults.condition)},
    {id:'n4',type:'agent',x:850,y:75,...structuredClone(defaults.agent),name:'Synthesize findings',instructions:'Summarize the research with clear citations and key takeaways.'},
    {id:'n5',type:'human',x:850,y:270,...structuredClone(defaults.human)},
    {id:'n6',type:'output',x:1110,y:160,...structuredClone(defaults.output)}
  ],edges:[{from:'n1',to:'n2'},{from:'n2',to:'n3'},{from:'n3',to:'n4',label:'yes'},{from:'n3',to:'n5',label:'no'},{from:'n4',to:'n6'},{from:'n5',to:'n6'}]});
  let flow, workflows = [], activeFlowId = null, selected = null, zoom = 1, pan = {x:30,y:22}, connectFrom = null, connectLabel = '', log = [], running = false, undoStack = [], redoStack = [], activeTab = 'run';
  const activeEdges = new Set();
  const canvas = $('#canvas'), edgesSvg = $('#edges'), wrap = $('#canvasWrap');
  function isValidShape(value){if(!value||typeof value.title!=='string'||!Array.isArray(value.nodes)||!Array.isArray(value.edges))return false;const ids=new Set();for(const n of value.nodes){if(!n||typeof n.id!=='string'||!/^[\w-]{1,64}$/.test(n.id)||ids.has(n.id)||!types[n.type]||typeof n.name!=='string'||!Number.isFinite(n.x)||!Number.isFinite(n.y))return false;ids.add(n.id);}return value.edges.every(e=>e&&ids.has(e.from)&&ids.has(e.to)&&(e.label===undefined||typeof e.label==='string'));}
  function workflowId(){return 'flow-'+Math.random().toString(36).slice(2,10);}
  try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(saved?.schema_version===1&&Array.isArray(saved.workflows)){workflows=saved.workflows.filter(w=>w&&typeof w.id==='string'&&isValidShape(w.flow));activeFlowId=saved.activeFlowId;}}catch{}
  if(!workflows.length){let legacy=null;try{legacy=JSON.parse(localStorage.getItem('agent-forge-workflow-v1')||'null');}catch{}workflows=[{id:workflowId(),flow:isValidShape(legacy)?legacy:starter()}];activeFlowId=workflows[0].id;}
  if(!workflows.some(w=>w.id===activeFlowId))activeFlowId=workflows[0].id;
  flow=workflows.find(w=>w.id===activeFlowId).flow;
  function save(){try{const active=workflows.find(w=>w.id===activeFlowId);if(active)active.flow=flow;localStorage.setItem(KEY,JSON.stringify({schema_version:1,activeFlowId,workflows}));$('#saveStatus').textContent='Saved locally';}catch{$('#saveStatus').textContent='Save failed';toast('Could not save locally. Export a copy to keep your changes.');}}
  function touch(){undoStack.push(JSON.stringify(flow));if(undoStack.length>40)undoStack.shift();redoStack=[];$('#saveStatus').textContent='Saving…';render();save();}
  function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),2300);}
  function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function node(id){return flow.nodes.find(n=>n.id===id);}
  function renderWorkflowList(){const list=$('#flowList');list.innerHTML=workflows.map(w=>`<button class="flow-link ${w.id===activeFlowId?'selected':''}" data-flow-id="${esc(w.id)}"><span class="flow-icon">◈</span><span>${esc(w.flow.title)}</span></button>`).join('');$$('[data-flow-id]',list).forEach(btn=>btn.onclick=()=>switchWorkflow(btn.dataset.flowId));}
  function switchWorkflow(id){const record=workflows.find(w=>w.id===id);if(!record||id===activeFlowId)return;activeFlowId=id;flow=record.flow;selected=null;connectFrom=null;log=[];activeEdges.clear();undoStack=[];redoStack=[];pan={x:30,y:22};zoom=1;save();fitGraph();}
  function createWorkflow(data){const record={id:workflowId(),flow:data};workflows.push(record);activeFlowId=record.id;flow=record.flow;selected=null;connectFrom=null;log=[];activeEdges.clear();undoStack=[];redoStack=[];pan={x:30,y:22};zoom=1;save();fitGraph();}
  function render(){
    $('#projectTitle').textContent=flow.title;
    $('#toolbarFlowTitle').textContent=flow.title;renderWorkflowList();
    $('#canvasHint').classList.toggle('hidden',flow.nodes.length>0);
    canvas.style.transform=`translate(${pan.x}px,${pan.y}px) scale(${zoom})`;
    const box=wrap.getBoundingClientRect();edgesSvg.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);
    edgesSvg.innerHTML=`<g transform="translate(${pan.x} ${pan.y}) scale(${zoom})">${flow.edges.map(e=>{const a=node(e.from),b=node(e.to);if(!a||!b)return '';const x1=a.x+192,y1=a.y+(a.type==='condition'?54:44),x2=b.x,y2=b.y+44,dx=Math.max(40,(x2-x1)*.45),d=`M ${x1} ${y1} C ${x1+dx} ${y1}, ${x2-dx} ${y2}, ${x2} ${y2}`,mx=(x1+x2)/2,my=(y1+y2)/2;return `<path class="edge-path ${activeEdges.has(`${e.from}|${e.to}`)?'active':''}" d="${d}"/><circle cx="${x2}" cy="${y2}" r="2.5" fill="#989b8a"/>${e.label?`<rect class="edge-label-bg" x="${mx-14}" y="${my-13}" width="28" height="15" rx="4"/><text class="edge-label" x="${mx}" y="${my-2}" text-anchor="middle">${esc(e.label)}</text>`:''}`}).join('')}</g>`;
    canvas.innerHTML=flow.nodes.map(n=>{const t=types[n.type],isSel=n.id===selected,klass=`flow-node${isSel?' selected':''}${n.running?' running':''}${n.done?' done':''}`;let desc=n.type==='agent'?n.instructions:n.type==='tool'?`${n.tool} · ${n.description}`:n.type==='condition'?n.expression:n.type==='human'?n.prompt:n.type==='parallel'?`${n.branches} parallel branches`:n.output;return `<article class="${klass}" data-id="${esc(n.id)}" style="left:${n.x}px;top:${n.y}px"><span class="port port-in" data-port="in" title="Вход" ${n.type==='agent'&&n.id===flow.nodes[0]?.id?'style="opacity:.25"':''}></span><div class="node-head"><span class="node-icon ${t.color}">${t.icon}</span><span class="node-title">${esc(n.name)}</span><span class="node-kind">${n.type==='agent'?esc(n.model||'mock') :t.label.toUpperCase()}</span></div><div class="node-body"><div class="node-preview">${esc(desc||'Configure this node in the inspector.')}</div><div class="node-bottom">${n.type==='agent'?`<span class="model-pill">◉ ${esc(n.model)}</span><span>·</span><span>temp ${esc(n.temperature)}</span>`:n.type==='tool'?'<span>FUNCTION</span>':n.type==='condition'?'<span>IF / ELSE</span>':n.type==='human'?'<span>HUMAN IN THE LOOP</span>':n.type==='parallel'?'<span>FAN-OUT</span>':'<span>RETURN VALUE</span>'}</div></div>${n.type==='condition'?'<div class="branch-ports"><span class="port" data-port="out-yes" title="yes branch"></span><span class="port" data-port="out-no" title="no branch"></span></div>':n.type==='output'?'':'<span class="port port-out" data-port="out" title="Выход"></span>'}</article>`}).join('');
    renderInspector();renderMini();$('#zoomLabel').textContent=`${Math.round(zoom*100)}%`;$('#zoomLabelSmall').textContent=`${Math.round(zoom*100)}%`;$('#logCount').textContent=log.length;$('#issueCount').textContent=String(validate(false).length);
  }
  function renderMini(){const m=$('#minimapNodes');m.innerHTML='';const xs=flow.nodes.map(n=>n.x),ys=flow.nodes.map(n=>n.y);if(!xs.length)return;const minX=Math.min(...xs)-20,maxX=Math.max(...xs)+230,minY=Math.min(...ys)-20,maxY=Math.max(...ys)+120,ww=maxX-minX,hh=maxY-minY;flow.nodes.forEach(n=>{const d=document.createElement('i');d.className='mini-node'+(n.id===selected?' selected':'');d.style.left=`${((n.x-minX)/ww)*100}%`;d.style.top=`${((n.y-minY)/hh)*100}%`;m.append(d);});}
  function field(label,key,value,placeholder='',area=false,extra=''){return `<div class="field-wrap"><label>${label}</label>${area?`<textarea class="field textarea" data-field="${key}" placeholder="${placeholder}">${esc(value||'')}</textarea>`:`<input class="field ${extra}" data-field="${key}" value="${esc(value||'')}" placeholder="${placeholder}"/>`}</div>`;}
  function renderInspector(){const empty=$('#inspector').querySelector('.inspector-empty'),content=$('#inspectorContent'),n=node(selected);if(!n){empty.classList.remove('hidden');content.classList.add('hidden');return;}empty.classList.add('hidden');content.classList.remove('hidden');const t=types[n.type];let fields='';
    if(n.type==='agent') fields=field('INSTRUCTIONS','instructions',n.instructions,'Describe what this agent should do…',true)+`<div class="field-wrap"><label>MODEL</label><select class="field select" data-field="model">${['claude-3-5-sonnet','claude-3-7-sonnet','gpt-4.1','gpt-4o','mock-llm'].map(x=>`<option ${n.model===x?'selected':''}>${x}</option>`).join('')}</select></div>`+field('TEMPERATURE','temperature',n.temperature,'0.0 – 1.0');
    if(n.type==='tool') fields=field('TOOL NAME','tool',n.tool,'web_search')+field('DESCRIPTION','description',n.description,'What does this tool do?',true)+field('INPUT','input',n.input,'{{ input }}');
    if(n.type==='condition') fields=field('EXPRESSION','expression',n.expression,'{{ value }} == true')+'<div class="field-wrap"><label>TRUE OUTPUT</label><input class="field" value="yes → next node" disabled /></div><div class="field-wrap"><label>FALSE OUTPUT</label><input class="field" value="no → next node" disabled /></div>';
    if(n.type==='human') fields=field('REVIEW PROMPT','prompt',n.prompt,'What should the reviewer check?',true)+`<div class="toggle-row"><span>Require explicit approval</span><button class="toggle ${n.required?'on':''}" data-toggle="required"><span></span></button></div>`;
    if(n.type==='parallel') fields=field('BRANCH COUNT','branches',n.branches,'2')+'<div class="connected-row">All connected branches run concurrently in preview.</div>';
    if(n.type==='output') fields=field('OUTPUT VALUE','output',n.output,'{{ result }}',true);
    content.innerHTML=`<div class="inspector-header"><div class="inspector-title-row"><span class="node-icon ${t.color}">${t.icon}</span><h3>${esc(n.name)}</h3><button class="icon-btn delete-node" id="deleteNode" title="Delete node">⌫</button></div><p>${t.desc}</p></div><section class="inspector-section">${field('NODE NAME','name',n.name,'Name this step')}${fields}</section><section class="inspector-section"><span class="field-label">CONNECTIONS</span>${flow.edges.filter(e=>e.to===n.id||e.from===n.id).map(e=>{const peer=node(e.from===n.id?e.to:e.from);return `<div class="connected-row"><i class="connection-dot"></i><span>${e.from===n.id?'To':'From'}: ${esc(peer?.name||'Unknown')}${e.label?` · ${esc(e.label)}`:''}</span><button class="icon-btn tiny edge-delete" data-edge="${e.from}|${e.to}|${e.label||''}" title="Remove connection">×</button></div>`}).join('')||'<div class="connected-row">No connections yet</div>'}<button class="add-connection" id="connectNode">＋ &nbsp;Connect node</button></section><div class="inspector-foot">ID: ${esc(n.id)} · ${t.label.toLowerCase()}</div>`;
    $$('[data-field]',content).forEach(el=>el.addEventListener('change',()=>{n[el.dataset.field]=el.value;touch();}));$('#deleteNode').onclick=()=>deleteNode(n.id);$('#connectNode').onclick=()=>{let branch='';if(n.type==='condition'){branch=prompt('Connect which condition branch? Enter yes or no.','yes')?.trim().toLowerCase()||'';if(!['yes','no'].includes(branch)){toast('Choose yes or no to connect a condition branch');return;}}startConnect(n.id,branch);};$$('.edge-delete',content).forEach(b=>b.onclick=()=>{const [from,to,label]=b.dataset.edge.split('|');flow.edges=flow.edges.filter(e=>e.from!==from||e.to!==to||(e.label||'')!==label);touch();});const tog=$('[data-toggle]',content);if(tog)tog.onclick=()=>{n[tog.dataset.toggle]=!n[tog.dataset.toggle];touch();};
  }
  function addNode(type,x,y){const id='n'+Math.random().toString(36).slice(2,8);flow.nodes.push({id,type,x,y,...structuredClone(defaults[type])});selected=id;touch();$('#canvasHint').classList.add('hidden');return id;}
  function deleteNode(id){flow.nodes=flow.nodes.filter(n=>n.id!==id);flow.edges=flow.edges.filter(e=>e.from!==id&&e.to!==id);selected=null;touch();toast('Node deleted');}
  function startConnect(id,label=''){connectFrom=id;connectLabel=label;$('#connectionHelp').classList.add('visible');toast('Choose the next node on the canvas');}
  function endConnect(to){if(connectFrom===to){toast('Choose a different node');return;}if(flow.edges.some(e=>e.from===connectFrom&&e.to===to&&(e.label||'')===connectLabel)){toast('These nodes are already connected');connectFrom=null;connectLabel='';$('#connectionHelp').classList.remove('visible');return;}flow.edges.push({from:connectFrom,to,...(connectLabel?{label:connectLabel}:{})});connectFrom=null;connectLabel='';$('#connectionHelp').classList.remove('visible');touch();toast(`Connected to ${node(to)?.name||'node'}`);}
  $('#cancelConnect').onclick=()=>{connectFrom=null;connectLabel='';$('#connectionHelp').classList.remove('visible');};
  $$('.library-node').forEach(btn=>{btn.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',btn.dataset.type);});btn.addEventListener('click',()=>{const rect=wrap.getBoundingClientRect();addNode(btn.dataset.type,Math.max(20,(rect.width/2-pan.x)/zoom-96),Math.max(20,(rect.height/2-pan.y)/zoom-44));});});
  wrap.addEventListener('dragover',e=>e.preventDefault());wrap.addEventListener('drop',e=>{e.preventDefault();const type=e.dataTransfer.getData('text/plain');if(types[type]){const r=wrap.getBoundingClientRect();addNode(type,(e.clientX-r.left-pan.x)/zoom,(e.clientY-r.top-pan.y)/zoom);}});
  canvas.addEventListener('click',e=>{const port=e.target.closest('.port'),card=e.target.closest('.flow-node');if(port&&card){const id=card.dataset.id;if(port.dataset.port.startsWith('out')){startConnect(id,port.dataset.port==='out-yes'?'yes':port.dataset.port==='out-no'?'no':'');return;}if(connectFrom){endConnect(id);return;}}if(card){selected=card.dataset.id;render();return;}selected=null;render();});
  canvas.addEventListener('pointerdown',e=>{const card=e.target.closest('.flow-node');if(!card||e.target.closest('.port'))return;const n=node(card.dataset.id),start={x:e.clientX,y:e.clientY,nx:n.x,ny:n.y};card.setPointerCapture(e.pointerId);const move=ev=>{n.x=start.nx+(ev.clientX-start.x)/zoom;n.y=start.ny+(ev.clientY-start.y)/zoom;card.style.left=n.x+'px';card.style.top=n.y+'px';renderEdgesOnly();};const up=()=>{card.removeEventListener('pointermove',move);card.removeEventListener('pointerup',up);touch();};card.addEventListener('pointermove',move);card.addEventListener('pointerup',up,{once:true});});
  function renderEdgesOnly(){const box=wrap.getBoundingClientRect();edgesSvg.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);edgesSvg.innerHTML=`<g transform="translate(${pan.x} ${pan.y}) scale(${zoom})">${flow.edges.map(e=>{const a=node(e.from),b=node(e.to);if(!a||!b)return '';const x1=a.x+192,y1=a.y+(a.type==='condition'?54:44),x2=b.x,y2=b.y+44,dx=Math.max(40,(x2-x1)*.45);return `<path class="edge-path ${activeEdges.has(`${e.from}|${e.to}`)?'active':''}" d="M ${x1} ${y1} C ${x1+dx} ${y1}, ${x2-dx} ${y2}, ${x2} ${y2}"/>`}).join('')}</g>`;}
  let panning=null;wrap.addEventListener('pointerdown',e=>{if(e.target===wrap||e.target.classList.contains('canvas-grid')){panning={x:e.clientX,y:e.clientY,px:pan.x,py:pan.y};wrap.setPointerCapture(e.pointerId);}});wrap.addEventListener('pointermove',e=>{if(panning){pan.x=panning.px+e.clientX-panning.x;pan.y=panning.py+e.clientY-panning.y;render();}});wrap.addEventListener('pointerup',()=>panning=null);
  function setZoom(z){zoom=Math.max(.35,Math.min(1.6,z));render();}
  function fitGraph(){if(!flow.nodes.length){zoom=1;pan={x:30,y:30};render();return;}const rect=wrap.getBoundingClientRect(),minX=Math.min(...flow.nodes.map(n=>n.x)),minY=Math.min(...flow.nodes.map(n=>n.y)),maxX=Math.max(...flow.nodes.map(n=>n.x+192)),maxY=Math.max(...flow.nodes.map(n=>n.y+100)),w=maxX-minX,h=maxY-minY;zoom=Math.min(1,(rect.width-100)/w,(rect.height-100)/h);zoom=Math.max(.35,zoom);pan={x:(rect.width-w*zoom)/2-minX*zoom,y:(rect.height-h*zoom)/2-minY*zoom};render();}
  $('#zoomIn').onclick=()=>setZoom(zoom+.1);$('#zoomOut').onclick=()=>setZoom(zoom-.1);$('#fitBtn').onclick=fitGraph;
  function validate(show=true){
    const issues=[],ids=new Set(flow.nodes.map(n=>n.id)),counts=new Map(flow.nodes.map(n=>[n.id,0])),adj=new Map(flow.nodes.map(n=>[n.id,[]]));
    if(!flow.nodes.length)issues.push('Add nodes to your workflow.');
    if(!flow.nodes.some(n=>n.type==='output'))issues.push('Add an Output node so the workflow returns a result.');
    if(new Set(flow.nodes.map(n=>n.id)).size!==flow.nodes.length)issues.push('Every node needs a unique ID.');
    const seenEdges=new Set();
    flow.edges.forEach(e=>{const key=`${e.from}|${e.to}|${e.label||''}`;if(seenEdges.has(key))issues.push(`Duplicate connection from ${node(e.from)?.name||e.from} to ${node(e.to)?.name||e.to}.`);seenEdges.add(key);if(!ids.has(e.from)||!ids.has(e.to)){issues.push('A connection points to a node that no longer exists.');return;}const source=node(e.from);if(source.type==='condition'&&!['yes','no'].includes(e.label))issues.push(`${source.name}: label each condition connection yes or no.`);if(source.type!=='condition'&&e.label)issues.push(`${source.name}: branch labels are only valid on Condition nodes.`);counts.set(e.to,(counts.get(e.to)||0)+1);adj.get(e.from).push(e.to);});
    flow.nodes.forEach(n=>{const label=n.name||`${types[n.type].label} ${n.id}`,outgoing=flow.edges.filter(e=>e.from===n.id);if(!n.name?.trim())issues.push(`${label}: add a name.`);if(n.type==='agent'){if(!n.instructions?.trim())issues.push(`${label}: add agent instructions.`);if(!n.model?.trim())issues.push(`${label}: select a model.`);const temp=Number(n.temperature);if(!Number.isFinite(temp)||temp<0||temp>1)issues.push(`${label}: temperature must be between 0 and 1.`);}if(n.type==='tool'&&!n.tool?.trim())issues.push(`${label}: add a tool name.`);if(n.type==='human'&&!n.prompt?.trim())issues.push(`${label}: add a review prompt.`);if(n.type==='condition'){if(!n.expression?.trim())issues.push(`${label}: add a condition expression.`);const labels=outgoing.map(e=>e.label);if(labels.filter(x=>x==='yes').length!==1||labels.filter(x=>x==='no').length!==1)issues.push(`${label}: add exactly one yes branch and one no branch.`);}if(n.type==='parallel'){const branches=Number(n.branches);if(!Number.isInteger(branches)||branches<2)issues.push(`${label}: use at least two branches.`);if(outgoing.length!==branches)issues.push(`${label}: connect exactly ${Number.isInteger(branches)?branches:'the configured number of'} branches.`);}if(n.type==='output'&&!n.output?.trim())issues.push(`${label}: add an output value.`);if(n.type!=='condition'&&n.type!=='parallel'&&n.type!=='output'&&outgoing.length>1)issues.push(`${label}: connect multiple branches through a Parallel node.`);if(n.type==='output'&&outgoing.length)issues.push(`${label}: Output nodes cannot have outgoing connections.`);});
    const roots=flow.nodes.filter(n=>(counts.get(n.id)||0)===0);if(flow.nodes.length&&!roots.length)issues.push('This workflow has no start node. Remove a cycle or add an entry point.');else if(roots.length>1)issues.push('This workflow has multiple start nodes. Connect the flow to one entry point.');
    if(roots.length){const reachable=new Set(),todo=roots.map(n=>n.id);while(todo.length){const id=todo.pop();if(reachable.has(id))continue;reachable.add(id);todo.push(...(adj.get(id)||[]));}flow.nodes.filter(n=>!reachable.has(n.id)).forEach(n=>issues.push(`${n.name}: this node is unreachable from the start.`));}
    const reverse=new Map(flow.nodes.map(n=>[n.id,[]]));flow.edges.forEach(e=>{if(reverse.has(e.to)&&reverse.has(e.from))reverse.get(e.to).push(e.from);});const outputIds=flow.nodes.filter(n=>n.type==='output').map(n=>n.id),canFinish=new Set(),back=outputIds.slice();while(back.length){const id=back.pop();if(canFinish.has(id))continue;canFinish.add(id);back.push(...(reverse.get(id)||[]));}flow.nodes.filter(n=>!canFinish.has(n.id)).forEach(n=>issues.push(`${n.name}: this path does not reach an Output node.`));
    const degree=new Map(counts),queue=flow.nodes.filter(n=>(degree.get(n.id)||0)===0).map(n=>n.id);let visited=0;while(queue.length){const id=queue.shift();visited++;for(const next of adj.get(id)||[]){degree.set(next,degree.get(next)-1);if(degree.get(next)===0)queue.push(next);}}if(visited<flow.nodes.length)issues.push('Cycles are not supported in this workflow.');
    const result=[...new Set(issues)];if(show){if(result.length){showIssues(result);toast(`${result.length} issue${result.length===1?'':'s'} found`);}else{toast('Workflow is valid');$('#runStatus').textContent='Validation passed';}}return result;
  }
  function showIssues(items){activeTab='issues';$$('.console-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab==='issues'));$('#consoleBody').innerHTML=`<div class="issue-list">${items.map(i=>`<div class="issue"><span>⚠</span>${esc(i)}</div>`).join('')}</div>`;}
  $('#validateBtn').onclick=()=>validate();
  function logEntry(n,kind,detail,ms){log.push({name:n.name,type:n.type,kind,detail,ms,at:new Date()});renderLog();}
  function renderLog(){if(activeTab!=='run')return;$('#consoleBody').innerHTML=log.length?`<div class="log-list">${log.map(x=>`<div class="log-row"><span class="log-time">${x.at.toLocaleTimeString('ru-RU',{hour12:false})}</span><span class="log-mark">${x.kind==='done'?'✓':x.kind==='wait'?'◷':'›'}</span><span><span class="log-title">${esc(x.name)}</span><span class="log-detail">${esc(x.detail)}</span></span><span class="log-pill">${x.ms}ms</span></div>`).join('')}</div>`:`<div class="empty-log"><span class="terminal-icon">⌘</span><div><b>No runs yet</b><span>Run a preview to see your agent's execution trace.</span></div></div>`;$('#logCount').textContent=log.length;}
  function mockCondition(n){const expr=String(n.expression||'').trim();const match=expr.match(/{{\s*([\w.]+)\s*}}\s*(>=|<=|==|!=|>|<)\s*(-?\d+(?:\.\d+)?|true|false|'[^']*'|"[^"]*")/i);if(!match)return true;const values={'search_results.length':3,'sources.length':3,'priority':'high','sentiment':'negative','approved':true};const left=values[match[1]]??0;let right=match[3];if(/^['"].*['"]$/.test(right))right=right.slice(1,-1);else if(/^(true|false)$/i.test(right))right=right.toLowerCase()==='true';else right=Number(right);switch(match[2]){case'>=':return left>=right;case'<=':return left<=right;case'>':return left>right;case'<':return left<right;case'==':return String(left)===String(right);case'!=':return String(left)!==String(right);default:return true;}}
  async function run(){if(running)return;const issues=validate(false);if(issues.length){showIssues(issues);toast('Fix validation issues before running');return;}running=true;log=[];activeEdges.clear();activeTab='run';$$('.console-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab==='run'));$$('.flow-node').forEach(e=>e.classList.remove('running','done'));$('#runStatus').textContent='Mock run in progress';$('#console').classList.remove('collapsed');renderLog();
    const inFlight = new Map();
    const findJoin = starts => {
      if (starts.length < 2) return null;
      const distances = starts.map(start => {
        const result = new Map([[start, 0]]);
        const queue = [start];
        while (queue.length) {
          const current = queue.shift();
          for (const edge of flow.edges.filter(item => item.from === current)) {
            if (!result.has(edge.to)) {
              result.set(edge.to, result.get(current) + 1);
              queue.push(edge.to);
            }
          }
        }
        return result;
      });
      const common = [...distances[0].keys()].filter(id => distances.every(map => map.has(id)));
      common.sort((a, b) => distances.reduce((sum, map) => sum + map.get(a), 0) - distances.reduce((sum, map) => sum + map.get(b), 0));
      return common[0] || null;
    };
    const execute = async (id, path, stopAt = null) => {
      if (id === stopAt) return true;
      if (path.has(id)) {
        log.push({name:'Cycle guard',kind:'wait',detail:'Stopped a repeated path to keep the mock run bounded.',ms:0,at:new Date()});
        renderLog();
        return false;
      }
      if (inFlight.has(id)) return inFlight.get(id);
      const current = node(id);
      if (!current) return false;
      const nextPath = new Set(path);
      nextPath.add(id);
      const task = (async () => {
        const element = $(`[data-id="${id}"]`);
        element?.classList.add('running');
        const ms = current.type === 'agent' ? 420 : current.type === 'tool' ? 260 : current.type === 'human' ? 520 : 120;
        let decision = null;
        const detail = current.type === 'agent'
          ? `Mock response for ${current.model} · no model was called.`
          : current.type === 'tool'
            ? `Mock tool · ${current.tool} returned 3 sample results.`
            : current.type === 'condition'
              ? (decision = mockCondition(current), `Expression evaluated · mock chose “${decision ? 'yes' : 'no'}”.`)
              : current.type === 'human'
                ? 'Mock preview · this review step was auto-approved; no person was asked.'
                : current.type === 'parallel'
                  ? `Fan-out · running ${flow.edges.filter(edge => edge.from === id).length} branches concurrently.`
                  : `Returned: ${current.output}`;
        logEntry(current, current.type === 'human' ? 'wait' : 'start', detail, ms);
        await new Promise(resolve => setTimeout(resolve, ms));
        element?.classList.remove('running');
        element?.classList.add('done');
        logEntry(current, 'done', `${types[current.type].label} completed.`, ms);
        let outgoing = flow.edges.filter(edge => edge.from === id);
        if (current.type === 'condition') outgoing = outgoing.filter(edge => edge.label === (decision ? 'yes' : 'no'));
        else if (current.type !== 'parallel') outgoing = outgoing.slice(0, 1);
        outgoing.forEach(edge => activeEdges.add(`${edge.from}|${edge.to}`));
        if (outgoing.length) renderEdgesOnly();
        if (current.type === 'parallel' && outgoing.length > 1) {
          const join = findJoin(outgoing.map(edge => edge.to));
          const results = await Promise.all(outgoing.map(edge => execute(edge.to, nextPath, join || stopAt)));
          if (join && results.every(Boolean)) return execute(join, nextPath, stopAt);
          return results.some(Boolean);
        }
        const results = await Promise.all(outgoing.map(edge => execute(edge.to, nextPath, stopAt)));
        return results.some(Boolean);
      })();
      inFlight.set(id, task);
      return task;
    };    const start=flow.nodes.find(n=>!flow.edges.some(e=>e.to===n.id));if(start)await execute(start.id,new Set());running=false;$('#runStatus').textContent='Preview completed · mock mode';toast('Mock preview completed');
  }
  $('#runBtn').onclick=run;$('#consoleRun').onclick=run;$('#collapseConsole').onclick=()=>$('#console').classList.toggle('collapsed');
  $$('.console-tab').forEach(b=>b.onclick=()=>{activeTab=b.dataset.tab;$$('.console-tab').forEach(x=>x.classList.toggle('active',x===b));if(activeTab==='issues')showIssues(validate(false));else if(activeTab==='run')renderLog();else $('#consoleBody').innerHTML='<div class="empty-log"><span class="terminal-icon">◈</span><div><b>Flow preview</b><span>The current workflow contains '+flow.nodes.length+' nodes and '+flow.edges.length+' connections.</span></div></div>';});
  function openExport(){const slug=flow.title.toLowerCase().replace(/[^a-z0-9-_]/g,'-').replace(/^-+|-+$/g,'');$('#exportFilename').value=slug||'workflow';$('#exportModal').classList.remove('hidden');}
  $('#exportBtn').onclick=openExport;$$('[data-close]').forEach(b=>b.onclick=()=>$('#'+b.dataset.close).classList.add('hidden'));$$('.modal-backdrop').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.add('hidden');}));
  let format='yaml';$$('.format-card').forEach(b=>b.onclick=()=>{$$('.format-card').forEach(x=>x.classList.toggle('selected',x===b));format=b.dataset.format;$('#downloadExport').innerHTML=`↓ &nbsp;Download .${format}`;});
  function yamlString(s){return JSON.stringify(String(s??''));}
  function exportData(){return {schema_version:'1.0.0',name:flow.title,description:'Agent Forge visual workflow',runtime:{mode:'local',preview:'mock'},nodes:flow.nodes.map(n=>({id:n.id,type:n.type,name:n.name,position:{x:n.x,y:n.y},...Object.fromEntries(Object.entries(n).filter(([k])=>!['id','type','name','x','y','running','done','strategy'].includes(k)))})),edges:flow.edges.map(e=>({from:e.from,to:e.to,...(e.label?{label:e.label}:{})}))};}
  function toYaml(obj,depth=0){const pad='  '.repeat(depth);if(Array.isArray(obj))return obj.length?obj.map(v=>`${pad}- ${v&&typeof v==='object'?'\n'+toYaml(v,depth+1):yamlString(v)}`).join('\n'):pad+'[]';return Object.entries(obj).map(([k,v])=>v&&typeof v==='object'?`${pad}${k}:\n${toYaml(v,depth+1)}`:`${pad}${k}: ${typeof v==='boolean'||typeof v==='number'?v:yamlString(v)}`).join('\n');}
  $('#downloadExport').onclick=()=>{const data=exportData(),blob=new Blob([format==='json'?JSON.stringify(data,null,2):toYaml(data)+'\n'],{type:format==='json'?'application/json':'text/yaml'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(($('#exportFilename').value||'workflow').replace(/[^a-z0-9-_]/gi,'-').replace(/^-+|-+$/g,'')||'workflow')+'.'+format;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);$('#exportModal').classList.add('hidden');toast(`Workflow exported as .${format}`);};
  $('#importBtn').onclick=()=>$('#importFile').click();$('#importFile').addEventListener('change',async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>5*1024*1024)throw new Error('Workflow file is larger than 5 MB.');const data=JSON.parse(await file.text());if(data.schema_version!=='1.0.0'||!Array.isArray(data.nodes)||!Array.isArray(data.edges)||typeof data.name!=='string')throw new Error('This file is not a supported Agent Forge workflow.');if(data.nodes.length>1000||data.edges.length>10000)throw new Error('Workflow exceeds the supported size.');const allowed=['instructions','model','temperature','tool','description','input','expression','prompt','required','branches','output'];const imported={title:data.name.trim()||'Imported workflow',nodes:data.nodes.map(n=>{if(!n||typeof n.id!=='string'||!types[n.type]||typeof n.name!=='string'||!Number.isFinite(n.position?.x)||!Number.isFinite(n.position?.y))throw new Error('Workflow contains an invalid node.');const values=Object.fromEntries(allowed.filter(k=>Object.hasOwn(n,k)).map(k=>[k,n[k]]));return {...structuredClone(defaults[n.type]),id:n.id,type:n.type,name:n.name,x:Math.max(-50000,Math.min(50000,n.position.x)),y:Math.max(-50000,Math.min(50000,n.position.y)),...values};}),edges:data.edges.map(edge=>{if(!edge||typeof edge.from!=='string'||typeof edge.to!=='string'||(edge.label!==undefined&&!['yes','no'].includes(edge.label)))throw new Error('Workflow contains an invalid connection.');return {from:edge.from,to:edge.to,...(edge.label?{label:edge.label}:{})};})};if(!isValidShape(imported))throw new Error('Workflow has duplicate IDs or dangling connections.');createWorkflow(imported);toast('Workflow imported');const issues=validate(false);if(issues.length)showIssues(issues);}catch(err){toast(err.message==='Unexpected end of JSON input'?'Could not read this JSON file.':err.message||'Could not import this workflow.');}});
  $('#templatesBtn').onclick=()=>$('#templateModal').classList.remove('hidden');$('#newFlow').onclick=$('#newFlowSmall').onclick=()=>$('#templateModal').classList.remove('hidden');$$('[data-template]').forEach(btn=>btn.onclick=()=>{const kind=btn.dataset.template;let next=kind==='blank'?{title:'Untitled workflow',nodes:[],edges:[]}:starter();if(kind==='support'){next.title='Support triage';next.nodes[0].name='Classify request';next.nodes[0].instructions='Classify the request by urgency, topic, and sentiment.';next.nodes[1].name='Create support ticket';next.nodes[1].tool='create_ticket';next.nodes[1].description='Create a ticket and route it to the appropriate support queue.';next.nodes[1].input='{{ classification }}';next.nodes[2].name='High priority?';next.nodes[2].expression="{{ priority }} == 'high'";next.nodes[3].name='Draft response';next.nodes[3].instructions='Draft a concise, helpful reply that addresses the support request.';next.nodes[4].name='Escalation review';next.nodes[4].prompt='Review and approve this high-priority support response before it is sent.';next.nodes[5].name='Support reply';next.nodes[5].output='{{ response }}';next.edges.forEach(edge=>{if(edge.from==='n3'&&edge.to==='n4')edge.label='no';if(edge.from==='n3'&&edge.to==='n5')edge.label='yes';});}if(kind==='content'){next.title='Content pipeline';next.nodes[0].name='Create content brief';next.nodes[0].instructions='Turn the request into an audience, goal, key points, and tone brief.';next.nodes[1].name='Gather sources';next.nodes[1].description='Find and summarize relevant sources for the content brief.';next.nodes[2]={id:'n3',type:'parallel',x:590,y:160,...structuredClone(defaults.parallel),name:'Analyze in parallel'};next.nodes[3].name='Fact-check claims';next.nodes[3].instructions='Check factual claims in the draft against the gathered sources.';next.nodes[4]={id:'n5',type:'agent',x:850,y:270,...structuredClone(defaults.agent),name:'Refine style',instructions:'Improve clarity, structure, and tone while preserving the verified facts.'};next.nodes[5].name='Publish-ready content';next.nodes[5].output='{{ fact_checked_draft + refined_copy }}';next.edges=[{from:'n1',to:'n2'},{from:'n2',to:'n3'},{from:'n3',to:'n4'},{from:'n3',to:'n5'},{from:'n4',to:'n6'},{from:'n5',to:'n6'}];}$('#templateModal').classList.add('hidden');createWorkflow(next);toast(`${flow.title} workflow created`);});
  $('#addFirstNode').onclick=()=>addNode('agent',100,100);$('#renameProject').onclick=()=>{const title=prompt('Workflow name',flow.title);if(title?.trim()){flow.title=title.trim();touch();}};
  function undo(){if(!undoStack.length)return;redoStack.push(JSON.stringify(flow));flow=JSON.parse(undoStack.pop());selected=null;render();save();}
  function redo(){if(!redoStack.length)return;undoStack.push(JSON.stringify(flow));flow=JSON.parse(redoStack.pop());selected=null;render();save();}
  $('#undoBtn').onclick=undo;$('#redoBtn').onclick=redo;
  $('#helpBtn').onclick=()=>toast('Drag a node onto the canvas, connect its output, then select it to edit its fields.');
  const isMac=/Mac/i.test(navigator.userAgentData?.platform||navigator.platform||'');$('.kbd').textContent=isMac?'⌘ E':'Ctrl E';
  window.addEventListener('keydown',e=>{const modifier=e.ctrlKey||e.metaKey,editing=Boolean(document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')),key=e.key.toLowerCase();if(modifier&&key==='e'&&!editing){e.preventDefault();openExport();}else if(modifier&&key==='s'&&!editing){e.preventDefault();save();toast('Saved locally');}else if(modifier&&key==='z'&&!editing){e.preventDefault();e.shiftKey?redo():undo();}else if(modifier&&(key==='y'||(key==='z'&&e.shiftKey))&&!editing){e.preventDefault();redo();}else if(modifier&&e.key==='Enter'&&!editing){e.preventDefault();run();}if(e.key==='Escape'){connectFrom=null;connectLabel='';$('#connectionHelp').classList.remove('visible');$$('.modal-backdrop').forEach(m=>m.classList.add('hidden'));}if((e.key==='Delete'||e.key==='Backspace')&&selected&&!editing)deleteNode(selected);});
  window.addEventListener('resize',fitGraph);requestAnimationFrame(()=>requestAnimationFrame(fitGraph));
})();

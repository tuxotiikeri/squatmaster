import type {Measurement} from './analysis.ts';
import {chartScale,download,normalizedCurve,repColor,SIGNALS,SIGNAL_GUIDES} from './report.ts';
const difficulty={normal:'Normal',hard:'Hard',insane:'I Am Insane'};
/** Same summary and sign conventions as the results view. */
export function renderResultsPng(r:Measurement,c:HTMLCanvasElement){
  const game=r.settings.mode==='game',fg=game?'#f1eee9':'#19373d',muted=game?'#c9c7d1':'#526c60',grid=game?'#68636f':'#bacabd';
  c.width=1600;c.height=(game?550:1980)+r.reps.length*48;
  const ctx=c.getContext('2d')!;ctx.fillStyle=game?'#171a24':'#f4f7f3';ctx.fillRect(0,0,c.width,c.height);
  ctx.fillStyle=fg;ctx.font='bold 42px Arial';ctx.fillText('Squat Master',65,70);ctx.font='24px Arial';ctx.fillStyle=muted;
  ctx.fillText(`${game?'GAME':'TEST'} · ${r.settings.side.toUpperCase()} STANCE LEG${r.stoppedEarly?' · Stopped early':''}`,65,112);
  const cards=[['Total time',r.totalDuration.toFixed(2)+' s'],[game?'Difficulty':'Depth target',game?difficulty[r.settings.difficulty]:Math.round(r.settings.depthTarget*100)+'%'],['Reps',`${r.reps.length} (${r.rejected} rejected)`]];
  cards.forEach(([title,value],i)=>{const left=65+i*505;ctx.fillStyle=game?'#242530':'#fff';ctx.fillRect(left,140,475,96);ctx.fillStyle=muted;ctx.font='22px Arial';ctx.fillText(title,left+20,171);ctx.fillStyle=fg;ctx.font='bold 32px Arial';ctx.fillText(value,left+20,215);});
  const xs=[65,245,455,670,965,1265],columns=['Rep','Duration, s','Depth, %','Knee at bottom, °','Pelvis at bottom, °','Shoulders at bottom, °'];
  ctx.fillStyle=muted;ctx.font='bold 21px Arial';columns.forEach((s,i)=>ctx.fillText(s,xs[i],285));ctx.fillStyle=fg;ctx.font='24px Arial';
  r.reps.forEach((p,i)=>[String(p.number),p.duration.toFixed(2),(p.maxDepth*100).toFixed(1),p.fppaAtBottom.toFixed(1),p.pelvisAtBottom.toFixed(1),p.shoulderAtBottom.toFixed(1)].forEach((s,j)=>ctx.fillText(s,xs[j],335+i*48)));
  const tableEnd=335+r.reps.length*48;
  if(r.reps.length){ctx.font='bold 24px Arial';ctx.fillText('Mean',xs[0],tableEnd);(['duration','maxDepth','fppaAtBottom','pelvisAtBottom','shoulderAtBottom'] as const).forEach((key,i)=>ctx.fillText((r.reps.reduce((sum,p)=>sum+p[key],0)/r.reps.length*(key==='maxDepth'?100:1)).toFixed(i===0?2:1),xs[i+1],tableEnd));}
  ctx.fillText('Total time',xs[0],tableEnd+48);ctx.fillText(r.totalDuration.toFixed(2),xs[1],tableEnd+48);
  if(!game){(['fppa','pelvis','shoulder'] as const).forEach((signal,index)=>{
    const top=550+r.reps.length*48+index*450,left=240,width=1280,height=290,scale=chartScale(r.reps,signal),x=(p:number)=>left+p/100*width,y=(v:number)=>top+height-(v-scale.min)/(scale.max-scale.min)*height;
    ctx.fillStyle=fg;ctx.font='bold 30px Arial';ctx.fillText(SIGNALS[signal],65,top-28);ctx.font='24px Arial';
    for(const angle of [...new Set([scale.min,-10,0,10,scale.max])]){ctx.strokeStyle=angle===0?fg:grid;ctx.lineWidth=angle===0?1.8:1;ctx.setLineDash(angle===0?[]:[6,6]);ctx.beginPath();ctx.moveTo(left,y(angle));ctx.lineTo(left+width,y(angle));ctx.stroke();ctx.fillStyle=muted;ctx.textAlign='right';ctx.fillText(angle+'°',left-20,y(angle)+8);ctx.textAlign='left';}
    ctx.setLineDash([6,6]);ctx.strokeStyle=grid;ctx.beginPath();ctx.moveTo(x(50),top);ctx.lineTo(x(50),top+height);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle=fg;ctx.font='22px Arial';const guide=SIGNAL_GUIDES[signal];guide.positive.forEach((s,i)=>ctx.fillText(s,65,y(scale.max/2)+i*27));guide.negative.forEach((s,i)=>ctx.fillText(s,65,y(scale.min/2)+i*27));
    ctx.font='24px Arial';ctx.fillStyle=muted;for(let i=0;i<=4;i++){ctx.textAlign='center';ctx.fillText(i*25+'%',x(i*25),top+height+36);}ctx.textAlign='left';
    r.reps.forEach((rep,i)=>{ctx.strokeStyle=repColor(r,i);ctx.lineWidth=3;ctx.beginPath();normalizedCurve(rep,signal).forEach((v,j)=>j?ctx.lineTo(x(v.percent),y(v.value)):ctx.moveTo(x(v.percent),y(v.value)));ctx.stroke();});
    ctx.fillStyle=muted;ctx.font='22px Arial';ctx.fillText('Descent · 0–50%           50%: deepest position           Ascent · 50–100%',left,top+height+76);
  });}
  ctx.font='21px Arial';ctx.fillStyle=muted;
  if(!game)ctx.fillText(r.filterApplied?'Results filtered at 6 Hz (Butterworth, forward–backward).':'6 Hz filtering unavailable for some segments.',65,c.height-70);
  ctx.fillText('v0.4 · '+new Date(r.created).toLocaleString('en-GB'),65,c.height-30);
}
export async function exportPng(r:Measurement){const c=document.createElement('canvas');renderResultsPng(r,c);const blob=await new Promise<Blob|null>(resolve=>c.toBlob(resolve,'image/png'));if(!blob)throw new Error('Image export failed.');download(blob,'squat_results_v0.4.png');}

import {summarize} from './analysis.ts';
import type {Measurement,Rep,Sample,SquatDetector} from './analysis.ts';
import {filterTimed} from './filter.ts';
export const COLORS=['#087f8c','#bd5631','#6754ae','#71812e','#ba467e','#2174b5','#827052','#4b7970','#883e44','#555e9e'];
export type Signal='fppa'|'pelvis'|'shoulder';
export const SIGNALS:Record<Signal,string>={fppa:'Knee Angle',pelvis:'Pelvic obliquity',shoulder:'Shoulder tilt'};
export const SIGNAL_GUIDES:Record<Signal,{description:string;positive:string[];negative:string[];positiveHelp:string;negativeHelp:string;zeroHelp:string}>={
  fppa:{description:'Frontal plane knee angle',positive:['Varus (+)'],negative:['Valgus (−)'],positiveHelp:'Varus: knee moves outward.',negativeHelp:'Valgus: knee moves inward.',zeroHelp:'Hip, knee and ankle aligned.'},
  pelvis:{description:'Pelvic obliquity: tilt of the hip line',positive:['Free-leg side','lower (+)'],negative:['Free-leg side','higher (−)'],positiveHelp:'The free-leg side of the pelvis is lower.',negativeHelp:'The free-leg side of the pelvis is higher.',zeroHelp:'The hip line is horizontal.'},
  shoulder:{description:'Shoulder tilt: inclination of the shoulder line',positive:['Free-leg side','lower (+)'],negative:['Free-leg side','higher (−)'],positiveHelp:'The shoulder on the free-leg side is lower.',negativeHelp:'The shoulder on the free-leg side is higher.',zeroHelp:'The shoulder line is horizontal.'}
};
const GAME_COLORS=['#49d5e3','#ff9966','#bca0ff','#e6d275','#fa9bcc','#71b9ff','#e1b69c','#90d8c5','#fc93a0','#bcc4ff'];
export function repColor(r:Measurement,index:number){const colors=r.settings.mode==='game'?GAME_COLORS:COLORS;return colors[index%colors.length];}
export function normalizedCurve(rep:Rep,signal:Signal='fppa'):{percent:number;value:number}[]{
  const s=rep.samples;let bottom=0;s.forEach((p,i)=>{if(p.depth>s[bottom].depth)bottom=i;});const start=s[0].time,mid=s[bottom].time,end=s.at(-1)!.time;let cursor=0;
  return Array.from({length:101},(_,percent)=>{const time=percent<=50?start+(mid-start)*percent/50:mid+(end-mid)*(percent-50)/50;while(cursor<s.length-2&&s[cursor+1].time<time)cursor++;const a=s[cursor],b=s[Math.min(cursor+1,s.length-1)],f=b.time===a.time?0:(time-a.time)/(b.time-a.time);return {percent,value:a[signal]+f*(b[signal]-a[signal])};});
}
export function chartScale(reps:Rep[],signal:Signal='fppa'){const angles=reps.flatMap(r=>r.samples.map(s=>s[signal]));return {min:Math.floor(Math.min(-10,...angles)/5)*5,max:Math.ceil(Math.max(10,...angles)/5)*5};}
export function finalize(d:SquatDetector,early:boolean):Measurement{
  const frames=d.frames.map(s=>({...s}));let applied=true;let segments=0;const rates:number[]=[];let segment:Sample[]=[];
  const flush=()=>{if(!segment.length)return;const times=segment.map(s=>s.time);
    segments++;for(const [signal,raw] of [['fppa','rawFppa'],['pelvis','rawPelvis'],['shoulder','rawShoulder']] as const){const r=filterTimed(times,segment.map(s=>s[raw]));segment.forEach((s,i)=>s[signal]=r.values[i]);applied &&=r.applied;if(signal==='fppa'&&Number.isFinite(r.fs))rates.push(r.fs);}
    segment=[];
  };
  for(const s of frames){if(!s.valid){flush();continue;}if(segment.length&&s.time-segment.at(-1)!.time>250)flush();segment.push(s);}flush();
  const byTime=new Map(frames.filter(s=>s.valid).map(s=>[s.time,s]));const reps=d.reps.map(r=>summarize(r.number,r.samples.map(s=>byTime.get(s.time)!)));
  const end=early?frames.at(-1)?.time??d.finishedAt:d.finishedAt;
  return {created:new Date().toISOString(),settings:{...d.settings},baseline:{...d.baseline},frames,reps,interrupted:d.interrupted,rejected:d.rejected,stoppedEarly:early,totalDuration:d.startedAt===null||end===null||end===undefined?0:(end-d.startedAt)/1000,filterHz:rates.length?Math.min(...rates):null,filterApplied:applied&&segments>0};
}
export function download(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
const value=(n:number)=>Number.isFinite(n)?n.toFixed(4):'';
export function framesCsv(r:Measurement){const start=r.frames[0]?.time??0;return ['time_s,rep,attempt,valid,phase,relative_depth,knee_angle_raw_deg,knee_angle_filtered_deg,knee_angle_judging_deg,pelvic_obliquity_raw_deg,pelvic_obliquity_filtered_deg,shoulder_tilt_raw_deg,shoulder_tilt_filtered_deg,visibility',...r.frames.map(s=>[value((s.time-start)/1000),s.rep||'',s.attempt||'',s.valid?1:0,s.phase,value(s.depth),value(s.rawFppa),value(s.fppa),value(s.judgingFppa),value(s.rawPelvis),value(s.pelvis),value(s.rawShoulder),value(s.shoulder),value(s.visibility)].join(','))].join('\r\n');}
export function summaryCsv(r:Measurement){return ['rep,mode,side,difficulty,duration_s,max_depth_percent,knee_at_bottom_deg,min_knee_deg,max_knee_deg,pelvis_at_bottom_deg,shoulder_at_bottom_deg,total_completion_time_s,depth_target_percent,rejected_attempts,interrupted_attempts,result_filter_cutoff_hz,min_segment_sample_rate_hz,created_utc',...r.reps.map(p=>[p.number,r.settings.mode,r.settings.side,r.settings.mode==='game'?r.settings.difficulty:'custom',value(p.duration),value(p.maxDepth*100),value(p.fppaAtBottom),value(p.minFppa),value(p.maxFppa),value(p.pelvisAtBottom),value(p.shoulderAtBottom),value(r.totalDuration),value(r.settings.depthTarget*100),r.rejected,r.interrupted,r.filterApplied?6:'',r.filterHz===null?'':value(r.filterHz),r.created].join(','))].join('\r\n');}
export function exportCsv(r:Measurement,kind:'frames'|'summary'){download(new Blob(['\uFEFF',kind==='frames'?framesCsv(r):summaryCsv(r)],{type:'text/csv;charset=utf-8'}),`squat_v0.4_${r.settings.side}_${kind}.csv`);}


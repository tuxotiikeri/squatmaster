import {LiveAngles} from './filter.ts';
export type Side='left'|'right';export type Phase='STANDING'|'DESCENDING'|'BOTTOM'|'ASCENDING';export type Difficulty='normal'|'hard'|'insane';
export const DIFFICULTIES:Record<Difficulty,number>={normal:.20,hard:.30,insane:.45};
export interface Landmark{x:number;y:number;z?:number;visibility?:number;presence?:number}
export interface Metrics{time:number;hipX:number;hipY:number;ankleX:number;ankleY:number;legLength:number;fppa:number;pelvis:number;shoulder:number;visibility:number}
export interface Baseline{hipX:number;hipY:number;ankleX:number;ankleY:number;legLength:number;samples:number}
export interface Sample extends Metrics{depth:number;rawFppa:number;rawPelvis:number;rawShoulder:number;judgingFppa:number;phase:Phase;rep:number;attempt:number;valid:boolean}
export interface Rep{number:number;samples:Sample[];duration:number;maxDepth:number;fppaAtBottom:number;maxFppa:number;minFppa:number;pelvisAtBottom:number;shoulderAtBottom:number}
export interface Settings{side:Side;targetReps:number;depthTarget:number;beep:boolean;mode:'test'|'game';difficulty:Difficulty}
export interface Measurement{created:string;settings:Settings;baseline:Baseline;frames:Sample[];reps:Rep[];interrupted:number;rejected:number;stoppedEarly:boolean;totalDuration:number;filterHz:number|null;filterApplied:boolean}
const degrees=180/Math.PI;
// Head and both feet must be reliably in view before the countdown can start.
export function wholeBodyVisible(points:Landmark[],m:Metrics|null){return !!m&&[0,27,28,31,32].every(i=>{const p=points[i];return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>.02&&p.x<.98&&p.y>.02&&p.y<.98&&(p.visibility??0)>=.65&&(p.presence??1)>=.65;});}
export function median(values:number[]){const s=[...values].sort((a,b)=>a-b),mid=Math.floor(s.length/2);return s.length?(s.length%2?s[mid]:(s[mid-1]+s[mid])/2):NaN;}
export function calculateMetrics(points:Landmark[],width:number,height:number,side:Side,time:number):Metrics|null{
  const ids=[11,12,23,24,side==='left'?25:26,side==='left'?27:28];if(width<=0||height<=0||ids.some(i=>!points[i]||!Number.isFinite(points[i].x)||!Number.isFinite(points[i].y)||points[i].x<0||points[i].x>1||points[i].y<0||points[i].y>1||(points[i].visibility??0)<.65||(points[i].presence??1)<.65))return null;
  const p=(i:number)=>({x:points[i].x*width,y:points[i].y*height});const hip=p(side==='left'?23:24),swing=p(side==='left'?24:23),knee=p(side==='left'?25:26),ankle=p(side==='left'?27:28),shoulder=p(side==='left'?11:12),opposite=p(side==='left'?12:11);
  const u={x:knee.x-hip.x,y:knee.y-hip.y},v={x:ankle.x-knee.x,y:ankle.y-knee.y},legLength=Math.hypot(ankle.x-hip.x,ankle.y-hip.y);if(legLength<height*.12||Math.hypot(u.x,u.y)<height*.03||Math.hypot(v.x,v.y)<height*.03||Math.abs(swing.x-hip.x)<width*.015||Math.abs(shoulder.x-opposite.x)<width*.02)return null;
  return {time,hipX:hip.x,hipY:hip.y,ankleX:ankle.x,ankleY:ankle.y,legLength,fppa:Math.atan2(u.x*v.y-u.y*v.x,u.x*v.x+u.y*v.y)*degrees*(side==='left'?1:-1),pelvis:Math.atan2(swing.y-hip.y,Math.abs(swing.x-hip.x))*degrees,shoulder:Math.atan2(opposite.y-shoulder.y,Math.abs(opposite.x-shoulder.x))*degrees,visibility:Math.min(...ids.map(i=>points[i].visibility??0))};
}
export function calibrate(samples:Metrics[],now:number):{baseline:Baseline|null;reason:string}{
  const valid=samples.filter(s=>now-s.time<=1000&&now-s.time>=0);if(valid.length<8||valid.at(-1)!.time-valid[0].time<650||now-valid.at(-1)!.time>200)return {baseline:null,reason:'Stand still and retry. Keep your shoulders, hips and stance leg visible.'};if(valid.some((s,i)=>i>0&&s.time-valid[i-1].time>250))return {baseline:null,reason:'Tracking interrupted. Stand still and retry.'};
  const leg=median(valid.map(s=>s.legLength)),spread=(key:keyof Metrics)=>{const s=valid.map(v=>v[key]).sort((a,b)=>a-b);return s[Math.floor((s.length-1)*.9)]-s[Math.floor((s.length-1)*.1)];};if(['hipX','hipY','ankleX','ankleY'].some(k=>spread(k as keyof Metrics)/leg>.025))return {baseline:null,reason:'Stand still and retry. Your starting position was moving.'};const m=(key:keyof Metrics)=>median(valid.map(s=>s[key]));return {baseline:{hipX:m('hipX'),hipY:m('hipY'),ankleX:m('ankleX'),ankleY:m('ankleY'),legLength:leg,samples:valid.length},reason:''};
}
export function summarize(number:number,samples:Sample[]):Rep{const bottom=samples.reduce((a,b)=>b.depth>a.depth?b:a);return {number,samples,duration:(samples.at(-1)!.time-samples[0].time)/1000,maxDepth:bottom.depth,fppaAtBottom:bottom.fppa,maxFppa:Math.max(...samples.map(s=>s.fppa)),minFppa:Math.min(...samples.map(s=>s.fppa)),pelvisAtBottom:bottom.pelvis,shoulderAtBottom:bottom.shoulder};}
export class SquatDetector{
  phase:Phase='STANDING';reps:Rep[]=[];frames:Sample[]=[];interrupted=0;rejected=0;attempt=0;startedAt:number|null=null;finishedAt:number|null=null;
  get failed(){return this.settings.mode==='game'&&this.angleExceeded&&this.phase!=='STANDING';}
  private candidate:Sample[]=[];private armed=true;private depthReached=false;private angleExceeded=false;private stableSince:number|null=null;private returnIndex:number|null=null;private lastTime:number|null=null;private previous:Sample|null=null;private peak=0;private lastStanding:Sample|null=null;private start=0;
  baseline:Baseline;settings:Settings;angles=new LiveAngles();constructor(baseline:Baseline,settings:Settings){this.baseline=baseline;this.settings=settings;}
  missing(time:number){this.frames.push({time,hipX:NaN,hipY:NaN,ankleX:NaN,ankleY:NaN,legLength:NaN,fppa:NaN,pelvis:NaN,shoulder:NaN,visibility:0,depth:NaN,rawFppa:NaN,rawPelvis:NaN,rawShoulder:NaN,judgingFppa:NaN,phase:this.phase,rep:0,attempt:this.phase==='STANDING'?0:this.attempt,valid:false});if(this.lastTime!==null&&time-this.lastTime>250)this.invalidate(time);}
  invalidate(time:number){if(this.candidate.length)this.interrupted++;this.candidate=[];this.phase='STANDING';this.armed=false;this.stableSince=null;this.returnIndex=null;this.depthReached=false;this.angleExceeded=false;this.previous=null;this.lastStanding=null;this.lastTime=time;this.angles.reset();}
  update(m:Metrics):{sample:Sample|null;depthJustReached:boolean;repCompleted:boolean;repRejected:boolean;failureJustDetected:boolean;message:string}{
    const none={sample:null,depthJustReached:false,repCompleted:false,repRejected:false,failureJustDetected:false,message:''};if(this.lastTime!==null&&m.time<=this.lastTime)return none;if(this.lastTime!==null&&m.time-this.lastTime>250)this.invalidate(this.lastTime);
    if(Math.hypot(m.ankleX-this.baseline.ankleX,m.ankleY-this.baseline.ankleY)/this.baseline.legLength>.12){this.missing(m.time);this.invalidate(m.time);return {...none,message:'Stance foot moved. Return to your starting position.'};}
    const wasFailed=this.failed;const dt=this.lastTime===null?50:m.time-this.lastTime;this.lastTime=m.time;const rawDepth=(m.hipY-this.baseline.hipY)/this.baseline.legLength,alpha=1-Math.exp(-dt/40),depth=this.previous?this.previous.depth+alpha*(rawDepth-this.previous.depth):rawDepth;
    const [fppa,pelvis,shoulder]=this.angles.update(m.time,[m.fppa,m.pelvis,m.shoulder]);const sample:Sample={...m,fppa,pelvis,shoulder,rawFppa:m.fppa,rawPelvis:m.pelvis,rawShoulder:m.shoulder,judgingFppa:fppa,depth,phase:this.phase,rep:0,attempt:0,valid:true};let depthJustReached=false,repCompleted=false,repRejected=false,message='';
    if(this.phase==='STANDING'){
      if(Math.abs(depth)<=.04){this.stableSince??=m.time;if(m.time-this.stableSince>=120)this.armed=true;this.lastStanding=sample;}else this.stableSince=null;
      if(this.armed&&depth>.07){this.phase='DESCENDING';this.start=this.lastStanding?.time??m.time;this.startedAt??=this.start;this.attempt++;this.candidate=this.lastStanding?[this.lastStanding]:[];this.candidate.forEach(s=>s.attempt=this.attempt);this.peak=depth;this.depthReached=false;this.angleExceeded=this.candidate.some(s=>Math.abs(s.judgingFppa)>10);this.returnIndex=null;}
    }
    if(this.phase!=='STANDING'){
      sample.attempt=this.attempt;this.candidate.push(sample);this.peak=Math.max(this.peak,depth);if(this.returnIndex===null&&Math.abs(fppa)>10)this.angleExceeded=true;
      if(!this.depthReached&&depth>=this.settings.depthTarget){this.depthReached=true;depthJustReached=true;this.phase='BOTTOM';}if(this.peak-depth>.025)this.phase='ASCENDING';
      if(Math.abs(depth)<=.04){this.stableSince??=m.time;this.returnIndex??=this.candidate.length-1;
        if(m.time-this.stableSince>=120){const complete=this.candidate.slice(0,this.returnIndex+1),duration=complete.at(-1)!.time-this.start;const reason=this.settings.mode==='game'&&this.angleExceeded?'Knee angle exceeded':!this.depthReached?'Depth not reached':duration<250?'Movement too short':'';
          if(!reason){const number=this.reps.length+1;complete.forEach(s=>s.rep=number);this.reps.push(summarize(number,complete));this.finishedAt=complete.at(-1)!.time;repCompleted=true;message='Rep accepted';}else{this.rejected++;repRejected=true;message=reason;}
          this.candidate=[];this.phase='STANDING';this.armed=true;this.depthReached=false;this.returnIndex=null;
        }
      }else{this.stableSince=null;this.returnIndex=null;}if(m.time-this.start>20000){this.invalidate(m.time);message='Attempt timed out. Return to standing.';}
    }
    sample.phase=this.phase;this.frames.push(sample);this.previous=sample;if(!message)message=this.settings.mode==='game'&&this.angleExceeded&&this.phase!=='STANDING'?'Knee angle exceeded — return to standing':this.depthReached?'Depth reached — return up':this.phase==='STANDING'?'Ready':'Squat to the target';return {sample,depthJustReached,repCompleted,repRejected,failureJustDetected:!wasFailed&&this.failed,message};
  }
}

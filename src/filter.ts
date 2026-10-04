// Fourth-order Butterworth low-pass, physical cutoff in Hz.
const Q=[0.541196100146197,1.306562964876377];
class Biquad {
  x1:number;x2:number;y1:number;y2:number;b0:number;b1:number;b2:number;a1:number;a2:number;
  constructor(fs:number,cutoff:number,initial:number,q:number){const w=2*Math.PI*cutoff/fs,c=Math.cos(w),alpha=Math.sin(w)/(2*q),a0=1+alpha;this.b0=(1-c)/2/a0;this.b1=(1-c)/a0;this.b2=this.b0;this.a1=-2*c/a0;this.a2=(1-alpha)/a0;this.x1=this.x2=this.y1=this.y2=initial;}
  step(x:number){const y=this.b0*x+this.b1*this.x1+this.b2*this.x2-this.a1*this.y1-this.a2*this.y2;this.x2=this.x1;this.x1=x;this.y2=this.y1;this.y1=y;return y;}
}
export function butterworth(values:number[],fs:number,cutoff=6){if(!values.length||fs<=cutoff*2)return [...values];const stages=Q.map(q=>new Biquad(fs,cutoff,values[0],q));return values.map(x=>stages.reduce((v,s)=>s.step(v),x));}
export function zeroPhase(values:number[],fs:number,cutoff=6){if(values.length<16||fs<=cutoff*2)return [...values];const n=Math.min(15,values.length-1),a=values[0],b=values.at(-1)!;const ext=[...values.slice(1,n+1).reverse().map(v=>2*a-v),...values,...values.slice(-n-1,-1).reverse().map(v=>2*b-v)];return butterworth(butterworth(ext,fs,cutoff).reverse(),fs,cutoff).reverse().slice(n,n+values.length);}
export const medianInterval=(times:number[])=>{const steps=times.slice(1).map((t,i)=>t-times[i]).filter(dt=>dt>0&&dt<=250).sort((a,b)=>a-b);return steps.length?steps[Math.floor(steps.length/2)]:NaN;};
export function filterTimed(times:number[],values:number[]):{values:number[];fs:number;applied:boolean}{
  const dt=medianInterval(times),fs=1000/dt;if(times.length<16||!Number.isFinite(fs)||fs<=12||times.at(-1)!<=times[0])return {values:[...values],fs,applied:false};
  const duration=times.at(-1)!-times[0],count=Math.max(2,Math.round(duration/dt)+1),step=duration/(count-1),actualFs=1000/step;if(actualFs<=12)return {values:[...values],fs:actualFs,applied:false};let cursor=0;
  const grid=Array.from({length:count},(_,i)=>{const t=times[0]+step*i;while(cursor<times.length-2&&times[cursor+1]<t)cursor++;const f=(t-times[cursor])/(times[cursor+1]-times[cursor]);return values[cursor]+f*(values[cursor+1]-values[cursor]);});const filtered=zeroPhase(grid,actualFs);
  return {values:times.map(t=>{const index=Math.min(count-2,Math.max(0,Math.floor((t-times[0])/step))),f=(t-times[0])/step-index;return filtered[index]+f*(filtered[index+1]-filtered[index]);}),fs:actualFs,applied:true};
}
export class LiveAngles{
  private last:number|null=null;private intervals:number[]=[];private previous:number[]|null=null;private stages:Biquad[][]=[];private fs=0;frequency=0;applied=false;
  reset(){this.last=null;this.intervals=[];this.previous=null;this.stages=[];this.fs=0;this.frequency=0;this.applied=false;}
  update(time:number,values:number[]){
    if(this.last!==null&&time-this.last>250)this.reset();if(this.last!==null&&time>this.last){this.intervals.push(time-this.last);if(this.intervals.length>20)this.intervals.shift();}this.last=time;
    const sorted=[...this.intervals].sort((a,b)=>a-b);this.frequency=sorted.length?1000/sorted[Math.floor(sorted.length/2)]:0;this.applied=this.frequency>12&&this.intervals.length>=5;
    if(!this.applied){this.previous=values;return [...values];}
    if(!this.stages.length||Math.abs(this.frequency-this.fs)/this.fs>.25){this.fs=this.frequency;this.stages=values.map((v,i)=>Q.map(q=>new Biquad(this.fs,6,this.previous?.[i]??v,q)));}
    const output=values.map((v,i)=>this.stages[i].reduce((x,s)=>s.step(x),v));this.previous=output;return output;
  }
}

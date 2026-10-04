/** Accept each delivered camera frame once; busy frames are dropped, never queued. */
export class FrameGate {
  private last=-Infinity;
  private busy=false;
  begin(frame:number){
    if(!Number.isFinite(frame)||frame<=this.last)return false;
    this.last=frame;
    if(this.busy)return false;
    this.busy=true;return true;
  }
  complete(){this.busy=false;}
}
/** Camera fps uses video frame counters, rather than display repaint callbacks. */
export class FrameRate {
  private observations:{time:number;count:number}[]=[];
  observe(time:number,count:number){
    const last=this.observations.at(-1);
    if(!Number.isFinite(time)||!Number.isFinite(count)||last&&(time<=last.time||count<=last.count))return;
    this.observations.push({time,count});
    while(this.observations.length>2&&time-this.observations[1].time>1200)this.observations.shift();
  }
  get fps(){const a=this.observations[0],b=this.observations.at(-1);return a&&b&&b.time-a.time>=500?1000*(b.count-a.count)/(b.time-a.time):null;}
}

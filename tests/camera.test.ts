import test from 'node:test';import assert from 'node:assert/strict';
import {FrameGate,FrameRate} from '../src/frame-clock.ts';
import {openCamera} from '../src/camera.ts';
test('duplicate frames never produce additional analyses',()=>{const gate=new FrameGate();assert.equal(gate.begin(1),true);gate.complete();assert.equal(gate.begin(1),false);assert.equal(gate.begin(.9),false);assert.equal(gate.begin(2),true);});
test('busy frames are dropped and never analysed later as queued work',()=>{const gate=new FrameGate();assert.equal(gate.begin(1),true);assert.equal(gate.begin(2),false);gate.complete();assert.equal(gate.begin(2),false);assert.equal(gate.begin(3),true);});
test('camera fps uses presented video frames rather than screen repaints',()=>{const rate=new FrameRate();for(let i=0;i<=60;i++)rate.observe(i*1000/60,Math.floor(i/2));assert.ok(Math.abs(rate.fps!-30)<1e-8);});
test('frame counter gaps still give the actual presented rate',()=>{const rate=new FrameRate();rate.observe(0,10);rate.observe(1000,70);assert.equal(rate.fps,60);});
test('camera negotiates highest advertised fps and analyses each new video frame at most once',async()=>{
  const names=['window','navigator','Worker','createImageBitmap','requestAnimationFrame','cancelAnimationFrame'];const saved=names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)] as const);
  let callback:any,worker:any,stopped=0,cancelled=0;const constraints:any[]=[],requests:any[]=[],poses:any[]=[],errors:string[]=[];
  const track={getCapabilities:()=>({frameRate:{min:1,max:120}}),getConstraints:()=>({width:{ideal:960}}),getSettings:()=>({frameRate:30}),applyConstraints:async(c:any)=>{constraints.push(c);},addEventListener:()=>{},stop:()=>{stopped++;}};
  class FakeWorker{onmessage:any=null;onerror:any=null;pending:any[]=[];terminated=false;constructor(){worker=this;}postMessage(data:any){if(data.type==='init')queueMicrotask(()=>this.onmessage({data:{type:'ready'}}));else this.pending.push(data);}terminate(){this.terminated=true;}}
  const video:any={readyState:2,videoWidth:960,videoHeight:720,play:async()=>{},requestVideoFrameCallback:(fn:any)=>{callback=fn;return 1;},cancelVideoFrameCallback:()=>{cancelled++;}};
  const mocks:any={window:{isSecureContext:true,setTimeout,clearTimeout},navigator:{mediaDevices:{getUserMedia:async(c:any)=>{requests.push(c);return {getVideoTracks:()=>[track],getTracks:()=>[track]};}}},Worker:FakeWorker,createImageBitmap:async()=>({close:()=>{}}),requestAnimationFrame:()=>{throw new Error('Should use camera-frame callbacks');},cancelAnimationFrame:()=>{}};
  try{
    for(const name of names)Object.defineProperty(globalThis,name,{value:mocks[name],configurable:true,writable:true});
    const session=await openCamera(video,'user',(...p)=>poses.push(p),e=>errors.push(e));assert.equal(constraints[0].frameRate.ideal,120);assert.equal('max' in requests[0].video.frameRate,false);
    const present=async(frame:number,time:number)=>{callback(time,{mediaTime:frame/30,presentationTime:time,presentedFrames:frame});await new Promise(resolve=>setImmediate(resolve));};
    for(let i=1;i<=31;i++){await present(i,i*1000/30);assert.equal(worker.pending.length,1);const data=worker.pending.shift();worker.onmessage({data:{type:'result',points:[],time:data.time}});await present(i,i*1000/30+10);assert.equal(worker.pending.length,0);}
    assert.equal(poses.length,31);assert.ok(Math.abs(session.fps()!-30)<1e-6);
    await present(32,32*1000/30);await present(33,33*1000/30);assert.equal(worker.pending.length,1);const data=worker.pending.shift();worker.onmessage({data:{type:'result',points:[],time:data.time}});await present(33,33*1000/30+10);assert.equal(worker.pending.length,0);
    session.close();assert.equal(stopped,1);assert.equal(cancelled,1);assert.equal(worker.terminated,true);assert.equal(video.srcObject,null);assert.deepEqual(errors,[]);
  }finally{for(const [name,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);}}
});

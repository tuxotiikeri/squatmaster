import type { Landmark } from './analysis.ts';
import {FrameGate,FrameRate} from './frame-clock.ts';
// Pinned assets; only model/runtime downloads use the network, never camera frames.
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';
export type CameraSession = { close: () => void; fps: () => number | null };
export async function openCamera(video: HTMLVideoElement, facing: 'user'|'environment', onPose:(points:Landmark[],time:number,width:number,height:number)=>void, onError:(message:string)=>void, signal?:AbortSignal): Promise<CameraSession> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Camera access needs HTTPS or localhost on this device.');
  const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facing},width:{ideal:960},height:{ideal:720},frameRate:{ideal:240}}});
  let worker:Worker|null=null, disposed=false, raf=0, ready=false;
  const gate=new FrameGate(),rate=new FrameRate(),track=stream.getVideoTracks()[0];
  let frameCallback:number|null=null;
  let fallback: import('@mediapipe/tasks-vision').PoseLandmarker | null=null;
  const close=()=>{if(disposed)return;disposed=true;cancelAnimationFrame(raf);if(frameCallback!==null)video.cancelVideoFrameCallback(frameCallback);worker?.terminate();fallback?.close();stream.getTracks().forEach(t=>t.stop());video.srcObject=null;};
  const abort=()=>close();signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted){close();throw new DOMException('Camera closed.','AbortError');}
  try {
    // Prefer the highest advertised rate without imposing an artificial 30/60 fps ceiling.
    const maximum=track.getCapabilities?.().frameRate?.max;
    if(maximum&&Number.isFinite(maximum)){try{await track.applyConstraints({...track.getConstraints(),frameRate:{ideal:maximum}});}catch{/* Keep the best rate negotiated by getUserMedia. */}}
    if(disposed)throw new DOMException('Camera closed.','AbortError');
    video.srcObject=stream;video.muted=true;video.playsInline=true;await video.play();
    const processFrame=async(now:number,frame:number)=>{
      if(disposed||!ready||video.readyState<2||!gate.begin(frame))return;
      try{
        if(worker){const bitmap=await createImageBitmap(video);if(disposed){bitmap.close();return;}worker.postMessage({type:'frame',bitmap,time:now},[bitmap]);}
        else{const result=fallback!.detectForVideo(video,now);onPose(result.landmarks[0]??[],now,video.videoWidth,video.videoHeight);gate.complete();}
      }catch{gate.complete();close();onError('Frame processing failed. Please retry the camera.');}
    };
    if(typeof video.requestVideoFrameCallback==='function'){
      const observe=(now:number,meta:VideoFrameCallbackMetadata)=>{if(disposed)return;rate.observe(meta.presentationTime,meta.presentedFrames);frameCallback=video.requestVideoFrameCallback(observe);void processFrame(now,meta.mediaTime);};
      frameCallback=video.requestVideoFrameCallback(observe);
    }else{
      // Older browsers: use the presented-frame counter when available. Never use
      // currentTime as a frame identity: it can advance between camera frames.
      const tick=(now:number)=>{if(disposed)return;raf=requestAnimationFrame(tick);const quality=video.getVideoPlaybackQuality?.(),frames=quality?quality.totalVideoFrames-quality.droppedVideoFrames:0;
        if(frames&&frames>0){rate.observe(now,frames);void processFrame(now,frames);}
        else if(ready&&video.currentTime>1){close();onError('Update your browser to analyse individual camera frames.');}
      };raf=requestAnimationFrame(tick);
    }
    try {
      worker=new Worker(new URL('./pose.worker.ts',import.meta.url),{type:'module'});
      const initializingWorker=worker;
      await new Promise<void>((resolve,reject)=>{
        const onAbort=()=>{clearTimeout(timeout);reject(new DOMException('Camera closed.','AbortError'));};
        const cleanup=()=>{clearTimeout(timeout);signal?.removeEventListener('abort',onAbort);};
        const timeout=window.setTimeout(()=>{cleanup();reject(new Error('Model loading timed out.'));},30000);
        signal?.addEventListener('abort',onAbort,{once:true});
        initializingWorker.onerror=()=>{cleanup();reject(new Error('The analysis worker could not start.'));};
        initializingWorker.onmessage=(event:MessageEvent)=>{
          const data=event.data;
          if(data.type==='ready'){cleanup();resolve();}
          if(data.type==='error'){cleanup();reject(new Error(data.message));}
        };
        initializingWorker.postMessage({type:'init',wasm:WASM,model:MODEL});
      });
    } catch {
      worker?.terminate();worker=null;
      if(disposed)throw new DOMException('Camera closed.','AbortError');
      const {FilesetResolver,PoseLandmarker}=await import('@mediapipe/tasks-vision');
      const files=await FilesetResolver.forVisionTasks(WASM);
      const options={baseOptions:{modelAssetPath:MODEL},runningMode:'VIDEO' as const,numPoses:1,minPoseDetectionConfidence:.65,minPosePresenceConfidence:.65,minTrackingConfidence:.65};
      try {fallback=await PoseLandmarker.createFromOptions(files,{...options,baseOptions:{...options.baseOptions,delegate:'GPU'}});}
      catch {fallback=await PoseLandmarker.createFromOptions(files,{...options,baseOptions:{...options.baseOptions,delegate:'CPU'}});}
    }
    if(disposed){fallback?.close();throw new DOMException('Camera closed.','AbortError');}
    stream.getVideoTracks().forEach(track=>track.addEventListener('ended',()=>{if(disposed)return;close();onError('Camera disconnected. Please retry.');}));
    if(worker){
      const activeWorker:Worker=worker;
      activeWorker.onerror=()=>{close();onError('Analysis interrupted. Please retry the camera.');};
      activeWorker.onmessage=(event:MessageEvent)=>{
        gate.complete();if(disposed)return;
        if(event.data.type==='error'){close();onError('Analysis failed. Please retry the camera.');return;}
        if(event.data.type==='result') onPose(event.data.points,event.data.time,video.videoWidth,video.videoHeight);
      };
    }
    ready=true;
    return {fps:()=>rate.fps??track.getSettings().frameRate??null,close:()=>{signal?.removeEventListener('abort',abort);close();}};
  } catch(error){close();throw error;}
}
export function drawPose(canvas:HTMLCanvasElement,points:Landmark[],width:number,height:number,side:'left'|'right',full=true,color='#66e0bc') {
  if(canvas.width!==width || canvas.height!==height){canvas.width=width;canvas.height=height;}
  const ctx=canvas.getContext('2d')!;ctx.clearRect(0,0,width,height);
  const hip=side==='left'?23:24,knee=side==='left'?25:26,ankle=side==='left'?27:28;
  const segments=full?[[0,1],[1,2],[2,3],[3,7],[0,4],[4,5],[5,6],[6,8],[9,10],[11,12],[11,13],[13,15],[15,17],[15,19],[15,21],[17,19],[12,14],[14,16],[16,18],[16,20],[16,22],[18,20],[11,23],[12,24],[23,24],[23,25],[25,27],[27,29],[29,31],[27,31],[24,26],[26,28],[28,30],[30,32],[28,32]]:[[23,24],[hip,knee],[knee,ankle]];
  ctx.lineWidth=Math.max(3,width/200);ctx.strokeStyle=color;ctx.fillStyle='#ffffff';
  const visible=(i:number)=>points[i] && (points[i].visibility??0)>=.65;
  for(const [a,b] of segments){if(!visible(a)||!visible(b))continue;ctx.beginPath();ctx.moveTo(points[a].x*width,points[a].y*height);ctx.lineTo(points[b].x*width,points[b].y*height);ctx.stroke();}
  for(const i of full?Array.from({length:33},(_,i)=>i):[23,24,knee,ankle]){if(!visible(i))continue;ctx.beginPath();ctx.arc(points[i].x*width,points[i].y*height,Math.max(3,width/170),0,Math.PI*2);ctx.fill();}
}


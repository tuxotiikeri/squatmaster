import {useEffect,useRef,useState} from 'react';
import {calibrate,calculateMetrics,DIFFICULTIES,wholeBodyVisible,SquatDetector} from './analysis.ts';
import type {Difficulty,Landmark,Measurement,Metrics,Settings} from './analysis.ts';
import {LiveAngles} from './filter.ts';
import {drawPose,openCamera} from './camera.ts';
import type {CameraSession} from './camera.ts';
import {exportCsv,finalize,repColor} from './report.ts';
import {exportPng} from './png.ts';
import Curve from './Curve.tsx';
type Mode='loading'|'ready'|'waiting'|'countdown'|'recording'|'results'|'idle';
const defaults:Settings={side:'left',targetReps:5,depthTarget:.18,beep:true,mode:'test',difficulty:'normal'};
const difficultyName:Record<Difficulty,string>={normal:'Normal',hard:'Hard',insane:'I Am Insane'};
const skeletonColors={Pink:'#ff74ba',Turquoise:'#4ee8ef'};
export default function App(){
  const [mode,setModeState]=useState<Mode>('loading'),modeRef=useRef<Mode>('loading');
  const [settings,setSettings]=useState<Settings>(defaults),settingsRef=useRef(settings);settingsRef.current=settings;
  const [facing,setFacing]=useState<'user'|'environment'>('user'),facingRef=useRef(facing);facingRef.current=facing;
  const [fullSkeleton,setFullSkeleton]=useState(true),[color,setColor]=useState<keyof typeof skeletonColors>('Turquoise'),drawing=useRef({fullSkeleton,color});drawing.current={fullSkeleton,color};
  const [error,setError]=useState(''),[message,setMessage]=useState('Starting camera'),[tracked,setTracked]=useState(false);
  const [count,setCount]=useState(0),[rejected,setRejected]=useState(0),[failed,setFailed]=useState(false),[pulse,setPulse]=useState<{key:number;text:string}|null>(null);
  const [countdown,setCountdown]=useState(5),[depth,setDepth]=useState(0),[angle,setAngle]=useState<number|null>(null);
  const [labelPosition,setLabelPosition]=useState({x:50,y:50}),[elapsed,setElapsed]=useState(0),[result,setResult]=useState<Measurement|null>(null),[exporting,setExporting]=useState(false),[help,setHelp]=useState(false);
  const [cameraRate,setCameraRate]=useState<number|null>(null);
  const video=useRef<HTMLVideoElement>(null),canvas=useRef<HTMLCanvasElement>(null),stage=useRef<HTMLDivElement>(null);
  const session=useRef<CameraSession|null>(null),abort=useRef<AbortController|null>(null),token=useRef(0),detector=useRef<SquatDetector|null>(null),previewFilter=useRef(new LiveAngles());
  const calibration=useRef<Metrics[]>([]),imageSize=useRef({width:0,height:0}),calibratedSize=useRef({width:0,height:0});
  const timer=useRef<ReturnType<typeof setInterval>|null>(null),startedCountdown=useRef(0),bodySince=useRef<number|null>(null),wholeTime=useRef(0),trackingTime=useRef(0),recordingTime=useRef(0),lastUi=useRef(0),lastEvent=useRef(0),audio=useRef<AudioContext|null>(null);
  const setMode=(m:Mode)=>{modeRef.current=m;setModeState(m);};
  const clearTimer=()=>{if(timer.current){clearInterval(timer.current);timer.current=null;}};
  const closeCamera=()=>{token.current++;abort.current?.abort();abort.current=null;session.current?.close();session.current=null;setTracked(false);};
  const finish=(early:boolean)=>{clearTimer();if(detector.current){setResult(finalize(detector.current,early));setMode('results');}closeCamera();};
  const beep=(bad=false)=>{if(!settingsRef.current.beep||audio.current?.state!=='running')return;const ctx=audio.current,osc=ctx.createOscillator(),gain=ctx.createGain();osc.connect(gain);gain.connect(ctx.destination);osc.type=bad?'sawtooth':'sine';osc.frequency.setValueAtTime(bad?190:740,ctx.currentTime);if(bad)osc.frequency.exponentialRampToValueAtTime(80,ctx.currentTime+.2);gain.gain.setValueAtTime(bad?.035:.08,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+(bad?.24:.12));osc.start();osc.stop(ctx.currentTime+(bad?.25:.13));};
  const beginCountdown=(now:number)=>{
    calibration.current=[];startedCountdown.current=now;setCountdown(5);setMode('countdown');setMessage('Get ready');clearTimer();
    timer.current=setInterval(()=>{const now=performance.now(),passed=now-startedCountdown.current;
      if(now-wholeTime.current>350){clearTimer();bodySince.current=null;calibration.current=[];setMode('waiting');setMessage('Get in front of camera');return;}
      setCountdown(Math.max(1,Math.ceil((5000-passed)/1000)));if(passed<5000)return;clearTimer();const calibrated=calibrate(calibration.current,now);
      if(!calibrated.baseline){setMode('ready');setMessage('Stand still. Start again');return;}
      if(settingsRef.current.mode==='game'&&previewFilter.current.frequency<=12){setMode('ready');setMessage('Analysis too slow. Try Test mode');return;}
      detector.current=new SquatDetector(calibrated.baseline,{...settingsRef.current});calibratedSize.current={...imageSize.current};recordingTime.current=now;lastEvent.current=now;setMode('recording');setMessage('GO!');
    },80);
  };
  const onPose=(points:Landmark[],time:number,width:number,height:number)=>{
    if(!canvas.current)return;const active=modeRef.current==='recording';
    if(active&&(width!==calibratedSize.current.width||height!==calibratedSize.current.height)){setError('Keep the camera orientation fixed. Start again.');finish(true);return;}
    if(width!==imageSize.current.width||height!==imageSize.current.height)calibration.current=[];imageSize.current={width,height};
    drawPose(canvas.current,points,width,height,settingsRef.current.side,drawing.current.fullSkeleton,skeletonColors[drawing.current.color]);
    const m=calculateMetrics(points,width,height,settingsRef.current.side,time),visible=wholeBodyVisible(points,m);if(m)trackingTime.current=time;if(visible)wholeTime.current=time;
    if(modeRef.current==='waiting'){if(visible){bodySince.current??=time;if(time-bodySince.current>=500)beginCountdown(time);}else bodySince.current=null;}
    if(modeRef.current==='countdown'&&m){calibration.current.push(m);calibration.current=calibration.current.filter(s=>time-s.time<=1200);}
    let displayAngle:number|null=null;if(m){const values=previewFilter.current.update(time,[m.fppa,m.pelvis,m.shoulder]);displayAngle=values[0];}
    if(active&&detector.current){
      if(!m){detector.current.missing(time);setFailed(detector.current.failed);setMessage('Return to standing');}
      else{const d=detector.current,update=d.update(m);if(update.sample){setDepth(update.sample.depth);displayAngle=update.sample.judgingFppa;}setFailed(d.failed);
        if(update.failureJustDetected){beep(true);lastEvent.current=time;setMessage('Rep failed — return up');setPulse({key:time,text:'Failed'});}
        if(update.repCompleted||update.repRejected){lastEvent.current=time;setMessage(update.repCompleted?'+1 · Ready':'Rejected · Ready');setRejected(d.rejected);if(update.repCompleted)setPulse({key:time,text:'+1'});}
        else if(!update.failureJustDetected&&time-lastEvent.current>900)setMessage(update.message);
        if(update.depthJustReached&&!d.failed)beep();if(update.repCompleted){setCount(d.reps.length);if(d.reps.length>=settingsRef.current.targetReps){finish(false);return;}}
      }
    }
    if(time-lastUi.current>=80){lastUi.current=time;setTracked(!!m);setAngle(displayAngle);setCameraRate(session.current?.fps()??null);
      const knee=points[settingsRef.current.side==='left'?25:26],el=stage.current;
      if(knee&&el){const scale=Math.min(el.clientWidth/width,el.clientHeight/height),ox=(el.clientWidth-width*scale)/2,oy=(el.clientHeight-height*scale)/2;
        let px=knee.x*width+(settingsRef.current.side==='left'?80:-80);if(facingRef.current==='user')px=width-px;
        setLabelPosition({x:Math.max(45,Math.min(el.clientWidth-45,ox+px*scale))/el.clientWidth*100,y:Math.max(35,Math.min(el.clientHeight-35,oy+knee.y*height*scale))/el.clientHeight*100});}
    }
  };
  const startCamera=async(cameraFacing=facingRef.current)=>{
    closeCamera();previewFilter.current.reset();setCameraRate(null);setError('');setMode('loading');setMessage('Starting camera');const attempt=++token.current;abort.current=new AbortController();
    try{const opened=await openCamera(video.current!,cameraFacing,onPose,text=>{if(attempt!==token.current)return;setError(text);if(modeRef.current==='recording')finish(true);else{clearTimer();closeCamera();setMode('idle');}},abort.current.signal);
      if(attempt!==token.current){opened.close();return;}session.current=opened;setMode('ready');setMessage('Press Start');
    }catch(e){if(attempt!==token.current)return;setMode('idle');setError(e instanceof Error&&e.name==='NotAllowedError'?'Allow camera access, then retry.':e instanceof Error?e.message:String(e));}
  };
  const startTest=()=>{
    try{audio.current??=new AudioContext();void audio.current.resume().catch(()=>{});}catch{/* Visual feedback stays available. */}
    setError('');setResult(null);setCount(0);setRejected(0);setFailed(false);setPulse(null);setDepth(0);setElapsed(0);detector.current=null;calibration.current=[];bodySince.current=null;wholeTime.current=0;setFullSkeleton(false);setMode('waiting');setMessage('Get in front of camera');lastEvent.current=0;
  };
  useEffect(()=>{
    void startCamera();const visibility=()=>{if(!document.hidden)return;if(modeRef.current==='recording'){setError('Measurement stopped in the background.');finish(true);}else if(['loading','ready','waiting','countdown'].includes(modeRef.current)){clearTimer();closeCamera();setMode('idle');setError('Camera paused. Retry camera.');}};
    document.addEventListener('visibilitychange',visibility);
    const watchdog=setInterval(()=>{const now=performance.now();if(modeRef.current==='recording'){
      const d=detector.current;if(d?.startedAt!==null&&d?.startedAt!==undefined)setElapsed((now-d.startedAt)/1000);
      if(now-trackingTime.current>1000){setTracked(false);setAngle(null);setMessage('Return to standing');d?.invalidate(now);setFailed(false);}
      if(settingsRef.current.mode==='game'&&d&&d.angles.frequency>0&&d.angles.frequency<=12){setError('Analysis too slow. Try Test mode.');finish(true);}
      else if(now-recordingTime.current>180000){setError('Time limit reached.');finish(true);}
    }},20);
    return ()=>{clearInterval(watchdog);document.removeEventListener('visibilitychange',visibility);clearTimer();token.current++;abort.current?.abort();session.current?.close();void audio.current?.close();};
  },[]);
  useEffect(()=>{document.documentElement.dataset.theme=settings.mode;return()=>{delete document.documentElement.dataset.theme;};},[settings.mode]);
  const locked=['loading','waiting','countdown','recording'].includes(mode);
  const changeSettings=(change:Partial<Settings>)=>{setSettings(s=>({...s,...change}));previewFilter.current.reset();};
  const newTest=()=>{setResult(null);detector.current=null;setCount(0);setRejected(0);setFailed(false);setPulse(null);setFullSkeleton(true);setDepth(0);setAngle(null);setElapsed(0);setError('');setMode('idle');setTimeout(()=>void startCamera(),0);};
  const gaugeRange=settings.depthTarget*1.35,gaugeTop=100*.04/gaugeRange;
  return <div className={`app-shell ${settings.mode==='game'?'game-theme':''}`}><header className="site-header"><span className="brand"><span className="brand-icon">S</span>Squat Master <small>v0.4</small></span><button className="help-button" onClick={()=>setHelp(!help)} aria-expanded={help}>Info</button></header>
    <main>{mode==='results'&&error&&<div className="notice" role="alert">{error}</div>}
    {help&&<section className="help-panel"><h3>Test your Squat.</h3><p>Test your single-leg squat in Test mode and get feedback on your frontal plane knee angle, pelvic tilt and shoulder tilt. Select the leg to test and adjust the target depth and number of reps.</p><ol><li><strong>Set up.</strong> Place the camera directly in front of you. Keep your whole body in view.</li><li><strong>Select settings.</strong> Press Start, step into view and balance on the selected leg. Keep the free foot off the ground.</li><li><strong>Get ready.</strong> The countdown starts when your whole body is detected. Stand still for the final second.</li><li><strong>GO!</strong> Squat to the lower target, then rise to the upper line. A +1 means your rep counts.</li></ol><h3>Game mode.</h3><p>Challenge your movement control and coordination: complete your reps quickly while keeping your frontal plane knee angle between −10° and 10°.</p><p>A red depth bar means the rep has failed. Get up and squat again!</p></section>}
    {mode!=='results'&&<div className="measurement-layout"><section className="camera-card"><div ref={stage} className={`camera-stage ${failed?'failed-stage':''}`}><div className={facing==='user'?'camera-media mirrored':'camera-media'}><video ref={video} muted playsInline aria-label="Live camera preview"/><canvas ref={canvas} aria-hidden="true"/></div>
      {mode==='loading'&&<div className="camera-placeholder"><span className="spinner"/></div>}
      {mode==='idle'&&<div className="camera-placeholder"><button className="primary" onClick={()=>void startCamera()}>Retry camera</button></div>}
      <div className="camera-top"><span className={`tracking-chip ${tracked?'good':''}`}>{tracked?'Tracking ready':'Find your position'}</span>{mode==='recording'&&<div className="rep-overlay">{count}<small> / {settings.targetReps}</small><span>{elapsed.toFixed(2)} s</span>{settings.mode==='game'&&<span className="rejected-count">{rejected}/{count+rejected} rejected</span>}</div>}</div>
      {angle!==null&&tracked&&<div className={`knee-label ${settings.mode==='game'&&Math.abs(angle)>10?'outside':''}`} style={{left:labelPosition.x+'%',top:labelPosition.y+'%'}}><strong>{Math.round(angle)}°</strong><span>{Math.abs(angle)<.5?'Neutral':angle<0?'Valgus':'Varus'}</span></div>}
      {mode==='countdown'&&<div className="countdown-overlay"><span>Get ready</span><strong>{countdown}</strong></div>}
      {mode==='recording'&&<div className={`depth-gauge ${failed?'failed':''}`} aria-label={`Depth ${Math.round(depth*100)} percent; return below 4 percent`}><span className="gauge-caption">DEPTH</span><div className="gauge-track"><div className={`gauge-fill ${depth>=settings.depthTarget?'reached':''}`} style={{height:Math.max(0,Math.min(100,depth/gaugeRange*100))+'%'}}/><div className={`gauge-target upper ${Math.abs(depth)<=.04?'reached':''}`} style={{top:gaugeTop+'%'}}><span>Stand up</span></div><div className="gauge-target" style={{top:100/1.35+'%'}}><span>Squat</span></div></div></div>}
      {pulse&&mode==='recording'&&<div key={pulse.key} className={`rep-pulse ${pulse.text==='Failed'?'bad':''}`} aria-hidden="true">{pulse.text}</div>}
      {mode!=='countdown'&&(settings.mode!=='game'||mode!=='recording'||error||!tracked||performance.now()-recordingTime.current<900)&&<div className={`camera-message ${mode==='recording'?'active-message':''}`} aria-live="polite">{error||message}</div>}
    </div><div className="camera-footer"><span className="fps-display">Camera {cameraRate===null?'—':Math.round(cameraRate)} fps</span>{mode==='ready'&&<button className="primary" onClick={startTest}>Start {settings.mode==='game'?'game':'test'}</button>}{['waiting','countdown'].includes(mode)&&<button className="secondary" onClick={()=>{clearTimer();setMode('ready');setMessage('Press Start');}}>Cancel</button>}{mode==='recording'&&<button className="secondary" onClick={()=>finish(true)}>Stop & results</button>}</div></section>
    <aside className="setup-card"><label className="control-label">MODE</label><div className="segmented">{(['test','game'] as const).map(m=><button key={m} disabled={locked} aria-pressed={settings.mode===m} className={settings.mode===m?'selected':''} onClick={()=>changeSettings({mode:m,depthTarget:m==='game'?DIFFICULTIES[settings.difficulty]:.18})}>{m==='test'?'Test mode':'Game mode'}</button>)}</div>
      <label className="control-label">STANCE LEG</label><div className="segmented">{(['left','right'] as const).map(side=><button key={side} disabled={locked} aria-pressed={settings.side===side} className={settings.side===side?'selected':''} onClick={()=>changeSettings({side})}>{side==='left'?'Left':'Right'}</button>)}</div>
      <label className="control-label">CAMERA</label><div className="segmented">{(['user','environment'] as const).map(f=><button key={f} disabled={locked} aria-pressed={facing===f} className={facing===f?'selected':''} onClick={()=>{setFacing(f);facingRef.current=f;void startCamera(f);}}>{f==='user'?'Front':'Rear'}</button>)}</div>
      <label className="control-label">TARGET REPS</label><div className="stepper"><button disabled={locked||settings.targetReps<=1} onClick={()=>changeSettings({targetReps:settings.targetReps-1})} aria-label="Decrease repetitions">−</button><output>{settings.targetReps}</output><button disabled={locked} onClick={()=>changeSettings({targetReps:settings.targetReps+1})} aria-label="Increase repetitions">+</button></div>
      {settings.mode==='game'?<><label className="control-label">DIFFICULTY</label><div className="difficulty-buttons">{(['normal','hard','insane'] as Difficulty[]).map(d=><button key={d} disabled={locked} aria-pressed={settings.difficulty===d} className={settings.difficulty===d?'selected':''} onClick={()=>changeSettings({difficulty:d,depthTarget:DIFFICULTIES[d]})}>{difficultyName[d]}</button>)}</div><p className="field-note">Stay within −10° to 10°. Beat your time.</p></>:<><label className="control-label">DEPTH TARGET</label><div className="stepper"><button disabled={locked||settings.depthTarget<=.08} onClick={()=>changeSettings({depthTarget:Math.max(.08,Math.round((settings.depthTarget-.01)*100)/100)})} aria-label="Decrease depth">−</button><output>{Math.round(settings.depthTarget*100)}<small>%</small></output><button disabled={locked||settings.depthTarget>=.5} onClick={()=>changeSettings({depthTarget:Math.min(.5,Math.round((settings.depthTarget+.01)*100)/100)})} aria-label="Increase depth">+</button></div></>}
      <button className={`sound-toggle ${settings.beep?'on':''}`} aria-pressed={settings.beep} onClick={()=>setSettings(s=>({...s,beep:!s.beep}))}><span>Sound</span><i/>{settings.beep?'On':'Off'}</button>
      <button className={`sound-toggle ${fullSkeleton?'on':''}`} aria-pressed={fullSkeleton} onClick={()=>setFullSkeleton(!fullSkeleton)}><span>Full skeleton</span><i/>{fullSkeleton?'On':'Off'}</button>
      <div className="skeleton-colors" aria-label="Skeleton color">{(Object.keys(skeletonColors) as (keyof typeof skeletonColors)[]).map(c=><button key={c} aria-label={c} title={c} aria-pressed={color===c} className={color===c?'selected':''} style={{background:skeletonColors[c]}} onClick={()=>setColor(c)}/>)}</div>
      <p className="privacy-note">Camera feed and results stay on your device. Results disappear on page reload.</p>
    </aside></div>}
    {mode==='results'&&result&&<section className="results"><div className="results-heading"><div><p className="eyebrow">{result.settings.mode==='game'?'GAME RESULT':'TEST RESULT'} · {result.settings.side.toUpperCase()} STANCE LEG</p><h2>Results</h2></div><button className="primary" onClick={newTest}>New measurement</button></div>
      <div className="result-cards"><div><span>Total time</span><strong>{result.totalDuration.toFixed(2)}<small> s</small></strong></div><div><span>{result.settings.mode==='game'?'Difficulty':'Depth target'}</span><strong className="difficulty-result">{result.settings.mode==='game'?difficultyName[result.settings.difficulty]:Math.round(result.settings.depthTarget*100)+'%'}</strong></div><div><span>Reps</span><strong>{result.reps.length}<small> ({result.rejected} rejected)</small></strong></div></div>
      {result.stoppedEarly&&<div className="notice">Measurement stopped early.</div>}{result.interrupted>0&&<p className="filter-note">Tracking interruptions: {result.interrupted}</p>}
      {result.settings.mode==='test'&&<p className="filter-note">{result.filterApplied?'Results filtered at 6 Hz (Butterworth, forward–backward).':'6 Hz filtering unavailable for some segments.'}</p>}
      {result.reps.length?<>{result.settings.mode==='test'&&<><div className="legend">{result.reps.map((r,i)=><span key={r.number}><i style={{background:repColor(result,i)}}/>Rep {r.number}</span>)}</div>{(['fppa','pelvis','shoulder'] as const).map(signal=><Curve key={signal} result={result} signal={signal}/>)}</>}
        <div className="table-wrap"><table><thead><tr>{['Rep','Duration, s','Depth, %','Knee at bottom, °','Pelvis at bottom, °','Shoulders at bottom, °'].map(s=><th key={s}>{s}</th>)}</tr></thead><tbody>{result.reps.map(r=><tr key={r.number}><th>{r.number}</th>{[r.duration,r.maxDepth*100,r.fppaAtBottom,r.pelvisAtBottom,r.shoulderAtBottom].map((v,i)=><td key={i}>{v.toFixed(i===0?2:1)}</td>)}</tr>)}<tr className="mean-row"><th>Mean</th>{(['duration','maxDepth','fppaAtBottom','pelvisAtBottom','shoulderAtBottom'] as const).map((key,i)=><td key={key}>{(result.reps.reduce((sum,r)=>sum+r[key],0)/result.reps.length*(key==='maxDepth'?100:1)).toFixed(i===0?2:1)}</td>)}</tr><tr className="mean-row"><th>Total time</th><td>{result.totalDuration.toFixed(2)}</td><td colSpan={4}/></tr></tbody></table></div>
      </>:<div className="empty-results"><h3>No accepted reps</h3><p>Reach the lower target, then return to the upper line.</p></div>}
      <div className="export-bar"><div><h3>Save your results</h3></div><div className="export-actions">{result.settings.mode==='test'&&<><button className="secondary" onClick={()=>exportCsv(result,'frames')}>Raw CSV</button><button className="secondary" onClick={()=>exportCsv(result,'summary')}>Summary CSV</button></>}<button className="primary" disabled={exporting} onClick={async()=>{setExporting(true);try{await exportPng(result);}catch(e){setError(String(e));}finally{setExporting(false);}}}>{exporting?'Saving…':'Results PNG'}</button></div></div>
    </section>}
    </main><footer className="site-footer">Squat Master · On-device analysis</footer></div>;
}

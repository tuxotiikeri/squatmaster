import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
let pose: PoseLandmarker | null = null;
self.onmessage = async (event: MessageEvent) => {
  const data = event.data;
  if (data.type === 'init') {
    try {
      const vision = await FilesetResolver.forVisionTasks(data.wasm);
      pose = await PoseLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:data.model,delegate:'CPU'},runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.65,minPosePresenceConfidence:.65,minTrackingConfidence:.65});
      self.postMessage({type:'ready'});
    } catch (error) { self.postMessage({type:'error',message:String(error)}); }
  }
  if (data.type === 'frame') {
    const bitmap: ImageBitmap = data.bitmap;
    try { const result=pose!.detectForVideo(bitmap,data.time); self.postMessage({type:'result',time:data.time,points:result.landmarks[0] ?? []}); }
    catch(error) { self.postMessage({type:'error',message:String(error)}); }
    finally { bitmap.close(); }
  }
};

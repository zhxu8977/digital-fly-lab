export const CAMERA_GESTURES = Object.freeze({
  Open_Palm: { id: "greeting", command: "come", label: "你张开手掌招呼它", response: "它回应招手，并来到电视正面", emoji: "👋", positive: true },
  Thumb_Up: { id: "proud", command: "praise", label: "你竖起大拇指表扬它", response: "它骄傲地挺胸点头", emoji: "👍", positive: true },
  Thumb_Down: { id: "seekFood", command: "eat", label: "你做出去找食物的手势", response: "它转头嗅闻，寻找甜果进食", emoji: "🍯", positive: false },
  Victory: { id: "celebrate", command: "perform", label: "你比出剪刀手", response: "它开心地蹦跳并转圈表演", emoji: "✌️", positive: true },
  ILoveYou: { id: "affection", command: "come", label: "你比出爱你的手势", response: "它害羞地摇摆并靠近屏幕", emoji: "💗", positive: true },
  Pointing_Up: { id: "curious", command: "walk", label: "你举起一根手指让它活动", response: "它歪头确认后，走一小段再回头看你", emoji: "☝️", positive: false },
  Closed_Fist: { id: "settle", command: "stay", label: "你握拳示意停下", response: "它刹住脚步，乖乖坐好看着你", emoji: "✊", positive: false },
});

// Manual actions share the exact reaction contract used by the recognizer.
// They are deliberately not presented as arbitrary camera gesture recognition.
export const SOCIAL_ACTIONS = Object.freeze(Object.fromEntries(Object.entries({
  greet: { id: "greeting", command: "come", label: "你向伙伴招手", response: "它软软地挥手，走过来和你打招呼", emoji: "👋", positive: true, duration: 2.2 },
  roll: { id: "roll", command: "perform", label: "你请它打个滚", response: "它蜷起身体，侧滚一圈后重新站稳", emoji: "🌀", positive: true, duration: 2.5, movementLocked: true },
  rub: { id: "rub", command: "come", label: "你邀请它撒娇", response: "它歪过脑袋，贴近你软软地蹭一蹭", emoji: "💗", positive: true, duration: 2.4 },
  tilt: { id: "curious", label: "你轻轻逗它", response: "它转头看你，歪着脑袋好奇地听", emoji: "🐾", positive: true, duration: 1.8 },
  blink: { id: "blinkBack", label: "你向它眨眼", response: "它也眨眨眼，再抬头看向你", emoji: "😉", positive: true, duration: 1.8 },
  smile: { id: "happy", label: "你对它笑了笑", response: "它扬起嘴角，身体轻轻摇摆", emoji: "😊", positive: true, duration: 1.8 },
  eat: { id: "seekFood", command: "eat", label: "你让它去吃甜果", response: "它嗅闻气味，靠近食物再尝一尝", emoji: "🍓", positive: false, duration: 1.8 },
  rest: { id: "settle", command: "stay", label: "你让它坐下休息", response: "它慢慢坐下，放松身体看着你", emoji: "💤", positive: false, duration: 2.4, movementLocked: true },
}).map(([key, value]) => [key, Object.freeze(value)])));

export function selectManualReaction(action) {
  const reaction = Object.hasOwn(SOCIAL_ACTIONS, action) ? SOCIAL_ACTIONS[action] : null;
  return reaction ? { ...reaction, confidence: 1, source: "manual" } : null;
}

const confidence = (value) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
const categoryMap = (categories = []) => Object.fromEntries((Array.isArray(categories) ? categories : []).filter((item) => item?.categoryName).map((item) => [item.categoryName, confidence(item.score)]));

/** Pure reaction selection kept separate so it can be tested without a camera. */
export function selectCameraReaction({ gesture = "None", gestureScore = 0, blendshapes = [], faceDetected = false } = {}) {
  const score = confidence(gestureScore);
  if (score >= 0.62 && Object.hasOwn(CAMERA_GESTURES, gesture)) return { ...CAMERA_GESTURES[gesture], confidence: score, source: "camera", duration: 2.2 };
  if (!faceDetected) return null;
  const face = categoryMap(blendshapes);
  const smile = ((face.mouthSmileLeft || 0) + (face.mouthSmileRight || 0)) / 2;
  const blink = Math.min(face.eyeBlinkLeft || 0, face.eyeBlinkRight || 0);
  if ((face.jawOpen || 0) > 0.52 && (face.browInnerUp || 0) > 0.18) {
    return { id: "surprise", label: "你露出惊讶表情", response: "它睁大眼睛、向后弹一下", emoji: "😮", positive: false, confidence: face.jawOpen, source: "camera", duration: 1.8 };
  }
  if (blink > 0.55) return { id: "blinkBack", label: "你眨了眨眼", response: "它也快速眨眼回应", emoji: "😉", positive: true, confidence: blink, source: "camera", duration: 1.8 };
  if (smile > 0.42) return { id: "happy", label: "你正在微笑", response: "它软乎乎地左右摇摆回应", emoji: "😊", positive: true, confidence: smile, source: "camera", duration: 1.8 };
  return null;
}

/** Require stable recognition, a shared cooldown and release before repetition. */
export class ReactionDebouncer {
  constructor({ stableFrames = 3, cooldownMs = 2400, rearmFrames = 5 } = {}) {
    this.stableFrames = Math.max(1, Math.floor(stableFrames));
    this.cooldownMs = Math.max(0, cooldownMs);
    this.rearmFrames = Math.max(1, Math.floor(rearmFrames));
    this.reset();
  }
  reset() {
    this.pendingId = null; this.frames = 0; this.neutralFrames = 0;
    this.lastEmittedId = null; this.lastReactionAt = -Infinity;
  }
  update(reaction, now) {
    if (!Number.isFinite(now)) return null;
    const id = reaction?.id || null;
    if (!id) {
      this.pendingId = null; this.frames = 0; this.neutralFrames++;
      if (this.neutralFrames >= this.rearmFrames) this.lastEmittedId = null;
      return null;
    }
    this.neutralFrames = 0;
    if (id === this.pendingId) this.frames++;
    else { this.pendingId = id; this.frames = 1; }
    if (this.frames < this.stableFrames || id === this.lastEmittedId || now - this.lastReactionAt < this.cooldownMs) return null;
    this.lastEmittedId = id; this.lastReactionAt = now; this.frames = 0;
    return reaction;
  }
}

export class CameraInteraction {
  constructor({ video, canvas, onStatus = () => {}, onFrame = () => {}, onReaction = () => {} }) {
    this.video = video;
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.onStatus = onStatus;
    this.onFrame = onFrame;
    this.onReaction = onReaction;
    this.running = false;
    this.lastVideoTime = -1;
    this.debouncer = new ReactionDebouncer();
    this.raf = 0;
  }

  async load() {
    if (this.gestureRecognizer && this.faceLandmarker) return;
    this.onStatus("正在加载本地手势与表情模型…");
    const { FaceLandmarker, FilesetResolver, GestureRecognizer } = await import("@mediapipe/tasks-vision");
    const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
    [this.gestureRecognizer, this.faceLandmarker] = await Promise.all([
      GestureRecognizer.createFromOptions(vision, {
        baseOptions: { modelAssetPath: "/mediapipe/models/gesture_recognizer.task" },
        runningMode: "VIDEO", numHands: 1,
        minHandDetectionConfidence: 0.52, minHandPresenceConfidence: 0.52, minTrackingConfidence: 0.5,
      }),
      FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: "/mediapipe/models/face_landmarker.task" },
        runningMode: "VIDEO", numFaces: 1, outputFaceBlendshapes: true,
        minFaceDetectionConfidence: 0.52, minFacePresenceConfidence: 0.52, minTrackingConfidence: 0.5,
      }),
    ]);
  }

  async start() {
    if (this.running) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("当前浏览器不支持摄像头访问");
    await this.load();
    this.onStatus("正在请求摄像头权限…");
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    this.video.srcObject = this.stream;
    await this.video.play();
    this.running = true;
    this.lastVideoTime = -1;
    this.debouncer.reset();
    this.onStatus("摄像头已开启：向它招手、微笑或比个手势吧");
    this.loop();
  }

  stop() {
    this.running = false;
    this.debouncer.reset();
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.onStatus("摄像头已关闭，视频不会保存");
  }

  loop = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    if (this.video.readyState < 2 || this.video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = this.video.currentTime;
    const now = performance.now();
    const gestures = this.gestureRecognizer.recognizeForVideo(this.video, now);
    const faces = this.faceLandmarker.detectForVideo(this.video, now);
    this.drawOverlay(gestures, faces);
    const category = gestures.gestures?.[0]?.[0];
    const blendshapes = faces.faceBlendshapes?.[0]?.categories || [];
    const reaction = selectCameraReaction({
      gesture: category?.categoryName || "None", gestureScore: category?.score || 0,
      blendshapes, faceDetected: Boolean(faces.faceLandmarks?.length),
    });
    this.onFrame({ faceDetected: Boolean(faces.faceLandmarks?.length), gesture: category?.categoryName || "None", gestureScore: category?.score || 0 });
    const accepted = this.debouncer.update(reaction, now);
    if (accepted) this.onReaction(accepted);
  };

  drawOverlay(gestures, faces) {
    const width = this.video.videoWidth || 640, height = this.video.videoHeight || 480;
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
    const ctx = this.context;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(131,243,195,.78)";
    faces.faceLandmarks?.[0]?.filter((_, index) => index % 8 === 0).forEach((point) => {
      ctx.beginPath(); ctx.arc((1 - point.x) * width, point.y * height, 1.6, 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = "rgba(255,214,121,.92)";
    gestures.landmarks?.[0]?.forEach((point) => {
      ctx.beginPath(); ctx.arc((1 - point.x) * width, point.y * height, 3, 0, Math.PI * 2); ctx.fill();
    });
  }
}

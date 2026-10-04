# Squat Master v0.4

Browser-based single-leg squat testing and movement-control game. React, TypeScript, Vite and MediaPipe Tasks Vision. Webcam analysis; video import is a later phase.

## Run locally

Install Node.js 22.12 or later, then:

```sh
git clone https://github.com/tuxotiikeri/squatmaster.git
cd squatmaster
npm install
npm run dev
```

Open the localhost URL printed by Vite, normally http://localhost:5173, and allow camera access. On Windows, `start.cmd` can also install missing dependencies and start the app. Phone cameras require an HTTPS address; ordinary LAN HTTP is insufficient.

`npm install` installs dependencies inside this project's `node_modules` folder. It does not replace packages in other projects. Later updates only require another install if package dependencies have changed.

## Build and verify

```sh
npm test
npm run build
npm run preview
```

Version 0.4 has 34 passing automated tests and a successful production build. Real-device checks remain documented in VERIFICATION.md. The app processes camera frames locally; it downloads the MediaPipe model/runtime at startup.

## Quick start

Pick Test mode or Game mode and the anatomical stance leg. Put the camera directly in front of you, on a stable support. Press Start and move into view. The app waits until the head, both feet and measurement landmarks are visible for half a second. Then Get ready 5–1 begins. Stand still on the selected leg for the final second, with the free foot raised. Median hip/ankle position establishes the depth baseline. Knee angle is never zeroed to the starting posture.

If the whole body disappears during countdown, the app returns to waiting. An unstable baseline produces “Stand still. Start again”. During measurement, squat to the lower gauge line and rise to the upper line. Gauge fill grows downward with descent and retracts upward on ascent. The upper line uses the detector's standing threshold: ±4% of standing hip–ankle distance. A 120 ms confirmation prevents duplicate counts; reported completion time excludes that final confirmation.

## Game rules and feedback

Normal requires 20%, Hard 30%, and I Am Insane 45% normalized hip descent. Menu labels omit percentages. These are software targets, not validated clinical thresholds. A valid rep reaches the depth target, returns upright and keeps the live filtered knee angle within −10° to 10°. A failed angle latches rejection: the bar turns red and one buzzer sounds. Return upright immediately to reset, even before reaching the lower target. Rejection is counted on that return. Accepted reps show a +1 animation. Rejected counts use completed accepted + rejected attempts as the denominator; tracking interruptions are reported separately.

Game time includes rejected attempts and pauses after the first movement begins. Camera tracking loss, moved stance foot or a 20-second attempt timeout interrupts an attempt and requires standing again. Measurement is capped at three minutes. Comparing times requires the same leg, difficulty and rep target.

## Camera and skeleton controls

The app requests the highest camera rate advertised by the track. Actual rate depends on the camera, resolution, driver, lighting and browser. Camera fps is measured from presented-frame counters, with configured track fps as a startup fallback. Analysis runs from requestVideoFrameCallback, keyed by the frame media timestamp. Each new frame can be analysed once; frames arriving while inference is busy are dropped rather than queued. Older browsers can use their real presented-frame counter; browsers without either reliable mechanism must be updated. Pose throughput may be lower than camera fps on a slower device. Game judging still requires more than 12 valid analysis fps for the 6 Hz filter.

Full skeleton can be toggled at any time. Starting a test switches to hips and the selected knee/ankle; the toggle can restore all landmarks. Colors are Pink and Turquoise.

## Angles and results

- Knee frontal plane angle: valgus negative, varus positive; straight hip–knee–ankle alignment is 0°.
- Pelvic obliquity: free-leg side lower is positive, higher is negative.
- Shoulder tilt: the same sign convention, using the shoulder line.

These are image-plane projection measurements from a single camera. Pelvic obliquity measures pelvic tilt, not hip abduction/adduction. Do not interpret the knee projection as a true anatomical 3D joint angle. Pixel geometry corrects for the image aspect ratio; the mirrored preview does not reverse anatomical sign conventions.

Test-mode graphs default to −10° to 10° and expand when needed. They include a horizontal zero line, a dashed 50% midpoint and anatomical sign labels. Hover or focus the question mark for a structured sign explanation. Each accepted rep is normalized separately: descent 0–50%, deepest position 50%, ascent 50–100%. Actual durations remain in the table and CSV.

Live judging uses a causal fourth-order Butterworth filter at 6 Hz with frequency estimated from actual timestamps. Results use forward–backward filtering on uniformly resampled continuous segments before phase normalization. Raw CSV contains raw, result-filtered and live-judging angles. Summary CSV retains measurement metadata. Test-mode Results PNG exports the table and three curves. Game results show Total time, Difficulty, Reps (rejected) and the rep summary table, with PNG-only export. Total time occupies the Duration column in both on-screen and exported tables. Game pages, wide-screen margins and PNG summaries use a consistent dark theme. In-game movement instructions are hidden after the initial GO; error messages and tracking recovery remain visible. The live clock displays hundredths of a second; this is display precision, not a claim of camera timing accuracy. Info contains the short Test your Squat and Game mode instructions.

## Privacy

Measurement data exists only in JavaScript memory. No backend, accounts, database, localStorage, sessionStorage, IndexedDB or measurement uploads. Reload, close or New measurement discards the session results. Downloads initiated by the user remain on their device. Model/runtime files load from pinned Google/jsDelivr URLs; camera frames are processed locally.

## Development checks

`npm test` runs calculation and state-machine tests. `npm run build` checks TypeScript and builds production assets. See VERIFICATION.md for completed checks and real-device checks still needed.


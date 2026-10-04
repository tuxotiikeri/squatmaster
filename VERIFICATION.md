# v0.4 verification

Completed 4 October 2026:

- 34/34 automated tests passed.
- TypeScript check and Vite production build passed.
- Camera integration test uses a mocked video stream and worker: maximum advertised frame rate is requested, 30 fps camera frames are processed once each despite extra callbacks, busy frames are dropped and tracks/callbacks are closed cleanly.
- Frame-clock tests cover repeated identifiers, dropped frames, display repaints and missing callbacks.
- PNG tests check the dark compact game summary, rejected count in the Reps card, Total time in the Duration column, three test charts, zero labels, anatomical signs and the dashed midpoint.
- The 27 existing calculation and squat-state tests remain passing.

Not verified on a real camera/device: negotiated maximum capture rate, MediaPipe throughput, sound timing, iPhone Safari, visual layout and downloads. Browser API mocks do not substitute for those checks.

Real-device checks:

1. Update and start the app. Confirm the header says v0.4 and Info replaces Quick start.
2. Confirm Camera fps appears without 30/60 selectors or a separate Analysis label. Compare the rate to the camera's actual available modes; there is no guaranteed 60 fps.
3. Toggle Test/Game on a 3440-pixel-wide screen. Page margins, tables and cards should all follow the dark game theme.
4. Complete a game: time shows hundredths; routine descent/ascent instructions disappear after GO. Failure bar, buzzer, rejection count and +1 remain.
5. Verify game results contain time, difficulty, reps with rejected count, rep summary and PNG export. Total time appears under Duration; there is no Rejected reps summary row.
6. In Test mode, check zero lines, dashed 50% guides, larger font sizes and positive/negative sign labels on all three graphs. Hover/focus the question marks and read each separated definition.
7. Export a test PNG and a game PNG, plus test CSVs. Confirm the respective layouts and signs match the results page.
8. Test camera permissions, countdown, both stance legs, skeleton colors and audio on Safari via HTTPS separately.

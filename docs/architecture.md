# Architecture

## Why Canvas + TypeScript?

The app is deliberately small and inspectable. There are no UI framework, animation, physics, analytics, or AI runtime dependencies in the browser. Vite bundles typed ES modules. Native DOM controls preserve keyboard access while Canvas provides pen input and high-DPI rendering.

## State boundaries

`Project` is the durable value: authored drawing, normalized rig, birth story, care counters, preferences, and growth. Version-1 import is an allowlist reconstruction with file/point/count/coordinate/color/identifier limits. Old version-1 values missing growth migrate to an empty growth record. Unknown fields are removed. `PetState`, weather snapshots, current tool, pointer position, dialogs, and photo underlay are ephemeral.

A working copy supports up to 50 undo/redo states in each editor. Entering the garden commits it. Local persistence is debounced; export commits immediately. Import warns before replacing the current friend. JSON files may include personal details and are never included in the repository.

## Rendering and motion

1. A deterministic state machine chooses wandering, idle, sleep, eating, drinking, following, and petting.
2. A smooth foot trajectory produces stance/swing targets. Four-legged defaults pair diagonals.
3. Two/three-joint analytic IK and multi-segment FABRIK preserve authored lengths.
4. Body/head/leg/tail transforms form the posed skeleton. The renderer computes up to four normalized weights for every original ink point, then blends transformations.
5. Canvas draws only those transformed strokes and optional diagnostic bones. It does not draw invisible/default limbs or replace custom anatomy.
6. The maximum authored foot-tip height determines ground contact, so unused whitespace does not make pets float.

No rigid-body collision, ground reaction forces, reinforcement learning, or pretrained policy inference is claimed. Procedural IK is a creative motion tool, not an anatomical or physically accurate simulator.

## Weather

Mock is pure and deterministic. Six scenes and day/night are locally available. Live requests occur only on a button action. The frontend calls same-origin `/api/weather`; the optional server validates a city preset or rounded coordinates, calls only OpenWeather, validates and normalizes its response, and keeps credentials server-side. No birthday is used to infer historical weather.

Static GitHub Pages hosts the full Mock app; it cannot execute the Node proxy. The optional Node server serves built static files and API together. See `weather.md` for operational caveats.

## Growth and food

Only a meal that has reached its target and entered consumption earns its food XP. Patting adds one XP with a three-second UI cooldown. Four permanent stages occur at 0, 20, 60, and 140 XP, changing rendered size. Counts are finite bounded integers. No idle-time penalties, purchases, or real-world health implications.

## Care tray and placement

The collapsible care tray is ephemeral UI. It contains seeds, berries, carrots, and water. Pointer capture keeps mouse, pen, and touch gestures attached to their initiating pointer. Other pointers cannot replace the active gesture. A shared pure `projectDrop` function maps both preview and final release to the same reachable horizontal ground point. Vertical coordinates are explicitly projected to the walkable ground; this is not free two-dimensional physics.

A tap selects an item without placing anything. The user can then tap the garden, or focus it and use Left/Right, Home/End and Enter/Space. Escape, pointer cancellation, lost capture, off-scene release, drawer dismissal, resize, navigation, and page visibility loss cancel the pending placement. Nothing is rewarded on pointer-down, selection, drag, or cancellation. Existing consumption logic records care and XP only after the pet arrives and eats. Resource positions resize with the meadow.

No durable project fields or storage keys change. Closing/reopening the tray does not reset the saved drawing, rig, name, care history, or growth. Placement previews and dropped consumables are temporary; saved progress remains the existing local-only version-one project.

## Tracing privacy

The underlay accepts only local PNG/JPEG/WebP Files with matching binary signatures, rejects over 12 MB and decoded images above 20 million pixels or 8000 px on an edge, and draws at an adjustable opacity/scale/offset. The bitmap is never part of `Project`. Replacing/removing/leaving the workspace closes it; asynchronous loads use a generation check so outdated private images cannot reappear. The exported garden PNG contains the pet's authored ink, not the underlay.

## Accessibility and performance

UI controls have labels and visible focus rings. Dialogs trap focus and Escape closes them. Rig coordinates can be changed numerically or by arrows (Shift for larger steps). Pen/touch use pointer capture. Reduced-motion preference stops ambient scene effects and is also inferred from the OS. Browser visibility pauses work, frame deltas are bounded, and high-DPI rendering is capped at 2x.

Drawing itself still requires a pointing input; sample creatures provide an alternate starting point. User-authored color choices may be low-contrast. No claim of full WCAG conformance is made without a dedicated audit.

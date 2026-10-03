# Contributing

1. Use Node 22.12+ and `npm ci`
2. Run `npm run dev`
3. Keep browser code dependency-light and privacy-first
4. Add tests for changed data, rig, motion, or weather behavior
5. Run `npm run check`, then `npm run test:e2e`
6. Test a tablet and narrow viewport, keyboard focus, reduced motion, repeated/cancelled actions, and reload persistence

Keep the project's promises accurate: arbitrary drawing deformation is procedural IK/skinning, not a pretrained physical policy. Never add a credential to client code or public fixtures. Use synthetic fixtures and original sample art. Do not commit user exports or photos.

Pull requests should describe behavior changed, verification run, and any remaining limits. Please preserve original artwork and attribution notices.

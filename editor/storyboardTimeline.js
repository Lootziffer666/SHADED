// StoryboardTimeline — fourth small, stable facade: edits the engine's real
// storyboard (the "Story/Akt" concept behind window.SHADED.story). Deliberately does
// NOT reimplement storyboard playback/blending (tickStory/playStory stay index.html's
// job) — it only reads/mutates the SAME live array the engine already owns.
//
// `window.SHADED.story.board()` returns the live internal `storyboard` array by
// reference (not a copy), so mutating what this class returns from `getSteps()`
// (push/splice/property edits) is exactly the same operation the engine's own
// internal step-list buttons perform — there is no second, independent copy of
// storyboard state.
export class StoryboardTimeline {
  constructor(facade) {
    this.facade = facade;
  }

  getSteps() {
    return this.facade.win.SHADED.story.board();
  }

  addStepFromCurrentParams(name = 'Neuer Schritt', dur = 3) {
    const steps = this.getSteps();
    steps.push({ name, dur, p: { ...this.facade.getParams() } });
    return steps.length - 1;
  }

  updateName(index, name) {
    this.getSteps()[index].name = name;
  }

  updateDuration(index, dur) {
    this.getSteps()[index].dur = Math.max(0.5, dur || 0.5);
  }

  /** Overwrites this step's parameters with whatever the engine is currently showing. */
  captureCurrentParamsInto(index) {
    this.getSteps()[index].p = { ...this.facade.getParams() };
  }

  /** Jumps the live preview to this step's parameters (same effect as the engine's own "👁" button). */
  previewStep(index) {
    this.facade.setParams(this.getSteps()[index].p);
  }

  moveUp(index) {
    const steps = this.getSteps();
    if (index <= 0) return;
    [steps[index - 1], steps[index]] = [steps[index], steps[index - 1]];
  }

  moveDown(index) {
    const steps = this.getSteps();
    if (index >= steps.length - 1) return;
    [steps[index + 1], steps[index]] = [steps[index], steps[index + 1]];
  }

  remove(index) {
    this.getSteps().splice(index, 1);
  }

  play() {
    this.facade.win.SHADED.story.play();
  }

  stop() {
    this.facade.win.SHADED.story.stop();
  }
}

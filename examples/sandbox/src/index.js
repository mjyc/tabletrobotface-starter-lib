import xs from "xstream";
import { run } from "@cycle/run";
import {
  createTabletFaceRobotSandboxDrivers,
  makeTabletFaceRobotSandbox
} from "tabletrobotface-starter-lib";

const settings = Object.assign(
  // defaults to "dev" setting
  { record: true, displayPoseViz: true, hideScroll: false },
  require("./settings.json")
);
if (settings.hideScroll) {
  document.body.style.overflow = "hidden";
}

const makeProgram = ({ Time = null } = {}) => {
  // an example program
  const program = sources => {
    sources.facePoses.addListener({ next: console.log });
    sources.voiceLevel.addListener({ next: console.log });

    const sinks = {
      setMessage: xs.merge(
        xs.of("Hello!"),
        sources.askMultipleChoiceFinished
          .compose(Time.delay(3000))
          .mapTo("bye!")
      ),
      askMultipleChoice: xs.of(["Let's do this!"]),
      test: sources.askMultipleChoiceFinished
        .compose(Time.delay(1000))
        .mapTo("test")
    };
    return sinks;
  };

  return sources => {
    const programSources = sources;
    const programSinks = program(sources);
    const sinks = programSinks;
    return sinks;
  };
};

const main = makeTabletFaceRobotSandbox(makeProgram, {
  record: settings.record,
  displayPoseViz: settings.displayPoseViz
});

const drivers = createTabletFaceRobotSandboxDrivers({
  record: settings.record,
  settings
});

run(main, drivers);

import xs from "xstream";
import { run } from "@cycle/run";
import { createMain, createDrivers } from "tabletrobotface-starter-lib";

const settings = require("./settings.json");
// defaults to "dev" setting
const { record = true, displayPoseViz = true, hideScroll = false } = settings;
if (hideScroll) {
  document.body.style.overflow = "hidden";
}

const makeProgram = ({ Time = null } = {}) => {
  // an example program
  const program = sources => {
    const sinks = {
      setMessage: xs.merge(
        xs.of("Hello!"),
        sources.askMultipleChoiceFinished
          .compose(Time.delay(3000))
          .mapTo("bye!")
      ),
      askMultipleChoice: xs.of(["Let's do this"]),
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

const main = createMain(makeProgram, { record, displayPoseViz });

const drivers = createDrivers({ record, settings });

run(main, drivers);

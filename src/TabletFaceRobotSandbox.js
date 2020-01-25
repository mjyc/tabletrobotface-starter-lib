import xs from "xstream";
import { withState } from "@cycle/state";
import { div } from "@cycle/dom";
import { withTabletFaceRobotActions } from "@cycle-robot-drivers/run";
import { DataDownloader } from "./utils";
import TabletFaceRobot from "./TabletFaceRobot";

export default (makeProgram, { record = true, displayPoseViz = true } = {}) => {
  return sources => {
    // disable the download button if record is false
    if (!record) {
      sources.DOM.element(".download")
        .take(1)
        .addListener({
          next: () => {
            // codesandbox complains about this
            if (document.querySelector(".download")) {
              document.querySelector(".download").style.display = "none";
            }
          }
        });
    }

    const dataProxy$ = xs.create(); // for recording data
    const stopRecording$ = xs.create(); // used for stopping recording
    // stop recording in 30min
    setTimeout(() => {
      stopRecording$.shamefullySendNext(xs.never());
    }, 60 * 30000);

    // setup the robot face logic
    const options = {
      hidePoseViz: !displayPoseViz,
      styles: {
        robotSpeechbubble: {
          styles: {
            message: {
              fontSize: "10vmin"
            }
          }
        }
      }
    };
    const sinks = withState(
      withTabletFaceRobotActions(
        TabletFaceRobot(makeProgram, {
          dataProxy: dataProxy$,
          stopRecord: stopRecording$
        }),
        options
      )
    )(sources);

    // setup outputs
    const dataDownloader = DataDownloader(sources, dataProxy$);
    const videoRecorder$ = xs.merge(
      sources.VideoRecorder.filter(v => v.type === "READY").mapTo("START"),
      dataDownloader.VideoRecorder
    );
    const vdom$ = xs
      .combine(sinks.DOM || xs.never(), dataDownloader.DOM)
      .map(vdoms => div(vdoms));
    return Object.assign({}, sinks, {
      DOM: vdom$,
      VideoRecorder: videoRecorder$,
      DownloadData: dataDownloader.DownloadData
    });
  };
};

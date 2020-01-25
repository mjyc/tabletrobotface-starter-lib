import xs from "xstream";
import { run } from "@cycle/run";
import { withState } from "@cycle/state";
import { div } from "@cycle/dom";
import { timeDriver } from "@cycle/time";
import { makePoseDetectionDriver } from "cycle-posenet-driver";
import {
  initializeTabletFaceRobotDrivers,
  withTabletFaceRobotActions
} from "@cycle-robot-drivers/run";
import { makeTabletFaceDriver } from "@cycle-robot-drivers/screen";
import {
  mockDownloadDataSource,
  makeDownloadDataDriver,
  makeMediaRecorderDriver,
  mockMediaRecorderSource,
  DataDownloader
} from "tabletrobotface-userstudy";
import makeTabletFaceRobot from "./makeTabletFaceRobot";
import makeAudioAverageFrequencyDriver from "./makeAudioAverageFrequencyDriver";

// ------
// Consts
// ------

const settings = require("./settings.json");
// defaults to "dev" setting
const { record = true, displayPoseViz = true, hideScroll = false } = settings;
if (hideScroll) {
  document.body.style.overflow = "hidden";
}

const videoWidth = 640;
const videoHeight = 480;

const stopRecording$ = xs.create(); // used for stopping recording
// stop recording in 30min
setTimeout(() => {
  stopRecording$.shamefullySendNext(xs.never());
}, 60 * 30000);

// ---------
// Functions
// ---------

const convertTimeTravelRecordedStreamToRecordedStream = timeTravelRecorded => {
  return timeTravelRecorded.map(x => ({
    value: x.value,
    stamp: x.timestamp
  }));
};

const makeProgram = ({ Time = null } = {}) => {
  // an example program
  const program = sources => {
    const sinks = {
      setMessage: xs.of("Hello!"),
      askMultipleChoice: xs.of(["Let's do this"]),
      test: sources.askMultipleChoiceFinished
        .compose(Time.delay(1000))
        .mapTo("bye!")
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

const main = sources => {
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
      makeTabletFaceRobot(makeProgram, {
        dataProxy: dataProxy$,
        stopRecord: stopRecording$
      }),
      options
    )
  )(sources);

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

const drivers = Object.assign({}, initializeTabletFaceRobotDrivers(), {
  Time: timeDriver,
  TabletFace: makeTabletFaceDriver({ styles: { eyeSize: "30vmin" } }),
  PoseDetection: makePoseDetectionDriver({
    videoWidth,
    videoHeight,
    flipHorizontal: true,
    fps: 30,
    closeGUIOnStart: false
  }),
  VoiceLevel: makeAudioAverageFrequencyDriver(),
  VideoRecorder: record
    ? makeMediaRecorderDriver({
        constraints: {
          video: {
            facingMode: "user",
            width: 640,
            height: 480
          },
          audio: true
        },
        timeout: Number.MAX_VALUE
      })
    : mockMediaRecorderSource,
  DownloadData: record
    ? makeDownloadDataDriver({
        filenamePrefix: "traces",
        jsonPostProcessFnc: data => {
          for (const k of Object.keys(data)) {
            data[k] = convertTimeTravelRecordedStreamToRecordedStream(data[k]);
          }
          return { traces: data, settings };
        }
      })
    : mockDownloadDataSource
});

run(main, drivers);

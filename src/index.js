import xs from "xstream";
import sampleCombine from "xstream/extra/sampleCombine";
import { run } from "@cycle/run";
import { withState } from "@cycle/state";
import { div } from "@cycle/dom";
import { timeDriver } from "@cycle/time";
import { recordStreams } from "@mjyc/cycle-time-travel";
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
import makeAudioAverageFrequencyDriver from "./makeAudioAverageFrequencyDriver";
import { makePoseDetectionDriver } from "cycle-posenet-driver";

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
      askMultipleChoice: xs.of(["Hi"])
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
    withTabletFaceRobotActions(sources => {
      // Prepare program sinks
      const time$ = sources.Time.animationFrames()
        .compose(sources.Time.throttle(100))
        .map(({ time }) => time);
      const tabletfaceLoaded$ = sources.TabletFace.events("load");
      // synchronize sensor inputs
      const facePoses$ = time$
        .compose(sampleCombine(sources.PoseDetection.events("poses")))
        .map(x => x[1]);
      const voiceLevel$ = time$
        .compose(sampleCombine(sources.VoiceLevel))
        .map(x => x[1]);
      // throttling askMultipleChoiceFinished$ makes buttons to flicker
      const askMultipleChoiceFinished$ = xs
        .create({
          start: listener =>
            sources.HumanSpeechbubbleAction.result.addListener(listener),
          stop: () => {}
        })
        .map(r => r.result);
      const sayFinished$ = xs
        .create({
          start: listener =>
            sources.SpeechSynthesisAction.result.addListener(listener),
          stop: () => {}
        })
        .map(r => r.result.text);

      // Create a program
      const sinks = makeProgram({ Time: sources.Time })({
        recordedStreams: dataProxy$,
        tabletfaceLoaded: tabletfaceLoaded$,
        facePoses: facePoses$,
        voiceLevel: voiceLevel$,
        askMultipleChoiceFinished: askMultipleChoiceFinished$,
        sayFinished: sayFinished$
      });
      // process program sinks
      const followFace$ = sinks.followFace || xs.never();
      const express$ = sinks.express || xs.never();
      const tabletFace$ = xs.merge(
        sources.TabletFace.events("load").mapTo({
          type: "START_BLINKING",
          value: { maxInterval: 10000 }
        }),
        xs.combine(followFace$, facePoses$).map(([detecting, poses]) => {
          // "follow face" logic
          if (
            !!detecting &&
            poses.length > 0 &&
            poses[0].keypoints.filter(kpt => kpt.part === "nose").length > 0
          ) {
            const nose = poses[0].keypoints.filter(
              kpt => kpt.part === "nose"
            )[0];
            const eyePosition = {
              x: nose.position.x / videoWidth,
              y: nose.position.y / videoHeight
            };
            return {
              type: "SET_STATE",
              value: {
                leftEye: eyePosition,
                rightEye: eyePosition
              }
            };
          } else {
            return {
              type: "SET_STATE",
              value: {
                leftEye: { x: 0.5, y: 0.5 },
                rightEye: { x: 0.5, y: 0.5 }
              }
            };
          }
        }),
        express$.map(x => ({
          type: "EXPRESS",
          value: { type: x }
        }))
      );

      // Record data
      const videoStart$ = sources.VideoRecorder.filter(v => v.type === "START");
      // TODO: dynamically generate the input
      // Cache out some data
      const recordedStreams = recordStreams(
        [
          {
            stream: tabletfaceLoaded$,
            label: "tabletfaceLoaded"
          },
          {
            // let's not waste memory! do not store data until program-start
            stream: xs
              .merge(
                xs.of(xs.never()),
                askMultipleChoiceFinished$
                  .filter(x => x === "Let's do this!")
                  .take(1)
                  .mapTo(facePoses$),
                stopRecording$.take(1)
              )
              .flatten(),
            label: "facePoses"
          },
          {
            // let's not waste memory! do not store data until program-start
            stream: xs
              .merge(
                xs.of(xs.never()),
                askMultipleChoiceFinished$
                  .filter(x => x === "Let's do this!")
                  .take(1)
                  .mapTo(voiceLevel$),
                stopRecording$.take(1)
              )
              .flatten(),
            label: "voiceLevel"
          },
          {
            stream: askMultipleChoiceFinished$,
            label: "askMultipleChoiceFinished"
          },
          {
            stream: sayFinished$,
            label: "sayFinished"
          },
          {
            stream: sinks.setMessage || xs.never(),
            label: "setMessage"
          },
          {
            stream: sinks.setImage || xs.never(),
            label: "setImage"
          },
          {
            stream: sinks.askMultipleChoice || xs.never(),
            label: "askMultipleChoice"
          },
          {
            stream: sinks.say || xs.never(),
            label: "say"
          },
          {
            stream: videoStart$,
            label: "videoStart"
          },
          {
            stream: tabletFace$.take(1), // skip recoding 'SET_STATE's since they cannot be replayed properly using dataplayer
            label: "TabletFace"
          }
        ],
        time$
      );
      const data$ = xs.combine.apply(null, recordedStreams).map(recorded => {
        const labels = recorded.map(r => r.label);
        const combined = recorded.reduce((out, data, i) => {
          out[labels[i]] = data;
          return out;
        }, {});
        return combined;
      });
      dataProxy$.imitate(data$);

      // TODOs: cache out outputs
      // move the options upward
      return {
        TabletFace: tabletFace$,
        RobotSpeechbubbleAction: {
          goal: xs.merge(
            sinks.setMessage || xs.never(),
            (sinks.setImage || xs.never()).map(x => ({
              type: "IMAGE",
              value: x
            }))
          )
        },
        HumanSpeechbubbleAction: {
          goal: sinks.askMultipleChoice || xs.never()
        },
        SpeechSynthesisAction: {
          goal: sinks.say || xs.never()
        }
      };
    }, options)
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
    closeGUIOnStart: true
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

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
  extractFaceFeatures,
  mockDownloadDataSource,
  makeDownloadDataDriver,
  makeMediaRecorderDriver,
  mockMediaRecorderSource,
  DataDownloader
} from "tabletrobotface-userstudy";
import streams from "listrp/streams";
import { fromXStream, toXStream } from "listrp/cyclebridge";
import makeAudioAverageFrequencyDriver from "./makeAudioAverageFrequencyDriver";
import { makePoseDetectionDriver } from "cycle-posenet-driver";
import programs from "iterrep/programs";
import {
  evaluateParams,
  repair,
  deriveExpectedStateTrace
} from "iterrep/repair";
import repairOptss from "iterrep/testdata/defaultRepairOptss";

const parameters = require("./parameters.json");
const settings = require("./settings.json");
const {
  userstudy,
  record = false,
  displayPoseViz = false,
  printStatus = false,
  disableCleanUp = false,
  hideScroll = true
} = settings;
if (hideScroll) {
  document.body.style.overflow = "hidden";
}
console.warn("record", record);
console.warn("userstudy", JSON.stringify(userstudy, null, 2));

const videoWidth = 640;
const videoHeight = 480;

const stopRecording$ = xs.create();
setTimeout(() => {
  stopRecording$.shamefullySendNext(xs.never());
}, 60 * 30000); // stop recording in 30min

const convertTimeTravelRecordedStreamToRecordedStream = timeTravelRecorded => {
  return timeTravelRecorded.map(x => ({
    value: x.value,
    stamp: x.timestamp
  }));
};

const makeUserstudy = (plan, Time) => {
  // parse args
  const { iter = 0, results = [] } =
    JSON.parse(localStorage.getItem("iterrep_repair")) || {};
  const name = plan[iter].name;
  const progParams =
    iter === 0 || name !== results[iter - 1].name
      ? parameters[name]
      : results[iter - 1].repairOutput.progParams; // should update
  const prior =
    iter === 0 || name !== results[iter - 1].name
      ? []
      : results[iter - 1].repairOutput.posterior;
  const instIndex = plan[iter].instIndex;
  console.warn("iter", iter);
  console.warn("progParams", JSON.stringify(progParams, null, 2));
  console.warn("instIndex", instIndex);
  console.warn("repairOptss[name]", JSON.stringify(repairOptss[name], null, 2));

  // create a program
  const progOptions = {
    instructions: programs.instructions[name][instIndex],
    startImmediately: false,
    mode: "book", // for "story"
    outputLabels: true,
    ss: Object.assign({}, streams, {
      sdelay: (period, stream) => {
        const in$ = toXStream(stream);
        return fromXStream(in$.compose(Time.delay(period)));
      },
      sthrottle: (period, stream) => {
        const in$ = toXStream(stream);
        return fromXStream(in$.compose(Time.throttle(period)));
      },
      sdebounce: (fn, stream) => {
        const in$ = toXStream(stream);
        return fromXStream(
          in$.map(x => xs.of(x).compose(Time.delay(fn(x)))).flatten()
        );
      },
      sbuffer: (windowSizeMs, stream) => {
        return cb => {
          const buffer = [];
          return stream(payload => {
            const stamp = Time._time();
            buffer.push({ stamp, value: payload });
            while (buffer[0].stamp < stamp - windowSizeMs) {
              buffer.shift();
            }
            cb(buffer.map(x => x.value));
          });
        };
      }
    })
  };
  const createProgram = programs[name];
  const repairOpts = repairOptss[name];
  const program = createProgram(progParams, progOptions);

  // prepare running the program
  const setMessagePush$ = xs.create();
  const askMultipleChoicePush$ = xs.create();
  return sources => {
    xs.combine(sources.recordedStreams, sources.askMultipleChoiceFinished)
      .filter(x => x[1] === "What's next?")
      .take(1)
      .compose(Time.delay(100)) // delay to display "Please answer..."
      .addListener({
        next: async ([recordedStreams, _]) => {
          // prepare repair inputs
          const traces = {};
          for (const k of Object.keys(recordedStreams)) {
            traces[k] = convertTimeTravelRecordedStreamToRecordedStream(
              recordedStreams[k]
            );
          }
          // adjust timestamps
          const startStamp = traces.facePoses[0].stamp;
          for (const k of Object.keys(traces)) {
            traces[k] = traces[k]
              .filter(x => x.stamp >= startStamp)
              .map(x => {
                return {
                  value: x.value,
                  stamp: x.stamp - startStamp
                };
              });
          }
          const inputTraces = {
            tabletfaceLoaded: traces.tabletfaceLoaded,
            facePoses: traces.facePoses,
            voiceLevel: traces.voiceLevel,
            askMultipleChoiceFinished: traces.askMultipleChoiceFinished,
            sayFinished: traces.sayFinished
          };
          const stateTrace = deriveExpectedStateTrace(traces);
          console.debug("derived stateTrace", stateTrace);

          // stop recording
          !record && stopRecording$.shamefullySendNext(xs.never());

          // evaluate current params
          const evalOut = await evaluateParams({
            createProgram,
            progParams,
            inputTraces,
            stateTrace,
            options: {
              computeOverlapBinSize: 100
            }
          });

          // repair
          const repairOutput = await repair({
            createProgram,
            progParams,
            inputTraces,
            stateTrace,
            options: Object.assign({ prior }, repairOpts)
          });
          const { score: repairedScore } = await evaluateParams({
            createProgram,
            progParams: repairOutput.progParams,
            inputTraces,
            stateTrace,
            options: {
              computeOverlapBinSize: 100
            }
          });
          console.debug("finished repair");
          console.debug("evalOut.score", evalOut.score);
          console.debug("repairedScore", repairedScore);
          console.debug("repairOutput.progParams", repairOutput.progParams);

          // store results
          const outputTraces = {
            setMessage: traces.setMessage,
            setImage: traces.setImage,
            askMultipleChoice: traces.askMultipleChoice,
            say: traces.say,
            detector: traces.detector,
            state: traces.state,
            videoStart: traces.videoStart,
            TabletFace: traces.TabletFace
          };
          results[iter] = {
            iter,
            name,
            evalOut,
            repairInputs: {
              createProgram,
              progParams,
              inputTraces,
              stateTrace,
              repairOpts
            },
            outputTraces,
            repairOutput,
            repairedScore
          };
          const data = {
            iter: iter + 1,
            results
          };
          localStorage.setItem("iterrep_repair", JSON.stringify(data));
          console.debug("updated localStorage.iterrep_repair");
          // console.debug(localStorage.getItem("iterrep_repair"));

          setMessagePush$.shamefullySendNext(
            "Please answer the questions in the main page"
          );
          if (iter !== plan.length - 1) {
            document.querySelector(".download").innerText = "Download & Reload";
            setTimeout(() => {
              askMultipleChoicePush$.shamefullySendNext([
                "Done! Let's move on"
              ]);
            }, 5000);
            sources.askMultipleChoiceFinished
              .filter(x => x === "Done! Let's move on")
              .addListener({
                next: x => {
                  location.reload();
                  setMessagePush$.shamefullySendNext("Thanks! Moving on...");
                  askMultipleChoicePush$.shamefullySendNext([]);
                }
              });
          } else {
            document.querySelector(".download").innerText = "Download & Finish";
          }
          document.querySelector(".download").onclick = () => {
            if (iter === plan.length - 1) {
              console.debug("downloading data");
              const el = document.createElement("a");
              el.id = "download_iterrep_repair";
              el.href = window.URL.createObjectURL(
                new Blob([localStorage.getItem("iterrep_repair")], {
                  type: "application/json"
                })
              );
              el.download = `robot_study_${name}`;
              el.click();

              if (!disableCleanUp) {
                console.debug("removing item from localStorage");
                localStorage.removeItem("iterrep_repair");
              }
            }
          };
          document.querySelector(".download").click();
        }
      });

    const programSinks = program({
      tabletfaceLoaded: fromXStream(sources.tabletfaceLoaded),
      facePoses: fromXStream(sources.facePoses),
      voiceLevel: fromXStream(sources.voiceLevel),
      askMultipleChoiceFinished: fromXStream(sources.askMultipleChoiceFinished),
      sayFinished: fromXStream(sources.sayFinished)
    });

    // for better UX
    const setMessage$ = sources.askMultipleChoiceFinished
      .filter(x => x === "What's next?")
      .take(1)
      .mapTo(
        iter !== plan.length - 1
          ? "Please answer the questions in the main page (Finishing up...)"
          : "Please answer the questions and upload the downloaded file in the main page (Finishing up...)"
      );
    const askMultipleChoice$ = sources.askMultipleChoiceFinished
      .filter(x => x === "What's next?")
      .take(1)
      .mapTo([]);

    const sinks = Object.keys(programSinks).reduce((prev, k) => {
      prev[k] = toXStream(programSinks[k]);
      return prev;
    }, {});
    sinks.setMessage = xs.merge(sinks.setMessage, setMessage$, setMessagePush$);
    sinks.askMultipleChoice = xs.merge(
      sinks.askMultipleChoice,
      askMultipleChoice$,
      askMultipleChoicePush$
    );
    return sinks;
  };
};

const main = sources => {
  // HACK! disable the download button if record is false
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

  const sinks = withState(
    withTabletFaceRobotActions(
      sources => {
        // inputs
        const time$ = sources.Time.animationFrames()
          .compose(sources.Time.throttle(100))
          .map(({ time }) => time);

        const tabletfaceLoaded$ = sources.TabletFace.events("load");
        const facePoses$ = time$
          .compose(sampleCombine(sources.PoseDetection.events("poses")))
          .map(x => x[1]);
        const voiceLevel$ = time$
          .compose(sampleCombine(sources.VoiceLevel))
          .map(x => x[1]);

        printStatus &&
          facePoses$
            .map(extractFaceFeatures)
            .compose(sampleCombine(voiceLevel$))
            .addListener({
              next: x =>
                console.debug(
                  "voiceLevel",
                  x[1].toFixed(2),
                  "faceAngle",
                  x[0].faceAngle.toFixed(2),
                  "noseAngle",
                  x[0].noseAngle.toFixed(2)
                )
            });

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

        // create a repairable program
        const sinks = makeUserstudy(userstudy, sources.Time)({
          recordedStreams: dataProxy$,
          tabletfaceLoaded: tabletfaceLoaded$,
          facePoses: facePoses$,
          voiceLevel: voiceLevel$,
          askMultipleChoiceFinished: askMultipleChoiceFinished$,
          sayFinished: sayFinished$
        });

        const followFace$ = sinks.followFace || xs.never();
        const express$ = sinks.express || xs.never();
        const tabletFace$ = xs.merge(
          sources.TabletFace.events("load").mapTo({
            type: "START_BLINKING",
            value: { maxInterval: 10000 }
          }),
          xs.combine(followFace$, facePoses$).map(([detecting, poses]) => {
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

        // record data
        const videoStart$ = sources.VideoRecorder.filter(
          v => v.type === "START"
        );
        const recordedStreams = recordStreams(
          [
            {
              stream: tabletfaceLoaded$,
              label: "tabletfaceLoaded"
            },
            {
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
              stream: xs
                .merge(xs.of(voiceLevel$), stopRecording$.take(1))
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
              stream: sinks.detector || xs.never(),
              label: "detector"
            },
            {
              stream: sinks.state || xs.never(),
              label: "state"
            },
            {
              stream: sinks.inputLabel || xs.never(),
              label: "inputLabel"
            },
            {
              stream: sinks.stateLabel || xs.never(),
              label: "stateLabel"
            },
            {
              stream: sinks.subStateLabel || xs.never(),
              label: "stateLabel"
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

        // outputs
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
      },
      {
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
      }
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

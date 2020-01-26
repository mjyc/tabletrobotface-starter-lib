import xs from "xstream";
import sampleCombine from "xstream/extra/sampleCombine";
import { recordStreams } from "@mjyc/cycle-time-travel";

export default (
  makeProgram,
  { dataProxy = dataProxy$.create(), stopRecording = xs.never() } = {}
) => {
  return sources => {
    // Prepare program sinks
    const time$ = sources.Time.animationFrames()
      .compose(sources.Time.throttle(100))
      .map(({ time }) => time);
    const tabletfaceLoaded$ = sources.TabletFace.events("load");
    // synchronize sensor inputs
    const poses$ = time$
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
      recordedStreams: dataProxy,
      tabletfaceLoaded: tabletfaceLoaded$,
      poses: poses$,
      voiceLevel: voiceLevel$,
      askMultipleChoiceFinished: askMultipleChoiceFinished$,
      sayFinished: sayFinished$
    });
    // process expected program sinks
    const followFace$ = sinks.followFace || xs.never();
    const express$ = sinks.express || xs.never();
    const setMessage$ = sinks.setMessage || xs.never();
    const setImage$ = sinks.setImage || xs.never();
    const askMultipleChoice$ = sinks.askMultipleChoice || xs.never();
    const say$ = sinks.say || xs.never();
    // prepare outgoing sinks
    const tabletFace$ = xs.merge(
      sources.TabletFace.events("load").mapTo({
        type: "START_BLINKING",
        value: { maxInterval: 10000 }
      }),
      xs.combine(followFace$, poses$).map(([detecting, poses]) => {
        // "follow face" logic
        if (
          !!detecting &&
          poses.length > 0 &&
          poses[0].keypoints.filter(kpt => kpt.part === "nose").length > 0
        ) {
          const nose = poses[0].keypoints.filter(kpt => kpt.part === "nose")[0];
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
    const robotSpeechbubbleAction$ = {
      goal: xs.merge(
        setMessage$,
        setImage$.map(x => ({
          type: "IMAGE",
          value: x
        }))
      )
    };
    const humanSpeechbubbleAction$ = {
      goal: sinks.askMultipleChoice || xs.never()
    };
    const speechSynthesisAction$ = {
      goal: sinks.say || xs.never()
    };

    // Record data
    const videoStart$ = sources.VideoRecorder.filter(v => v.type === "START");
    // Cache out some data
    const recordedStreams = recordStreams(
      [
        // for dataplayer
        {
          stream: tabletFace$.take(1), // skip recoding 'SET_STATE's since they cannot be replayed properly using dataplayer
          label: "TabletFace"
        },
        {
          stream: videoStart$,
          label: "videoStart"
        },
        // program inputs
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
                .mapTo(poses$),
              stopRecording.take(1)
            )
            .flatten(),
          label: "poses"
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
              stopRecording.take(1)
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
        // program outputs
        {
          stream: setMessage$,
          label: "setMessage"
        },
        {
          stream: setImage$,
          label: "setImage"
        },
        {
          stream: askMultipleChoice$,
          label: "askMultipleChoice"
        },
        {
          stream: say$,
          label: "say"
        }
      ].concat(
        // record other outputs too
        Object.keys(sinks)
          .filter(
            name =>
              ["setMessage", "setImage", "askMultipleChoice", "say"].indexOf(
                name
              ) === -1
          )
          .map(name => ({
            stream: sinks[name],
            label: name
          }))
      ),
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
    dataProxy.imitate(data$);

    return {
      TabletFace: tabletFace$,
      RobotSpeechbubbleAction: robotSpeechbubbleAction$,
      HumanSpeechbubbleAction: humanSpeechbubbleAction$,
      SpeechSynthesisAction: speechSynthesisAction$
    };
  };
};

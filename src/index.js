const xs = require("xstream").default;
const delay = require("xstream/extra/delay").default;
const dropRepeats = require("xstream/extra/dropRepeats").default;
const sampleCombine = require("xstream/extra/sampleCombine").default;
const { run } = require("@cycle/run");
const { withState } = require("@cycle/state");
const { timeDriver } = require("@cycle/time");
const { div, span } = require("@cycle/dom");
const {
  initializeTabletFaceRobotDrivers,
  withTabletFaceRobotActions
} = require("@cycle-robot-drivers/run");
const { makeTabletFaceDriver } = require("@cycle-robot-drivers/screen");
const { makePoseDetectionDriver } = require("cycle-posenet-driver");
const extractPoseFeatures = require("./extractPoseFeatures");
const makeVADDriver = require("./makeVADDriver");

const settings = Object.assign(
  {
    params: {
      headTiltedTo: {
        minFaceAngle: -30,
        maxFaceAngle: 30
      },
      faceLookingAt: {
        minNoseAngle: -10,
        maxNoseAngle: 10
      }
    }
  },
  require("./settings")
);
const main = require("./programs/monologue");

const drivers = Object.assign(initializeTabletFaceRobotDrivers(), {
  Time: timeDriver,
  TabletFace: makeTabletFaceDriver(),
  PoseDetection: makePoseDetectionDriver({ fps: 10, closeGUIOnStart: true }),
  VAD: makeVADDriver()
});

const wrappedMain = sources => {
  const ready$ = xs
    .create({
      start: listener =>
        sources.HumanSpeechbubbleAction.result.addListener(listener),
      stop: () => {}
    })
    .filter(r => r.result === "Tap to start")
    .take(1)
    .mapTo(true)
    .remember();

  const time$ = sources.Time.animationFrames()
    .compose(sources.Time.throttle(500))
    .map(({ time }) => time);
  const poses$ = time$
    .compose(
      sampleCombine(xs.create(sources.PoseDetection.events("poses")._prod))
    )
    .map(x => x[1]);
  const isFaceVisible$ = poses$
    .map(poses => poses.length !== 0)
    .startWith(false)
    .compose(dropRepeats())
    .remember();
  const poseFeatures$ = poses$.map(poses =>
    poses.length === 0 ? {} : extractPoseFeatures(poses[0])
  );
  const headTiltedTo$ = poseFeatures$
    .map(({ faceAngle }) =>
      typeof faceAngle === "undefined"
        ? ""
        : faceAngle < settings.params.headTiltedTo.minFaceAngle
        ? "left"
        : faceAngle > settings.params.headTiltedTo.maxFaceAngle
        ? "right"
        : "center"
    )
    .startWith("")
    .compose(dropRepeats())
    .remember();
  const faceLookingAt$ = poseFeatures$
    .map(({ noseAngle }) =>
      typeof noseAngle === "undefined"
        ? ""
        : noseAngle < settings.params.faceLookingAt.minNoseAngle
        ? "right"
        : noseAngle > settings.params.faceLookingAt.maxNoseAngle
        ? "left"
        : "center"
    )
    .startWith("")
    .compose(dropRepeats())
    .remember();
  const isHumanSpeaking$ = time$
    .compose(sampleCombine(xs.create(sources.VAD._prod)))
    .map(x => x[1])
    .startWith(false)
    .compose(dropRepeats())
    .remember();
  const sayFinished$ = xs
    .create({
      start: listener =>
        sources.SpeechSynthesisAction.result.addListener(listener),
      stop: () => {}
    })
    .map(r => r.result.text);
  const playSoundFinished$ = xs
    .create({
      start: listener => sources.AudioPlayerAction.result.addListener(listener),
      stop: () => {}
    })
    .map(r => r.result); // always returns null

  const state$ = xs.create();
  const sinks = main({
    Time: {
      delay: (period, stream) => stream.compose(sources.Time.delay(period))
    },
    state: state$,
    ready: ready$.compose(sources.Time.delay(0)), // delay(0) allows immediately triggering actions
    isFaceVisible: isFaceVisible$,
    headTiltedTo: headTiltedTo$,
    faceLookingAt: faceLookingAt$,
    isHumanSpeaking: isHumanSpeaking$,
    sayFinished: sayFinished$,
    playSoundFinished: playSoundFinished$
  });
  state$.imitate(sinks.state || xs.never());

  const setMessage$ = xs
    .merge(
      xs.of(xs.never()),
      ready$.mapTo(!!sinks.setMessage ? sinks.setMessage : xs.never())
    )
    .flatten()
    .filter(x => x !== null && typeof x !== "undefined")
    .map(x => String(x)); // cast to a string
  const say$ = xs
    .merge(
      xs.of(xs.never()),
      ready$.mapTo(!!sinks.say ? sinks.say : xs.never())
    )
    .flatten()
    .filter(x => x !== null && typeof x !== "undefined")
    .map(x => (x === "" ? " " : x)) // " " for silence
    .map(x => String(x)); // cast to a string
  const playSound$ = xs
    .merge(
      xs.of(xs.never()),
      ready$.mapTo(!!sinks.playSound ? sinks.playSound : xs.never())
    )
    .flatten()
    .filter(x => x !== null && typeof x !== "undefined");

  const statusbar = xs
    .combine(
      isFaceVisible$,
      headTiltedTo$.map(x => `"${x}"`),
      faceLookingAt$.map(x => `"${x}"`),
      isHumanSpeaking$,
      xs
        .combine(
          sources.SpeechSynthesisAction.status.map(s => s.status),
          say$.startWith("")
        )
        .map(([status, say]) => (status === "ACTIVE" ? `"${say}"` : ""))
    )
    .map(
      ([isFaceVisible, headTiltedTo, faceLookingAt, isHumanSpeaking, saying]) =>
        div([
          span(
            { style: { marginLeft: "10px", fontWeight: "bold" } },
            "isFaceVisible:"
          ),
          span(`${isFaceVisible}`),
          span(
            { style: { marginLeft: "10px", fontWeight: "bold" } },
            "headTiltedTo:"
          ),
          span(`${headTiltedTo}`),
          span(
            { style: { marginLeft: "10px", fontWeight: "bold" } },
            "faceLookingAt:"
          ),
          span(`${faceLookingAt}`),
          span(
            { style: { marginLeft: "10px", fontWeight: "bold" } },
            "isHumanSpeaking:"
          ),
          span(`${isHumanSpeaking}`),
          span(
            { style: { marginLeft: "10px", fontWeight: "bold" } },
            "saying:"
          ),
          span(`${saying}`)
        ])
    )
    .startWith("");

  return {
    RobotSpeechbubbleAction: {
      goal: setMessage$
    },
    HumanSpeechbubbleAction: {
      goal: poses$
        .take(1)
        .mapTo(["Tap to start"])
        .remember()
    },
    SpeechSynthesisAction: {
      goal: say$.map(x => ({ text: x, rate: 0.8 }))
    },
    AudioPlayerAction: {
      goal: playSound$
    },
    statusbar: statusbar
  };
};

run(sources => {
  const sinks = withState(withTabletFaceRobotActions(wrappedMain))(sources);
  return Object.assign(sinks, {
    DOM: xs.combine(sinks.statusbar, sinks.DOM).map(vdoms => div(vdoms))
  });
}, drivers);

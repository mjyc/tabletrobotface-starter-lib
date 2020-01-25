import xs from "xstream";
import {
  makeDOMDriver,
  a,
  b,
  br,
  div,
  h2,
  li,
  ol,
  pre,
  span,
  ul
} from "@cycle/dom";
import { run } from "@cycle/run";
import { makePoseDetectionDriver } from "cycle-posenet-driver";
import makeAudioAverageFrequencyDriver from "./makeAudioAverageFrequencyDriver";

const videoWidth = 640;
const videoHeight = 480;

function main(sources) {
  const params$ = xs.of({
    algorithm: "single-pose",
    singlePoseDetection: { minPoseConfidence: 0.2 },
    output: {
      showSkeleton: false
    }
  });
  const vdom$ = xs
    .combine(
      sources.PoseDetection.events("dom").startWith(""),
      sources.VoiceLevel.map(x =>
        pre(
          { style: { "text-align": "center", "font-size": "18px" } },
          `Loudness: ${x.toFixed(2)}`
        )
      ).startWith(""),
      xs.of(
        div({ style: { width: "640px", margin: "auto" } }, [
          div([b("IMPORTANT!! "), span("Make sure")]),
          ol([
            li(
              "you see a camera feed with 3 cyan dots following your eyes (2) and on your nose (1). There may be more dots and that is fine."
            ),
            li(
              'your see the word "Loudness" and a number below the feed and the number increases as you make sounds.'
            )
          ]),
          div([
            b("IMPORTANT!! "),
            span(
              "PLEASE DO NOT PARTICIPATE THE STUDY if 1. and 2. does not work on your computer"
            )
          ]),
          br(),
          div("Recommendations"),
          ul([
            li([
              span("double-check your "),
              a(
                {
                  attrs: { href: "https://www.onlinemictest.com/webcam-test/" }
                },
                "camera setup"
              ),
              span(" and "),
              a(
                { attrs: { href: "https://www.onlinemictest.com/" } },
                "microphone setup"
              )
            ]),
            li("use a Chrome or Firefox browser")
          ])
        ])
      )
    )
    .map(vdoms => div(vdoms));

  sources.PoseDetection.events("poses").addListener({
    next: poses => {
      // console.debug("poses", poses);
    }
  });

  return {
    DOM: vdom$,
    PoseDetection: params$
  };
}

run(main, {
  DOM: makeDOMDriver("#app"),
  PoseDetection: makePoseDetectionDriver({
    videoWidth,
    videoHeight,
    flipHorizontal: true,
    fps: 30,
    closeGUIOnStart: true
  }),
  VoiceLevel: makeAudioAverageFrequencyDriver()
});

// hide widgets
const handle = setInterval(() => {
  if (
    !!document.querySelector(".posenet") &&
    !!document.querySelector(".posenet").children[2] &&
    !!document.querySelector(".posenet").children[3]
  ) {
    document.querySelector(".posenet").style.width = "640px";
    document.querySelector(".posenet").children[2].style.display = "none";
    document.querySelector(".posenet").children[3].style.display = "none";
    clearInterval(handle);
  }
});

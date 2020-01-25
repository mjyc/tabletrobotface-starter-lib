import xs from "xstream";
import throttle from "xstream/extra/throttle";
import { div, video } from "@cycle/dom";
import { withState } from "@cycle/state";
import { withTabletFaceRobotActions } from "@cycle-robot-drivers/run";
import Replayer from "./Replayer";

function adjustFaceSize(rawJSON) {
  var width = "512px";
  var height = "300px";
  return rawJSON
    .replace(/(\d*\.?\d+)(vw)/g, `calc(${width} * $1 * 0.01)`)
    .replace(/(\d*\.?\d+)(vh|vmin)/g, `calc(${height} * $1 * 0.01)`)
    .replace(
      /{"sel":"div.posenet","data":{"style":{"position":"relative","display":\"block\"/g,
      `{"sel":"div.posenet","data":{"style":{"position":"relative","display":\"none\"`
    )
    .replace(/"padding":"1em"/g, `"padding":"0.45em"`);
}

export default (
  loadedStreams,
  videoStartTime,
  { fileprefix = "", disablenav = false } = {}
) => sources => {
  const replayer = Replayer(sources.DOM, sources.Time, loadedStreams);
  xs.combine(replayer.time)
    .compose(throttle(50))
    .addListener({
      next: time => {
        if (!document.querySelector("video.replayer")) {
          return;
        }
        if (!disablenav) {
          document.querySelector("video.replayer").currentTime =
            (time - videoStartTime) / 1000;
        } else {
          if (
            time[0] - videoStartTime > 0 &&
            !!document.querySelector("video.replayer").paused &&
            !document.querySelector("video.replayer").ended
          ) {
            document.querySelector("video.replayer").currentTime =
              (time - videoStartTime) / 1000;
            document.querySelector("video.replayer").play();
          } else if (
            time[0] - videoStartTime < 0 &&
            !document.querySelector("video.replayer").paused
          ) {
            document.querySelector("video.replayer").currentTime = 0;
            document.querySelector("video.replayer").pause();
          }
        }
      }
    });

  const video$ = xs.of(`/${fileprefix}.mp4`).map(url =>
    video(".replayer", {
      props: { src: url, loop: false, autoplay: false },
      style: {
        width: "400px",
        height: "300px",
        transform: "rotateY(180deg)",
        "-webkit-transform": "rotateY(180deg)" /* Safari and Chrome */,
        "-moz-transform": "rotateY(180deg)" /* Firefox */
      }
    })
  );

  const sinks = withState(
    withTabletFaceRobotActions(
      sources => {
        return {
          RobotSpeechbubbleAction: {
            goal: replayer.timeTravel.setMessage.remember()
          },
          HumanSpeechbubbleAction: {
            goal: replayer.timeTravel.askMultipleChoice.remember()
          }
          // TabletFace: replayer.timeTravel.TabletFace.remember()
        };
      },
      {
        hidePoseViz: true,
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

  const vdom$ = xs
    .combine(
      xs
        .combine(
          sinks.DOM.map(vdom => {
            return JSON.parse(adjustFaceSize(JSON.stringify(vdom)));
          }),
          video$
        )
        .map(vdoms =>
          div(
            {
              style: {
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "space-evenly",
                alignItems: "flex-start"
              }
            },
            vdoms
          )
        ),
      replayer.DOM.remember()
    )
    .map(vdoms => div(vdoms));

  return Object.assign({}, sinks, {
    DOM: vdom$
  });
};

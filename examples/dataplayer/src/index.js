document.body.style.backgroundColor = "white";
document.body.style.margin = "0px";

import xs from "xstream";
import throttle from "xstream/extra/throttle";
import dropRepeats from "xstream/extra/dropRepeats";
import { div, video } from "@cycle/dom";
import { run } from "@cycle/run";
import { withState } from "@cycle/state";
import { timeDriver } from "@cycle/time";
import { makeTabletFaceDriver } from "@cycle-robot-drivers/screen";
import {
  withTabletFaceRobotActions,
  initializeTabletFaceRobotDrivers
} from "@cycle-robot-drivers/run";
import { Replayer } from "tabletrobotface-starter-lib";
import settings from "./settings.json";

const fileprefix = settings.fileprefix;
const disablenav = settings.disablenav || false;

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

const makeMain = (loadedStreams, videoStartTime) => sources => {
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
                justifyContent: "space-between",
                alignItems: "flex-start"
              }
            },
            vdoms
          )
        ),
      replayer.DOM.remember()
    )
    .map(vdoms => div(vdoms));

  return {
    ...sinks,
    DOM: vdom$
  };
};

const drivers = {
  ...initializeTabletFaceRobotDrivers(),
  TabletFace: makeTabletFaceDriver({ styles: { eyeSize: "30vmin" } }),
  Time: timeDriver
};

fetch(`/${fileprefix}.json`)
  .then(r => r.text())
  .then(rawJSON => {
    const data = JSON.parse(rawJSON).traces;
    // convert to time traveler format
    Object.keys(data).map(k => {
      data[k] = data[k].map(({ stamp, value }) => ({
        timestamp: stamp,
        value
      }));
    });
    // just take the "START_BLINKING"
    data["TabletFace"] = [data["TabletFace"][0]];
    // drop "Tap to start"
    // data["askMultipleChoice"] = data["askMultipleChoice"].slice(1);
    // remove duplicates due to updating "model"
    let prev = null;
    let newDataSetMessage = [];
    let newDataAskMultipleChoice = [];
    data["setMessage"].map(x => {
      if (prev === null || x.value !== prev.value) {
        newDataSetMessage.push(x);
      } else {
        data["askMultipleChoice"] = data["askMultipleChoice"].filter(
          y => x.timestamp !== y.timestamp
        );
      }
      prev = x;
    });
    data["setMessage"] = newDataSetMessage;
    // remove "null"
    data["askMultipleChoiceFinished"] = data[
      "askMultipleChoiceFinished"
    ].filter(x => x.value !== null);
    // serve streams on memory for Replayer component
    const labels2exclude = [
      "tabletfaceLoaded",
      "facePoses",
      "handPositions",
      "voiceLevel",
      "detector",
      "say",
      "state"
    ];
    const labels2hide = [
      "videoStart",
      "TabletFace",
      "setMessage",
      "askMultipleChoice",
      "setImage",
      "askMultipleChoiceFinished",
      "sayFinished"
    ];
    const label2label = {
      inputLabel: "inputs",
      stateLabel: "state trace"
    };
    const loadedStreams = Object.keys(data)
      .map(label => {
        data[label].label = !!label2label[label] ? label2label[label] : label;
        const recordedStream = xs.of(data[label]).remember();
        recordedStream.label = label;
        recordedStream.hidden = labels2hide.indexOf(label) !== -1;
        return recordedStream;
      })
      .filter(s => labels2exclude.indexOf(s.label) === -1);

    const videoStartTime = data["videoStart"][0].timestamp;

    const main = makeMain(loadedStreams, videoStartTime);

    run(main, drivers);
  });

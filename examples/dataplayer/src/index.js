import xs from "xstream";
import { run } from "@cycle/run";
import {
  createDataPlayerDrivers,
  DataPlayer
} from "tabletrobotface-starter-lib";
import settings from "./settings.json";

const fileprefix = settings.fileprefix || "testdata/traces";
const disablenav = settings.disablenav || false;

const drivers = createDataPlayerDrivers();

fetch(`/${fileprefix}.json`)
  .then(r => r.text())
  .then(rawJSON => {
    const data = JSON.parse(rawJSON).traces;
    // convert to cycle-time-travel format
    Object.keys(data).map(k => {
      data[k] = data[k].map(({ stamp, value }) => ({
        timestamp: stamp,
        value
      }));
    });
    // just take the "START_BLINKING"
    data["TabletFace"] = [data["TabletFace"][0]];

    const labels2exclude = ["tabletfaceLoaded", "poses", "voiceLevel"];
    const labels2hide = ["videoStart", "TabletFace"];
    const label2label = {};
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

    const main = DataPlayer(loadedStreams, videoStartTime, {
      fileprefix,
      disablenav
    });

    run(main, drivers);
  });

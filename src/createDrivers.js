import { timeDriver } from "@cycle/time";
import { makePoseDetectionDriver } from "cycle-posenet-driver";
import { initializeTabletFaceRobotDrivers } from "@cycle-robot-drivers/run";
import { makeTabletFaceDriver } from "@cycle-robot-drivers/screen";
import {
  mockDownloadDataSource,
  makeDownloadDataDriver,
  makeMediaRecorderDriver,
  mockMediaRecorderSource
} from "./utils";
import makeAudioAverageFrequencyDriver from "./makeAudioAverageFrequencyDriver";

export default ({ record = true, settings = {} } = {}) => {
  const videoWidth = 640;
  const videoHeight = 480;

  const convertTimeTravelRecordedStreamToRecordedStream = timeTravelRecorded => {
    return timeTravelRecorded.map(x => ({
      value: x.value,
      stamp: x.timestamp
    }));
  };

  return Object.assign({}, initializeTabletFaceRobotDrivers(), {
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
              width: videoWidth,
              height: videoHeight
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
              data[k] = convertTimeTravelRecordedStreamToRecordedStream(
                data[k]
              );
            }
            return { traces: data, settings }; // backup "settings" too
          }
        })
      : mockDownloadDataSource
  });
};

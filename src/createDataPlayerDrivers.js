import { timeDriver } from "@cycle/time";
import { makeTabletFaceDriver } from "@cycle-robot-drivers/screen";
import {
  initializeTabletFaceRobotDrivers
} from "@cycle-robot-drivers/run";

export default () => {
  return Object.assign({}, initializeTabletFaceRobotDrivers(), {
    TabletFace: makeTabletFaceDriver({ styles: { eyeSize: "30vmin" } }),
    Time: timeDriver
  });
};

export { default as createMain } from "./createMain";
export { default as createDrivers } from "./createDrivers";
export { default as makeTabletFaceRobot } from "./makeTabletFaceRobot";
export {
  default as makeAudioAverageFrequencyDriver
} from "./makeAudioAverageFrequencyDriver";

// module.exports = {
//   createMain: require("./createMain"),
//   createDrivers: require("./createDrivers"),
//   makeAudioAverageFrequencyDriver: require("./makeAudioAverageFrequencyDriver"),
//   makeTabletFaceRobot: require("./makeTabletFaceRobot")
// };

// import { run } from "@cycle/run";
// import createMain from "./createMain";
// import createDrivers from "./createDrivers";

// const settings = require("./settings.json");
// // defaults to "dev" setting
// const { record = true, displayPoseViz = true, hideScroll = false } = settings;
// if (hideScroll) {
//   document.body.style.overflow = "hidden";
// }

// const main = createMain();

// const drivers = createDrivers();

// run(main, drivers);

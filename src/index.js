import { run } from "@cycle/run";
import createMain from "./createMain";
import createDrivers from "./createDrivers";

const settings = require("./settings.json");
// defaults to "dev" setting
const { record = true, displayPoseViz = true, hideScroll = false } = settings;
if (hideScroll) {
  document.body.style.overflow = "hidden";
}

const main = createMain();

const drivers = createDrivers();

run(main, drivers);

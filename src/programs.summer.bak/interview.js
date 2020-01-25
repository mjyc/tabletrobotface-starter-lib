var { merge, combineLatest } = require("../streams");

function main(sensors) {
  ////////////////////////
  // your code from here//
  ////////////////////////

  var say = merge(
    sensors.ready.mapTo("What does a typical day look like for you?"),
    merge(sensors.sayFinished, sensors.isHumanSpeaking)
      .bufferCount(4)
      .map(function(x) {
        if (
          (x[0] === "What does a typical day look like for you?" &&
            !x[1] &&
            x[2] &&
            !x[3]) ||
          (x[1] === "What does a typical day look like for you?" &&
            x[2] &&
            !x[3])
        ) {
          return "What odd talent do you have?";
        } else if (
          (x[0] === "What odd talent do you have?" && !x[1] && x[2] && !x[3]) ||
          (x[1] === "What odd talent do you have?" && x[2] && !x[3])
        ) {
          return "We are done";
        } else {
          return null;
        }
      })
  );

  var actions = {
    say: say
  };
  return actions;

  ////////////////////////
  // your code till here//
  ////////////////////////
}

module.exports = main;

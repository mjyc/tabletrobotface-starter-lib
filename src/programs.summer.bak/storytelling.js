var { merge, combineLatest } = require("../streams");

function main(sensors) {
  ////////////////////////
  // your code from here//
  ////////////////////////

  var say = merge(
    sensors.ready.mapTo("Brown bear, brown bear, what do you see?"),
    combineLatest(sensors.sayFinished.delay(1), sensors.isHumanSpeaking)
      .filter(function(x) {
        return x[0] && !x[1];
      })
      .map(function(x) {
        if (x[0] === "Brown bear, brown bear, what do you see?") {
          return "I see a human looking at me.";
        } else if (x[0] === "I see a human looking at me.") {
          return "The END";
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

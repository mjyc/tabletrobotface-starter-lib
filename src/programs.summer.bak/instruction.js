var { merge, combineLatest } = require("../streams");

function main(sensors) {
  ////////////////////////
  // your code from here//
  ////////////////////////

  var say = merge(
    sensors.ready.mapTo("Let's start from looking forward"),
    sensors.sayFinished
      .filter(function(x) {
        return x === "Let's start from looking forward";
      })
      .mapTo("and now slowly rotate to your right"),
    combineLatest(
      sensors.sayFinished.filter(function(x) {
        return x === "and now slowly rotate to your right";
      }),
      sensors.faceLookingAt
        .filter(function(x) {
          return x === "right";
        })
        .take(1)
    ).mapTo("and now slowly rotate to your left"),
    combineLatest(
      sensors.sayFinished.filter(function(x) {
        return x === "and now slowly rotate to your right";
      }),
      sensors.faceLookingAt
        .filter(function(x) {
          return x === "left";
        })
        .take(1)
    ).mapTo("Great job!")
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

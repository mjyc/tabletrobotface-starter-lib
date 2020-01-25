const xs = require("xstream").default;
var {
  map,
  mapTo,
  filter,
  scan,
  merge,
  combineLatest,
  startWith,
  take,
  skip,
  distinct,
  distinct2,
  pairwise
} = require("../streams");

function main(sensors) {
  var input$ = merge(
    mapTo("ready", sensors.ready),
    combineLatest(
      sensors.faceLookingAt,
      sensors.isHumanSpeaking,
      sensors.Time.delay(3000, sensors.sayFinished)
    )
  );

  var state$ = distinct(
    scan(
      function(prev, input) {
        // console.debug("prev", prev, "input", input);
        if (prev == "init" && input == "ready") {
          return "read1";
        } else if (
          prev == "read1" &&
          input[0] === "center" && // HACK
          input[1] === false &&
          input[2] === "Brown bear, brown bear, what do you see?"
        ) {
          return "read2";
        } else if (
          prev == "read2" &&
          input[0] === "center" && // HACK
          input[1] === false &&
          input[2] === "I see a human looking at me."
        ) {
          return "read3";
        }
        return prev;
      },
      "init",
      input$
    )
  );

  var say$ = map(
    function(state) {
      if (state == "read1") {
        return "Brown bear, brown bear, what do you see?";
      } else if (state == "read2") {
        return "I see a human looking at me.";
      } else if (state == "read3") {
        return "The END";
      }
      return " ";
    },
    filter(function(state) {
      return state !== "init";
    }, state$)
  );

  var actions = {
    say: say$
  };
  return actions;
}

module.exports = main;

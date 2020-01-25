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

function TakeTurn(sensors) {
  var input$ = merge(
    mapTo("start", sensors.start),
    map(function(f) {
      return f === "center" ? "attentionOn" : "attentionOff";
    }, sensors.faceLookingAt),
    map(function(s) {
      return s ? "speaking" : "silent";
    }, sensors.isHumanSpeaking)
  );

  var state$ = distinct(
    scan(
      function(prev, input) {
        // console.debug("prev", prev, "input", input);
        if (input == "start") {
          return "wait";
        } else if (prev == "wait" && input == "attentionOff") {
          return "waitAndHold";
        } else if (prev == "waitAndHold" && input == "attentionOn") {
          return "wait";
        } else if (prev == "waitAndHold" && input == "speaking") {
          return "speakAndHold";
        } else if (prev == "wait" && input == "speaking") {
          return "speak";
        } else if (prev == "speak" && input == "silent") {
          return "done";
        } else if (prev == "speak" && input == "attentionOff") {
          return "speakAndHold";
        } else if (prev == "speak" && input == "attentionOn") {
          return "speak";
        } else if (prev == "speakAndHold" && input == "silent") {
          return "hold";
        } else if (prev == "hold" && input == "attentionOn") {
          return "done";
        }
        return prev;
      },
      "init",
      input$
    )
  );

  return {
    state: state$
  };
}

function main(sensors) {
  var takeTurn = TakeTurn({
    start: filter(function(s) {
      return s == "ask1" || s == "ask2" || s == "ask3";
    }, sensors.state),
    faceLookingAt: sensors.faceLookingAt,
    isHumanSpeaking: sensors.isHumanSpeaking
  });

  var input$ = merge(
    mapTo("ready", sensors.ready),
    mapTo(
      "answered",
      filter(function(s) {
        return s == "done";
      }, takeTurn.state)
    )
  );

  var state$ = distinct(
    scan(
      function(prev, input) {
        if (prev == "init" && input == "ready") {
          return "ask1";
        } else if (prev == "ask1" && input == "answered") {
          return "ask2";
        } else if (prev == "ask2" && input == "answered") {
          return "ask3";
        } else if (prev == "ask3" && input == "answered") {
          return "done";
        }
        return prev;
      },
      "init",
      input$
    )
  );

  var setMessage$ = map(
    function(state) {
      if (state == "ask1") {
        return "What does a typical day look like for you?";
      } else if (state == "ask2") {
        return "What odd talent do you have?";
      } else if (state == "ask3") {
        return "What's the most spontaneous thing you've done?";
      } else if (state == "done") {
        return "Thank you!";
      }
      return " ";
    },
    filter(function(state) {
      return state !== "init";
    }, state$)
  );

  var actions = {
    state: state$,
    setMessage: setMessage$
  };
  return actions;
}

module.exports = main;

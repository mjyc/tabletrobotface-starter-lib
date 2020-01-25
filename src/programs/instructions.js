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

function makeInstruct(direction) {
  return function instruct(sensors) {
    var input$ = merge(
      mapTo("start", sensors.start),
      sensors.Time.delay(1000, sensors.sayFinished)
      // mapTo(
      //   "reset",
      //   filter(function(s) {
      //     return s == "done";
      //   }, sensors.state)
      // )
    );

    var state$ = distinct(
      scan(
        function(prev, input) {
          // console.debug("inst dir", direction, "prev", prev, "input", input);
          // if (prev == "init" && input == "start") {
          if (input == "start") {
            return "inst1";
          } else if (
            prev == "inst1" &&
            input == "Tilt your head to the " + direction
          ) {
            return "inst2";
          } else if (prev == "inst2" && input == "one") {
            return "inst3";
          } else if (prev == "inst3" && input == "two") {
            return "inst4";
          } else if (prev == "inst4" && input == "three") {
            return "done";
          }
          // } else if (prev == "done" && input == "reset") {
          //   return "init";
          // }
          return prev;
        },
        "init",
        input$
      )
    );

    var say$ = map(
      function(state) {
        // console.debug("inst dir", direction, "state", state);
        if (state == "inst1") {
          return "Tilt your head to the " + direction;
        } else if (state == "inst2") {
          return "one";
        } else if (state == "inst3") {
          return "two";
        } else if (state == "inst4") {
          return "three";
        }
        return " ";
      },
      filter(function(state) {
        return state !== "init" && state !== "done";
      }, state$)
    );

    var actions = {
      state: state$,
      say: say$
    };
    return actions;
  };
}

function makePlaySound(direction = "left") {
  return function PlaySound(sensors) {
    var input$ = merge(
      mapTo("start", sensors.start),
      mapTo("pause", sensors.pause),
      sensors.headTiltedTo,
      sensors.playSoundFinished
    );
    var state$ = distinct(
      scan(
        function(prev, input) {
          // console.debug("prev", prev, "input", input);
          if (input == "start") {
            return "init";
            // if (input == "start") {
            //   return "done";
          } else if (input == "pause") {
            return "pause";
          } else if ((prev == "init" || prev == "done") && input == direction) {
            return "playGood";
          } else if ((prev == "init" || prev == "done") && input != direction) {
            return "playWarning";
            // } else if (prev == "done" && input == direction) {
            //   return "playGood";
            // } else if (prev == "done" && input != direction) {
            //   return "playWarning";
          } else if (
            (prev == "playGood" || prev == "playWarning") &&
            input == null
          ) {
            return "done";
          }
          return prev;
        },
        "pause",
        input$
      )
    );
    var playSound$ = state$
      .filter(function(s) {
        return s == "playGood" || s == "playWarning";
      })
      .map(function(s) {
        return s == "playGood" ? "/public/good.ogg" : "/public/warning.ogg";
      });

    var actions = {
      state: state$,
      playSound: playSound$
    };
    return actions;
  };
}

var InstructLeft = makeInstruct("left");
var InstructRight = makeInstruct("right");
var PlaySoundLeft = makePlaySound("left");
var PlaySoundRight = makePlaySound("right");

function main(sensors) {
  var instructLeft = InstructLeft({
    Time: sensors.Time,
    start: filter(function(s) {
      return s === "instruct1" || s === "instruct3";
    }, sensors.state),
    sayFinished: sensors.sayFinished
  });
  var instructRight = InstructRight({
    Time: sensors.Time,
    start: filter(function(s) {
      return s === "instruct2" || s === "instruct4";
    }, sensors.state),
    sayFinished: sensors.sayFinished
  });
  var playSoundLeft = PlaySoundLeft({
    start: filter(function(s) {
      return s === "instruct1" || s === "instruct3";
    }, sensors.state),
    // start: filter(function(s) {
    //   return s === "inst1";
    // }, instructLeft.state),
    pause: filter(function(s) {
      return s === "instruct2" || s === "instruct4";
    }, sensors.state),
    headTiltedTo: sensors.headTiltedTo,
    playSoundFinished: sensors.playSoundFinished
  });
  var playSoundRight = PlaySoundRight({
    start: filter(function(s) {
      return s === "instruct2" || s === "instruct4";
    }, sensors.state),
    // start: filter(function(s) {
    //   return s === "inst1";
    // }, instructRight.state),
    pause: filter(function(s) {
      return s === "instruct1" || s === "instruct3";
    }, sensors.state),
    headTiltedTo: sensors.headTiltedTo,
    playSoundFinished: sensors.playSoundFinished
  });

  var input$ = merge(
    mapTo("ready", sensors.ready),
    mapTo(
      "instructLeftDone",
      // filter(function(s) {
      //   return s == "done";
      // }, instructLeft.state)
      filter(function(ss) {
        return ss[0] == "done" && ss[1] == "done";
      }, combineLatest(instructLeft.state, playSoundLeft.state))
    ),
    mapTo(
      "instructRightDone",
      // filter(function(s) {
      //   return s == "done";
      // }, instructRight.state)
      filter(function(ss) {
        return ss[0] == "done" && ss[1] == "done";
      }, combineLatest(instructRight.state, playSoundRight.state))
    )
  );

  var state$ = distinct(
    scan(
      function(prev, input) {
        // console.debug("prev", prev, "input", input);
        if (prev == "init" && input == "ready") {
          return "instruct1";
        } else if (prev == "instruct1" && input == "instructLeftDone") {
          return "instruct2";
        } else if (prev == "instruct2" && input == "instructRightDone") {
          return "instruct3";
        } else if (prev == "instruct3" && input == "instructLeftDone") {
          return "instruct4";
        } else if (prev == "instruct4" && input == "instructRightDone") {
          return "done";
        }
        return prev;
      },
      "init",
      input$
    )
  );

  return {
    state: state$,
    say: merge(instructLeft.say, instructRight.say),
    playSound: merge(playSoundLeft.playSound, playSoundRight.playSound)
  };
}

module.exports = main;

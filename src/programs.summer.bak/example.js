var { map, scan } = require("../streams");

function main(sensors) {
  var numVisibleFaces = map(function(b) {
    if (b) {
      return 1;
    } else {
      return 0;
    }
  }, sensors.isFaceVisible);
  var actions = {
    setMessage: scan(
      function(acc, num) {
        return acc + num;
      },
      0,
      numVisibleFaces
    )
  };
  return actions;
}

module.exports = main;
